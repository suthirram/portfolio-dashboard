package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func newHistorySvc(mt *mtest.T) *HistoryService {
	svc := NewHistoryService(persistence.New(mt.DB).Snapshots, nil)
	svc.Now = func() time.Time { return time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC) }
	return svc
}

func TestHistoryService_List_RejectsToBeforeFrom(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("inverted range", func(mt *mtest.T) {
		svc := newHistorySvc(mt)
		_, err := svc.List(context.Background(), primitive.NewObjectID(),
			time.Date(2026, 6, 10, 0, 0, 0, 0, time.UTC),
			time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
		)
		if !errors.Is(err, ErrInvalidDate) {
			t.Errorf("err = %v, want ErrInvalidDate", err)
		}
	})
}

func TestHistoryService_List_DerivesTotalsAndDateFormat(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("totals derived", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		date := time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: primitive.NewObjectID()},
			{Key: "user_id", Value: uid},
			{Key: "date", Value: date},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 100.0},
					{Key: "current", Value: 198.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}))

		svc := newHistorySvc(mt)
		got, err := svc.List(context.Background(), uid, date, date)
		if err != nil {
			t.Fatalf("List: %v", err)
		}
		if len(got.Rows) != 1 {
			t.Fatalf("rows = %d, want 1", len(got.Rows))
		}
		r := got.Rows[0]
		if r.Date != "2026-06-16" {
			t.Errorf("date = %q, want 2026-06-16", r.Date)
		}
		if r.Totals.InvestedTotal != 100 || r.Totals.CurrentTotal != 198 {
			t.Errorf("totals = %+v", r.Totals)
		}
		if r.Totals.PnLPct == nil || *r.Totals.PnLPct != 98.0 {
			t.Errorf("PnLPct = %v, want 98.0", r.Totals.PnLPct)
		}
	})
}

func TestHistoryService_Range_EmptyReturnsCurrentYear(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("empty", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		svc := newHistorySvc(mt)
		got, err := svc.Range(context.Background(), primitive.NewObjectID())
		if err != nil {
			t.Fatalf("Range: %v", err)
		}
		if got.HasData {
			t.Error("HasData = true, want false")
		}
		if got.EarliestYear != 2026 || got.LatestYear != 2026 {
			t.Errorf("years = (%d, %d), want (2026, 2026)", got.EarliestYear, got.LatestYear)
		}
	})
}

func TestHistoryService_Add_RejectsFutureDate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("future", func(mt *mtest.T) {
		svc := newHistorySvc(mt)
		_, err := svc.Add(context.Background(), primitive.NewObjectID(), AddRowInput{
			Date: "2099-01-01",
			Regions: map[string]domain.RegionSnapshot{
				"INR": {Invested: 1, Current: 1},
			},
		})
		if !errors.Is(err, ErrInvalidDate) {
			t.Errorf("err = %v, want ErrInvalidDate", err)
		}
	})
}

func TestHistoryService_Add_RejectsUnknownRegion(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("bad region", func(mt *mtest.T) {
		svc := newHistorySvc(mt)
		_, err := svc.Add(context.Background(), primitive.NewObjectID(), AddRowInput{
			Date: "2026-06-15",
			Regions: map[string]domain.RegionSnapshot{
				"mars": {Invested: 1, Current: 1},
			},
		})
		if !errors.Is(err, ErrInvalidRegions) {
			t.Errorf("err = %v, want ErrInvalidRegions", err)
		}
	})
}

func TestHistoryService_Add_RejectsNegative(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("negative", func(mt *mtest.T) {
		svc := newHistorySvc(mt)
		_, err := svc.Add(context.Background(), primitive.NewObjectID(), AddRowInput{
			Date: "2026-06-15",
			Regions: map[string]domain.RegionSnapshot{
				"INR": {Invested: -1, Current: 1},
			},
		})
		if !errors.Is(err, ErrInvalidRegions) {
			t.Errorf("err = %v, want ErrInvalidRegions", err)
		}
	})
}

func TestHistoryService_Add_StampsWriteCurrencyFromBucketKey(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("write_currency stamp", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// Get: not found
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		// Upsert FindOne: not found
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		// Upsert InsertOne ack
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		svc := newHistorySvc(mt)
		row, err := svc.Add(context.Background(), uid, AddRowInput{
			Date: "2026-06-15",
			Regions: map[string]domain.RegionSnapshot{
				"INR": {Invested: 100, Current: 198},
				"EUR": {Invested: 50, Current: 60},
			},
		})
		if err != nil {
			t.Fatalf("Add: %v", err)
		}
		if got := row.Regions["INR"].WriteCurrency; got != "INR" {
			t.Errorf("INR bucket WriteCurrency = %q, want INR", got)
		}
		if got := row.Regions["EUR"].WriteCurrency; got != "EUR" {
			t.Errorf("EUR bucket WriteCurrency = %q, want EUR", got)
		}
	})
}

func TestHistoryService_Add_NewDateInsertsAsManual(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("insert", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// Get: not found
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		// Upsert FindOne: not found
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		// Upsert InsertOne: ack
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		svc := newHistorySvc(mt)
		row, err := svc.Add(context.Background(), uid, AddRowInput{
			Date: "2026-06-15",
			Regions: map[string]domain.RegionSnapshot{
				"INR": {Invested: 100, Current: 198},
			},
		})
		if err != nil {
			t.Fatalf("Add: %v", err)
		}
		if row.Regions["INR"].Source != domain.SnapshotSourceManual {
			t.Errorf("source = %q, want manual", row.Regions["INR"].Source)
		}
		if row.Date != "2026-06-15" {
			t.Errorf("date = %q, want 2026-06-15", row.Date)
		}
	})
}

func TestHistoryService_Add_ExistingDateReturnsConflict(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("conflict", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
		existing := bson.D{
			{Key: "_id", Value: primitive.NewObjectID()},
			{Key: "user_id", Value: uid},
			{Key: "date", Value: date},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 50.0},
					{Key: "current", Value: 55.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, existing))

		svc := newHistorySvc(mt)
		_, err := svc.Add(context.Background(), uid, AddRowInput{
			Date: "2026-06-15",
			Regions: map[string]domain.RegionSnapshot{
				"INR": {Invested: 100, Current: 198},
			},
		})
		var conflict *ErrConflict
		if !errors.As(err, &conflict) {
			t.Fatalf("err = %v, want *ErrConflict", err)
		}
		if len(conflict.Conflicts) != 1 {
			t.Errorf("conflicts = %d, want 1", len(conflict.Conflicts))
		}
		if conflict.Conflicts[0].Existing.Invested != 50 {
			t.Errorf("conflict existing invested = %v, want 50", conflict.Conflicts[0].Existing.Invested)
		}
	})
}

func TestHistoryService_Paste_RejectsRowsOutsideMonth(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("outside month", func(mt *mtest.T) {
		svc := newHistorySvc(mt)
		// Date in May while month says June -> rejected.
		got, err := svc.Paste(context.Background(), primitive.NewObjectID(), PasteInput{
			Month: "2026-06",
			Rows: []AddRowInput{
				{Date: "2026-05-30", Regions: map[string]domain.RegionSnapshot{"INR": {Invested: 1, Current: 1}}},
			},
		})
		if err != nil {
			t.Fatalf("Paste: %v", err)
		}
		if len(got.Rejected) != 1 {
			t.Fatalf("rejected = %d, want 1", len(got.Rejected))
		}
		if len(got.Applied) != 0 {
			t.Errorf("applied = %d, want 0", len(got.Applied))
		}
	})
}

func TestHistoryService_Paste_ConflictsAndAppliedSplit(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("mixed", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// Two rows:
		//  - 2026-06-01: existing row -> conflict
		//  - 2026-06-02: no existing -> applied
		existing := bson.D{
			{Key: "_id", Value: primitive.NewObjectID()},
			{Key: "user_id", Value: uid},
			{Key: "date", Value: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 10.0},
					{Key: "current", Value: 12.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}
		// Row 1 Get: existing
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, existing))
		// Row 2 Get: not found
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		// Row 2 Upsert FindOne: not found
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		// Row 2 Upsert InsertOne: ack
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		svc := newHistorySvc(mt)
		got, err := svc.Paste(context.Background(), uid, PasteInput{
			Month: "2026-06",
			Rows: []AddRowInput{
				{Date: "2026-06-01", Regions: map[string]domain.RegionSnapshot{"INR": {Invested: 99, Current: 99}}},
				{Date: "2026-06-02", Regions: map[string]domain.RegionSnapshot{"INR": {Invested: 1, Current: 1}}},
			},
		})
		if err != nil {
			t.Fatalf("Paste: %v", err)
		}
		if len(got.Conflicts) != 1 {
			t.Errorf("conflicts = %d, want 1", len(got.Conflicts))
		}
		if len(got.Applied) != 1 {
			t.Errorf("applied = %d, want 1", len(got.Applied))
		}
		if len(got.Rejected) != 0 {
			t.Errorf("rejected = %d, want 0", len(got.Rejected))
		}
	})
}

func TestHistoryService_Paste_InvalidMonthIs400(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("bad month", func(mt *mtest.T) {
		svc := newHistorySvc(mt)
		_, err := svc.Paste(context.Background(), primitive.NewObjectID(), PasteInput{Month: "garbage"})
		if !errors.Is(err, ErrInvalidDate) {
			t.Errorf("err = %v, want ErrInvalidDate", err)
		}
	})
}

func TestHistoryService_Delete_DelegatesToStore(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("delete", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// Store.Delete: FindOne returns all-manual row
		row := bson.D{
			{Key: "_id", Value: primitive.NewObjectID()},
			{Key: "user_id", Value: uid},
			{Key: "date", Value: time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 1.0},
					{Key: "current", Value: 1.0},
					{Key: "source", Value: "manual"},
				}},
			}},
		}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, row))
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}))

		svc := newHistorySvc(mt)
		if err := svc.Delete(context.Background(), uid, "2026-06-15", false); err != nil {
			t.Fatalf("Delete: %v", err)
		}
	})
}

func patchRegionsRow(uid primitive.ObjectID, date time.Time, bucket bson.D) bson.D {
	return bson.D{
		{Key: "_id", Value: primitive.NewObjectID()},
		{Key: "user_id", Value: uid},
		{Key: "date", Value: date},
		{Key: "currency", Value: "INR"},
		{Key: "regions", Value: bson.D{
			{Key: "INR", Value: bucket},
		}},
	}
}

func TestHistoryService_PatchRegions_FlipsRegionToManualAndCapturesCronOriginal(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("first override of a cron bucket", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		date := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
		// Existing row (Get): a cron-written INR bucket.
		existing := patchRegionsRow(uid, date, bson.D{
			{Key: "invested", Value: 50.0},
			{Key: "current", Value: 55.0},
			{Key: "source", Value: "cron"},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, existing))
		// Atomic PatchRegions UpdateOne ack.
		mt.AddMockResponses(mtest.CreateSuccessResponse(
			bson.E{Key: "n", Value: 1},
			bson.E{Key: "nModified", Value: 1},
		))
		// Final Get: post-image row carries OriginalCron* the service wrote.
		updated := patchRegionsRow(uid, date, bson.D{
			{Key: "invested", Value: 100.0},
			{Key: "current", Value: 198.0},
			{Key: "source", Value: "manual"},
			{Key: "original_cron_invested", Value: 50.0},
			{Key: "original_cron_current", Value: 55.0},
		})
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, updated))

		svc := newHistorySvc(mt)
		got, err := svc.PatchRegions(context.Background(), uid, "2026-06-15", PatchRegionsInput{
			Regions: map[string]domain.RegionSnapshot{
				"INR": {Invested: 100, Current: 198},
			},
		})
		if err != nil {
			t.Fatalf("PatchRegions: %v", err)
		}
		inr := got.Regions["INR"]
		if inr.Source != domain.SnapshotSourceManual {
			t.Errorf("source = %q, want manual", inr.Source)
		}
		if inr.OriginalCronInvested == nil || *inr.OriginalCronInvested != 50.0 {
			t.Errorf("OriginalCronInvested = %v, want 50.0", inr.OriginalCronInvested)
		}
		if inr.OriginalCronCurrent == nil || *inr.OriginalCronCurrent != 55.0 {
			t.Errorf("OriginalCronCurrent = %v, want 55.0", inr.OriginalCronCurrent)
		}

		// Inspect the actual update we sent. It must carry OriginalCron*
		// in the regions.INR sub-document so the store persists them.
		events := mt.GetAllStartedEvents()
		var sawCronAnchor bool
		for _, e := range events {
			if e.CommandName != "update" {
				continue
			}
			if bytesContainKey([]byte(e.Command), "original_cron_invested") {
				sawCronAnchor = true
			}
		}
		if !sawCronAnchor {
			t.Error("update command did not carry original_cron_invested; audit trail will be lost")
		}
	})
}

func TestOriginalCronFor(t *testing.T) {
	cron := domain.RegionSnapshot{Invested: 10, Current: 20, Source: domain.SnapshotSourceCron}
	gotInv, gotCur := originalCronFor(cron)
	if gotInv == nil || *gotInv != 10 || gotCur == nil || *gotCur != 20 {
		t.Errorf("cron source: anchor = (%v, %v), want (10, 20)", gotInv, gotCur)
	}

	prior := 7.0
	priorCur := 9.0
	manualWithAnchor := domain.RegionSnapshot{
		Invested: 100, Current: 110, Source: domain.SnapshotSourceManual,
		OriginalCronInvested: &prior, OriginalCronCurrent: &priorCur,
	}
	gotInv, gotCur = originalCronFor(manualWithAnchor)
	if gotInv == nil || *gotInv != 7 || gotCur == nil || *gotCur != 9 {
		t.Errorf("manual w/ anchor: kept = (%v, %v), want (7, 9) — first-override-wins broken",
			gotInv, gotCur)
	}

	manualNoAnchor := domain.RegionSnapshot{Source: domain.SnapshotSourceManual}
	gotInv, gotCur = originalCronFor(manualNoAnchor)
	if gotInv != nil || gotCur != nil {
		t.Errorf("manual no anchor: want (nil, nil), got (%v, %v)", gotInv, gotCur)
	}
}

func bytesContainKey(b []byte, key string) bool {
	// Cheap substring check — mtest's bytes are valid bson but searching
	// for the key string in the marshalled output is enough to verify
	// the field was included.
	target := []byte(key)
	for i := 0; i+len(target) <= len(b); i++ {
		if string(b[i:i+len(target)]) == key {
			return true
		}
	}
	return false
}

func TestHistoryService_Range_WithDataReportsEarliestAndCurrent(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("with data", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: primitive.NewObjectID()},
			{Key: "user_id", Value: uid},
			{Key: "date", Value: time.Date(2023, 5, 1, 0, 0, 0, 0, time.UTC)},
		}))
		svc := newHistorySvc(mt)
		got, err := svc.Range(context.Background(), uid)
		if err != nil {
			t.Fatalf("Range: %v", err)
		}
		if !got.HasData || got.EarliestYear != 2023 || got.LatestYear != 2026 {
			t.Errorf("Range = %+v, want HasData=true EarliestYear=2023 LatestYear=2026", got)
		}
	})
}

func TestErrConflictMessage(t *testing.T) {
	e := &ErrConflict{}
	if e.Error() == "" {
		t.Error("ErrConflict.Error empty")
	}
}

func TestHistoryService_Delete_CronProtectedBubblesUp(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("cron protected", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		row := bson.D{
			{Key: "_id", Value: primitive.NewObjectID()},
			{Key: "user_id", Value: uid},
			{Key: "date", Value: time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 1.0},
					{Key: "current", Value: 1.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, row))

		svc := newHistorySvc(mt)
		err := svc.Delete(context.Background(), uid, "2026-06-15", false)
		if !errors.Is(err, persistence.ErrCronProtected) {
			t.Errorf("err = %v, want ErrCronProtected", err)
		}
	})
}
