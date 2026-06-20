package services

import (
	"errors"
	"sort"

	"portfolio-dashboard/internal/domain"
)

// ErrOversell is returned by RecomputePosition when a sell removes more shares
// than are held at that point in the ledger. Callers (the transactions service)
// reject the offending write; the returned Position still reflects the ledger
// clamped at zero so it is safe to inspect.
var ErrOversell = errors.New("ledger: sell exceeds shares held")

// Position is the derived state of a holding after replaying its full ledger.
type Position struct {
	StocksOwned    float64
	AvgCostPrice   float64 // running basis / qty (0 when flat)
	RealizedPnL    float64
	TotalDividends float64
}

// RecomputePosition replays txns into the current position using the
// average-cost method: a buy adds its total cost to the running basis, a sell
// realizes (credited Amount − avgCost×qty) and leaves the remainder's average
// unchanged. The function is pure and deterministic.
//
// split/bonus scale quantity by Ratio (basis invariant ⇒ avg cost falls);
// dividend accumulates TotalDividends; merger is a no-op on the position
// (recorded for audit elsewhere).
func RecomputePosition(txns []domain.Transaction) (Position, error) {
	// Order: the opening balance is always the baseline (sorts first regardless
	// of its calendar date), then by trade date, then insertion order for
	// same-day events.
	ordered := make([]domain.Transaction, len(txns))
	copy(ordered, txns)
	sort.SliceStable(ordered, func(i, j int) bool {
		oi, oj := ordered[i].Type == domain.TxnOpening, ordered[j].Type == domain.TxnOpening
		if oi != oj {
			return oi
		}
		if ordered[i].Date.Equal(ordered[j].Date) {
			return ordered[i].CreatedAt.Before(ordered[j].CreatedAt)
		}
		return ordered[i].Date.Before(ordered[j].Date)
	})

	var pos Position
	var totalQty, totalBasis float64
	var oversell error

	for _, t := range ordered {
		switch t.Type {
		case domain.TxnOpening:
			if t.Quantity > 0 {
				totalQty += t.Quantity
				totalBasis += t.Amount
			}
			pos.RealizedPnL += t.RealizedSeed
		case domain.TxnBuy:
			if t.Quantity > 0 {
				totalQty += t.Quantity
				totalBasis += t.Amount
			}
		case domain.TxnSell:
			var avg float64
			if totalQty > 0 {
				avg = totalBasis / totalQty
			}
			qty := t.Quantity
			if qty > totalQty {
				qty = totalQty
				oversell = ErrOversell
			}
			// proceeds (Amount) are the full sell credit; cost removed at avg.
			pos.RealizedPnL += t.Amount - avg*qty
			totalQty -= qty
			totalBasis -= avg * qty
		case domain.TxnSplit, domain.TxnBonus:
			// quantity ×Ratio, basis invariant ⇒ running average tracks
			// totalBasis/totalQty automatically.
			if t.Ratio > 0 {
				totalQty *= t.Ratio
			}
		case domain.TxnDividend:
			pos.TotalDividends += t.Amount
		case domain.TxnMerger:
			// no-op on the position; recorded for audit only
		}
	}

	pos.StocksOwned = totalQty
	if totalQty > 0 {
		pos.AvgCostPrice = totalBasis / totalQty
	}
	return pos, oversell
}
