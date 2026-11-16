package cmd

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

// sectorBackfillBatch is how many holdings one batch classifies. Lookups run
// at most one new symbol per second, so a batch takes about a minute and the
// runner saves progress between batches.
const sectorBackfillBatch = 50

// sectorBackfillStep is the tracked form of `migrate sectors --all-users
// --apply` (PD-056): it classifies every user's holdings that have no
// classification for their current symbol. Progress needs no stored
// position: a classified holding is no longer eligible, so each batch picks
// up the next sectorBackfillBatch holdings and a retry resumes by itself.
// The cursor only counts batches. Holdings already needs-review are not
// retried; owners resolve them in the review queue.
type sectorBackfillStep struct {
	store    *persistence.Store
	backfill *services.SectorBackfill
	logger   *zap.Logger
}

func newSectorBackfillStep(store *persistence.Store, logger *zap.Logger) sectorBackfillStep {
	backfill := services.NewSectorBackfill(store.Holdings, services.NewCompanyProfileService(logger), logger)
	return sectorBackfillStep{store: store, backfill: backfill, logger: logger}
}

func (sectorBackfillStep) Version() string { return "20261116_01" }

func (s sectorBackfillStep) Run(ctx context.Context, cursor *string) (*string, error) {
	userIds, err := sectorBackfillUsers(ctx, s.store.Users, primitive.ObjectID{})
	if err != nil {
		return nil, err
	}
	report, err := s.backfill.Run(ctx, services.SectorBackfillOptions{
		UserIds: userIds,
		Apply:   true,
		Limit:   sectorBackfillBatch,
	})
	logSectorBackfillReport(s.logger, true, len(userIds), report)
	if err != nil {
		return nil, err
	}
	return sectorBackfillNext(report, cursor)
}

// sectorBackfillNext decides what follows a batch. A Yahoo rate limit or a
// holding that could not be looked up or written fails the step, so it is
// recorded failed and the next deploy retries it. Otherwise the step
// continues while holdings remain beyond the batch limit, and is done when
// none do.
func sectorBackfillNext(report services.SectorBackfillReport, cursor *string) (*string, error) {
	switch {
	case report.RateLimited:
		return nil, errors.New("yahoo rate-limited the lookups; the next run resumes")
	case report.Errors > 0:
		return nil, fmt.Errorf("%d holdings failed lookup or write; the next run retries them", report.Errors)
	case report.Remaining == 0:
		return nil, nil
	}
	batch := 0
	if cursor != nil {
		batch, _ = strconv.Atoi(*cursor)
	}
	return new(strconv.Itoa(batch + 1)), nil
}
