package services

import (
	"math"
	"testing"

	"portfolio-dashboard/internal/domain"
)

func goldTxn(d string, paid, grams float64) domain.GoldTransaction {
	return domain.GoldTransaction{Date: goldDay(d), ActualPaid: paid, GramsBought: grams, GmPrice: paid / grams}
}

// wantPtr asserts a nullable metric: want nil → must be nil, otherwise
// must match within tolerance.
func wantPtr(t *testing.T, name string, got, want *float64) {
	t.Helper()
	switch {
	case want == nil && got != nil:
		t.Errorf("%s = %v, want null", name, *got)
	case want != nil && got == nil:
		t.Errorf("%s = null, want %v", name, *want)
	case want != nil && math.Abs(*got-*want) > 1e-3:
		t.Errorf("%s = %v, want %v", name, *got, *want)
	}
}

// TestBuildMetrics pins the PRD-003 §6 metric formulas, including the
// owner's worked example: 72 g invested at 100/g valued at 200/g →
// invested 7200, current 14400, P/L 7200 (100%).
func TestBuildMetrics(t *testing.T) {
	today := goldDay("2026-07-07")

	t.Run("owner worked example", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2025-07-07", 7200, 72)}
		price := 200.0
		bees := 500.0
		m := buildMetrics(txns, &price, &bees, today)

		if m.Invested != 7200 || m.Grams != 72 {
			t.Fatalf("invested/grams = %v/%v, want 7200/72", m.Invested, m.Grams)
		}
		wantPtr(t, "current", m.Current, f64(14400))
		wantPtr(t, "nett_ex_bees", m.NettExBees, f64(7200))
		wantPtr(t, "nett_in_bees", m.NettInBees, f64(7700))
		wantPtr(t, "avg_per_gram", m.AvgPerGram, f64(100))
		// One flow of -7200 a year ago, +14400 today: doubling in a year.
		wantPtr(t, "xirr", m.Xirr, f64(1.0))
	})

	t.Run("no price row leaves valuation null but totals present", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-01", 59500, 8)}
		bees := 0.0
		m := buildMetrics(txns, nil, &bees, today)

		if m.Invested != 59500 || m.Grams != 8 {
			t.Fatalf("invested/grams = %v/%v", m.Invested, m.Grams)
		}
		wantPtr(t, "current", m.Current, nil)
		wantPtr(t, "nett_ex_bees", m.NettExBees, nil)
		wantPtr(t, "nett_in_bees", m.NettInBees, nil)
		wantPtr(t, "xirr", m.Xirr, nil)
		wantPtr(t, "avg_per_gram", m.AvgPerGram, f64(7437.5))
	})

	t.Run("bees quote unavailable nulls only the bees rows", func(t *testing.T) {
		txns := []domain.GoldTransaction{goldTxn("2026-07-01", 7000, 1)}
		price := 7100.0
		m := buildMetrics(txns, &price, nil, today)

		wantPtr(t, "bees_pl", m.BeesPl, nil)
		wantPtr(t, "nett_in_bees", m.NettInBees, nil)
		wantPtr(t, "nett_ex_bees", m.NettExBees, f64(100))
	})

	t.Run("empty ledger yields zeros and nulls", func(t *testing.T) {
		bees := 250.0
		price := 7100.0
		m := buildMetrics(nil, &price, &bees, today)

		if m.Invested != 0 || m.Grams != 0 {
			t.Fatalf("invested/grams = %v/%v, want 0/0", m.Invested, m.Grams)
		}
		wantPtr(t, "avg_per_gram", m.AvgPerGram, nil)
		wantPtr(t, "xirr", m.Xirr, nil)
		wantPtr(t, "current", m.Current, f64(0))
	})
}
