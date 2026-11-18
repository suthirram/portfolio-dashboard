package persistence

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
)

var overallDay = time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)

func attachedStore(mt *mtest.T) *Store {
	store := New(mt.DB)
	store.AttachOverall()
	return store
}

// overallCommands returns the started commands sent to portfolio_overall, in order.
func overallCommands(mt *mtest.T) []bson.Raw {
	var commands []bson.Raw
	for _, event := range mt.GetAllStartedEvents() {
		if name, ok := event.Command.Lookup(event.CommandName).StringValueOK(); ok && name == "portfolio_overall" {
			commands = append(commands, event.Command)
		}
	}
	return commands
}

func TestSnapshotUpsertWithJobRateWritesTheOverallDay(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("insert + overall put", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch),
			mtest.CreateSuccessResponse(),
			mtest.CreateSuccessResponse(),
		)
		rate := 90.0
		err := attachedStore(mt).Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			UserID: primitive.NewObjectID(), Date: overallDay, Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{
				domain.CurrencyINR: {Invested: 1000, Current: 1100, Source: domain.SnapshotSourceCron},
				domain.CurrencyEUR: {Invested: 10, Current: 11, Source: domain.SnapshotSourceCron},
			},
			Fx: &domain.FxRate{EurInr: &rate, FxDate: "2026-11-13"},
		})
		if err != nil {
			t.Fatalf("Upsert: %v", err)
		}
		writes := overallCommands(mt)
		if len(writes) != 1 {
			t.Fatalf("overall writes = %d; want 1", len(writes))
		}
		update := writes[0].Lookup("updates").Array().Index(0).Value().Document()
		if got := update.Lookup("u", "$set", "stocks_current_inr").Double(); got != 2090 {
			t.Errorf("stocks_current_inr = %v; want 1100 + 11×90 = 2090", got)
		}
		if got := update.Lookup("u", "$set", "eur_inr").Double(); got != 90 {
			t.Errorf("eur_inr = %v; want 90", got)
		}
		if upsert, _ := update.Lookup("upsert").BooleanOK(); !upsert {
			t.Error("the job's write must create the day's document")
		}
	})
}

func TestSnapshotPatchRegionsRefreshesAtTheStoredRate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("patch + read back + pipeline refresh", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		row := snapshotBSON(userId, overallDay, map[string]domain.RegionSnapshot{
			domain.CurrencyINR: {Invested: 1000, Current: 1200, Source: domain.SnapshotSourceManual},
			domain.CurrencyEUR: {Invested: 10, Current: 12, Source: domain.SnapshotSourceCron},
		})
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}, bson.E{Key: "nModified", Value: 1}),
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, row),
			mtest.CreateSuccessResponse(),
		)
		err := attachedStore(mt).Snapshots.PatchRegions(context.Background(), userId, overallDay, map[string]domain.RegionSnapshot{
			domain.CurrencyINR: {Invested: 1000, Current: 1200},
		})
		if err != nil {
			t.Fatalf("PatchRegions: %v", err)
		}
		writes := overallCommands(mt)
		if len(writes) != 1 {
			t.Fatalf("overall writes = %d; want 1", len(writes))
		}
		update := writes[0].Lookup("updates").Array().Index(0).Value().Document()
		if update.Lookup("u").Type != bson.TypeArray {
			t.Error("refresh must be a pipeline update that reads the stored eur_inr")
		}
		if upsert, _ := update.Lookup("upsert").BooleanOK(); !upsert {
			t.Error("a refresh must create the day's document when a History edit adds a new date")
		}
		stage := update.Lookup("u").Array().Index(0).Value().Document()
		if _, err := stage.LookupErr("$set", "fx_carried", "$ifNull"); err != nil {
			t.Error("a new document must be flagged fx_carried until its rate is fetched")
		}
	})
}

func TestSnapshotDeleteRemovesTheOverallDay(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("force delete", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		row := snapshotBSON(userId, overallDay, map[string]domain.RegionSnapshot{
			domain.CurrencyINR: {Invested: 1, Current: 1, Source: domain.SnapshotSourceCron},
		})
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, row),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
		)
		if err := attachedStore(mt).Snapshots.ForceDelete(context.Background(), userId, overallDay); err != nil {
			t.Fatalf("ForceDelete: %v", err)
		}
		if writes := overallCommands(mt); len(writes) != 1 {
			t.Fatalf("overall deletes = %d; want 1", len(writes))
		}
	})
}

func TestUnattachedSnapshotStoreLeavesOverallAlone(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("no overall", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch),
			mtest.CreateSuccessResponse(),
		)
		err := New(mt.DB).Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			UserID: primitive.NewObjectID(), Date: overallDay, Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{domain.CurrencyINR: {Invested: 1, Current: 1, Source: domain.SnapshotSourceCron}},
		})
		if err != nil {
			t.Fatalf("Upsert: %v", err)
		}
		if writes := overallCommands(mt); len(writes) != 0 {
			t.Fatalf("overall writes = %d; want 0 without AttachOverall", len(writes))
		}
	})
}
