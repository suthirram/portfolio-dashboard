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

// ErrOverallUnavailable is returned when portfolio_overall is not attached.
var ErrOverallUnavailable = errors.New("overall history is not available")

// OverallPoint is one day of the overall chart: stocks plus gold, in INR and
// in EUR at the day's stored rate. Nil amounts are unknown, never zero.
type OverallPoint struct {
	Date        string
	InvestedInr *float64
	CurrentInr  *float64
	InvestedEur *float64
	CurrentEur  *float64
	EurInr      *float64
	FxCarried   bool
	MissingRate bool
	// GoldUnvalued marks a day on which gold was held but had no price to
	// value it with yet (bought before the first price entry): the total is
	// unknown, never a stock-only figure (owner, 2026-11-18). Entering the
	// price heals the day on the next read.
	GoldUnvalued bool
}

// OverallGold is the gold side of the overall chart: the existing overlay
// (nearest earlier price, so a day without a price copies the previous
// day's), whether gold was held on each day, and Unavailable when gold
// could not be read at all for a gold-enabled account.
type OverallGold struct {
	Overlay     map[string]domain.GoldHistoryPoint
	Held        map[string]bool
	Unavailable bool
}

// OverallService reads portfolio_overall (PD-059).
type OverallService struct {
	store  *persistence.OverallStore
	logger *zap.Logger
}

// NewOverallService wires an OverallService; store may be nil (unattached).
func NewOverallService(store *persistence.OverallStore, logger *zap.Logger) *OverallService {
	return &OverallService{store: store, logger: logger}
}

func (s *OverallService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// Days returns the user's overall documents in [from, to], oldest first.
func (s *OverallService) Days(ctx context.Context, userId primitive.ObjectID, from, to time.Time) (_ []domain.OverallDay, retErr error) {
	ctx, span := tracer.Start(ctx, "OverallService.Days")
	defer endSpan(span, &retErr)
	if s.store == nil {
		return nil, ErrOverallUnavailable
	}
	if to.Before(from) {
		return nil, ErrInvalidDate
	}
	days, err := s.store.List(ctx, userId, from, to)
	if err != nil {
		logger := s.log(ctx)
		logger.Error("overall history read failed", zap.Error(err))
		return nil, err
	}
	return days, nil
}

// OverallPoints adds gold to each day's stock totals and converts the sum to
// EUR at the day's rate. Amounts are nil — never a partial figure — when the
// day has no stock totals (MissingRate), when gold could not be read at all
// (gold.Unavailable), or when gold was held but had no price (GoldUnvalued).
// A day before any gold was held simply has no gold.
func OverallPoints(days []domain.OverallDay, gold OverallGold) []OverallPoint {
	points := make([]OverallPoint, 0, len(days))
	for _, day := range days {
		date := day.Date.UTC().Format("2006-01-02")
		point := OverallPoint{Date: date, EurInr: day.EurInr, FxCarried: day.FxCarried}
		goldPoint, valued := gold.Overlay[date]
		switch {
		case day.StocksInvestedInr == nil || day.StocksCurrentInr == nil:
			point.MissingRate = true
		case !gold.Unavailable && !valued && gold.Held[date]:
			point.GoldUnvalued = true
		}
		if point.MissingRate || point.GoldUnvalued || gold.Unavailable {
			points = append(points, point)
			continue
		}
		investedInr, currentInr := *day.StocksInvestedInr, *day.StocksCurrentInr
		if valued {
			investedInr += goldPoint.Invested
			currentInr += goldPoint.Current
		}
		investedInr, currentInr = round(investedInr), round(currentInr)
		point.InvestedInr, point.CurrentInr = &investedInr, &currentInr
		if day.EurInr != nil && *day.EurInr > 0 {
			investedEur, currentEur := round(investedInr / *day.EurInr), round(currentInr / *day.EurInr)
			point.InvestedEur, point.CurrentEur = &investedEur, &currentEur
		}
		points = append(points, point)
	}
	return points
}
