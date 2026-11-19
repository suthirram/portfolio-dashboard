package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/persistence"
)

// failingCloses is a DailyCloser whose Yahoo call fails.
type failingCloses struct{}

func (failingCloses) GetDailyCloses(context.Context, string, time.Time, time.Time) (map[string]float64, error) {
	return nil, errors.New("yahoo down")
}

// flaggedVersion is the updated_at every flaggedDay was last written at.
var flaggedVersion = time.Date(2026, 11, 14, 9, 0, 0, 0, time.UTC)

// flaggedDay is a stored overall document carrying a fallback rate.
func flaggedDay(userId primitive.ObjectID, date time.Time) bson.D {
	return bson.D{
		{Key: "user_id", Value: userId}, {Key: "date", Value: date},
		{Key: "fx_carried", Value: true}, {Key: "updated_at", Value: flaggedVersion},
	}
}

// refetchFor wires an OverallRefetch at Saturday 2026-11-14 10:00 UTC, so
// Friday 2026-11-13 is a past day and the current trading day is Saturday.
func refetchFor(mt *mtest.T, prices PriceFetcher, closer DailyCloser) *OverallRefetch {
	store := persistence.New(mt.DB)
	store.AttachOverall()
	refetch := NewOverallRefetch(store.Overall, store.Snapshots, prices, closer, zap.NewNop())
	refetch.Now = func() time.Time { return time.Date(2026, 11, 14, 10, 0, 0, 0, time.UTC) }
	return refetch
}

// overallUpdates returns the update statements sent to portfolio_overall.
func overallUpdates(mt *mtest.T) []bson.Raw {
	var updates []bson.Raw
	for _, event := range mt.GetAllStartedEvents() {
		if event.CommandName == "update" {
			updates = append(updates, event.Command.Lookup("updates").Array().Index(0).Value().Document())
		}
	}
	return updates
}

func TestOverallRefetchHealsAFlaggedPastDay(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("heal", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, backfillFriday)),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, backfillFriday, 11)),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
		)
		calls := 0
		missing, err := refetchFor(mt, eurQuote{calls: new(int)}, eurCloses{closes: map[string]float64{"2026-11-13": 90}, calls: &calls}).
			Refetch(context.Background(), userId, []time.Time{backfillFriday})
		if err != nil {
			t.Fatalf("Refetch: %v", err)
		}
		if len(missing) != 0 || calls != 1 {
			t.Errorf("missing = %v, Yahoo calls = %d; want none missing after one call", missing, calls)
		}
		updates := overallUpdates(mt)
		if len(updates) != 1 {
			t.Fatalf("overall updates = %d; want 1", len(updates))
		}
		if carried, ok := updates[0].Lookup("q", "fx_carried").BooleanOK(); !ok || !carried {
			t.Error("the heal must only match a day that is still flagged, never a good stored rate")
		}
		if version, ok := updates[0].Lookup("q", "updated_at").TimeOK(); !ok || !version.Equal(flaggedVersion) {
			t.Errorf("heal filter updated_at = %v; want the version read with the flagged list", version)
		}
		if upsert, _ := updates[0].Lookup("upsert").BooleanOK(); upsert {
			t.Error("the heal must never create a document")
		}
		set := updates[0].Lookup("u", "$set")
		if got := set.Document().Lookup("stocks_current_inr").Double(); got != 2090 {
			t.Errorf("stocks_current_inr = %v; want 1100 + 11×90 = 2090", got)
		}
		if carried := set.Document().Lookup("fx_carried").Boolean(); carried {
			t.Error("a healed day must clear fx_carried")
		}
	})
}

// A History edit between the snapshot read and the heal rewrites the day's
// totals (and updated_at) but leaves it flagged: the heal must not match,
// so the older totals never overwrite the newer ones, and the day is
// reported for a retry.
func TestOverallRefetchLeavesADayChangedMidFetchFlagged(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("concurrent edit", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, backfillFriday)),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, backfillFriday, 11)),
			// The edit moved updated_at: the versioned filter matches nothing.
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}),
		)
		missing, err := refetchFor(mt, eurQuote{calls: new(int)}, eurCloses{closes: map[string]float64{"2026-11-13": 90}, calls: new(int)}).
			Refetch(context.Background(), userId, []time.Time{backfillFriday})
		if err != nil {
			t.Fatalf("Refetch: %v", err)
		}
		if len(missing) != 1 || missing[0] != "2026-11-13" {
			t.Errorf("missing = %v; want [2026-11-13] left flagged for a retry", missing)
		}
	})
}

func TestOverallRefetchKeepsDaysFlaggedWhenYahooFails(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("failure", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, backfillFriday)))
		missing, err := refetchFor(mt, eurQuote{calls: new(int)}, failingCloses{}).
			Refetch(context.Background(), userId, []time.Time{backfillFriday})
		if err != nil {
			t.Fatalf("a failed fetch must not be an error: %v", err)
		}
		if len(missing) != 1 || missing[0] != "2026-11-13" {
			t.Errorf("missing = %v; want [2026-11-13]", missing)
		}
		if len(overallUpdates(mt)) != 0 {
			t.Error("a failed fetch must write nothing")
		}
	})
}

func TestOverallRefetchIgnoresDaysThatAreNotFlagged(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("not flagged", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch))
		calls := 0
		missing, err := refetchFor(mt, eurQuote{calls: new(int)}, eurCloses{calls: &calls}).
			Refetch(context.Background(), userId, []time.Time{backfillThursday})
		if err != nil {
			t.Fatalf("Refetch: %v", err)
		}
		if len(missing) != 0 || calls != 0 || len(overallUpdates(mt)) != 0 {
			t.Errorf("missing = %v, Yahoo calls = %d; an unflagged day needs no fetch and no write", missing, calls)
		}
	})
}

func TestOverallRefetchUsesTheLiveQuoteForTheCurrentTradingDay(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("current day", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		monday := time.Date(2026, 11, 16, 0, 0, 0, 0, time.UTC)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, flaggedDay(userId, monday)),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, monday, 11)),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
		)
		quotes, closes := 0, 0
		refetch := refetchFor(mt, eurQuote{rate: 91, calls: &quotes}, eurCloses{calls: &closes})
		refetch.Now = func() time.Time { return time.Date(2026, 11, 16, 6, 0, 0, 0, time.UTC) } // 11:30 IST Monday
		missing, err := refetch.Refetch(context.Background(), userId, []time.Time{monday})
		if err != nil {
			t.Fatalf("Refetch: %v", err)
		}
		if len(missing) != 0 || quotes != 1 || closes != 0 {
			t.Errorf("missing = %v, quotes = %d, closes calls = %d; want the live quote only", missing, quotes, closes)
		}
		updates := overallUpdates(mt)
		if len(updates) != 1 || updates[0].Lookup("u", "$set", "eur_inr").Double() != 91 {
			t.Errorf("updates = %v; want eur_inr 91 from the live quote", updates)
		}
	})
}

func TestOverallRefetchRequiresDates(t *testing.T) {
	t.Parallel()
	refetch := NewOverallRefetch(nil, nil, nil, nil, zap.NewNop())
	if _, err := refetch.Refetch(context.Background(), primitive.NewObjectID(), nil); !errors.Is(err, ErrInvalidDate) {
		t.Errorf("err = %v; want ErrInvalidDate", err)
	}
}
