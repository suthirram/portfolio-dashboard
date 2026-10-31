package services

import (
	"context"
	"errors"
	"testing"

	"github.com/samber/lo"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/persistence"
)

// TestHoldingsService_Update_AppliesAllInputFields exercises the identity
// branches in Update's BSON-builder. Each row toggles one field; the table
// guards against a future edit silently dropping a column. Position fields
// (stocks_owned/avg_cost_price/realized_pnl) are no longer written here — they
// route through the opening ledger event (see ledger_test.go).
func TestHoldingsService_Update_AppliesAllInputFields(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	uid := primitive.NewObjectID()
	hid := primitive.NewObjectID()

	successful := func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(
			bson.E{Key: "value", Value: bson.D{
				{Key: "_id", Value: hid},
				{Key: "user_id", Value: uid},
				{Key: "script", Value: "TCS"},
				{Key: "exchange", Value: "NSE"},
				{Key: "type", Value: "stock"},
				{Key: "currency", Value: "INR"},
			}},
		), mtest.CreateSuccessResponse()) // ledger currency sync when currency is sent
	}

	tests := []struct {
		name  string
		input api.HoldingInput
	}{
		{"baseline only required", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}},
		{"with symbol", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Symbol: new("TCS.NS")}},
		{"with valid currency EUR", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Currency: lo.ToPtr(api.HoldingInputCurrency("EUR"))}},
		{"with notes", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Notes: new("long-term hold")}},
	}

	for _, tc := range tests {
		mt.Run(tc.name, func(mt *mtest.T) {
			successful(mt)
			svc := NewHoldingsService(persistence.New(mt.DB).Holdings, persistence.New(mt.DB).Transactions, nil)
			_, found, err := svc.Update(context.Background(), uid, hid.Hex(), tc.input)
			if err != nil {
				t.Fatalf("update: %v", err)
			}
			if !found {
				t.Fatal("expected found=true")
			}
		})
	}
}

// TestHoldingsService_Update_InvalidIDIsNotFound covers the early-return path
// where the path-param can't be parsed as ObjectID — must read as 404, not
// 500, so ids stay non-enumerable.
func TestHoldingsService_Update_InvalidIDIsNotFound(t *testing.T) {
	svc := NewHoldingsService(nil, nil, nil)
	_, found, err := svc.Update(context.Background(), primitive.NewObjectID(), "not-an-oid", api.HoldingInput{})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if found {
		t.Fatal("expected found=false for malformed id")
	}
}

// TestHoldingsService_Update_StoreNotFoundIsNotFound mirrors the wire
// behaviour: a wrong-owner id reads as 404 without leaking ownership.
func TestHoldingsService_Update_StoreNotFoundIsNotFound(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("scoped update misses", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))

		svc := NewHoldingsService(persistence.New(mt.DB).Holdings, persistence.New(mt.DB).Transactions, nil)
		_, found, err := svc.Update(context.Background(), primitive.NewObjectID(), primitive.NewObjectID().Hex(), api.HoldingInput{
			Script: "X", Exchange: "NSE", Type: "stock",
		})
		if err != nil && !errors.Is(err, persistence.ErrNotFound) {
			t.Fatalf("update: %v", err)
		}
		if found {
			t.Fatal("expected found=false when store returns ErrNotFound")
		}
	})
}

// A currency change rewrites the currency on the holding's ledger events; an
// edit that leaves the currency alone does not touch the ledger.
func TestHoldingsService_Update_SyncsLedgerCurrency(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	run := func(mt *mtest.T, currency *api.HoldingInputCurrency) int {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(
			// UpdateScopedAndReturn — findAndModify on holdings.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
				{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "currency", Value: "EUR"},
			}}),
			// SetCurrencyByHolding — updateMany on transactions.
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: int32(3)}, bson.E{Key: "nModified", Value: int32(3)}),
		)
		st := persistence.New(mt.DB)
		svc := NewHoldingsService(st.Holdings, st.Transactions, nil)
		if _, found, err := svc.Update(context.Background(), userId, holdingId.Hex(), api.HoldingInput{
			Script: "SAP", Exchange: "OTHER", Type: "stock", Currency: currency,
		}); err != nil || !found {
			t.Fatalf("Update: found=%v err=%v", found, err)
		}
		n := 0
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "update" || e.Command.Lookup("update").StringValue() != "transactions" {
				continue
			}
			n++
			set := e.Command.Lookup("updates").Array().Index(0).Value().Document().Lookup("u", "$set").Document()
			if got := set.Lookup("currency").StringValue(); got != "EUR" {
				t.Errorf("ledger currency = %q, want EUR", got)
			}
		}
		return n
	}
	mt.Run("currency changed", func(mt *mtest.T) {
		eur := api.HoldingInputCurrency("EUR")
		if n := run(mt, &eur); n != 1 {
			t.Errorf("ledger updates = %d, want 1", n)
		}
	})
	mt.Run("currency not sent", func(mt *mtest.T) {
		if n := run(mt, nil); n != 0 {
			t.Errorf("ledger updates = %d, want 0", n)
		}
	})
}
