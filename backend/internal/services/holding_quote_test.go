package services

import (
	"context"
	"errors"
	"math"
	"testing"

	"portfolio-dashboard/internal/domain"
)

func TestHoldingQuote(t *testing.T) {
	rates := map[string]float64{"USD/EUR": 0.9}
	cases := []struct {
		name            string
		holdingCurrency string
		quoteCurrency   string
		wantPrice       float64
		wantCurrency    string
	}{
		{name: "USD quote on a EUR holding converts to EUR", holdingCurrency: "EUR", quoteCurrency: "USD", wantPrice: 180, wantCurrency: "EUR"},
		{name: "EUR quote on a EUR holding stays", holdingCurrency: "EUR", quoteCurrency: "EUR", wantPrice: 200, wantCurrency: "EUR"},
		{name: "INR quote on an INR holding stays", holdingCurrency: "INR", quoteCurrency: "INR", wantPrice: 200, wantCurrency: "INR"},
		{name: "USD quote on an INR holding stays", holdingCurrency: "INR", quoteCurrency: "USD", wantPrice: 200, wantCurrency: "USD"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			holding := domain.Holding{Symbol: "NVDA", Currency: tc.holdingCurrency}
			prices := &stubPriceFetcher{price: 200, priceCur: tc.quoteCurrency, previousClose: new(100.0), rates: rates}

			got, err := holdingQuote(context.Background(), prices, holding)
			if err != nil {
				t.Fatalf("holdingQuote: %v", err)
			}
			if math.Abs(got.Price-tc.wantPrice) > 1e-9 || got.Currency != tc.wantCurrency {
				t.Errorf("quote = %v %s, want %v %s", got.Price, got.Currency, tc.wantPrice, tc.wantCurrency)
			}
			// The previous close converts with the price, so the day change stays in one currency.
			wantPreviousClose := 100 * tc.wantPrice / 200
			if got.PreviousClosePrice == nil || math.Abs(*got.PreviousClosePrice-wantPreviousClose) > 1e-9 {
				t.Errorf("previous close = %v, want %v", got.PreviousClosePrice, wantPreviousClose)
			}
		})
	}
}

func TestHoldingQuote_RateFailureFailsTheQuote(t *testing.T) {
	holding := domain.Holding{Symbol: "NVDA", Currency: "EUR"}
	for name, prices := range map[string]*stubPriceFetcher{
		"rate error": {price: 200, priceCur: "USD", rateErr: errors.New("yahoo status 429")},
		"zero rate":  {price: 200, priceCur: "USD", rates: map[string]float64{}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := holdingQuote(context.Background(), prices, holding); err == nil {
				t.Fatal("err = nil, want the conversion failure: a USD price must never be counted as EUR")
			}
		})
	}
}

func TestHoldingWithPriceToAPI_EURHoldingOfUSDListing(t *testing.T) {
	// 2 NVDA bought for €150 each; Yahoo quotes $200, and $1 = €0.9.
	holding := domain.Holding{Symbol: "NVDA", Currency: "EUR", StocksOwned: 2, AvgCostPrice: 150}
	prices := &stubPriceFetcher{price: 200, priceCur: "USD", rates: map[string]float64{"USD/EUR": 0.9}}

	got := HoldingWithPriceToAPI(context.Background(), holding, prices, 0.011)

	if got.CurrentPrice == nil || *got.CurrentPrice != 180 {
		t.Errorf("CurrentPrice = %v, want 180 (EUR)", got.CurrentPrice)
	}
	if got.CurrentValueEur == nil || *got.CurrentValueEur != 360 {
		t.Errorf("CurrentValueEur = %v, want 360", got.CurrentValueEur)
	}
	if got.UnrealizedPnlEur == nil || *got.UnrealizedPnlEur != 60 {
		t.Errorf("UnrealizedPnlEur = %v, want 60", got.UnrealizedPnlEur)
	}
}
