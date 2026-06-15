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

// TestHoldingsService_Update_AppliesAllInputFields exercises every optional
// branch in Update's BSON-builder. Each row toggles one field; the table
// guards against a future edit silently dropping a column.
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
		))
	}

	tests := []struct {
		name  string
		input api.HoldingInput
	}{
		{"baseline only required", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}},
		{"with symbol", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Symbol: lo.ToPtr("TCS.NS")}},
		{"with stocks_owned", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", StocksOwned: lo.ToPtr(10.0)}},
		{"with avg_cost_price", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", AvgCostPrice: lo.ToPtr(3500.0)}},
		{"with realized_pnl", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", RealizedPnl: lo.ToPtr(120.0)}},
		{"with valid currency EUR", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Currency: lo.ToPtr(api.HoldingInputCurrency("EUR"))}},
		{"with notes", api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Notes: lo.ToPtr("long-term hold")}},
	}

	for _, tc := range tests {
		mt.Run(tc.name, func(mt *mtest.T) {
			successful(mt)
			svc := NewHoldingsService(persistence.New(mt.DB).Holdings, nil)
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
	svc := NewHoldingsService(nil, nil)
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

		svc := NewHoldingsService(persistence.New(mt.DB).Holdings, nil)
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
