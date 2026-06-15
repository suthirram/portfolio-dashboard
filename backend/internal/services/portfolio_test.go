package services

import (
	"context"
	"errors"
	"math"
	"testing"

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

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, &stubPriceFetcher{
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
		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, &stubPriceFetcher{
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

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, &stubPriceFetcher{
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

func TestPortfolioService_Prices_RateFailureBubblesUp(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("rate error fails the call", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))

		svc := NewPortfolioService(persistence.New(mt.DB).Holdings, &stubPriceFetcher{
			rateErr: errors.New("forex out"),
		}, nil)

		_, _, err := svc.Prices(context.Background(), uid)
		if err == nil {
			t.Fatal("expected error when forex rate fails")
		}
	})
}
