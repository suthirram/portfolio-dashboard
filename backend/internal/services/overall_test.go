package services

import (
	"testing"
	"time"

	"portfolio-dashboard/internal/domain"
)

// overallTestDay is a stored day converted at 100 INR per EUR.
func overallTestDay(date string, invested, current *float64) domain.OverallDay {
	parsed, _ := time.Parse("2006-01-02", date)
	rate := 100.0
	return domain.OverallDay{Date: parsed, EurInr: &rate, StocksInvestedInr: invested, StocksCurrentInr: current}
}

func TestOverallPoints(t *testing.T) {
	t.Parallel()
	days := []domain.OverallDay{
		overallTestDay("2026-11-11", new(900.0), new(950.0)),
		overallTestDay("2026-11-12", new(1000.0), new(1100.0)),
		overallTestDay("2026-11-13", new(1000.0), new(1200.0)),
		overallTestDay("2026-11-14", nil, nil),
	}
	gold := OverallGold{
		Overlay: map[string]domain.GoldHistoryPoint{"2026-11-13": {Invested: 500, Current: 600}},
		Held:    map[string]bool{"2026-11-12": true, "2026-11-13": true, "2026-11-14": true},
	}

	points := OverallPoints(days, gold)
	if len(points) != 4 {
		t.Fatalf("points = %d; want 4", len(points))
	}
	if points[0].CurrentInr == nil || *points[0].CurrentInr != 950 || points[0].GoldUnvalued {
		t.Errorf("day before any gold = %+v; want the stock total 950 with no gold", points[0])
	}
	if !points[1].GoldUnvalued || points[1].CurrentInr != nil || points[1].CurrentEur != nil {
		t.Errorf("gold held before its first price = %+v; want GoldUnvalued and nil amounts, not a stock-only total", points[1])
	}
	if points[2].GoldUnvalued || *points[2].InvestedInr != 1500 || *points[2].CurrentInr != 1800 || *points[2].CurrentEur != 18 {
		t.Errorf("day with gold = %+v; want 1500 / 1800 INR, 18 EUR", points[2])
	}
	if !points[3].MissingRate || points[3].CurrentInr != nil {
		t.Errorf("day without stock totals = %+v; want MissingRate and nil amounts", points[3])
	}
}

func TestOverallPointsWithGoldUnavailableHaveNoTotals(t *testing.T) {
	t.Parallel()
	days := []domain.OverallDay{overallTestDay("2026-11-13", new(1000.0), new(1200.0))}
	points := OverallPoints(days, OverallGold{Unavailable: true})
	if points[0].CurrentInr != nil || points[0].InvestedInr != nil {
		t.Errorf("point = %+v; want nil amounts — a stock-only figure must not pass as the overall total", points[0])
	}
}
