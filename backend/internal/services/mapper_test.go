package services

import (
	"context"
	"errors"
	"testing"

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
