package services

import (
	"math"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func calendarDay(year int, month time.Month, dayOfMonth int) time.Time {
	return time.Date(year, month, dayOfMonth, 0, 0, 0, 0, time.UTC)
}

func calendarDayPtr(year int, month time.Month, dayOfMonth int) *time.Time {
	date := calendarDay(year, month, dayOfMonth)
	return &date
}

func assertRate(t *testing.T, label string, got *float64, want float64) {
	t.Helper()
	if got == nil {
		t.Fatalf("%s xirr = nil, want %.4f", label, want)
	}
	if math.Abs(*got-want) > 1e-6 {
		t.Errorf("%s xirr = %.6f, want %.6f", label, *got, want)
	}
}

func holdingResult(t *testing.T, view api.StockXirrView, holdingId primitive.ObjectID) api.StockXirrHolding {
	t.Helper()
	for _, holding := range view.Holdings {
		if holding.HoldingId == holdingId.Hex() {
			return holding
		}
	}
	t.Fatalf("holding %s missing from view", holdingId.Hex())
	return api.StockXirrHolding{}
}

func TestLedgerFlow_SignsAndDates(t *testing.T) {
	cases := []struct {
		name        string
		txn         domain.Transaction
		wantAmount  float64
		wantDate    time.Time
		wantUndated bool
		wantCash    bool
	}{
		{"buy pays out", domain.Transaction{Type: domain.TxnBuy, Date: calendarDay(2025, 3, 1), Amount: 500}, -500, calendarDay(2025, 3, 1), false, true},
		{"sell pays in", domain.Transaction{Type: domain.TxnSell, Date: calendarDay(2025, 3, 2), Amount: 700}, 700, calendarDay(2025, 3, 2), false, true},
		{"dividend pays in", domain.Transaction{Type: domain.TxnDividend, Date: calendarDay(2025, 3, 3), Amount: 40}, 40, calendarDay(2025, 3, 3), false, true},
		{"dated opening uses its opening date", domain.Transaction{
			Type: domain.TxnOpening, Date: calendarDay(2026, 6, 1), OpeningDate: calendarDayPtr(2024, 1, 15), Amount: 900,
		}, -900, calendarDay(2024, 1, 15), false, true},
		{"undated opening falls back to the ordering date", domain.Transaction{
			Type: domain.TxnOpening, Date: calendarDay(2026, 6, 1), Amount: 900,
		}, -900, calendarDay(2026, 6, 1), true, true},
		{"split moves no cash", domain.Transaction{Type: domain.TxnSplit, Date: calendarDay(2025, 1, 1), Ratio: 2}, 0, time.Time{}, false, false},
		{"bonus moves no cash", domain.Transaction{Type: domain.TxnBonus, Date: calendarDay(2025, 1, 1), Ratio: 2}, 0, time.Time{}, false, false},
		{"merger moves no cash", domain.Transaction{Type: domain.TxnMerger, Date: calendarDay(2025, 1, 1)}, 0, time.Time{}, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			flow, undated, isCash := ledgerFlow(tc.txn)
			if isCash != tc.wantCash || undated != tc.wantUndated {
				t.Fatalf("cash=%v undated=%v, want cash=%v undated=%v", isCash, undated, tc.wantCash, tc.wantUndated)
			}
			if !tc.wantCash {
				return
			}
			if flow.Amount != tc.wantAmount || !flow.Date.Equal(tc.wantDate) {
				t.Errorf("flow = %v on %s, want %v on %s", flow.Amount, flow.Date, tc.wantAmount, tc.wantDate)
			}
		})
	}
}

// ₹1,000 that is worth ₹1,100 exactly 365 days later is a 10% XIRR.
func TestBuildStockXirr_HeldPosition(t *testing.T) {
	holdingId := primitive.NewObjectID()
	holdings := []domain.Holding{{ID: holdingId, Symbol: "TCS.NS", Currency: "INR", StocksOwned: 10}}
	txns := []domain.Transaction{{HoldingID: holdingId, Type: domain.TxnOpening, Date: calendarDay(2026, 6, 1), OpeningDate: calendarDayPtr(2025, 1, 1), Amount: 1000}}

	view := buildStockXirr(holdings, txns, map[primitive.ObjectID]float64{holdingId: 1100}, calendarDay(2026, 1, 1))

	holding := holdingResult(t, view, holdingId)
	assertRate(t, "holding", holding.Xirr, 0.10)
	if holding.UndatedOpening {
		t.Error("undated_opening = true for a dated opening")
	}
	if holding.Since == nil || !holding.Since.Equal(calendarDay(2025, 1, 1)) {
		t.Errorf("since = %v, want 2025-01-01", holding.Since)
	}
	if len(view.Currencies) != 1 || view.Currencies[0].Currency != "INR" {
		t.Fatalf("currencies = %+v, want one INR bucket", view.Currencies)
	}
	assertRate(t, "INR", view.Currencies[0].Xirr, 0.10)
	if !view.AsOf.Equal(calendarDay(2026, 1, 1)) {
		t.Errorf("as_of = %s, want 2026-01-01", view.AsOf)
	}
}

// A sold-out holding has no terminal value: its rate comes from the
// realised cash alone. ₹1,000 → ₹1,210 over two years is 10% a year.
func TestBuildStockXirr_SoldOutUsesRealisedCash(t *testing.T) {
	holdingId := primitive.NewObjectID()
	holdings := []domain.Holding{{ID: holdingId, Symbol: "INFY.NS", Currency: "INR"}}
	txns := []domain.Transaction{
		{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2023, 1, 1), Amount: 1000},
		{HoldingID: holdingId, Type: domain.TxnSell, Date: calendarDay(2025, 1, 1), Amount: 1210},
	}

	view := buildStockXirr(holdings, txns, nil, calendarDay(2026, 11, 11))

	// 2023-01-01 → 2025-01-01 is 731 days (2024 is a leap year), ACT/365.
	assertRate(t, "holding", holdingResult(t, view, holdingId).Xirr, math.Pow(1.21, 365.0/731)-1)
}

// Dividends count as money received, so they raise the rate.
func TestBuildStockXirr_DividendsRaiseTheRate(t *testing.T) {
	holdingId := primitive.NewObjectID()
	holdings := []domain.Holding{{ID: holdingId, Symbol: "ITC.NS", Currency: "INR", StocksOwned: 1}}
	buy := domain.Transaction{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 1000}
	values := map[primitive.ObjectID]float64{holdingId: 1000}

	withoutDividend := buildStockXirr(holdings, []domain.Transaction{buy}, values, calendarDay(2026, 1, 1))
	withDividend := buildStockXirr(holdings, []domain.Transaction{buy,
		{HoldingID: holdingId, Type: domain.TxnDividend, Date: calendarDay(2026, 1, 1), Amount: 100},
	}, values, calendarDay(2026, 1, 1))

	assertRate(t, "no dividend", holdingResult(t, withoutDividend, holdingId).Xirr, 0)
	assertRate(t, "with dividend", holdingResult(t, withDividend, holdingId).Xirr, 0.10)
}

// The currency bucket pools every holding in that currency; EUR stays
// apart, a split moves no cash, and the INR bucket comes first.
func TestBuildStockXirr_CurrencyBuckets(t *testing.T) {
	tcs, infy, sap := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
	holdings := []domain.Holding{
		{ID: sap, Symbol: "SAP.DE", Currency: "EUR", StocksOwned: 1},
		{ID: tcs, Symbol: "TCS.NS", Currency: "INR", StocksOwned: 1},
		{ID: infy, Symbol: "INFY.NS", Currency: "", StocksOwned: 1}, // empty currency is INR
	}
	txns := []domain.Transaction{
		{HoldingID: tcs, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 600},
		{HoldingID: tcs, Type: domain.TxnSplit, Date: calendarDay(2025, 6, 1), Ratio: 2},
		{HoldingID: infy, Type: domain.TxnOpening, Date: calendarDay(2025, 1, 1), Amount: 400},
		{HoldingID: sap, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 100},
	}
	values := map[primitive.ObjectID]float64{tcs: 700, infy: 400, sap: 95}

	view := buildStockXirr(holdings, txns, values, calendarDay(2026, 1, 1))

	if len(view.Currencies) != 2 || view.Currencies[0].Currency != "INR" || view.Currencies[1].Currency != "EUR" {
		t.Fatalf("currencies = %+v, want INR then EUR", view.Currencies)
	}
	assertRate(t, "INR", view.Currencies[0].Xirr, 0.10) // (700+400) ÷ (600+400)
	assertRate(t, "EUR", view.Currencies[1].Xirr, -0.05)
	if view.Currencies[0].UndatedOpenings != 1 {
		t.Errorf("INR undated_openings = %d, want 1", view.Currencies[0].UndatedOpenings)
	}
	if !holdingResult(t, view, infy).UndatedOpening {
		t.Error("INFY undated_opening = false, want true")
	}
}

// XIRR is money-weighted: the same prices give a better rate when more
// money went in before the rise. Here ₹1,000 is added either just before
// or just after the price doubles.
func TestBuildStockXirr_RewardsGoodTiming(t *testing.T) {
	holdingId := primitive.NewObjectID()
	holdings := []domain.Holding{{ID: holdingId, Symbol: "X.NS", Currency: "INR", StocksOwned: 1}}
	first := domain.Transaction{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 1000}
	today := calendarDay(2026, 1, 1)

	// Early: the second ₹1,000 buys before the doubling, so it doubles too.
	early := buildStockXirr(holdings, []domain.Transaction{first,
		{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 2, 1), Amount: 1000},
	}, map[primitive.ObjectID]float64{holdingId: 4000}, today)
	// Late: the second ₹1,000 buys after the doubling and stays flat.
	late := buildStockXirr(holdings, []domain.Transaction{first,
		{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 12, 1), Amount: 1000},
	}, map[primitive.ObjectID]float64{holdingId: 3000}, today)

	earlyRate := holdingResult(t, early, holdingId).Xirr
	lateRate := holdingResult(t, late, holdingId).Xirr
	if earlyRate == nil || lateRate == nil || *earlyRate <= *lateRate {
		t.Fatalf("early = %v, late = %v; want early > late", earlyRate, lateRate)
	}
}

// Holdings outside the INR/EUR buckets are left out, events of an unknown
// holding are ignored, and a holding with no cash flows has no rate.
func TestBuildStockXirr_SkipsWhatCannotBeMeasured(t *testing.T) {
	usd, empty := primitive.NewObjectID(), primitive.NewObjectID()
	holdings := []domain.Holding{
		{ID: usd, Symbol: "AAPL", Currency: "USD", StocksOwned: 1},
		{ID: empty, Symbol: "NEW.NS", Currency: "INR"},
	}
	txns := []domain.Transaction{
		{HoldingID: usd, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 100},
		{HoldingID: primitive.NewObjectID(), Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 999},
	}

	view := buildStockXirr(holdings, txns, map[primitive.ObjectID]float64{usd: 120}, calendarDay(2026, 1, 1))

	if len(view.Holdings) != 1 || view.Holdings[0].HoldingId != empty.Hex() {
		t.Fatalf("holdings = %+v, want only the INR holding", view.Holdings)
	}
	if view.Holdings[0].Xirr != nil || view.Holdings[0].Since != nil {
		t.Errorf("empty holding = %+v, want no rate and no since", view.Holdings[0])
	}
	if len(view.Currencies) != 1 || view.Currencies[0].Xirr != nil {
		t.Errorf("currencies = %+v, want one INR bucket with no rate", view.Currencies)
	}
}
