package services

import (
	"math"
	"testing"
	"time"

	"portfolio-dashboard/internal/domain"
)

func days(ds ...string) []time.Time {
	out := make([]time.Time, 0, len(ds))
	for _, d := range ds {
		out = append(out, goldDay(d))
	}
	return out
}

func priceRow(d string, v float64) domain.GoldPrice {
	return domain.GoldPrice{Date: goldDay(d), PricePerGram: v}
}

// TestGoldOverlay pins the PRD-003 §8 rules, starting with the owner's
// worked example: 72 g bought at 100/g, today's price 200/g → invested
// 7200, actual 14400, volatility 0.00, P/L 100%.
func TestGoldOverlay(t *testing.T) {
	t.Run("owner worked example", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-01", 7200, 72)}
		prices := []domain.GoldPrice{priceRow("2026-07-06", 200)}
		out := goldOverlay(txns, prices, days("2026-07-06"))

		p, ok := out["2026-07-06"]
		if !ok {
			t.Fatal("no overlay for the row date")
		}
		if p.Invested != 7200 || p.Current != 14400 {
			t.Errorf("invested/current = %v/%v, want 7200/14400", p.Invested, p.Current)
		}
		if p.VolatilityPct != 0 {
			t.Errorf("volatility = %v, want 0 (first row in window)", p.VolatilityPct)
		}
		if p.PnlPct == nil || *p.PnlPct != 100 {
			t.Errorf("pnl_pct = %v, want 100", p.PnlPct)
		}
	})

	t.Run("volatility chains across window rows", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-01", 10000, 100)}
		prices := []domain.GoldPrice{
			priceRow("2026-07-01", 100),
			priceRow("2026-07-02", 110),
			priceRow("2026-07-03", 99),
		}
		out := goldOverlay(txns, prices, days("2026-07-01", "2026-07-02", "2026-07-03"))

		if v := out["2026-07-01"].VolatilityPct; v != 0 {
			t.Errorf("day1 volatility = %v, want 0", v)
		}
		if v := out["2026-07-02"].VolatilityPct; math.Abs(v-10) > 1e-9 {
			t.Errorf("day2 volatility = %v, want 10 (10000→11000)", v)
		}
		if v := out["2026-07-03"].VolatilityPct; math.Abs(v-(-10)) > 1e-9 {
			t.Errorf("day3 volatility = %v, want -10 (11000→9900)", v)
		}
	})

	t.Run("rows before the first purchase get no overlay", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-03", 7000, 1)}
		prices := []domain.GoldPrice{priceRow("2026-07-01", 7000), priceRow("2026-07-03", 7000)}
		out := goldOverlay(txns, prices, days("2026-07-01", "2026-07-02", "2026-07-03"))

		if _, ok := out["2026-07-01"]; ok {
			t.Error("overlay present before first purchase")
		}
		if _, ok := out["2026-07-02"]; ok {
			t.Error("overlay present before first purchase")
		}
		if _, ok := out["2026-07-03"]; !ok {
			t.Error("overlay missing on purchase day")
		}
	})

	t.Run("price falls back to nearest earlier day", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-01", 7000, 1)}
		prices := []domain.GoldPrice{priceRow("2026-07-01", 7000)} // weekend gap after
		out := goldOverlay(txns, prices, days("2026-07-05"))

		p, ok := out["2026-07-05"]
		if !ok {
			t.Fatal("no overlay despite earlier price existing")
		}
		if p.Current != 7000 {
			t.Errorf("current = %v, want 7000 (carried price)", p.Current)
		}
	})

	t.Run("no price at all means no overlay", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-01", 7000, 1)}
		out := goldOverlay(txns, nil, days("2026-07-01"))
		if len(out) != 0 {
			t.Errorf("overlay = %v, want empty (nothing to value with)", out)
		}
	})

	t.Run("position accumulates across purchases", func(t *testing.T) {
		txns := []domain.GoldTransaction{
			goldTxn("2026-07-01", 7000, 1),
			goldTxn("2026-07-03", 7500, 1),
		}
		prices := []domain.GoldPrice{priceRow("2026-07-01", 7000), priceRow("2026-07-03", 7600)}
		out := goldOverlay(txns, prices, days("2026-07-01", "2026-07-03"))

		d3 := out["2026-07-03"]
		if d3.Invested != 14500 || d3.Current != 15200 {
			t.Errorf("day3 invested/current = %v/%v, want 14500/15200", d3.Invested, d3.Current)
		}
	})
}
