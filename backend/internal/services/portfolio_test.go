package services

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/persistence"
)

type stubPriceFetcher struct {
	price    float64
	priceCur string
	priceErr error
	rate     float64
	rateErr  error
}

func (s *stubPriceFetcher) GetPrice(_ context.Context, _ string) (float64, string, error) {
	return s.price, s.priceCur, s.priceErr
}

func (s *stubPriceFetcher) GetForexRate(_ context.Context, _, _ string) (float64, error) {
	return s.rate, s.rateErr
}

// holdingsCursor returns a single-batch mock cursor for ListByUser.
func holdingsCursor(uid primitive.ObjectID, docs ...bson.D) []bson.D {
	out := make([]bson.D, 0, len(docs))
	for _, d := range docs {
		out = append(out, append(bson.D{{Key: "user_id", Value: uid}}, d...))
	}
	return out
}

func TestPortfolioService_Summary_INRHolding(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("inr cost and current value", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		docs := holdingsCursor(uid, bson.D{
			{Key: "script", Value: "TCS"},
			{Key: "symbol", Value: "TCS.NS"},
			{Key: "currency", Value: "INR"},
			{Key: "stocks_owned", Value: 10.0},
			{Key: "avg_cost_price", Value: 3000.0},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, docs...))

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, nil, &stubPriceFetcher{
			price: 3500, rate: 0.011,
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		if got.TotalCost == nil || *got.TotalCost != 30000 {
			t.Errorf("TotalCost = %v, want 30000", got.TotalCost)
		}
		if got.TotalCurrentValue == nil || *got.TotalCurrentValue != 35000 {
			t.Errorf("TotalCurrentValue = %v, want 35000", got.TotalCurrentValue)
		}
		if got.TotalUnrealized == nil || *got.TotalUnrealized != 5000 {
			t.Errorf("TotalUnrealized = %v, want 5000", got.TotalUnrealized)
		}
		if got.EurRate == nil || *got.EurRate != 0.011 {
			t.Errorf("EurRate = %v, want 0.011", got.EurRate)
		}
	})
}

func TestPortfolioService_Summary_PriceErrorAssumesZero(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("delisted symbol counts as current 0", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		docs := holdingsCursor(uid, bson.D{
			{Key: "script", Value: "IDFC"},
			{Key: "symbol", Value: "IDFC.NS"},
			{Key: "currency", Value: "INR"},
			{Key: "stocks_owned", Value: 100.0},
			{Key: "avg_cost_price", Value: 114.82},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, docs...))

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, nil, &stubPriceFetcher{
			priceErr: errors.New("yahoo status 404"), rate: 0.011,
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		// Cost still books the full position; current is 0 and the whole
		// cost shows as an unrealized loss — same rule the cron snapshot
		// applies, so the dashboard and the snapshot agree on a 404 symbol.
		if got.TotalCost == nil || *got.TotalCost != 11482 {
			t.Errorf("TotalCost = %v, want 11482", got.TotalCost)
		}
		if got.TotalCurrentValue == nil || *got.TotalCurrentValue != 0 {
			t.Errorf("TotalCurrentValue = %v, want 0", got.TotalCurrentValue)
		}
		if got.TotalUnrealized == nil || *got.TotalUnrealized != -11482 {
			t.Errorf("TotalUnrealized = %v, want -11482", got.TotalUnrealized)
		}
	})
}

func TestPortfolioService_Summary_EURHoldingDividesByRate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("eur cost normalised to inr", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		docs := holdingsCursor(uid, bson.D{
			{Key: "script", Value: "VWCE"},
			{Key: "symbol", Value: "VWCE.DE"},
			{Key: "currency", Value: "EUR"},
			{Key: "stocks_owned", Value: 5.0},
			{Key: "avg_cost_price", Value: 100.0},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, docs...))

		rate := 0.011
		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, nil, &stubPriceFetcher{
			price: 120, rate: rate,
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		// 5 * 100 EUR = 500 EUR / 0.011 = 45454.54... INR
		wantCostINR := 500.0 / rate
		if got.TotalCost == nil || math.Abs(*got.TotalCost-wantCostINR) > 0.01 {
			t.Errorf("TotalCost = %v, want ~%v", got.TotalCost, wantCostINR)
		}
		// Current value: 5 * 120 EUR = 600 EUR / 0.011 INR
		wantCV := 600.0 / rate
		if got.TotalCurrentValue == nil || math.Abs(*got.TotalCurrentValue-wantCV) > 0.01 {
			t.Errorf("TotalCurrentValue = %v, want ~%v", got.TotalCurrentValue, wantCV)
		}
	})
}

func TestPortfolioService_Summary_FallbackRateWhenForexFails(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("uses fallback when rate errors", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		docs := holdingsCursor(uid, bson.D{
			{Key: "script", Value: "TCS"},
			{Key: "symbol", Value: ""},
			{Key: "currency", Value: "INR"},
			{Key: "stocks_owned", Value: 1.0},
			{Key: "avg_cost_price", Value: 100.0},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, docs...))

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, nil, &stubPriceFetcher{
			rateErr: errors.New("forex out"),
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		if got.EurRate == nil || *got.EurRate != fallbackEURRate {
			t.Errorf("EurRate = %v, want fallback %v", got.EurRate, fallbackEURRate)
		}
		if got.TotalCost == nil || *got.TotalCost != 100 {
			t.Errorf("TotalCost = %v, want 100", got.TotalCost)
		}
	})
}

func TestPortfolioService_Summary_PreviousClose(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("change vs previous close, INR base + native per-currency", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		holdings := holdingsCursor(uid, bson.D{
			{Key: "script", Value: "TCS"},
			{Key: "symbol", Value: "TCS.NS"},
			{Key: "currency", Value: "INR"},
			{Key: "stocks_owned", Value: 10.0},
			{Key: "avg_cost_price", Value: 3000.0},
		})
		// Previous-close snapshot: INR bucket worth 30000 at close.
		snap := bson.D{
			{Key: "user_id", Value: uid},
			{Key: "date", Value: primitive.NewDateTimeFromTime(time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC))},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 28000.0},
					{Key: "current", Value: 30000.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}
		// ListByUser cursor, then LatestBefore FindOne.
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, holdings...),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, snap),
		)

		store := persistence.New(mt.DB)
		svc := NewPortfolioService(store.Holdings, store.Snapshots, &stubPriceFetcher{
			price: 3500, rate: 0.011,
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		// Today current = 10 * 3500 = 35000 INR; prev close = 30000.
		if got.PreviousCloseValue == nil || *got.PreviousCloseValue != 30000 {
			t.Fatalf("PreviousCloseValue = %v, want 30000", got.PreviousCloseValue)
		}
		if got.ChangeValue == nil || *got.ChangeValue != 5000 {
			t.Errorf("ChangeValue = %v, want 5000", got.ChangeValue)
		}
		if got.ChangePct == nil || math.Abs(*got.ChangePct-(5000.0/30000*100)) > 0.001 {
			t.Errorf("ChangePct = %v, want ~16.667", got.ChangePct)
		}
		if got.PreviousCloseDate == nil || *got.PreviousCloseDate != "2026-06-16" {
			t.Errorf("PreviousCloseDate = %v, want 2026-06-16", got.PreviousCloseDate)
		}
		if got.PerCurrency == nil || len(*got.PerCurrency) != 1 {
			t.Fatalf("PerCurrency = %v, want 1 entry", got.PerCurrency)
		}
		inr := (*got.PerCurrency)[0]
		if inr.Currency == nil || *inr.Currency != "INR" {
			t.Errorf("per-currency[0].Currency = %v, want INR", inr.Currency)
		}
		if inr.Current == nil || *inr.Current != 35000 || inr.PreviousClose == nil || *inr.PreviousClose != 30000 {
			t.Errorf("per-currency INR current/prev = %v/%v, want 35000/30000", inr.Current, inr.PreviousClose)
		}
	})

	mt.Run("no prior snapshot leaves change fields nil", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		holdings := holdingsCursor(uid, bson.D{
			{Key: "symbol", Value: "TCS.NS"},
			{Key: "currency", Value: "INR"},
			{Key: "stocks_owned", Value: 10.0},
			{Key: "avg_cost_price", Value: 3000.0},
		})
		// Empty FirstBatch → LatestBefore returns ErrNotFound.
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, holdings...),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch),
		)

		store := persistence.New(mt.DB)
		svc := NewPortfolioService(store.Holdings, store.Snapshots, &stubPriceFetcher{
			price: 3500, rate: 0.011,
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		if got.PreviousCloseValue != nil || got.ChangeValue != nil || got.PerCurrency != nil {
			t.Errorf("expected nil change fields without a prior snapshot, got prev=%v change=%v perCcy=%v",
				got.PreviousCloseValue, got.ChangeValue, got.PerCurrency)
		}
	})
}

// TestPortfolioService_Summary_PreviousClose_LegacyUSD covers the prev-close
// fold of a legacy USD snapshot bucket into INR. Kept separate from
// TestPortfolioService_Summary_PreviousClose to stay under the gocyclo limit.
func TestPortfolioService_Summary_PreviousClose_LegacyUSD(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("legacy USD bucket folds into INR, no phantom USD row", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// One INR holding today, worth 10*3500 = 35000 INR.
		holdings := holdingsCursor(uid, bson.D{
			{Key: "script", Value: "TCS"},
			{Key: "symbol", Value: "TCS.NS"},
			{Key: "currency", Value: "INR"},
			{Key: "stocks_owned", Value: 10.0},
			{Key: "avg_cost_price", Value: 3000.0},
		})
		// Legacy snapshot: the same rupee-paid US-listed money sits in a USD
		// bucket (old exchange-based bucketing). INR bucket = 20000, legacy
		// USD bucket = 10000. Both are really INR → prev INR should be 30000.
		snap := bson.D{
			{Key: "user_id", Value: uid},
			{Key: "date", Value: primitive.NewDateTimeFromTime(time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC))},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 18000.0},
					{Key: "current", Value: 20000.0},
					{Key: "source", Value: "cron"},
				}},
				{Key: "USD", Value: bson.D{
					{Key: "invested", Value: 9000.0},
					{Key: "current", Value: 10000.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, holdings...),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, snap),
		)

		store := persistence.New(mt.DB)
		svc := NewPortfolioService(store.Holdings, store.Snapshots, &stubPriceFetcher{
			price: 3500, rate: 0.011,
		}, nil)

		got, err := svc.Summary(context.Background(), uid)
		if err != nil {
			t.Fatalf("summary: %v", err)
		}
		// Prev close (INR base) folds USD into INR: 20000 + 10000 = 30000.
		if got.PreviousCloseValue == nil || *got.PreviousCloseValue != 30000 {
			t.Fatalf("PreviousCloseValue = %v, want 30000 (USD folded into INR)", got.PreviousCloseValue)
		}
		if got.ChangeValue == nil || *got.ChangeValue != 5000 {
			t.Errorf("ChangeValue = %v, want 5000", got.ChangeValue)
		}
		// Exactly one row — INR — with no phantom USD row.
		if got.PerCurrency == nil || len(*got.PerCurrency) != 1 {
			t.Fatalf("PerCurrency = %v, want exactly 1 row (INR, no USD)", got.PerCurrency)
		}
		inr := (*got.PerCurrency)[0]
		if inr.Currency == nil || *inr.Currency != "INR" {
			t.Errorf("per-currency[0].Currency = %v, want INR", inr.Currency)
		}
		if inr.Current == nil || *inr.Current != 35000 || inr.PreviousClose == nil || *inr.PreviousClose != 30000 {
			t.Errorf("per-currency INR current/prev = %v/%v, want 35000/30000",
				inr.Current, inr.PreviousClose)
		}
	})
}

func TestPortfolioService_Prices_RateFailureBubblesUp(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("rate error fails the call", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, nil, &stubPriceFetcher{
			rateErr: errors.New("forex out"),
		}, nil)

		_, _, err := svc.Prices(context.Background(), uid)
		if err == nil {
			t.Fatal("expected error when forex rate fails")
		}
	})
}
