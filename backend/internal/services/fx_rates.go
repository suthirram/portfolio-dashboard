package services

import (
	"context"
	"sort"
	"time"

	"portfolio-dashboard/internal/domain"
)

// eurInrSymbol is Yahoo's EUR→INR pair: INR per 1 EUR.
const eurInrSymbol = "EURINR=X"

// DailyCloser fetches a symbol's daily closes (PriceService.GetDailyCloses).
type DailyCloser interface {
	GetDailyCloses(ctx context.Context, symbol string, from, to time.Time) (map[string]float64, error)
}

// sortedDays is a close series' trading days in order, for rateOn.
func sortedDays(closes map[string]float64) []string {
	days := make([]string, 0, len(closes))
	for day := range closes {
		days = append(days, day)
	}
	sort.Strings(days)
	return days
}

// rateOn is the rate for date from a close series: the close on that day,
// else the last close before it (a weekend or holiday, carried with its own
// fx_date, not flagged). No close on or before date is unknown and flagged.
// Shared by the past-day snapshot run and the backfill (PD-059).
func rateOn(days []string, closes map[string]float64, date string) domain.FxRate {
	index := sort.SearchStrings(days, date)
	if index < len(days) && days[index] == date {
		rate := closes[date]
		return domain.FxRate{EurInr: &rate, FxDate: date}
	}
	if index == 0 {
		return domain.FxRate{Carried: true}
	}
	previous := days[index-1]
	rate := closes[previous]
	return domain.FxRate{EurInr: &rate, FxDate: previous}
}
