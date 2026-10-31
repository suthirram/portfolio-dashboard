package services

import (
	"slices"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
)

// DividendHistoryPoint is one currency's dividends as of a History row.
type DividendHistoryPoint struct {
	ToDate float64 `json:"to_date"` // received on or before the row date
	OnDay  float64 `json:"on_day"`  // received on the row date
}

// StockKey identifies one stock line of a History row. The same symbol can
// be held in INR and in EUR, so the currency is part of the key: the two
// amounts never mix (PRD-005 §3, §12).
type StockKey struct {
	Currency string
	Symbol   string
}

// DividendDay is the overlay for one row date: per currency, and per stock
// (to date) for the per-stock breakdown.
type DividendDay struct {
	ByCurrency map[string]DividendHistoryPoint
	ByStock    map[StockKey]float64
}

// DividendOverlay computes dividends to date per currency and per stock for
// each row date (YYYY-MM-DD). dividends are in tab order.
func DividendOverlay(dividends []domain.Transaction, holdings []domain.Holding, dates []string) map[string]DividendDay {
	symbolOf := make(map[primitive.ObjectID]string, len(holdings))
	for _, holding := range holdings {
		symbolOf[holding.ID] = holding.Symbol
	}
	sorted := slices.Clone(dates)
	slices.Sort(sorted)

	out := make(map[string]DividendDay, len(sorted))
	toDate := map[string]int64{}
	byStock := map[StockKey]int64{}
	i := 0
	for _, date := range sorted {
		cutoff, err := time.Parse(time.DateOnly, date)
		if err != nil {
			continue
		}
		onDay := map[string]int64{}
		for ; i < len(dividends) && !domain.UTCDate(dividends[i].Date).After(cutoff); i++ {
			dividend := dividends[i]
			// Stored currencies are canonical (ledgerCurrency, Task 3A), the same
			// code a snapshot line carries (CurrencyOf), so the keys line up.
			currency, cents := dividend.Currency, domain.AmountCents(dividend.Amount)
			toDate[currency] += cents
			byStock[StockKey{Currency: currency, Symbol: symbolOf[dividend.HoldingID]}] += cents
			if domain.UTCDate(dividend.Date).Equal(cutoff) {
				onDay[currency] += cents
			}
		}
		day := DividendDay{ByCurrency: map[string]DividendHistoryPoint{}, ByStock: map[StockKey]float64{}}
		for currency, cents := range toDate {
			day.ByCurrency[currency] = DividendHistoryPoint{ToDate: domain.CentsToMoney(cents), OnDay: domain.CentsToMoney(onDay[currency])}
		}
		for stock, cents := range byStock {
			day.ByStock[stock] = domain.CentsToMoney(cents)
		}
		out[date] = day
	}
	return out
}
