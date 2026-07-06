package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// ErrInvalidGoldPrice flags a price payload that fails the entered-field
// rules (PRD-003 §7); controllers map it to 400.
var ErrInvalidGoldPrice = errors.New("gold: invalid price")

// istZone matters because "today" bounds the missing-day window (PRD-003
// §7): the owner enters the local jeweler rate, so the calendar rolls on
// Indian time, not UTC — same zone the snapshot job keys on.
var istZone = time.FixedZone("IST", 5*60*60+30*60)

// goldToday returns the current IST calendar day, normalized to a bare
// UTC-midnight date so it compares cleanly with stored DATE values.
func goldToday() time.Time {
	now := time.Now().In(istZone)
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

// Prices returns uid's price rows with from ≤ date ≤ to (either bound open
// when nil), oldest first.
func (s *GoldService) Prices(ctx context.Context, uid string, from, to *openapi_types.Date) ([]api.GoldPrice, error) {
	lo, hi := time.Date(1, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(9999, 12, 31, 0, 0, 0, 0, time.UTC)
	if from != nil {
		lo = from.Time
	}
	if to != nil {
		hi = to.Time
	}
	if lo.After(hi) {
		return nil, fmt.Errorf("%w: to before from", ErrInvalidGoldPrice)
	}
	rows, err := s.store.ListPrices(ctx, uid, lo, hi)
	if err != nil {
		return nil, err
	}
	out := make([]api.GoldPrice, 0, len(rows))
	for _, r := range rows {
		out = append(out, api.GoldPrice{
			Date:         openapi_types.Date{Time: r.Date},
			PricePerGram: r.PricePerGram,
		})
	}
	return out, nil
}

// PutPrices validates and bulk-upserts price rows — re-entering an
// existing day's price is an edit, not an error.
func (s *GoldService) PutPrices(ctx context.Context, uid string, prices []api.GoldPrice) error {
	if len(prices) == 0 {
		return fmt.Errorf("%w: empty payload", ErrInvalidGoldPrice)
	}
	seen := make(map[string]bool, len(prices))
	rows := make([]domain.GoldPrice, 0, len(prices))
	for _, p := range prices {
		if p.Date.IsZero() {
			return fmt.Errorf("%w: date is required", ErrInvalidGoldPrice)
		}
		if p.PricePerGram <= 0 {
			return fmt.Errorf("%w: price for %s must be > 0", ErrInvalidGoldPrice, p.Date.Format("2006-01-02"))
		}
		key := p.Date.Format("2006-01-02")
		if seen[key] {
			return fmt.Errorf("%w: duplicate date %s", ErrInvalidGoldPrice, key)
		}
		seen[key] = true
		rows = append(rows, domain.GoldPrice{UserID: uid, Date: p.Date.Time, PricePerGram: p.PricePerGram})
	}
	return s.store.UpsertPrices(ctx, uid, rows)
}

// MissingDates lists the calendar days that owe a price row: first
// purchase date through today (IST), weekends included; no purchases → no
// obligation (PRD-003 §7).
func (s *GoldService) MissingDates(ctx context.Context, uid string) ([]openapi_types.Date, error) {
	first, ok, err := s.store.FirstTransactionDate(ctx, uid)
	if err != nil {
		return nil, err
	}
	today := goldToday()
	if !ok || first.After(today) {
		return []openapi_types.Date{}, nil
	}
	have, err := s.store.ListPrices(ctx, uid, first, today)
	if err != nil {
		return nil, err
	}
	gaps := missingDates(first, have, today)
	out := make([]openapi_types.Date, 0, len(gaps))
	for _, d := range gaps {
		out = append(out, openapi_types.Date{Time: d})
	}
	return out, nil
}

// missingDates walks every calendar day from first through today and
// returns the ones without a price row. Pure — pinned by unit tests; the
// service method only feeds it store rows.
func missingDates(first time.Time, have []domain.GoldPrice, today time.Time) []time.Time {
	priced := make(map[string]bool, len(have))
	for _, p := range have {
		priced[p.Date.Format("2006-01-02")] = true
	}
	var gaps []time.Time
	for d := dateOnly(first); !d.After(dateOnly(today)); d = d.AddDate(0, 0, 1) {
		if !priced[d.Format("2006-01-02")] {
			gaps = append(gaps, d)
		}
	}
	return gaps
}

// dateOnly strips clock and zone down to a UTC-midnight calendar date.
func dateOnly(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
