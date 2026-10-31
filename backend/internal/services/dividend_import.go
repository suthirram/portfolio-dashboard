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
	sheetRow api.DividendImportRow
	day      time.Time
	holding  *domain.Holding
}

func (r importRow) key() domain.DividendKey {
	return domain.DividendKey{HoldingId: r.holding.ID, Day: r.day.Format(time.DateOnly), Cents: domain.AmountCents(r.sheetRow.Amount)}
}

// partition splits valid rows (sheet order) into new and duplicate by
// occurrence: each stored dividend with the same key absorbs one sheet row;
// sheet repeats beyond the stored count are new (PRD-005 §5 A–D).
func partition(rows []importRow, existing []domain.Transaction) (fresh, duplicates []importRow) {
	remaining := make(map[domain.DividendKey]int, len(existing))
	for _, storedDividend := range existing {
		remaining[domain.DividendKeyOf(storedDividend)]++
	}
	for _, row := range rows {
		if rowKey := row.key(); remaining[rowKey] > 0 {
			remaining[rowKey]--
			duplicates = append(duplicates, row)
			continue
		}
		fresh = append(fresh, row)
	}
	return fresh, duplicates
}

// window returns the date range and holdings the duplicate lookup must cover.
func window(rows []importRow) (from, to time.Time, holdingIds []primitive.ObjectID) {
	seen := map[primitive.ObjectID]bool{}
	from, to = rows[0].day, rows[0].day
	for _, row := range rows {
		if row.day.Before(from) {
			from = row.day
		}
		if row.day.After(to) {
			to = row.day
		}
		if !seen[row.holding.ID] {
			seen[row.holding.ID] = true
			holdingIds = append(holdingIds, row.holding.ID)
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
	for _, row := range rows {
		if row.Cumulative == nil {
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
func buildPreview(names []nameResolution, fresh, duplicates []importRow, invalid []api.DividendImportRowStatus, warnings []api.DividendImportWarning) api.DividendImportPreview {
	statuses := make([]api.DividendImportRowStatus, 0, len(fresh)+len(duplicates)+len(invalid))
	addRows := func(importRows []importRow, status string) {
		for _, row := range importRows {
			holdingId := row.holding.ID.Hex()
			statuses = append(statuses, api.DividendImportRowStatus{Line: row.sheetRow.Line, Status: status, HoldingId: &holdingId})
		}
	}
	addRows(fresh, "ready")
	addRows(duplicates, "duplicate")
	statuses = append(statuses, invalid...)
	slices.SortFunc(statuses, func(first, second api.DividendImportRowStatus) int { return cmp.Compare(first.Line, second.Line) })

	views := make([]api.DividendNameResolution, 0, len(names))
	for _, resolution := range names {
		views = append(views, resolution.view)
	}
	return api.DividendImportPreview{
		Counts:   api.DividendImportCounts{Ready: len(fresh), Duplicate: len(duplicates), Invalid: len(invalid), Total: len(statuses)},
		Names:    views,
		Rows:     statuses,
		Warnings: warnings,
	}
}
