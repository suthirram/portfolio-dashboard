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
	d, _ := time.Parse(time.DateOnly, day)
	return api.DividendImportRow{Line: line, Date: openapi_types.Date{Time: d}, ShareName: "TCS", Amount: amount, Cumulative: cumulative}
}

func resolved(h *domain.Holding, r api.DividendImportRow) importRow {
	return importRow{in: r, day: domain.UTCDate(r.Date.Time), holding: h}
}

// PRD-005 §5 scenarios A–D; a hand-entered ledger dividend counts as stored.
func TestPartition_OccurrenceBased(t *testing.T) {
	tcs := &domain.Holding{ID: primitive.NewObjectID(), Script: "TCS"}
	two := []importRow{resolved(tcs, sheetRow(2, "2020-01-01", 300, nil)), resolved(tcs, sheetRow(3, "2020-01-01", 300, nil))}
	stored := func(n int) []domain.Transaction {
		out := []domain.Transaction{}
		for range n {
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
	for _, c := range cases {
		fresh, dups := partition(two, c.existing)
		if len(fresh) != c.fresh || len(dups) != c.dupes {
			t.Errorf("%s: fresh %d dups %d, want %d / %d", c.name, len(fresh), len(dups), c.fresh, c.dupes)
		}
		if c.dupes > 0 && dups[0].in.Line != c.firstDupeLine {
			t.Errorf("%s: first duplicate line %d, want %d (sheet order)", c.name, dups[0].in.Line, c.firstDupeLine)
		}
	}
	other := []domain.Transaction{dividendEvent(tcs.ID, "2020-01-02", 300), dividendEvent(tcs.ID, "2020-01-01", 300.5), dividendEvent(primitive.NewObjectID(), "2020-01-01", 300)}
	if fresh, _ := partition(two, other); len(fresh) != 2 {
		t.Error("a different day, amount or holding must not count as a duplicate")
	}
}

func TestCumulativeWarnings(t *testing.T) {
	c := func(v float64) *float64 { return &v }
	ok := []api.DividendImportRow{sheetRow(2, "2020-01-01", 300, c(300)), sheetRow(3, "2020-01-01", 300, c(600)), sheetRow(4, "2020-03-15", 1250.5, c(1850.5))}
	if w := cumulativeWarnings(ok); len(w) != 0 {
		t.Errorf("consistent sheet: %v, want none", w)
	}
	bad := []api.DividendImportRow{sheetRow(2, "2020-01-01", 300, c(300)), sheetRow(3, "2020-03-15", 1250.5, c(1900))}
	if w := cumulativeWarnings(bad); len(w) != 1 || w[0].Line != 3 {
		t.Errorf("mismatch: %v, want one warning on line 3", w)
	}
	unordered := []api.DividendImportRow{sheetRow(2, "2020-03-15", 300, c(300)), sheetRow(3, "2020-01-01", 300, c(999))}
	if w := cumulativeWarnings(unordered); len(w) != 1 || w[0].Line != 3 {
		t.Errorf("out of order: %v, want one skip warning", w)
	}
	if w := cumulativeWarnings([]api.DividendImportRow{sheetRow(2, "2020-01-01", 300, nil), sheetRow(3, "2020-01-02", 300, nil)}); len(w) != 0 {
		t.Error("no CUMULATIVE column: no warnings")
	}
}

func TestBuildPreview_Counts(t *testing.T) {
	tcs := &domain.Holding{ID: primitive.NewObjectID()}
	reason := "dividend must be a positive amount"
	p := buildPreview(nil,
		[]importRow{resolved(tcs, sheetRow(3, "2020-01-01", 300, nil))},
		[]importRow{resolved(tcs, sheetRow(2, "2020-01-01", 300, nil))},
		[]api.DividendImportRowStatus{{Line: 4, Status: "invalid", Reason: &reason}},
		[]api.DividendImportWarning{})
	if p.Counts != (api.DividendImportCounts{Ready: 1, Duplicate: 1, Invalid: 1, Total: 3}) {
		t.Errorf("counts = %+v", p.Counts)
	}
	if p.Rows[0].Line != 2 || p.Rows[0].Status != "duplicate" || p.Rows[2].Status != "invalid" {
		t.Errorf("rows not in line order: %+v", p.Rows)
	}
}
