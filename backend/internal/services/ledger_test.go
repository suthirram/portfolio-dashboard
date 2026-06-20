package services

import (
	"errors"
	"math"
	"testing"
	"time"

	"portfolio-dashboard/internal/domain"
)

// day returns a deterministic date n days after a fixed epoch, so ledger order
// is stable without touching the wall clock.
func day(n int) time.Time {
	return time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC).AddDate(0, 0, n)
}

// tx builds a buy/sell/opening event: qty shares for a total cash Amount.
func tx(typ domain.TxnType, d int, qty, amount float64) domain.Transaction {
	return domain.Transaction{Type: typ, Date: day(d), CreatedAt: day(d), Quantity: qty, Amount: amount}
}

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func assertPos(t *testing.T, got Position, qty, avg, realized, div float64) {
	t.Helper()
	if !approx(got.StocksOwned, qty) {
		t.Errorf("StocksOwned = %v, want %v", got.StocksOwned, qty)
	}
	if !approx(got.AvgCostPrice, avg) {
		t.Errorf("AvgCostPrice = %v, want %v", got.AvgCostPrice, avg)
	}
	if !approx(got.RealizedPnL, realized) {
		t.Errorf("RealizedPnL = %v, want %v", got.RealizedPnL, realized)
	}
	if !approx(got.TotalDividends, div) {
		t.Errorf("TotalDividends = %v, want %v", got.TotalDividends, div)
	}
}

// Average cost: buy 10 for 1000 (avg 100), buy 10 for 2000 (avg 150),
// sell 10 credited 2500 ⇒ realized 2500 − 150×10 = 1000, remaining 10 @ 150.
func TestRecomputePosition_AverageCost(t *testing.T) {
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 10, 1000),
		tx(domain.TxnBuy, 1, 10, 2000),
		tx(domain.TxnSell, 2, 10, 2500),
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 10, 150, 1000, 0)
}

// Fees are folded into the cash amounts: buy 10 debited 1020 ⇒ avg 102;
// sell 5 credited 740 ⇒ realized 740 − 102×5 = 230, remaining 5 @ 102.
func TestRecomputePosition_FeesFoldedIntoAmount(t *testing.T) {
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 10, 1020),
		tx(domain.TxnSell, 1, 5, 740),
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 5, 102, 230, 0)
}

// Sell everything then rebuy starts a fresh average.
func TestRecomputePosition_FullExitResetsAverage(t *testing.T) {
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 10, 1000),
		tx(domain.TxnSell, 1, 10, 1500),
		tx(domain.TxnBuy, 2, 5, 1000),
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 5, 200, 500, 0)
}

func TestRecomputePosition_SplitDropsAvgCost(t *testing.T) {
	// Buy 10 for 1000 (avg 100), 2-for-1 split ⇒ 20 shares, avg 50.
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 10, 1000),
		{Type: domain.TxnSplit, Date: day(1), CreatedAt: day(1), Ratio: 2},
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 20, 50, 0, 0)
}

func TestRecomputePosition_BonusDropsAvgCost(t *testing.T) {
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 10, 1000),
		{Type: domain.TxnBonus, Date: day(1), CreatedAt: day(1), Ratio: 2},
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 20, 50, 0, 0)
}

func TestRecomputePosition_DividendsAccumulate(t *testing.T) {
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 10, 1000),
		{Type: domain.TxnDividend, Date: day(1), CreatedAt: day(1), Amount: 35},
		{Type: domain.TxnDividend, Date: day(2), CreatedAt: day(2), Amount: 15},
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 10, 100, 0, 50)
}

func TestRecomputePosition_OversellRejected(t *testing.T) {
	txns := []domain.Transaction{
		tx(domain.TxnBuy, 0, 5, 500),
		tx(domain.TxnSell, 1, 10, 1500),
	}
	got, err := RecomputePosition(txns)
	if !errors.Is(err, ErrOversell) {
		t.Errorf("want ErrOversell, got %v", err)
	}
	if !approx(got.StocksOwned, 0) {
		t.Errorf("StocksOwned = %v, want 0", got.StocksOwned)
	}
}

// Migration equivalence: a single opening event reproduces the legacy
// stocks_owned/avg_cost_price/realized_pnl identically (Amount = qty × avg).
func TestRecomputePosition_OpeningSeedEquivalence(t *testing.T) {
	txns := []domain.Transaction{{
		Type: domain.TxnOpening, Date: day(0), CreatedAt: day(0),
		Quantity: 25, Amount: 25 * 412.5, RealizedSeed: 1234.56,
	}}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 25, 412.5, 1234.56, 0)
}

func TestRecomputePosition_OpeningIsBaselineNotDateOrdered(t *testing.T) {
	// Opening dated AFTER a backdated buy must still be the baseline: buy
	// adds to the opening position rather than being matched before it.
	txns := []domain.Transaction{
		{Type: domain.TxnOpening, Date: day(9), CreatedAt: day(9), Quantity: 10, Amount: 1000},
		tx(domain.TxnBuy, 0, 10, 2000),
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	// 20 shares, basis 3000 ⇒ avg 150; no sells.
	assertPos(t, got, 20, 150, 0, 0)
}

func TestRecomputePosition_OrdersByDateNotInsertion(t *testing.T) {
	// Sell entered first (later CreatedAt) but dated after the buy must still
	// be applied after it.
	txns := []domain.Transaction{
		{Type: domain.TxnSell, Date: day(2), CreatedAt: day(9), Quantity: 10, Amount: 2500},
		{Type: domain.TxnBuy, Date: day(0), CreatedAt: day(8), Quantity: 10, Amount: 1000},
	}
	got, err := RecomputePosition(txns)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	assertPos(t, got, 0, 0, 1500, 0)
}
