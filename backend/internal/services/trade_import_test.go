package services

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func tradeSheetRow(line int, day string, symbol string, kind api.TradeImportRowType, quantity, amount float64) api.TradeImportRow {
	date, _ := time.Parse(time.DateOnly, day)
	return api.TradeImportRow{Line: line, Date: openapi_types.Date{Time: date}, Symbol: symbol, StockName: symbol + " LTD",
		Exchange: api.TradeImportRowExchangeNSE, Type: kind, Quantity: quantity, Amount: amount}
}

// A BSE row finds the .NS holding: the match is on the symbol without its
// exchange suffix (PRD-008 §5).
func TestResolveSymbols_ExchangeSuffixIgnored(t *testing.T) {
	gold := domain.Holding{ID: primitive.NewObjectID(), Script: "Gold BeES", Symbol: "GOLDBEES.NS", Currency: "INR"}
	got := resolveSymbols([]nameCount{{name: "GOLDBEES", label: "NIP IND ETF GOLD BEES", rows: 3}}, []domain.Holding{gold}, nil)[0]
	if got.view.Status != nameAuto || got.holding == nil || got.holding.ID != gold.ID || *got.view.MatchedBy != "symbol" {
		t.Fatalf("status %q matched %v; want auto by symbol to GOLDBEES.NS", got.view.Status, got.view.MatchedBy)
	}
}

// An unknown symbol is never guessed: it waits for the user, with
// suggestions scored on the sheet's stock name.
func TestResolveSymbols_UnknownSymbolNeedsConfirmation(t *testing.T) {
	lg := domain.Holding{ID: primitive.NewObjectID(), Script: "LG Electronics India", Symbol: "LGEI.NS", Currency: "INR"}
	got := resolveSymbols([]nameCount{{name: "LGEINDIA", label: "LG ELECTRONICS INDIA LTD", rows: 2}}, []domain.Holding{lg}, nil)[0]
	if got.view.Status != nameNeedsConfirmation || got.holding != nil {
		t.Fatalf("status %q; want needs_confirmation with no holding", got.view.Status)
	}
	if len(got.view.Suggestions) == 0 || got.view.Suggestions[0].HoldingId != lg.ID.Hex() {
		t.Errorf("suggestions %v; want LG Electronics India first", got.view.Suggestions)
	}
}

func TestValidateTrade(t *testing.T) {
	today := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	ok := tradeSheetRow(2, "2026-11-02", "ITC", api.TradeImportRowTypeBuy, 1, 400)
	for name, testCase := range map[string]struct {
		mutate func(*api.TradeImportRow)
		want   string
	}{
		"valid":         {func(*api.TradeImportRow) {}, ""},
		"unknown type":  {func(row *api.TradeImportRow) { row.Type = "short" }, `Type "short" is not BUY or SELL`},
		"zero quantity": {func(row *api.TradeImportRow) { row.Quantity = 0 }, "Quantity must be a positive number"},
		"zero value":    {func(row *api.TradeImportRow) { row.Amount = 0.004 }, "Value must be a positive amount"},
		"future":        {func(row *api.TradeImportRow) { row.Date = openapi_types.Date{Time: today.AddDate(0, 0, 1)} }, "Date is in the future"},
	} {
		row := ok
		testCase.mutate(&row)
		if got := validateTrade(row, today); got != testCase.want {
			t.Errorf("%s: got %q, want %q", name, got, testCase.want)
		}
	}
}

// The owner's rule (2026-11-03), per holding, day, type, quantity and value:
// n identical sheet rows against m saved trades add max(0, n−m), and a saved
// trade the sheet lacks is never removed.
func TestTradeOccurrences_AddOnlyWhatIsMissing(t *testing.T) {
	holding := &domain.Holding{ID: primitive.NewObjectID()}
	day := time.Date(2025, 4, 7, 0, 0, 0, 0, time.UTC)
	saved := domain.Transaction{HoldingID: holding.ID, Type: domain.TxnBuy, Date: day, Quantity: 5, Amount: 617.25}
	row := tradeRow{sheetRow: tradeSheetRow(2, "2025-04-07", "ITC", api.TradeImportRowTypeBuy, 5, 617.25), day: day, holding: holding}
	for name, testCase := range map[string]struct {
		sheet, saved, wantAdded int
	}{
		"twice in the sheet, none saved": {2, 0, 2},
		"twice in the sheet, once saved": {2, 1, 1},
		"twice in both":                  {2, 2, 0},
		"once in the sheet, twice saved": {1, 2, 0},
		"saved, not in the sheet":        {0, 1, 0},
	} {
		fresh, duplicates := partitionByKey(slices.Repeat([]tradeRow{row}, testCase.sheet), slices.Repeat([]domain.Transaction{saved}, testCase.saved), tradeRow.key, tradeKeyOf)
		if len(fresh) != testCase.wantAdded || len(duplicates) != testCase.sheet-testCase.wantAdded {
			t.Errorf("%s: %d added, %d already saved; want %d added", name, len(fresh), len(duplicates), testCase.wantAdded)
		}
	}
}

func TestTradeImport(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	userId, gold := primitive.NewObjectID(), primitive.NewObjectID()
	holdingDocs := func(mt *mtest.T) bson.D {
		return mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			bson.D{{Key: "_id", Value: gold}, {Key: "user_id", Value: userId}, {Key: "script", Value: "Gold BeES"}, {Key: "symbol", Value: "GOLDBEES.NS"}, {Key: "currency", Value: "INR"}})
	}
	transactions := func(mt *mtest.T, docs ...bson.D) bson.D {
		return mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, docs...)
	}
	stored := func(day string, kind string, quantity, amount float64) bson.D {
		date, _ := time.Parse(time.DateOnly, day)
		return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: gold},
			{Key: "type", Value: kind}, {Key: "date", Value: date}, {Key: "quantity", Value: quantity}, {Key: "amount", Value: amount}}
	}
	service := func(mt *mtest.T) *TradeImportService {
		store := persistence.New(mt.DB)
		tradeImport := NewTradeImportService(store.Transactions, store.Holdings, directRunner{}, nil, nil)
		tradeImport.today = func() time.Time { return time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC) }
		return tradeImport
	}
	twoBuys := api.TradeImportInput{Rows: []api.TradeImportRow{
		tradeSheetRow(2, "2025-04-04", "GOLDBEES", api.TradeImportRowTypeBuy, 17, 1278.4),
		tradeSheetRow(3, "2025-04-07", "GOLDBEES", api.TradeImportRowTypeBuy, 1, 73.55),
	}}

	mt.Run("re-uploading the same trades writes nothing: saved trades stay untouched", func(mt *mtest.T) {
		first, second := stored("2025-04-04", "buy", 17, 1278.4), stored("2025-04-07", "buy", 1, 73.55)
		mt.AddMockResponses(
			holdingDocs(mt),
			transactions(mt), // no opening
			transactions(mt, first, second),
		)
		result, err := service(mt).Import(context.Background(), userId, twoBuys)
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.Imported != 0 || result.Replaced != 2 {
			t.Errorf("imported %d replaced %d; want 0 / 2", result.Imported, result.Replaced)
		}
		for _, write := range []string{"insert", "update", "findAndModify", "delete"} {
			if count := commandCount(mt, write, "transactions"); count != 0 {
				t.Errorf("%d %s commands on transactions; want none", count, write)
			}
		}
	})

	mt.Run("rows up to the opening date are covered; later rows import", func(mt *mtest.T) {
		openingDate := time.Date(2025, 4, 5, 0, 0, 0, 0, time.UTC)
		opening := bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: gold},
			{Key: "type", Value: "opening"}, {Key: "date", Value: openingDate}, {Key: "opening_date", Value: openingDate}, {Key: "quantity", Value: 40.0}, {Key: "amount", Value: 2800.0}}
		mt.AddMockResponses(
			holdingDocs(mt),
			transactions(mt, opening),
			transactions(mt),          // nothing stored to replace
			transactions(mt, opening), // oversell replay
			mtest.CreateSuccessResponse(),
			transactions(mt, opening), // recompute
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
		)
		result, err := service(mt).Import(context.Background(), userId, twoBuys)
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.Imported != 1 || result.Covered != 1 {
			t.Errorf("imported %d covered %d; want 1 / 1 (4 Apr is inside the opening)", result.Imported, result.Covered)
		}
	})

	mt.Run("History heals inside the commit, from the earliest new trade; a failed heal fails the import", func(mt *mtest.T) {
		mt.AddMockResponses(
			holdingDocs(mt), transactions(mt), transactions(mt), transactions(mt),
			mtest.CreateSuccessResponse(), // insertMany
			transactions(mt),              // recompute
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
		)
		healer := &recordingRecomputer{err: errors.New("snapshot write failed")}
		tradeImport := service(mt)
		tradeImport.recomputer = healer
		_, err := tradeImport.Import(context.Background(), userId, twoBuys)
		if err == nil || !healer.from.Equal(time.Date(2025, 4, 4, 0, 0, 0, 0, time.UTC)) {
			t.Fatalf("err = %v, healed from %v; want the heal error, healed from 2025-04-04", err, healer.from)
		}
	})

	// A saved buy carrying a time (noon) replays after a bare-day imported
	// sell; oversell is judged at the end of the day, so the buy covers it.
	mt.Run("a sell covered by a saved same-day buy with a time imports", func(mt *mtest.T) {
		noonBuy := stored("2025-04-04", "buy", 5, 400)
		noonBuy[4].Value = time.Date(2025, 4, 4, 12, 0, 0, 0, time.UTC)
		mt.AddMockResponses(
			holdingDocs(mt), transactions(mt), transactions(mt, noonBuy),
			transactions(mt, noonBuy),     // oversell replay
			mtest.CreateSuccessResponse(), // insertMany
			transactions(mt, noonBuy),     // recompute
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
		)
		input := api.TradeImportInput{Rows: []api.TradeImportRow{tradeSheetRow(2, "2025-04-04", "GOLDBEES", api.TradeImportRowTypeSell, 5, 450)}}
		if result, err := service(mt).Import(context.Background(), userId, input); err != nil || result.Imported != 1 {
			t.Fatalf("Import: %+v, %v; want the sell imported", result, err)
		}
	})

	mt.Run("a sell beyond the shares held blocks the whole import", func(mt *mtest.T) {
		mt.AddMockResponses(holdingDocs(mt), transactions(mt), transactions(mt), transactions(mt))
		input := api.TradeImportInput{Rows: []api.TradeImportRow{tradeSheetRow(2, "2025-04-04", "GOLDBEES", api.TradeImportRowTypeSell, 5, 400)}}
		_, err := service(mt).Import(context.Background(), userId, input)
		var invalid *TradeImportInvalidError
		if !errors.As(err, &invalid) || invalid.Preview.Counts.Invalid != 1 {
			t.Fatalf("err = %v; want TradeImportInvalidError with the sell invalid", err)
		}
		if inserts := commandCount(mt, "insert", "transactions"); inserts != 0 {
			t.Errorf("%d inserts issued; want none", inserts)
		}
	})

	// Same-day order is by day only (owner, 2026-11-03: the file's time has no
	// effect): a saved trade keeps its place, new trades of that day follow
	// it in the file's order, each dated at the bare day.
	mt.Run("new trades of a day follow its saved trades, in file order, dated at the day", func(mt *mtest.T) {
		saved := stored("2025-04-07", "buy", 1, 73.55)
		mt.AddMockResponses(
			holdingDocs(mt), transactions(mt), transactions(mt, saved),
			transactions(mt, saved),       // oversell replay
			mtest.CreateSuccessResponse(), // insertMany
			transactions(mt, saved),       // recompute
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
		)
		input := api.TradeImportInput{Rows: []api.TradeImportRow{
			tradeSheetRow(2, "2025-04-07", "GOLDBEES", api.TradeImportRowTypeSell, 1, 75),
			tradeSheetRow(3, "2025-04-07", "GOLDBEES", api.TradeImportRowTypeBuy, 2, 150),
		}}
		tradeImport := service(mt)
		importedAt := time.Date(2026, 11, 3, 9, 0, 0, 0, time.UTC)
		tradeImport.now = func() time.Time { return importedAt }
		if _, err := tradeImport.Import(context.Background(), userId, input); err != nil {
			t.Fatalf("Import: %v", err)
		}
		if problem := dayOrderProblem(insertedTrades(mt), []string{"sell", "buy"}, time.Date(2025, 4, 7, 0, 0, 0, 0, time.UTC), importedAt); problem != "" {
			t.Error(problem)
		}
	})

	mt.Run("a confirmed new symbol creates its holding with the trades", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch), // no holdings
			transactions(mt),              // no openings
			mtest.CreateSuccessResponse(), // insert holding
			mtest.CreateSuccessResponse(), // insertMany trades
			transactions(mt),              // recompute
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: primitive.NewObjectID()}}}),
		)
		input := api.TradeImportInput{Rows: []api.TradeImportRow{
			tradeSheetRow(2, "2025-10-13", "LGEINDIA", api.TradeImportRowTypeBuy, 13, 14820),
			tradeSheetRow(3, "2025-10-14", "LGEINDIA", api.TradeImportRowTypeSell, 13, 22258.6),
		}, Create: &[]string{"LGEINDIA"}}
		result, err := service(mt).Import(context.Background(), userId, input)
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.CreatedHoldings != 1 || result.Imported != 2 {
			t.Errorf("created %d imported %d; want 1 / 2", result.CreatedHoldings, result.Imported)
		}
		if inserts := commandCount(mt, "insert", "holdings"); inserts != 1 {
			t.Errorf("%d holding inserts; want 1", inserts)
		}
	})
}

// insertedTrades returns the documents of every insert on transactions.
func insertedTrades(mt *mtest.T) []bson.Raw {
	var inserted []bson.Raw
	for _, event := range mt.GetAllStartedEvents() {
		if event.CommandName == "insert" && event.Command.Lookup("insert").StringValue() == "transactions" {
			documents, _ := event.Command.Lookup("documents").Array().Values()
			for _, document := range documents {
				inserted = append(inserted, document.Document())
			}
		}
	}
	return inserted
}

// dayOrderProblem describes how inserted trades break the day-only order —
// the given types in file order, each dated at the bare day and created at
// or after importedAt with created_at rising in file order, with no import
// metadata stored (nothing reads it) — or "" when they keep it.
func dayOrderProblem(inserted []bson.Raw, types []string, day, importedAt time.Time) string {
	if len(inserted) != len(types) {
		return fmt.Sprintf("%d trades inserted; want %d", len(inserted), len(types))
	}
	previous := importedAt.Add(-time.Nanosecond)
	for i, trade := range inserted {
		created := trade.Lookup("created_at").Time()
		switch {
		case trade.Lookup("type").StringValue() != types[i]:
			return fmt.Sprintf("trade %d is a %s; want %v in file order", i, trade.Lookup("type").StringValue(), types)
		case !trade.Lookup("date").Time().UTC().Equal(day):
			return fmt.Sprintf("trade %d dated %v; want the bare day %v", i, trade.Lookup("date").Time().UTC(), day)
		case !created.After(previous):
			return fmt.Sprintf("trade %d created %v; want after %v (the import, then file order)", i, created, previous)
		case trade.Lookup("import").Type != 0:
			return fmt.Sprintf("trade %d stores import metadata %v; want none", i, trade.Lookup("import"))
		}
		previous = created
	}
	return ""
}

// recordingRecomputer records the heal start and returns err.
type recordingRecomputer struct {
	from time.Time
	err  error
}

func (r *recordingRecomputer) RecomputeFrom(_ context.Context, _ primitive.ObjectID, from time.Time) error {
	r.from = from
	return r.err
}
