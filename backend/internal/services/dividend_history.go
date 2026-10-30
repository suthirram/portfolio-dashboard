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

// DividendDay is the overlay for one row date: per currency, and per symbol
// (to date) for the per-stock breakdown.
type DividendDay struct {
	ByCurrency map[string]DividendHistoryPoint
	BySymbol   map[string]float64
}

// DividendOverlay computes dividends to date per currency and per symbol for
// each row date (YYYY-MM-DD). txns are in tab order.
func DividendOverlay(txns []domain.Transaction, holdings []domain.Holding, dates []string) map[string]DividendDay {
	symbolOf := make(map[primitive.ObjectID]string, len(holdings))
	for _, h := range holdings {
		symbolOf[h.ID] = h.Symbol
	}
	sorted := slices.Clone(dates)
	slices.Sort(sorted)

	out := make(map[string]DividendDay, len(sorted))
	toDate := map[string]int64{}
	bySymbol := map[string]int64{}
	i := 0
	for _, date := range sorted {
		cutoff, err := time.Parse(time.DateOnly, date)
		if err != nil {
			continue
		}
		onDay := map[string]int64{}
		for ; i < len(txns) && !domain.UTCDate(txns[i].Date).After(cutoff); i++ {
			t := txns[i]
			// Stored currencies are canonical (ledgerCurrency, Task 3A).
			c, cents := t.Currency, domain.AmountCents(t.Amount)
			toDate[c] += cents
			bySymbol[symbolOf[t.HoldingID]] += cents
			if domain.UTCDate(t.Date).Equal(cutoff) {
				onDay[c] += cents
			}
		}
		day := DividendDay{ByCurrency: map[string]DividendHistoryPoint{}, BySymbol: map[string]float64{}}
		for c, cents := range toDate {
			day.ByCurrency[c] = DividendHistoryPoint{ToDate: domain.CentsToMoney(cents), OnDay: domain.CentsToMoney(onDay[c])}
		}
		for s, cents := range bySymbol {
			day.BySymbol[s] = domain.CentsToMoney(cents)
		}
		out[date] = day
	}
	return out
}
