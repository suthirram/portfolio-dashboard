package cmd

import (
	"testing"

	"go.uber.org/zap"

	"portfolio-dashboard/internal/persistence"
	"portfolio-dashboard/internal/services"
)

func TestSectorBackfillIsRegistered(t *testing.T) {
	t.Parallel()
	for _, step := range migrationSteps(&persistence.Store{}, zap.NewNop()) {
		if step.Version() == "20261116_01" {
			return
		}
	}
	t.Fatal("sector backfill step 20261116_01 is not in the migration registry")
}

func TestSectorBackfillNext(t *testing.T) {
	t.Parallel()
	testCases := []struct {
		name       string
		report     services.SectorBackfillReport
		cursor     *string
		wantCursor string // "" means the step is done
		wantErr    bool
	}{
		{name: "nothing left is done", report: services.SectorBackfillReport{Eligible: 3}},
		{name: "remaining holdings start batch 1", report: services.SectorBackfillReport{Eligible: 50, Remaining: 9}, wantCursor: "1"},
		{name: "remaining holdings advance the batch", report: services.SectorBackfillReport{Eligible: 50, Remaining: 9}, cursor: new("1"), wantCursor: "2"},
		{name: "rate limit fails for a retry", report: services.SectorBackfillReport{Eligible: 4, Remaining: 9, RateLimited: true}, wantErr: true},
		{name: "holding errors fail for a retry", report: services.SectorBackfillReport{Eligible: 4, Errors: 1}, wantErr: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			next, err := sectorBackfillNext(testCase.report, testCase.cursor)
			if (err != nil) != testCase.wantErr {
				t.Fatalf("err = %v; wantErr %v", err, testCase.wantErr)
			}
			got := ""
			if next != nil {
				got = *next
			}
			if got != testCase.wantCursor {
				t.Errorf("next cursor = %q; want %q", got, testCase.wantCursor)
			}
		})
	}
}
