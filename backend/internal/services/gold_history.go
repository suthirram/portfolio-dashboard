package services

import (
	"context"
	"sort"
	"time"

	"portfolio-dashboard/internal/domain"
)

// HistoryOverlay computes the physical-gold position for each history-row
// date (PRD-003 §8, DD-003 §4): two store reads — the full ledger and the
// price series up to the latest date — then a pure as-of walk. Keys of the
// result are the YYYY-MM-DD dates that have an overlay; rows before the
// first purchase or without any valuation price get none. GOLDBEES is
// untouched here — it already lives in the stock buckets.
func (s *GoldService) HistoryOverlay(ctx context.Context, uid string, dates []string) (map[string]domain.GoldHistoryPoint, error) {
	if len(dates) == 0 {
		return map[string]domain.GoldHistoryPoint{}, nil
	}
	txns, err := s.store.ListTransactions(ctx, uid)
	if err != nil {
		return nil, err
	}
	if len(txns) == 0 {
		return map[string]domain.GoldHistoryPoint{}, nil
	}
	parsed := make([]time.Time, 0, len(dates))
	for _, d := range dates {
		t, err := time.Parse("2006-01-02", d)
		if err != nil {
			continue // malformed row dates simply get no overlay
		}
		parsed = append(parsed, t)
	}
	if len(parsed) == 0 {
		return map[string]domain.GoldHistoryPoint{}, nil
	}
	sort.Slice(parsed, func(i, j int) bool { return parsed[i].Before(parsed[j]) })
	// All prices up to the last row date: the valuation rule is "nearest
	// earlier", so the window has no lower bound.
	prices, err := s.store.ListPrices(ctx, uid, time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC), parsed[len(parsed)-1])
	if err != nil {
		return nil, err
	}
	return goldOverlay(txns, prices, parsed), nil
}

// InvestedOn is the physical-gold invested amount at the end of each day:
// the cash paid for the purchases dated on or before it (PD-052). Unlike
// HistoryOverlay it needs no price, so a purchase counts from its own day
// even before the first price is entered. One store read.
func (s *GoldService) InvestedOn(ctx context.Context, userId string, days []time.Time) (_ []float64, retErr error) {
	ctx, span := tracer.Start(ctx, "GoldService.InvestedOn")
	defer endSpan(span, &retErr)
	txns, err := s.store.ListTransactions(ctx, userId)
	if err != nil {
		return nil, err
	}
	return goldInvestedOn(txns, days), nil
}

// goldInvestedOn sums ActualPaid of the purchases dated on or before each
// day; purchases and days may come in any order.
func goldInvestedOn(txns []domain.GoldTransaction, days []time.Time) []float64 {
	invested := make([]float64, len(days))
	for i, day := range days {
		for _, txn := range txns {
			if !dateOnly(txn.Date).After(dateOnly(day)) {
				invested[i] += txn.ActualPaid
			}
		}
	}
	return invested
}

// goldOverlay is the pure as-of walk behind HistoryOverlay. txns and
// prices arrive in ascending date order (the store guarantees it); dates
// must be ascending. Volatility chains across the rows that actually get
// an overlay, in window order, starting at 0.
func goldOverlay(txns []domain.GoldTransaction, prices []domain.GoldPrice, dates []time.Time) map[string]domain.GoldHistoryPoint {
	out := make(map[string]domain.GoldHistoryPoint, len(dates))

	ti, pi := 0, 0
	invested, grams := 0.0, 0.0
	var price *float64
	var prevCurrent *float64

	for _, d := range dates {
		day := dateOnly(d)
		for ti < len(txns) && !dateOnly(txns[ti].Date).After(day) {
			invested += txns[ti].ActualPaid
			grams += txns[ti].GramsBought
			ti++
		}
		for pi < len(prices) && !dateOnly(prices[pi].Date).After(day) {
			price = &prices[pi].PricePerGram
			pi++
		}
		if grams == 0 && invested == 0 {
			continue // position did not exist yet
		}
		if price == nil {
			continue // nothing to value the grams with
		}

		point := domain.GoldHistoryPoint{
			Invested: invested,
			Current:  grams * *price,
		}
		if prevCurrent != nil && *prevCurrent != 0 {
			point.VolatilityPct = (point.Current - *prevCurrent) / *prevCurrent * 100
		}
		if invested != 0 {
			pnl := (point.Current - invested) / invested * 100
			point.PnlPct = &pnl
		}
		out[day.Format("2006-01-02")] = point
		cur := point.Current
		prevCurrent = &cur
	}
	return out
}
