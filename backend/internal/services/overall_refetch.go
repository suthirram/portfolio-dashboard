package services

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// OverallRefetch re-fetches the EUR→INR rate of a user's flagged
// portfolio_overall days (PD-059, DD-015 §2.7). fx_carried marks a
// fallback rate after a failed fetch, or no rate yet (a History add for a
// new date). Snapshot rows are only read, to recompute each healed day's
// totals at its new rate.
type OverallRefetch struct {
	overall   *persistence.OverallStore
	snapshots *persistence.SnapshotStore
	prices    PriceFetcher
	closer    DailyCloser
	logger    *zap.Logger
	Now       func() time.Time
}

// NewOverallRefetch wires an OverallRefetch; overall may be nil
// (unattached) and closer may be nil (no historical closes: past days stay
// flagged).
func NewOverallRefetch(overall *persistence.OverallStore, snapshots *persistence.SnapshotStore, prices PriceFetcher, closer DailyCloser, logger *zap.Logger) *OverallRefetch {
	return &OverallRefetch{overall: overall, snapshots: snapshots, prices: prices, closer: closer, logger: logger, Now: func() time.Time { return time.Now().UTC() }}
}

func (r *OverallRefetch) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, r.logger)
}

// Missing lists the user's flagged days, newest first, as YYYY-MM-DD.
func (r *OverallRefetch) Missing(ctx context.Context, userId primitive.ObjectID) (_ []string, retErr error) {
	ctx, span := tracer.Start(ctx, "OverallRefetch.Missing")
	defer endSpan(span, &retErr)
	days, err := r.flagged(ctx, userId)
	if err != nil {
		return nil, err
	}
	dates := make([]string, 0, len(days))
	for _, day := range days {
		dates = append(dates, day.Date.UTC().Format(time.DateOnly))
	}
	return dates, nil
}

// flagged reads the user's flagged days, newest first, with the
// updated_at each heal checks.
func (r *OverallRefetch) flagged(ctx context.Context, userId primitive.ObjectID) ([]domain.OverallDay, error) {
	if r.overall == nil {
		return nil, ErrOverallUnavailable
	}
	days, err := r.overall.ListCarried(ctx, userId)
	if err != nil {
		logger := r.log(ctx)
		logger.Error("fx missing read failed", zap.Error(err))
		return nil, err
	}
	return days, nil
}

// Refetch re-fetches the requested days that are still flagged and heals
// each one a rate is found for. It returns the requested days that remain
// flagged, newest first; days that are not flagged are ignored. A failed
// Yahoo call is not an error: the days stay flagged and History offers
// them again (PRD-015 §4.4). Nor is a day changed while this runs (a
// History edit rewrote its totals): it stays flagged so a retry heals it
// from fresh buckets.
func (r *OverallRefetch) Refetch(ctx context.Context, userId primitive.ObjectID, dates []time.Time) (_ []string, retErr error) {
	ctx, span := tracer.Start(ctx, "OverallRefetch.Refetch")
	defer endSpan(span, &retErr)
	if len(dates) == 0 {
		return nil, ErrInvalidDate
	}
	flagged, err := r.flagged(ctx, userId)
	if err != nil {
		return nil, err
	}
	requested := make(map[string]bool, len(dates))
	for _, date := range dates {
		requested[domain.UTCDate(date).Format(time.DateOnly)] = true
	}
	pending := make([]string, 0, len(dates))
	seen := make(map[string]time.Time, len(dates))
	for _, day := range flagged {
		date := day.Date.UTC().Format(time.DateOnly)
		if requested[date] {
			pending = append(pending, date)
			seen[date] = day.UpdatedAt
		}
	}
	logger := r.log(ctx)
	rates := r.ratesFor(ctx, logger, pending)
	missing := make([]string, 0, len(pending))
	for _, date := range pending {
		rate, found := rates[date]
		if !found {
			missing = append(missing, date)
			continue
		}
		day, _ := time.Parse(time.DateOnly, date)
		row, err := r.snapshots.Get(ctx, userId, day)
		if errors.Is(err, persistence.ErrNotFound) {
			logger.Warn("fx refetch: flagged day has no snapshot row", zap.String("date", date))
			missing = append(missing, date)
			continue
		}
		if err != nil {
			logger.Error("fx refetch: snapshot read failed", zap.String("date", date), zap.Error(err))
			return nil, err
		}
		healed, err := r.overall.HealCarried(ctx, userId, day, seen[date], rate, row.Buckets)
		if err != nil {
			logger.Error("fx refetch: overall write failed", zap.String("date", date), zap.Error(err))
			return nil, err
		}
		if !healed {
			logger.Info("fx refetch: day changed during the fetch; left flagged", zap.String("date", date))
			missing = append(missing, date)
		}
	}
	return missing, nil
}

// ratesFor finds a rate for each pending day (newest first): the live
// quote for the current trading day on a weekday, as the snapshot job uses
// it, and otherwise the day's close or the last close before it (rateOn)
// from one Yahoo call over the whole span. A day without a rate is left
// out of the map.
func (r *OverallRefetch) ratesFor(ctx context.Context, logger *zap.Logger, pending []string) map[string]domain.FxRate {
	rates := make(map[string]domain.FxRate, len(pending))
	currentDay := SnapshotTradingDay(r.Now())
	past := make([]string, 0, len(pending))
	for _, date := range pending {
		day, _ := time.Parse(time.DateOnly, date)
		if !day.Equal(currentDay) || isWeekend(day) {
			past = append(past, date)
			continue
		}
		rate, _, err := r.prices.GetPrice(ctx, eurInrSymbol)
		if err != nil || rate <= 0 {
			logger.Warn("fx refetch: EUR→INR quote failed", zap.Float64("rate", rate), zap.Error(err))
			continue
		}
		rates[date] = domain.FxRate{EurInr: &rate, FxDate: date}
	}
	if len(past) == 0 {
		return rates
	}
	if r.closer == nil {
		logger.Warn("fx refetch: no historical closes source; past days stay flagged")
		return rates
	}
	earliest, _ := time.Parse(time.DateOnly, past[len(past)-1])
	latest, _ := time.Parse(time.DateOnly, past[0])
	closes, err := r.closer.GetDailyCloses(ctx, eurInrSymbol, earliest.AddDate(0, 0, -7), latest)
	if err != nil {
		logger.Warn("fx refetch: EUR→INR closes fetch failed", zap.Error(err))
		return rates
	}
	days := sortedDays(closes)
	for _, date := range past {
		if rate := rateOn(days, closes, date); rate.EurInr != nil {
			rates[date] = rate
		}
	}
	return rates
}
