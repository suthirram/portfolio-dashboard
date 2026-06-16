package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// HistoryService is the read/write surface for /api/history. It composes
// SnapshotStore behind validation and per-region patching so controllers
// stay thin.
type HistoryService struct {
	store  *persistence.SnapshotStore
	logger *zap.Logger
	// Now lets tests inject a deterministic clock for the "no future date"
	// validation.
	Now func() time.Time
}

// NewHistoryService wires a HistoryService.
func NewHistoryService(store *persistence.SnapshotStore, logger *zap.Logger) *HistoryService {
	return &HistoryService{
		store:  store,
		logger: logger,
		Now:    func() time.Time { return time.Now().UTC() },
	}
}

// HistoryRow is the per-date API DTO returned by List.
type HistoryRow struct {
	Date    string                           `json:"date"` // YYYY-MM-DD
	Regions map[string]domain.RegionSnapshot `json:"regions"`
	Totals  domain.SnapshotTotals            `json:"totals"`
}

// HistoryList is the GET /api/history response envelope.
type HistoryList struct {
	Currency string       `json:"currency"`
	Rows     []HistoryRow `json:"rows"`
}

// HistoryConflict reports one region whose incoming value collides with
// an existing row.
type HistoryConflict struct {
	Region   string                `json:"region"`
	Existing domain.RegionSnapshot `json:"existing"`
	Incoming domain.RegionSnapshot `json:"incoming"`
}

// AddRowInput is the request body for POST /api/history.
type AddRowInput struct {
	Date    string                           `json:"date"`
	Regions map[string]domain.RegionSnapshot `json:"regions"`
}

// PatchRegionsInput is the request body for PUT /api/history/:date/regions.
type PatchRegionsInput struct {
	Regions map[string]domain.RegionSnapshot `json:"regions"`
}

// PasteInput is the request body for POST /api/history/paste.
type PasteInput struct {
	Month string        `json:"month"` // YYYY-MM
	Rows  []AddRowInput `json:"rows"`
}

// PasteReport is the three-bucket response to a paste request.
type PasteReport struct {
	Applied   []string           `json:"applied"`
	Conflicts []DateConflict     `json:"conflicts"`
	Rejected  []RejectedPasteRow `json:"rejected"`
}

// DateConflict packages every per-region conflict for one date — the
// shape the UI's sequential modal consumes.
type DateConflict struct {
	Date     string                           `json:"date"`
	Existing map[string]domain.RegionSnapshot `json:"existing"`
	Incoming map[string]domain.RegionSnapshot `json:"incoming"`
}

// RejectedPasteRow names a row the paste handler refused to even consider
// because its shape was invalid.
type RejectedPasteRow struct {
	Date   string `json:"date"`
	Reason string `json:"reason"`
}

// HistoryRangeInfo is the GET /api/history/range response. Used by the
// frontend year-dropdown bootstrap.
type HistoryRangeInfo struct {
	EarliestYear int  `json:"earliest_year"`
	LatestYear   int  `json:"latest_year"`
	HasData      bool `json:"has_data"`
}

// ErrInvalidDate is returned when a YYYY-MM-DD body field is malformed,
// in the future, or out of the requested month.
var ErrInvalidDate = errors.New("history: invalid date")

// ErrInvalidRegions is returned when the region map is empty, has unknown
// keys, or carries non-finite / negative numbers.
var ErrInvalidRegions = errors.New("history: invalid regions payload")

// ErrConflict is returned by Add when the (user, date) row already
// exists and the caller didn't ask to override.
type ErrConflict struct {
	Conflicts []HistoryConflict
}

func (e *ErrConflict) Error() string { return "history: row exists for date" }

// List returns the caller's rows in [from, to] inclusive.
func (s *HistoryService) List(ctx context.Context, uid primitive.ObjectID, from, to time.Time) (HistoryList, error) {
	if to.Before(from) {
		return HistoryList{}, fmt.Errorf("%w: to before from", ErrInvalidDate)
	}
	snaps, err := s.store.List(ctx, uid, from, to)
	if err != nil {
		return HistoryList{}, err
	}
	currency := "INR"
	rows := make([]HistoryRow, 0, len(snaps))
	for _, snap := range snaps {
		if snap.Currency != "" {
			currency = snap.Currency
		}
		rows = append(rows, HistoryRow{
			Date:    snap.Date.UTC().Format("2006-01-02"),
			Regions: snap.Buckets,
			Totals:  snap.Totals(),
		})
	}
	return HistoryList{Currency: currency, Rows: rows}, nil
}

// Range returns the year-dropdown bootstrap data.
func (s *HistoryService) Range(ctx context.Context, uid primitive.ObjectID) (HistoryRangeInfo, error) {
	earliest, err := s.store.EarliestYear(ctx, uid)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			now := s.Now().UTC().Year()
			return HistoryRangeInfo{EarliestYear: now, LatestYear: now, HasData: false}, nil
		}
		return HistoryRangeInfo{}, err
	}
	now := s.Now().UTC().Year()
	return HistoryRangeInfo{EarliestYear: earliest, LatestYear: now, HasData: true}, nil
}

// Add inserts a new manual row or returns *ErrConflict when the date
// already has a row.
func (s *HistoryService) Add(ctx context.Context, uid primitive.ObjectID, in AddRowInput) (HistoryRow, error) {
	date, err := parseDateNotFuture(in.Date, s.Now)
	if err != nil {
		return HistoryRow{}, err
	}
	if err := validateRegions(in.Regions); err != nil {
		return HistoryRow{}, err
	}

	existing, err := s.store.Get(ctx, uid, date)
	switch {
	case err == nil:
		conflicts := buildConflicts(in.Regions, existing.Buckets)
		return HistoryRow{}, &ErrConflict{Conflicts: conflicts}
	case errors.Is(err, persistence.ErrNotFound):
		// happy path
	default:
		return HistoryRow{}, err
	}

	regions := make(map[string]domain.RegionSnapshot, len(in.Regions))
	for k, r := range in.Regions {
		r.Source = domain.SnapshotSourceManual
		regions[k] = r
	}
	snap := domain.PortfolioSnapshot{
		UserID:   uid,
		Date:     date,
		Currency: "INR",
		Buckets:  regions,
	}
	if err := s.store.Upsert(ctx, snap); err != nil {
		return HistoryRow{}, err
	}
	return HistoryRow{
		Date:    date.UTC().Format("2006-01-02"),
		Regions: regions,
		Totals:  snap.Totals(),
	}, nil
}

// PatchRegions applies the user-accepted overrides from the conflict
// modal. Every region in the body is written with source=manual.
//
// Captures the cron-written values into OriginalCron* the first time
// each bucket is overridden so the original numbers stay recoverable
// (PD-042 §3.3 audit trail). Subsequent overrides on a bucket that
// already carries OriginalCron* values keep them — the audit anchor
// is the *first* override, not the most recent one.
func (s *HistoryService) PatchRegions(ctx context.Context, uid primitive.ObjectID, dateStr string, in PatchRegionsInput) (HistoryRow, error) {
	date, err := parseDateNotFuture(dateStr, s.Now)
	if err != nil {
		return HistoryRow{}, err
	}
	if err := validateRegions(in.Regions); err != nil {
		return HistoryRow{}, err
	}

	// Read existing row so OriginalCron* can be set for first-time
	// overrides and preserved for subsequent ones.
	existing, err := s.store.Get(ctx, uid, date)
	if err != nil {
		return HistoryRow{}, err
	}

	patched := make(map[string]domain.RegionSnapshot, len(in.Regions))
	for k, incoming := range in.Regions {
		merged := incoming
		merged.Source = domain.SnapshotSourceManual
		merged.OriginalCronInvested, merged.OriginalCronCurrent = originalCronFor(existing.Buckets[k])
		patched[k] = merged
	}

	// Atomic multi-region update so a failure mid-way through cannot
	// leave half the override persisted (PD-042 PR6 review).
	if err := s.store.PatchRegions(ctx, uid, date, patched); err != nil {
		return HistoryRow{}, err
	}
	updated, err := s.store.Get(ctx, uid, date)
	if err != nil {
		return HistoryRow{}, err
	}
	return HistoryRow{
		Date:    updated.Date.UTC().Format("2006-01-02"),
		Regions: updated.Buckets,
		Totals:  updated.Totals(),
	}, nil
}

// originalCronFor decides the OriginalCron* values for an override.
// Rules:
//   - existing was cron → capture its invested/current as the anchor.
//   - existing was manual with an OriginalCron* set → keep them (first
//     override wins; never re-anchor).
//   - existing was manual with no anchor → no anchor (the bucket was
//     never cron-written, so there is no "original cron" to restore to).
func originalCronFor(existing domain.RegionSnapshot) (*float64, *float64) {
	switch existing.Source {
	case domain.SnapshotSourceCron:
		inv, cur := existing.Invested, existing.Current
		return &inv, &cur
	case domain.SnapshotSourceManual:
		return existing.OriginalCronInvested, existing.OriginalCronCurrent
	}
	return nil, nil
}

// Delete removes a row only if every region is manual; cron-touched rows
// surface ErrCronProtected from the store.
func (s *HistoryService) Delete(ctx context.Context, uid primitive.ObjectID, dateStr string) error {
	date, err := parseDateNotFuture(dateStr, s.Now)
	if err != nil {
		return err
	}
	return s.store.Delete(ctx, uid, date)
}

// Paste processes a bulk-paste body. Non-conflicting rows are persisted
// immediately; conflicting and invalid rows are returned in the report
// for the UI to handle.
func (s *HistoryService) Paste(ctx context.Context, uid primitive.ObjectID, in PasteInput) (PasteReport, error) {
	month, err := time.Parse("2006-01", in.Month)
	if err != nil {
		return PasteReport{}, fmt.Errorf("%w: month %q", ErrInvalidDate, in.Month)
	}
	monthStart := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
	nextMonth := monthStart.AddDate(0, 1, 0)

	report := PasteReport{
		Applied:   []string{},
		Conflicts: []DateConflict{},
		Rejected:  []RejectedPasteRow{},
	}

	for _, row := range in.Rows {
		date, err := parseDateNotFuture(row.Date, s.Now)
		if err != nil {
			report.Rejected = append(report.Rejected, RejectedPasteRow{Date: row.Date, Reason: err.Error()})
			continue
		}
		if date.Before(monthStart) || !date.Before(nextMonth) {
			report.Rejected = append(report.Rejected, RejectedPasteRow{Date: row.Date, Reason: "date outside selected month"})
			continue
		}
		if err := validateRegions(row.Regions); err != nil {
			report.Rejected = append(report.Rejected, RejectedPasteRow{Date: row.Date, Reason: err.Error()})
			continue
		}

		existing, err := s.store.Get(ctx, uid, date)
		switch {
		case err == nil:
			report.Conflicts = append(report.Conflicts, DateConflict{
				Date:     date.UTC().Format("2006-01-02"),
				Existing: existing.Buckets,
				Incoming: row.Regions,
			})
			continue
		case errors.Is(err, persistence.ErrNotFound):
			// insert path
		default:
			return PasteReport{}, err
		}

		regions := make(map[string]domain.RegionSnapshot, len(row.Regions))
		for k, r := range row.Regions {
			r.Source = domain.SnapshotSourceManual
			regions[k] = r
		}
		if err := s.store.Upsert(ctx, domain.PortfolioSnapshot{
			UserID:   uid,
			Date:     date,
			Currency: "INR",
			Buckets:  regions,
		}); err != nil {
			return PasteReport{}, err
		}
		report.Applied = append(report.Applied, date.UTC().Format("2006-01-02"))
	}

	return report, nil
}

// ---- helpers ----

func parseDateNotFuture(s string, now func() time.Time) (time.Time, error) {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, fmt.Errorf("%w: parse %q", ErrInvalidDate, s)
	}
	d = domain.UTCDate(d)
	today := domain.UTCDate(now())
	if d.After(today) {
		return time.Time{}, fmt.Errorf("%w: %s is in the future", ErrInvalidDate, s)
	}
	return d, nil
}

func validateRegions(in map[string]domain.RegionSnapshot) error {
	if len(in) == 0 {
		return fmt.Errorf("%w: empty", ErrInvalidRegions)
	}
	known := map[string]struct{}{
		domain.CurrencyINR: {},
		domain.CurrencyEUR: {},
		domain.CurrencyUSD: {},
	}
	for k, r := range in {
		if _, ok := known[k]; !ok {
			return fmt.Errorf("%w: unknown region %q", ErrInvalidRegions, k)
		}
		if r.Invested < 0 || r.Current < 0 {
			return fmt.Errorf("%w: negative value for region %q", ErrInvalidRegions, k)
		}
	}
	return nil
}

func buildConflicts(incoming, existing map[string]domain.RegionSnapshot) []HistoryConflict {
	out := make([]HistoryConflict, 0, len(incoming))
	for k, r := range incoming {
		ex, ok := existing[k]
		if !ok {
			continue
		}
		out = append(out, HistoryConflict{Region: k, Existing: ex, Incoming: r})
	}
	return out
}
