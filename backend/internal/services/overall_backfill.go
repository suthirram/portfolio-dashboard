package services

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// OverallBackfill builds portfolio_overall from stored snapshots (PD-059,
// DD-015 §2.6). It only reads portfolio_snapshots. Apply fills days without
// a rate and never overwrites a rated one; Rebuild recomputes every day's
// totals and keeps a stored rate.
type OverallBackfill struct {
	snapshots *persistence.SnapshotStore
	overall   *persistence.OverallStore
	closer    DailyCloser
	logger    *zap.Logger
	Now       func() time.Time

	closes     map[string]float64
	closesFrom time.Time
	days       []string // sorted keys of closes
}

// NewOverallBackfill wires an OverallBackfill.
func NewOverallBackfill(snapshots *persistence.SnapshotStore, overall *persistence.OverallStore, closer DailyCloser, logger *zap.Logger) *OverallBackfill {
	return &OverallBackfill{snapshots: snapshots, overall: overall, closer: closer, logger: logger, Now: func() time.Time { return time.Now().UTC() }}
}

// OverallBackfillOptions selects the mode.
type OverallBackfillOptions struct {
	DryRun  bool
	Rebuild bool
}

// OverallBackfillReport is one user's outcome. The dry run fills it with
// exactly the selection apply would make, so it is a true preview:
// SkippedRated is what apply leaves alone, ToWrite what it would write,
// WithoutRate the ToWrite rows that get no exchange rate (whether or not
// their INR total can be computed), and Min/MaxCurrent span the ToWrite rows
// whose total is known.
type OverallBackfillReport struct {
	Rows         int
	SkippedRated int
	ToWrite      int
	Written      int
	WithoutRate  int
	MinCurrent   float64
	MaxCurrent   float64
}

// RunUser backfills one user. Both stores are read first; Yahoo is called
// only when some row needs a rate it does not already have, so a rebuild
// with every rate stored works through a Yahoo outage.
func (b *OverallBackfill) RunUser(ctx context.Context, userId primitive.ObjectID, opts OverallBackfillOptions) (_ OverallBackfillReport, retErr error) {
	ctx, span := tracer.Start(ctx, "OverallBackfill.RunUser")
	defer endSpan(span, &retErr)
	report := OverallBackfillReport{}
	today := domain.UTCDate(b.Now())
	rows, err := b.snapshots.List(ctx, userId, time.Time{}, today)
	if err != nil || len(rows) == 0 {
		return report, err
	}
	earliest := rows[len(rows)-1].Date // List is newest first
	existing, err := b.overall.List(ctx, userId, earliest, today)
	if err != nil {
		return report, err
	}
	rated := make(map[string]domain.OverallDay, len(existing))
	for _, day := range existing {
		if day.EurInr != nil {
			rated[day.Date.UTC().Format("2006-01-02")] = day
		}
	}

	// Selection, shared by dry run, apply and rebuild: apply skips rated
	// days; rebuild keeps their stored rate. Only the rest need Yahoo.
	var needRateFrom *time.Time
	for _, row := range rows {
		if _, ok := rated[row.Date.UTC().Format("2006-01-02")]; !ok {
			date := row.Date
			needRateFrom = &date // rows are newest first, so this ends earliest
		}
	}
	if needRateFrom != nil {
		if err := b.ensureCloses(ctx, *needRateFrom, today); err != nil {
			return report, err
		}
	}

	report.MinCurrent = -1
	for _, row := range rows {
		report.Rows++
		date := row.Date.UTC().Format("2006-01-02")
		stored, isRated := rated[date]
		if isRated && !opts.Rebuild {
			report.SkippedRated++
			continue
		}
		rate := domain.FxRate{EurInr: stored.EurInr, FxDate: stored.FxDate, Carried: stored.FxCarried}
		if !isRated {
			rate = rateOn(b.days, b.closes, date)
		}
		report.ToWrite++
		// A day without a rate is counted even when its INR total exists (an
		// INR-only day): it still has no EUR amounts on the chart and is
		// offered for re-fetch, so the dry run must show it.
		if rate.EurInr == nil {
			report.WithoutRate++
		}
		if _, current := domain.OverallFromBuckets(row.Buckets, rate.EurInr); current != nil {
			if report.MinCurrent < 0 || *current < report.MinCurrent {
				report.MinCurrent = *current
			}
			report.MaxCurrent = max(report.MaxCurrent, *current)
		}
		if opts.DryRun {
			continue
		}
		written := true
		if opts.Rebuild {
			err = b.overall.Put(ctx, userId, row.Date, rate, row.Buckets)
		} else {
			// FillUnrated re-checks "no rate" in the database, a guard
			// against a live write landing between the read and this one.
			written, err = b.overall.FillUnrated(ctx, userId, row.Date, rate, row.Buckets)
		}
		if err != nil {
			return report, err
		}
		if written {
			report.Written++
		}
	}
	if report.MinCurrent < 0 {
		report.MinCurrent = 0
	}
	return report, nil
}

// ensureCloses fetches EUR→INR closes once per run, refetching only when a
// user's history starts earlier than the series already held.
func (b *OverallBackfill) ensureCloses(ctx context.Context, from, to time.Time) error {
	if b.closes != nil && !from.Before(b.closesFrom) {
		return nil
	}
	closes, err := b.closer.GetDailyCloses(ctx, eurInrSymbol, from.AddDate(0, 0, -7), to)
	if err != nil {
		return err
	}
	b.closes, b.closesFrom, b.days = closes, from, sortedDays(closes)
	return nil
}
