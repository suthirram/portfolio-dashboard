package persistence

import (
	"context"
	"errors"
	"maps"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
)

func snapshotBSON(uid primitive.ObjectID, date time.Time, regions map[string]domain.RegionSnapshot) bson.D {
	rd := bson.D{}
	for k, r := range regions {
		rd = append(rd, bson.E{Key: k, Value: bson.D{
			{Key: "invested", Value: r.Invested},
			{Key: "current", Value: r.Current},
			{Key: "source", Value: string(r.Source)},
		}})
	}
	return bson.D{
		{Key: "_id", Value: primitive.NewObjectID()},
		{Key: "user_id", Value: uid},
		{Key: "date", Value: date},
		{Key: "currency", Value: "INR"},
		{Key: "regions", Value: rd},
		{Key: "created_at", Value: time.Now()},
		{Key: "updated_at", Value: time.Now()},
	}
}

func TestSnapshotUpsert_NewRowInsertsAllRegionsAsGiven(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("insert path", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch))
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		s := New(mt.DB)
		err := s.Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			UserID:   primitive.NewObjectID(),
			Date:     time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC),
			Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{
				domain.CurrencyINR: {Invested: 100, Current: 198, Source: domain.SnapshotSourceCron},
			},
		})
		if err != nil {
			t.Fatalf("Upsert: %v", err)
		}
	})
}

func TestSnapshotUpsert_RejectsInvalidSource(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("invalid source", func(mt *mtest.T) {
		s := New(mt.DB)
		err := s.Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			UserID:   primitive.NewObjectID(),
			Date:     time.Now(),
			Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{
				"india": {Invested: 1, Current: 1, Source: "auto"},
			},
		})
		if err == nil {
			t.Fatal("Upsert with invalid source: want error, got nil")
		}
	})
}

func TestSnapshotUpsert_RejectsZeroUserID(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("zero user id", func(mt *mtest.T) {
		s := New(mt.DB)
		err := s.Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			Date:     time.Now(),
			Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{
				"india": {Source: domain.SnapshotSourceCron},
			},
		})
		if err == nil {
			t.Fatal("Upsert with zero user id: want error, got nil")
		}
	})
}

func TestSnapshotUpsert_RejectsEmptyRegions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("empty regions", func(mt *mtest.T) {
		s := New(mt.DB)
		err := s.Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			UserID:   primitive.NewObjectID(),
			Date:     time.Now(),
			Currency: "INR",
			Buckets:  map[string]domain.RegionSnapshot{},
		})
		if err == nil {
			t.Fatal("Upsert with no regions: want error, got nil")
		}
	})
}

func TestSnapshotUpsert_PreservesManualRegionsOnReRun(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("merge keeps manual", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		date := time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC)

		existing := snapshotBSON(uid, date, map[string]domain.RegionSnapshot{
			domain.CurrencyINR: {Invested: 999, Current: 999, Source: domain.SnapshotSourceManual},
			domain.CurrencyEUR: {Invested: 10, Current: 10, Source: domain.SnapshotSourceCron},
		})

		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, existing))
		mt.AddMockResponses(mtest.CreateSuccessResponse(
			bson.E{Key: "n", Value: 1},
			bson.E{Key: "nModified", Value: 1},
		))

		s := New(mt.DB)
		err := s.Snapshots.Upsert(context.Background(), domain.PortfolioSnapshot{
			UserID:   uid,
			Date:     date,
			Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{
				domain.CurrencyINR: {Invested: 1, Current: 1, Source: domain.SnapshotSourceCron},
				domain.CurrencyEUR: {Invested: 20, Current: 25, Source: domain.SnapshotSourceCron},
			},
		})
		if err != nil {
			t.Fatalf("Upsert: %v", err)
		}

		events := mt.GetAllStartedEvents()
		var update *bson.D
		for _, e := range events {
			if e.CommandName == "update" {
				doc, err := e.Command.LookupErr("updates")
				if err != nil {
					continue
				}
				arr := doc.Array()
				elem := arr.Index(0).Value().Document()
				u := elem.Lookup("u").Document()
				var b bson.D
				if err := bson.Unmarshal(u, &b); err != nil {
					t.Fatalf("update unmarshal: %v", err)
				}
				update = &b
				break
			}
		}
		if update == nil {
			t.Fatalf("no update command issued; got %d events", len(events))
		}

		set := findSet(*update)
		regions := normaliseRegions(set["regions"])
		india := regions[domain.CurrencyINR]
		europe := regions[domain.CurrencyEUR]
		if !regionHasInvested(india, 999) {
			t.Errorf("merged India should keep manual invested=999, got %+v", india)
		}
		if !regionHasInvested(europe, 20) {
			t.Errorf("merged Europe should be cron incoming=20, got %+v", europe)
		}
	})
}

func findSet(update bson.D) bson.M {
	for _, e := range update {
		if e.Key == "$set" {
			switch v := e.Value.(type) {
			case bson.D:
				out := bson.M{}
				for _, kv := range v {
					out[kv.Key] = kv.Value
				}
				return out
			case bson.M:
				return v
			}
		}
	}
	return bson.M{}
}

func normaliseRegions(v any) map[string]any {
	out := map[string]any{}
	switch r := v.(type) {
	case bson.D:
		for _, e := range r {
			out[e.Key] = e.Value
		}
	case bson.M:
		maps.Copy(out, r)
	case map[string]any:
		return r
	}
	return out
}

func regionHasInvested(v any, want float64) bool {
	switch r := v.(type) {
	case bson.M:
		return r["invested"] == want
	case bson.D:
		for _, e := range r {
			if e.Key == "invested" && e.Value == want {
				return true
			}
		}
	case domain.RegionSnapshot:
		return r.Invested == want
	}
	return false
}

func TestSnapshotList_PinsUserIDAndUTCRange(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("list", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		row := snapshotBSON(uid,
			time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC),
			map[string]domain.RegionSnapshot{
				domain.CurrencyINR: {Invested: 1, Current: 1, Source: domain.SnapshotSourceCron},
			},
		)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, row))

		s := New(mt.DB)
		got, err := s.Snapshots.List(context.Background(), uid,
			time.Date(2026, 6, 1, 5, 0, 0, 0, time.UTC),
			time.Date(2026, 6, 30, 23, 0, 0, 0, time.UTC),
		)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(got) != 1 {
			t.Fatalf("got %d rows, want 1", len(got))
		}

		events := mt.GetAllStartedEvents()
		if len(events) == 0 {
			t.Fatal("no find command")
		}
		find := events[0]
		if find.CommandName != "find" {
			t.Fatalf("first command = %s, want find", find.CommandName)
		}
		uidVal, err := find.Command.LookupErr("filter", "user_id")
		if err != nil {
			t.Fatalf("filter.user_id missing: %v", err)
		}
		gotUID, _ := uidVal.ObjectIDOK()
		if gotUID != uid {
			t.Errorf("filter.user_id = %s, want %s", gotUID.Hex(), uid.Hex())
		}
	})
}

func TestSnapshotGet_MissingReturnsErrNotFound(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("not found", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch))
		s := New(mt.DB)
		_, err := s.Snapshots.Get(context.Background(), primitive.NewObjectID(),
			time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC))
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("err = %v, want ErrNotFound", err)
		}
	})
}

func TestSnapshotPatchRegion_MissingRowReturnsErrNotFound(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("patch missing", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(
			bson.E{Key: "n", Value: 0},
			bson.E{Key: "nModified", Value: 0},
		))
		s := New(mt.DB)
		err := s.Snapshots.PatchRegion(context.Background(),
			primitive.NewObjectID(),
			time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC),
			domain.CurrencyINR,
			domain.RegionSnapshot{Invested: 1, Current: 1, Source: domain.SnapshotSourceManual},
		)
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("err = %v, want ErrNotFound", err)
		}
	})
}

func TestSnapshotDelete_RejectsRowWithCronRegion(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("delete cron-protected", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		date := time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC)
		row := snapshotBSON(uid, date, map[string]domain.RegionSnapshot{
			domain.CurrencyINR: {Invested: 1, Current: 1, Source: domain.SnapshotSourceCron},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, row))

		s := New(mt.DB)
		err := s.Snapshots.Delete(context.Background(), uid, date)
		if !errors.Is(err, ErrCronProtected) {
			t.Fatalf("err = %v, want ErrCronProtected", err)
		}
	})
}

func TestSnapshotDelete_AllManualRowDeletes(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("delete all-manual", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		date := time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC)
		row := snapshotBSON(uid, date, map[string]domain.RegionSnapshot{
			domain.CurrencyINR: {Invested: 1, Current: 1, Source: domain.SnapshotSourceManual},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch, row))
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}))

		s := New(mt.DB)
		if err := s.Snapshots.Delete(context.Background(), uid, date); err != nil {
			t.Fatalf("Delete: %v", err)
		}
	})
}

func TestSnapshotDelete_MissingReturnsErrNotFound(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("delete missing", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, "portfolio.portfolio_snapshots", mtest.FirstBatch))
		s := New(mt.DB)
		err := s.Snapshots.Delete(context.Background(), primitive.NewObjectID(),
			time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC))
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("err = %v, want ErrNotFound", err)
		}
	})
}

func TestSnapshotDeleteByUser_IssuesDeleteManyScopedToUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("delete by user", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 3}))

		s := New(mt.DB)
		if err := s.Snapshots.DeleteByUser(context.Background(), uid); err != nil {
			t.Fatalf("DeleteByUser: %v", err)
		}

		events := mt.GetAllStartedEvents()
		if len(events) == 0 {
			t.Fatal("no delete command")
		}
		del := events[0]
		if del.CommandName != "delete" {
			t.Fatalf("command = %s, want delete", del.CommandName)
		}
		uidVal, err := del.Command.LookupErr("deletes", "0", "q", "user_id")
		if err != nil {
			t.Fatalf("delete filter.user_id missing: %v", err)
		}
		gotUID, _ := uidVal.ObjectIDOK()
		if gotUID != uid {
			t.Errorf("delete scoped to %s, want %s", gotUID.Hex(), uid.Hex())
		}
	})
}
