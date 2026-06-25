package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
)

func TestHoldingWithPriceToAPI_PriceErrorAssumesZero(t *testing.T) {
	hld := domain.Holding{
		Script:       "IDFC",
		Symbol:       "IDFC.NS",
		Currency:     "INR",
		StocksOwned:  100,
		AvgCostPrice: 114.82,
	}
	ps := &stubPriceFetcher{priceErr: errors.New("yahoo status 404"), rate: 0.011}

	got := HoldingWithPriceToAPI(context.Background(), hld, ps, 0.011)

	if got.PriceError == nil {
		t.Fatalf("PriceError = nil, want the 404 surfaced")
	}
	if got.CurrentPrice == nil || *got.CurrentPrice != 0 {
		t.Errorf("CurrentPrice = %v, want 0", got.CurrentPrice)
	}
	if got.CurrentValue == nil || *got.CurrentValue != 0 {
		t.Errorf("CurrentValue = %v, want 0", got.CurrentValue)
	}
	// Whole cost is the unrealized loss when the symbol is assumed worthless.
	if got.UnrealizedPnl == nil || *got.UnrealizedPnl != -11482 {
		t.Errorf("UnrealizedPnl = %v, want -11482", got.UnrealizedPnl)
	}
}

func TestHoldingWithPriceToAPI_RoundsToTwoDecimals(t *testing.T) {
	hld := domain.Holding{
		Script:       "Vanguard S&P 500",
		Symbol:       "IE00BFMXXD54.SG",
		Currency:     "INR",
		StocksOwned:  1.949558,
		AvgCostPrice: 102.59,
	}
	ps := &stubPriceFetcher{price: 125.9, priceCur: "INR", rate: 0.011}

	got := HoldingWithPriceToAPI(context.Background(), hld, ps, 0.011)

	// 1.949558 × 102.59 = 200.00515… → 200.01
	if got.CostPrice == nil || *got.CostPrice != 200.01 {
		t.Errorf("CostPrice = %v, want 200.01", got.CostPrice)
	}
	// 1.949558 × 125.9 = 245.44935… → 245.45
	if got.CurrentValue == nil || *got.CurrentValue != 245.45 {
		t.Errorf("CurrentValue = %v, want 245.45", got.CurrentValue)
	}
}

func TestOpeningStatus(t *testing.T) {
	withOpening := primitive.NewObjectID()
	withDate := primitive.NewObjectID()
	noOpening := primitive.NewObjectID()
	d := time.Date(2026, time.June, 15, 0, 0, 0, 0, time.UTC)

	openings := map[primitive.ObjectID]domain.Transaction{
		withOpening: {Type: domain.TxnOpening},                  // seeded, date unset
		withDate:    {Type: domain.TxnOpening, OpeningDate: &d}, // seeded, date set
	}

	// Seeded but unset → has_opening true, opening_date nil (prompt fires).
	has, od := openingStatus(openings, withOpening)
	if has == nil || !*has {
		t.Fatalf("withOpening: has_opening = %v, want true", has)
	}
	if od != nil {
		t.Errorf("withOpening: opening_date = %v, want nil (unset)", od)
	}

	// Seeded and set → has_opening true, opening_date carries the date.
	has, od = openingStatus(openings, withDate)
	if has == nil || !*has {
		t.Fatalf("withDate: has_opening = %v, want true", has)
	}
	if od == nil || !od.Equal(d) {
		t.Errorf("withDate: opening_date = %v, want %v", od, d)
	}

	// No opening event → has_opening false, no prompt.
	has, od = openingStatus(openings, noOpening)
	if has == nil || *has {
		t.Fatalf("noOpening: has_opening = %v, want false", has)
	}
	if od != nil {
		t.Errorf("noOpening: opening_date = %v, want nil", od)
	}
}
