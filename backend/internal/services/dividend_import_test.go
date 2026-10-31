package services

import (
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func sheetRow(line int, day string, amount float64, cumulative *float64) api.DividendImportRow {
	date, _ := time.Parse(time.DateOnly, day)
	return api.DividendImportRow{Line: line, Date: openapi_types.Date{Time: date}, ShareName: "TCS", Amount: amount, Cumulative: cumulative}
}

func resolved(holding *domain.Holding, row api.DividendImportRow) importRow {
	return importRow{sheetRow: row, day: domain.UTCDate(row.Date.Time), holding: holding}
}

// PRD-005 §5 scenarios A–D; a hand-entered ledger dividend counts as stored.
func TestPartition_OccurrenceBased(t *testing.T) {
	tcs := &domain.Holding{ID: primitive.NewObjectID(), Script: "TCS"}
	two := []importRow{resolved(tcs, sheetRow(2, "2020-01-01", 300, nil)), resolved(tcs, sheetRow(3, "2020-01-01", 300, nil))}
	stored := func(count int) []domain.Transaction {
		out := []domain.Transaction{}
		for range count {
			out = append(out, dividendEvent(tcs.ID, "2020-01-01", 300))
		}
		return out
	}
	cases := []struct {
		name          string
		existing      []domain.Transaction
		fresh, dupes  int
		firstDupeLine int
	}{
		{"A: DB 1, sheet 2", stored(1), 1, 1, 2},
		{"B: DB 2, sheet 2", stored(2), 0, 2, 2},
		{"C: DB 0, sheet 2", stored(0), 2, 0, 0},
		{"D: same file again", stored(2), 0, 2, 2},
	}
	for _, testCase := range cases {
		fresh, duplicates := partition(two, testCase.existing)
		if len(fresh) != testCase.fresh || len(duplicates) != testCase.dupes {
			t.Errorf("%s: fresh %d duplicates %d, want %d / %d", testCase.name, len(fresh), len(duplicates), testCase.fresh, testCase.dupes)
		}
		if testCase.dupes > 0 && duplicates[0].sheetRow.Line != testCase.firstDupeLine {
			t.Errorf("%s: first duplicate line %d, want %d (sheet order)", testCase.name, duplicates[0].sheetRow.Line, testCase.firstDupeLine)
		}
	}
	other := []domain.Transaction{dividendEvent(tcs.ID, "2020-01-02", 300), dividendEvent(tcs.ID, "2020-01-01", 300.5), dividendEvent(primitive.NewObjectID(), "2020-01-01", 300)}
	if fresh, _ := partition(two, other); len(fresh) != 2 {
		t.Error("a different day, amount or holding must not count as a duplicate")
	}
}

func TestCumulativeWarnings(t *testing.T) {
	cumulative := func(value float64) *float64 { return &value }
	consistent := []api.DividendImportRow{sheetRow(2, "2020-01-01", 300, cumulative(300)), sheetRow(3, "2020-01-01", 300, cumulative(600)), sheetRow(4, "2020-03-15", 1250.5, cumulative(1850.5))}
	if warnings := cumulativeWarnings(consistent); len(warnings) != 0 {
		t.Errorf("consistent sheet: %v, want none", warnings)
	}
	mismatched := []api.DividendImportRow{sheetRow(2, "2020-01-01", 300, cumulative(300)), sheetRow(3, "2020-03-15", 1250.5, cumulative(1900))}
	if warnings := cumulativeWarnings(mismatched); len(warnings) != 1 || warnings[0].Line != 3 {
		t.Errorf("mismatch: %v, want one warning on line 3", warnings)
	}
	unordered := []api.DividendImportRow{sheetRow(2, "2020-03-15", 300, cumulative(300)), sheetRow(3, "2020-01-01", 300, cumulative(999))}
	if warnings := cumulativeWarnings(unordered); len(warnings) != 1 || warnings[0].Line != 3 {
		t.Errorf("out of order: %v, want one skip warning", warnings)
	}
	if warnings := cumulativeWarnings([]api.DividendImportRow{sheetRow(2, "2020-01-01", 300, nil), sheetRow(3, "2020-01-02", 300, nil)}); len(warnings) != 0 {
		t.Error("no CUMULATIVE column: no warnings")
	}
}

func TestBuildPreview_Counts(t *testing.T) {
	tcs := &domain.Holding{ID: primitive.NewObjectID()}
	reason := "dividend must be a positive amount"
	preview := buildPreview(nil,
		[]importRow{resolved(tcs, sheetRow(3, "2020-01-01", 300, nil))},
		[]importRow{resolved(tcs, sheetRow(2, "2020-01-01", 300, nil))},
		[]api.DividendImportRowStatus{{Line: 4, Status: "invalid", Reason: &reason}},
		[]api.DividendImportWarning{})
	if preview.Counts != (api.DividendImportCounts{Ready: 1, Duplicate: 1, Invalid: 1, Total: 3}) {
		t.Errorf("counts = %+v", preview.Counts)
	}
	if preview.Rows[0].Line != 2 || preview.Rows[0].Status != "duplicate" || preview.Rows[2].Status != "invalid" {
		t.Errorf("rows not in line order: %+v", preview.Rows)
	}
}
