package services

import (
	"context"
	"errors"
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

// directRunner runs the transaction body without a replica set.
type directRunner struct{}

func (directRunner) InTransaction(ctx context.Context, work func(ctx context.Context) error) error {
	return work(ctx)
}

func commandCount(mt *mtest.T, name, collection string) int {
	count := 0
	for _, event := range mt.GetAllStartedEvents() {
		if event.CommandName == name && event.Command.Lookup(name).StringValue() == collection {
			count++
		}
	}
	return count
}

func importInput(mappings map[string]*string) api.DividendImportInput {
	day := openapi_types.Date{Time: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)}
	input := api.DividendImportInput{Currency: "INR", Rows: []api.DividendImportRow{
		{Line: 2, Date: day, ShareName: "TCS", Amount: 300},
		{Line: 3, Date: day, ShareName: "TCS", Amount: 300},
		{Line: 4, Date: day, ShareName: "JLP", Amount: 500},
	}}
	if mappings != nil {
		input.Mappings = &mappings
	}
	return input
}

func TestImport(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	userId, tcs, jio := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	holdingDocs := func(mt *mtest.T) bson.D {
		return mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			bson.D{{Key: "_id", Value: tcs}, {Key: "user_id", Value: userId}, {Key: "script", Value: "TCS"}, {Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"}},
			bson.D{{Key: "_id", Value: jio}, {Key: "user_id", Value: userId}, {Key: "script", Value: "Jio Platforms Ltd"}, {Key: "symbol", Value: "JIOPLA.NS"}, {Key: "currency", Value: "INR"}},
		)
	}
	service := func(mt *mtest.T) *DividendsService {
		store := persistence.New(mt.DB)
		dividendsService := NewDividendsService(store.Transactions, store.Holdings, directRunner{}, nil)
		dividendsService.today = func() time.Time { return time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC) }
		return dividendsService
	}

	mt.Run("unresolved name blocks the import, nothing written", func(mt *mtest.T) {
		mt.AddMockResponses(holdingDocs(mt), mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch))
		_, err := service(mt).Import(context.Background(), userId, importInput(nil))
		var invalid *ImportInvalidError
		if !errors.As(err, &invalid) || invalid.Preview.Counts.Invalid != 1 {
			t.Fatalf("err = %v, want ImportInvalidError with 1 invalid row (JLP)", err)
		}
		if inserts := commandCount(mt, "insert", "transactions"); inserts != 0 {
			t.Errorf("%d inserts issued; want none", inserts)
		}
	})

	mt.Run("confirmed import inserts, saves the alias, recomputes each holding once", func(mt *mtest.T) {
		jioHex := jio.Hex()
		mt.AddMockResponses(
			holdingDocs(mt),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // no stored dividends
			mtest.CreateSuccessResponse(), // insertMany
			mtest.CreateSuccessResponse(), // aliases $pull
			mtest.CreateSuccessResponse(), // aliases $addToSet
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // recompute TCS
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: tcs}}}),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // recompute Jio
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: jio}}}),
		)
		result, err := service(mt).Import(context.Background(), userId, importInput(map[string]*string{"JLP": &jioHex}))
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.Imported != 3 || len(result.Duplicates) != 0 {
			t.Errorf("imported %d dups %d, want 3 / 0 (in-sheet repeats kept)", result.Imported, len(result.Duplicates))
		}
		if recomputes := commandCount(mt, "findAndModify", "holdings"); recomputes != 2 {
			t.Errorf("holding recomputes = %d, want 2 (once per holding)", recomputes)
		}
		if aliasWrites := commandCount(mt, "update", "holdings"); aliasWrites != 2 {
			t.Errorf("alias writes = %d, want 2 (pull + addToSet for JLP)", aliasWrites)
		}
	})

	mt.Run("re-import of stored rows imports nothing", func(mt *mtest.T) {
		jioHex := jio.Hex()
		day := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
		stored := func(holdingId primitive.ObjectID, amount float64) bson.D {
			return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "holding_id", Value: holdingId}, {Key: "type", Value: "dividend"}, {Key: "date", Value: day}, {Key: "amount", Value: amount}}
		}
		mt.AddMockResponses(
			holdingDocs(mt),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, stored(tcs, 300), stored(tcs, 300), stored(jio, 500)),
			mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse(), // alias pull + addToSet (answer re-sent)
		)
		result, err := service(mt).Import(context.Background(), userId, importInput(map[string]*string{"JLP": &jioHex}))
		if err != nil {
			t.Fatalf("Import: %v", err)
		}
		if result.Imported != 0 || len(result.Duplicates) != 3 {
			t.Errorf("imported %d dups %d, want 0 / 3 (idempotent)", result.Imported, len(result.Duplicates))
		}
		if inserts := commandCount(mt, "insert", "transactions"); inserts != 0 {
			t.Errorf("%d inserts issued; want none", inserts)
		}
	})
}

// An imported dividend is stored at cent precision, like a hand-entered one,
// so the holding's total_dividends equals the Dividends view (DD-005 §2.5).
func TestImportRow_ToTransactionRoundsToCents(t *testing.T) {
	holding := &domain.Holding{ID: primitive.NewObjectID(), Currency: "INR"}
	row := importRow{sheetRow: api.DividendImportRow{Line: 2, ShareName: "TCS", Amount: 1.004}, day: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC), holding: holding}
	if got := row.toTransaction(primitive.NewObjectID(), "batch", time.Now()).Amount; got != 1.0 {
		t.Errorf("imported amount = %v, want 1 (rounded to cents)", got)
	}
}

// Delete-all is scoped to dividends of one currency and recomputes each
// affected holding.
func TestDeleteAll_ScopedAndRecomputes(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("INR", func(mt *mtest.T) {
		userId, tcs := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(bson.E{Key: "values", Value: bson.A{tcs}}), // distinct
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: int32(4)}),         // deleteMany
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: tcs}}}),
		)
		store := persistence.New(mt.DB)
		deleted, err := NewDividendsService(store.Transactions, store.Holdings, directRunner{}, nil).DeleteAll(context.Background(), userId, "INR")
		if err != nil || deleted != 4 {
			t.Fatalf("DeleteAll = %d, %v; want 4, nil", deleted, err)
		}
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName != "delete" {
				continue
			}
			filter := event.Command.Lookup("deletes").Array().Index(0).Value().Document().Lookup("q").Document()
			if filter.Lookup("type").StringValue() != "dividend" || filter.Lookup("user_id").ObjectID() != userId {
				t.Errorf("delete filter = %s; want type=dividend for the user", filter)
			}
		}
		if recomputes := commandCount(mt, "findAndModify", "holdings"); recomputes != 1 {
			t.Errorf("recomputes = %d, want 1", recomputes)
		}
	})

	// A dividend whose holding no longer exists (ErrNoDocuments on recompute)
	// must not block Delete all.
	mt.Run("orphan dividend", func(mt *mtest.T) {
		userId, gone := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(bson.E{Key: "values", Value: bson.A{gone}}), // distinct
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: int32(1)}),          // deleteMany
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}), // holding not found
		)
		store := persistence.New(mt.DB)
		deleted, err := NewDividendsService(store.Transactions, store.Holdings, directRunner{}, nil).DeleteAll(context.Background(), userId, "INR")
		if err != nil || deleted != 1 {
			t.Fatalf("DeleteAll = %d, %v; want 1, nil (orphan skipped)", deleted, err)
		}
	})
}
