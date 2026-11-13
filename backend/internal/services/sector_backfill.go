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

// BackfillProfiles is what the sector backfill needs from the provider:
// lookups, plus whether Yahoo has rate-limited us, which stops the batch.
type BackfillProfiles interface {
	ProfileFetcher
	RateLimited() bool
}

// backfillHoldings is the slice of HoldingStore the backfill uses; tests
// substitute an in-memory store.
type backfillHoldings interface {
	ListByUser(ctx context.Context, userId primitive.ObjectID) ([]domain.Holding, error)
	SetClassification(ctx context.Context, userId, id primitive.ObjectID, symbol, holdingType string, expected *domain.Classification, classification domain.Classification) (domain.Holding, error)
}

// SectorBackfillOptions scopes one backfill run (DD-013 §1).
type SectorBackfillOptions struct {
	UserIds         []primitive.ObjectID
	Apply           bool // false: dry run, Yahoo is asked but nothing is written
	RetryUnresolved bool // also redo needs-review holdings for their current symbol
	Limit           int  // holdings to process this run; 0 means all
}

// SectorBackfillReport counts one run. Resolved and NeedsReview count the
// classifications written (or that would be, in a dry run); Conflicts are
// holdings changed meanwhile and left alone; Remaining were eligible but
// beyond the limit.
type SectorBackfillReport struct {
	Eligible    int
	Resolved    int
	NeedsReview int
	Skipped     int
	Conflicts   int
	Errors      int
	Remaining   int
	RateLimited bool // Yahoo rate-limited us; the batch stopped early
}

// SectorBackfill classifies existing holdings that have no classification for
// their current symbol, one lookup at a time.
type SectorBackfill struct {
	holdings backfillHoldings
	profiles BackfillProfiles
	logger   *zap.Logger
	now      func() time.Time
	// pace waits before looking up a symbol not yet seen in this run, keeping
	// to at most one new symbol per second.
	pace func(ctx context.Context) error
}

// NewSectorBackfill wires a backfill over the holdings store.
func NewSectorBackfill(holdings *persistence.HoldingStore, profiles BackfillProfiles, logger *zap.Logger) *SectorBackfill {
	return &SectorBackfill{holdings: holdings, profiles: profiles, logger: logger, now: time.Now, pace: waitOneSecond}
}

func waitOneSecond(ctx context.Context) error {
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (b *SectorBackfill) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, b.logger)
}

// NeedsBackfill reports whether holding should be looked up: it has no
// classification for its current symbol, or (with retryUnresolved) only a
// needs-review one. A resolved classification, including an owner's
// confirmation, is never redone.
func NeedsBackfill(holding domain.Holding, retryUnresolved bool) bool {
	classification := holding.Classification
	if !classification.CurrentFor(holding.Symbol) {
		return true
	}
	return retryUnresolved && classification.Status == domain.ClassificationNeedsReview
}

// Run backfills the users in opts in order. A per-holding provider failure is
// recorded as needs-review and the run continues; a Yahoo rate limit stops the
// run with RateLimited set and nothing written for that holding. Cancelling
// ctx stops before the next write and returns ctx's error. Each write is a
// compare-and-set, so a holding edited or confirmed meanwhile is a conflict,
// never overwritten. Reruns resume: processed holdings are no longer eligible.
func (b *SectorBackfill) Run(ctx context.Context, opts SectorBackfillOptions) (_ SectorBackfillReport, retErr error) {
	ctx, span := tracer.Start(ctx, "SectorBackfill.Run")
	defer endSpan(span, &retErr)
	logger := b.log(ctx)
	var report SectorBackfillReport
	seenSymbols := map[string]bool{}
	for _, userId := range opts.UserIds {
		holdings, err := b.holdings.ListByUser(ctx, userId)
		if err != nil {
			report.Errors++
			logger.Error("backfill list holdings failed", zap.String("owner", userId.Hex()), zap.Error(err))
			continue
		}
		ownerSectors := SectorLabels(holdings)
		for _, holding := range holdings {
			if !NeedsBackfill(holding, opts.RetryUnresolved) {
				report.Skipped++
				continue
			}
			if opts.Limit > 0 && report.Eligible >= opts.Limit {
				report.Remaining++
				continue
			}
			symbol := domain.CanonicalSymbol(holding.Symbol)
			if !seenSymbols[symbol] {
				if len(seenSymbols) > 0 {
					if err := b.pace(ctx); err != nil {
						return report, err
					}
				}
				seenSymbols[symbol] = true
			}
			classification, err := lookupClassification(ctx, b.profiles, holding.Symbol, holding.Type, func() ([]string, error) { return ownerSectors, nil }, b.now())
			// A cancelled lookup reads as unavailable; never record it.
			if ctxErr := ctx.Err(); ctxErr != nil {
				return report, ctxErr
			}
			if err != nil {
				report.Errors++
				logger.Error("backfill lookup failed", zap.String("holding", holding.ID.Hex()), zap.Error(err))
				continue
			}
			if classification.Source == "" && b.profiles.RateLimited() {
				report.RateLimited = true
				logger.Warn("backfill stopped", zap.String("outcome", "rate_limited"))
				return report, nil
			}
			report.Eligible++
			if opts.Apply {
				_, err := b.holdings.SetClassification(ctx, userId, holding.ID, holding.Symbol, holding.Type, holding.Classification, classification)
				if errors.Is(err, persistence.ErrNotFound) {
					report.Conflicts++
					continue
				}
				if err != nil {
					report.Errors++
					logger.Error("backfill write failed", zap.String("holding", holding.ID.Hex()), zap.Error(err))
					continue
				}
			}
			if classification.Status == domain.ClassificationResolved {
				report.Resolved++
				ownerSectors = append(ownerSectors, classification.Sector)
			} else {
				report.NeedsReview++
			}
		}
	}
	return report, nil
}
