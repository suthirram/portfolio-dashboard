package cmd

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
)

// Only the dates the target lacks are copied, oldest first, re-owned by the
// target with a fresh id; buckets (source included) and lines go as they are.
func TestHistoryToCopy(t *testing.T) {
	source, target := primitive.NewObjectID(), primitive.NewObjectID()
	day := func(value string) time.Time {
		parsed, _ := time.Parse(time.DateOnly, value)
		return parsed
	}
	row := func(owner primitive.ObjectID, date string, source domain.SnapshotSource) domain.PortfolioSnapshot {
		return domain.PortfolioSnapshot{ID: primitive.NewObjectID(), UserID: owner, Date: day(date), Currency: "INR",
			Buckets: map[string]domain.RegionSnapshot{"INR": {Invested: 100, Current: 110, Source: source}},
			Lines:   []domain.HoldingSnapshot{{Symbol: "TCS.NS"}}}
	}
	// Newest first, as SnapshotStore.List returns them.
	sourceRows := []domain.PortfolioSnapshot{
		row(source, "2026-03-03", domain.SnapshotSourceCron),
		row(source, "2026-03-02", domain.SnapshotSourceManual),
		row(source, "2026-03-01", domain.SnapshotSourceCron),
	}
	targetRows := []domain.PortfolioSnapshot{row(target, "2026-03-03", domain.SnapshotSourceCron)}

	copies := historyToCopy(sourceRows, targetRows, target)
	if len(copies) != 2 || !copies[0].Date.Equal(day("2026-03-01")) || !copies[1].Date.Equal(day("2026-03-02")) {
		t.Fatalf("copies = %v; want 1 and 2 March, oldest first (3 March is the target's own)", copies)
	}
	for _, copied := range copies {
		if copied.UserID != target || !copied.ID.IsZero() {
			t.Errorf("%s: owner %s id %s; want the target and a fresh id", copied.Date.Format(time.DateOnly), copied.UserID.Hex(), copied.ID.Hex())
		}
	}
	if copies[1].Buckets["INR"].Source != domain.SnapshotSourceManual || len(copies[0].Lines) != 1 {
		t.Errorf("buckets / lines not copied as they are: %+v", copies)
	}
	if again := historyToCopy(sourceRows, append(targetRows, copies...), target); len(again) != 0 {
		t.Errorf("a re-run would copy %d rows; want none", len(again))
	}
}
