package services

import (
	"math"
	"sort"
	"time"
)

// cashFlow is one dated amount in an XIRR series: negative = money out
// (a purchase), positive = money in (the terminal valuation).
type cashFlow struct {
	Date   time.Time
	Amount float64
}

// xirr computes the annualized internal rate of return of irregular dated
// flows — the spreadsheet XIRR() (DD-003 §2): ACT/365 day count,
// Newton–Raphson with a bisection fallback. ok is false when the series
// cannot have a rate (fewer than two flows, single-signed) or neither
// solver converges; the UI renders "—" then.
func xirr(flows []cashFlow) (rate float64, ok bool) {
	if len(flows) < 2 {
		return 0, false
	}
	sorted := make([]cashFlow, len(flows))
	copy(sorted, flows)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Date.Before(sorted[j].Date) })

	hasNeg, hasPos := false, false
	t0 := sorted[0].Date
	years := make([]float64, len(sorted))
	for i, f := range sorted {
		years[i] = f.Date.Sub(t0).Hours() / 24 / 365
		hasNeg = hasNeg || f.Amount < 0
		hasPos = hasPos || f.Amount > 0
	}
	if !hasNeg || !hasPos {
		return 0, false
	}

	npv := func(r float64) float64 {
		sum := 0.0
		for i, f := range sorted {
			sum += f.Amount / math.Pow(1+r, years[i])
		}
		return sum
	}
	dnpv := func(r float64) float64 {
		sum := 0.0
		for i, f := range sorted {
			if years[i] == 0 {
				continue
			}
			sum -= years[i] * f.Amount / math.Pow(1+r, years[i]+1)
		}
		return sum
	}

	const tol = 1e-9

	// Newton–Raphson from a conventional 10% guess.
	r := 0.1
	for range 100 {
		v := npv(r)
		if math.Abs(v) < tol {
			return r, true
		}
		d := dnpv(r)
		if d == 0 || math.IsNaN(d) || math.IsInf(d, 0) {
			break
		}
		next := r - v/d
		if next <= -1 || math.IsNaN(next) || math.IsInf(next, 0) {
			break
		}
		if math.Abs(next-r) < tol {
			return next, true
		}
		r = next
	}

	// Bisection fallback over (-1, 1000]: rates below -100%/yr or above
	// 100,000%/yr are not meaningful answers for a gold ledger anyway.
	lower, upper := -1+1e-9, 1000.0
	vLower, vUpper := npv(lower), npv(upper)
	if math.IsNaN(vLower) || math.IsInf(vLower, 0) ||
		math.IsNaN(vUpper) || math.IsInf(vUpper, 0) || vLower*vUpper > 0 {
		// NaN comparisons are always false, so an unchecked NaN bound would
		// slip past the sign test and bisect garbage.
		return 0, false
	}
	for range 200 {
		mid := (lower + upper) / 2
		v := npv(mid)
		switch {
		case math.Abs(v) < tol:
			return mid, true
		case v*vLower < 0:
			upper = mid
		default:
			lower, vLower = mid, v
		}
	}
	return (lower + upper) / 2, true
}
