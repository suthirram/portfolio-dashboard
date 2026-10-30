package services

import (
	"cmp"
	"fmt"
	"slices"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

const maxImportRows = 5000

// importRow is a valid sheet row resolved to a holding.
type importRow struct {
	in      api.DividendImportRow
	day     time.Time
	holding *domain.Holding
}

func (r importRow) key() domain.DividendKey {
	return domain.DividendKey{HoldingId: r.holding.ID, Day: r.day.Format(time.DateOnly), Cents: domain.AmountCents(r.in.Amount)}
}

// partition splits valid rows (sheet order) into new and duplicate by
// occurrence: each stored dividend with the same key absorbs one sheet row;
// sheet repeats beyond the stored count are new (PRD-005 §5 A–D).
func partition(rows []importRow, existing []domain.Transaction) (fresh, dups []importRow) {
	remaining := make(map[domain.DividendKey]int, len(existing))
	for _, t := range existing {
		remaining[domain.DividendKeyOf(t)]++
	}
	for _, r := range rows {
		if k := r.key(); remaining[k] > 0 {
			remaining[k]--
			dups = append(dups, r)
			continue
		}
		fresh = append(fresh, r)
	}
	return fresh, dups
}

// window returns the date range and holdings the duplicate lookup must cover.
func window(rows []importRow) (from, to time.Time, holdingIds []primitive.ObjectID) {
	seen := map[primitive.ObjectID]bool{}
	from, to = rows[0].day, rows[0].day
	for _, r := range rows {
		if r.day.Before(from) {
			from = r.day
		}
		if r.day.After(to) {
			to = r.day
		}
		if !seen[r.holding.ID] {
			seen[r.holding.ID] = true
			holdingIds = append(holdingIds, r.holding.ID)
		}
	}
	return from, to.Add(24*time.Hour - time.Nanosecond), holdingIds
}

// cumulativeWarnings checks the sheet's running total (PRD-005 §7.2): with
// every row carrying a cumulative and dates in order, each cumulative should
// equal the previous one plus this row's dividend. Mismatches are warnings;
// they never change a row's status.
func cumulativeWarnings(rows []api.DividendImportRow) []api.DividendImportWarning {
	warnings := []api.DividendImportWarning{}
	if len(rows) < 2 {
		return warnings
	}
	for _, r := range rows {
		if r.Cumulative == nil {
			return warnings
		}
	}
	for i := 1; i < len(rows); i++ {
		if rows[i].Date.Before(rows[i-1].Date.Time) {
			return []api.DividendImportWarning{{Line: rows[i].Line, Message: "rows are not in date order, so the CUMULATIVE check was skipped"}}
		}
	}
	for i := 1; i < len(rows); i++ {
		expected := domain.AmountCents(*rows[i-1].Cumulative) + domain.AmountCents(rows[i].Amount)
		got := domain.AmountCents(*rows[i].Cumulative)
		if diff := got - expected; diff > 1 || diff < -1 {
			warnings = append(warnings, api.DividendImportWarning{Line: rows[i].Line,
				Message: fmt.Sprintf("CUMULATIVE is %.2f, expected %.2f", domain.CentsToMoney(got), domain.CentsToMoney(expected))})
		}
	}
	return warnings
}

// reasonOf strips the ErrValidation prefix for display.
func reasonOf(err error) string {
	return strings.TrimPrefix(err.Error(), ErrValidation.Error()+": ")
}

// buildPreview assembles the response: counts, names, per-line statuses.
func buildPreview(names []nameResolution, fresh, dups []importRow, invalid []api.DividendImportRowStatus, warnings []api.DividendImportWarning) api.DividendImportPreview {
	rows := make([]api.DividendImportRowStatus, 0, len(fresh)+len(dups)+len(invalid))
	add := func(rs []importRow, status string) {
		for _, r := range rs {
			id := r.holding.ID.Hex()
			rows = append(rows, api.DividendImportRowStatus{Line: r.in.Line, Status: status, HoldingId: &id})
		}
	}
	add(fresh, "ready")
	add(dups, "duplicate")
	rows = append(rows, invalid...)
	slices.SortFunc(rows, func(a, b api.DividendImportRowStatus) int { return cmp.Compare(a.Line, b.Line) })

	views := make([]api.DividendNameResolution, 0, len(names))
	for _, n := range names {
		views = append(views, n.view)
	}
	return api.DividendImportPreview{
		Counts:   api.DividendImportCounts{Ready: len(fresh), Duplicate: len(dups), Invalid: len(invalid), Total: len(rows)},
		Names:    views,
		Rows:     rows,
		Warnings: warnings,
	}
}
