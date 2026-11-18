package services

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/persistence"
)

type fixedCloses map[string]float64

func (closes fixedCloses) GetDailyCloses(context.Context, string, time.Time, time.Time) (map[string]float64, error) {
	return closes, nil
}

// noYahoo fails the test if the backfill asks Yahoo for anything.
type noYahoo struct{ t *testing.T }

func (closer noYahoo) GetDailyCloses(context.Context, string, time.Time, time.Time) (map[string]float64, error) {
	closer.t.Error("Yahoo was called although every needed rate is stored")
	return nil, nil
}

var (
	backfillThursday = time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	backfillFriday   = time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)
)

// snapshotRow is one stored snapshot with INR and EUR buckets.
func snapshotRow(userId primitive.ObjectID, date time.Time, eurCurrent float64) bson.D {
	return bson.D{
		{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId},
		{Key: "date", Value: date}, {Key: "currency", Value: "INR"},
		{Key: "regions", Value: bson.D{
			{Key: "INR", Value: bson.D{{Key: "invested", Value: 1000.0}, {Key: "current", Value: 1100.0}, {Key: "source", Value: "cron"}}},
			{Key: "EUR", Value: bson.D{{Key: "invested", Value: 10.0}, {Key: "current", Value: eurCurrent}, {Key: "source", Value: "cron"}}},
		}},
	}
}

// ratedDay is a stored overall document with a rate.
func ratedDay(userId primitive.ObjectID, date time.Time, rate float64) bson.D {
	return bson.D{
		{Key: "user_id", Value: userId}, {Key: "date", Value: date},
		{Key: "eur_inr", Value: rate}, {Key: "fx_date", Value: date.Format("2006-01-02")}, {Key: "fx_carried", Value: false},
	}
}

func backfillFor(mt *mtest.T, closer DailyCloser) *OverallBackfill {
	store := persistence.New(mt.DB)
	store.AttachOverall()
	backfill := NewOverallBackfill(store.Snapshots, store.Overall, closer, zap.NewNop())
	backfill.Now = func() time.Time { return backfillFriday }
	return backfill
}

func sentTo(mt *mtest.T, collection string) []string {
	var commands []string
	for _, event := range mt.GetAllStartedEvents() {
		if name, _ := event.Command.Lookup(event.CommandName).StringValueOK(); name == collection {
			commands = append(commands, event.CommandName)
		}
	}
	return commands
}

func TestOverallBackfillFillsOnlyUnratedDays(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("apply", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, backfillFriday, 11)),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
		)
		report, err := backfillFor(mt, fixedCloses{"2026-11-13": 90}).RunUser(context.Background(), userId, OverallBackfillOptions{})
		if err != nil {
			t.Fatalf("RunUser: %v", err)
		}
		if report.ToWrite != 1 || report.WithoutRate != 0 || report.MaxCurrent != 2090 {
			t.Errorf("report = %+v; want 1 row converted to 1100 + 11×90 = 2090", report)
		}
		for _, command := range sentTo(mt, "portfolio_snapshots") {
			if command != "find" {
				t.Errorf("the backfill sent %q to portfolio_snapshots; it must only read them", command)
			}
		}
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName != "update" {
				continue
			}
			update := event.Command.Lookup("updates").Array().Index(0).Value().Document()
			if exists, ok := update.Lookup("q", "eur_inr", "$exists").BooleanOK(); !ok || exists {
				t.Error("apply must only fill days without a rate, never overwrite a live one")
			}
		}
	})
}

func TestOverallBackfillDryRunPreviewsApply(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("one rated, one unrated", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch,
				snapshotRow(userId, backfillFriday, 50), snapshotRow(userId, backfillThursday, 11)),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, ratedDay(userId, backfillFriday, 90)),
		)
		report, err := backfillFor(mt, fixedCloses{"2026-11-12": 100}).RunUser(context.Background(), userId, OverallBackfillOptions{DryRun: true})
		if err != nil {
			t.Fatalf("RunUser: %v", err)
		}
		if report.Rows != 2 || report.SkippedRated != 1 || report.ToWrite != 1 || report.Written != 0 {
			t.Errorf("report = %+v; want 2 rows, 1 skipped as rated, 1 to write, 0 written", report)
		}
		if report.MinCurrent != 2200 || report.MaxCurrent != 2200 {
			t.Errorf("min/max = %v/%v; want only the unrated Thursday (1100 + 11×100 = 2200)", report.MinCurrent, report.MaxCurrent)
		}
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName == "update" || event.CommandName == "insert" {
				t.Fatalf("dry run sent %q", event.CommandName)
			}
		}
	})
}

func TestOverallBackfillRebuildWithStoredRatesSkipsYahoo(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("rebuild", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, snapshotRow(userId, backfillFriday, 11)),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_overall", mtest.FirstBatch, ratedDay(userId, backfillFriday, 90)),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
		)
		report, err := backfillFor(mt, noYahoo{t: t}).RunUser(context.Background(), userId, OverallBackfillOptions{Rebuild: true})
		if err != nil {
			t.Fatalf("RunUser: %v", err)
		}
		if report.Written != 1 || report.MaxCurrent != 2090 {
			t.Errorf("report = %+v; want the day rebuilt at its stored rate 90 (2090)", report)
		}
	})
}
