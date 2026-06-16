package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// SnapshotService builds and persists daily portfolio snapshots
// (PRD-002 / DD-002). It composes the holding store with a PriceFetcher
// the same way PortfolioService does, so the snapshot job benefits from
// the existing 5-minute Yahoo price cache.
type SnapshotService struct {
	holdings  *persistence.HoldingStore
	snapshots *persistence.SnapshotStore
	users     *persistence.UserStore
	prices    PriceFetcher
	logger    *zap.Logger
	// Now lets tests inject a deterministic clock without dragging in
	// a time interface.
	Now func() time.Time
}

// NewSnapshotService wires a SnapshotService.
func NewSnapshotService(
	holdings *persistence.HoldingStore,
	snapshots *persistence.SnapshotStore,
	users *persistence.UserStore,
	prices PriceFetcher,
	logger *zap.Logger,
) *SnapshotService {
	return &SnapshotService{
		holdings:  holdings,
		snapshots: snapshots,
		users:     users,
		prices:    prices,
		logger:    logger,
		Now:       func() time.Time { return time.Now().UTC() },
	}
}

func (s *SnapshotService) log(ctx context.Context) *zap.Logger {
	if l, ok := logging.FromContext(ctx); ok {
		return l
	}
	if s.logger != nil {
		return s.logger
	}
	return zap.NewNop()
}

// CurrencyOf maps a holding to its snapshot bucket key. The app only
// accepts Holding.Currency in {INR, EUR} (see frontend HoldingInput),
// so the USD bucket exists in the schema for shape symmetry but is
// expected to always be empty in practice. Returns ("unknown", false)
// when the mapping can't classify the holding; the caller logs and
// excludes it.
//
// PR7 design-review (2026-06-16) moved bucketing from region to
// currency. A prod-cron bug then surfaced: an NYSE holding typed
// with Currency=INR (the user paid in rupees for a US-listed
// security) was bucketed to USD because Exchange beat Currency. The
// monetary amount (StocksOwned × AvgCostPrice) lives in
// Holding.Currency — that field is now authoritative.
//
// Rules, in order:
//  1. Holding.Currency = INR or EUR → that bucket. Authoritative.
//  2. Currency is blank — fall back to Exchange:
//     NSE / BSE → INR
//     LSE / XETRA / EURONEXT / FWB / MIL / SIX / AMS / PAR → EUR
//     (No USD fallback — see paragraph above.)
//
// Anything else falls into "unknown".
func CurrencyOf(h domain.Holding) (string, bool) {
	switch strings.ToUpper(h.Currency) {
	case domain.CurrencyINR, domain.CurrencyEUR:
		return strings.ToUpper(h.Currency), true
	}
	switch strings.ToUpper(h.Exchange) {
	case "NSE", "BSE":
		return domain.CurrencyINR, true
	case "LSE", "XETRA", "EURONEXT", "FWB", "MIL", "SIX", "AMS", "PAR":
		return domain.CurrencyEUR, true
	}
	return "unknown", false
}

// BuildSnapshot computes the (user, date) snapshot for uid using live
// prices. A per-symbol price error degrades that symbol to current ==
// invested for the day (no synthetic gain/loss) and is logged. An empty
// portfolio still produces a row with all canonical regions at zero, so
// the chart starts the day the user signed up (PRD-002 §6).
func (s *SnapshotService) BuildSnapshot(ctx context.Context, uid primitive.ObjectID, date time.Time) (domain.PortfolioSnapshot, error) {
	holdings, err := s.holdings.ListByUser(ctx, uid)
	if err != nil {
		return domain.PortfolioSnapshot{}, fmt.Errorf("list holdings: %w", err)
	}

	buckets := make(map[string]domain.RegionSnapshot, len(domain.AllCurrencies))
	for _, c := range domain.AllCurrencies {
		buckets[c] = domain.RegionSnapshot{Source: domain.SnapshotSourceCron}
	}

	for _, hld := range holdings {
		cur, ok := CurrencyOf(hld)
		if !ok {
			s.log(ctx).Warn("snapshot: holding has unknown currency; excluded",
				zap.String("script", hld.Script),
				zap.String("exchange", hld.Exchange),
				zap.String("currency", hld.Currency),
			)
			continue
		}
		invested := hld.StocksOwned * hld.AvgCostPrice
		current := invested
		price, _, perr := s.prices.GetPrice(ctx, hld.Symbol)
		if perr == nil && price > 0 {
			current = hld.StocksOwned * price
		} else if perr != nil {
			s.log(ctx).Warn("snapshot: price fetch failed; using invested as current",
				zap.String("symbol", hld.Symbol),
				zap.Error(perr),
			)
		}
		rs := buckets[cur]
		rs.Invested += invested
		rs.Current += current
		buckets[cur] = rs
	}

	return domain.PortfolioSnapshot{
		UserID: uid,
		Date:   domain.UTCDate(date),
		// Currency on the document is the "display anchor" — kept as
		// INR for backwards-compatibility with PR4-era docs. The actual
		// per-bucket amounts live in their native currency under Regions.
		Currency: "INR",
		Buckets:  buckets,
	}, nil
}

// RunOptions configures a snapshot run. Zero-value RunOptions = today,
// every non-disabled user, persist for real.
type RunOptions struct {
	Date   time.Time          // defaults to now (UTC)
	UserID primitive.ObjectID // optional: restrict to one user
	DryRun bool               // when true, no Upsert is called
}

// RunReport summarises a Run. UserErrors maps user-id hex → error message;
// the run continues past a single user's failure (DD-002 §3.4).
type RunReport struct {
	Date       time.Time
	Total      int
	Succeeded  int
	UserErrors map[string]string
}

// HasErrors reports whether the run hit any user-level failure.
func (r RunReport) HasErrors() bool { return len(r.UserErrors) > 0 }

// Run executes the snapshot job for the configured user set on the
// configured date.
func (s *SnapshotService) Run(ctx context.Context, opts RunOptions) (RunReport, error) {
	if opts.Date.IsZero() {
		opts.Date = s.Now()
	}
	date := domain.UTCDate(opts.Date)

	users, err := s.activeUsers(ctx, opts.UserID)
	if err != nil {
		return RunReport{Date: date}, err
	}

	report := RunReport{Date: date, Total: len(users), UserErrors: map[string]string{}}
	for _, u := range users {
		// Bail early on parent ctx cancellation rather than continue
		// recording per-user failures that are really one cancellation
		// in disguise. Surfaces a single ctx error to the caller.
		if err := ctx.Err(); err != nil {
			return report, err
		}
		snap, err := s.BuildSnapshot(ctx, u.ID, date)
		if err != nil {
			report.UserErrors[u.ID.Hex()] = err.Error()
			s.log(ctx).Error("snapshot build failed",
				zap.String("user_id", u.ID.Hex()),
				zap.Error(err),
			)
			continue
		}
		if opts.DryRun {
			report.Succeeded++
			continue
		}
		if err := s.snapshots.Upsert(ctx, snap); err != nil {
			report.UserErrors[u.ID.Hex()] = err.Error()
			s.log(ctx).Error("snapshot upsert failed",
				zap.String("user_id", u.ID.Hex()),
				zap.Error(err),
			)
			continue
		}
		report.Succeeded++
	}
	return report, nil
}

// activeUsers returns the user set the run should iterate. When restrict
// is non-zero, only that user is returned (still filtered for disabled).
func (s *SnapshotService) activeUsers(ctx context.Context, restrict primitive.ObjectID) ([]domain.User, error) {
	if !restrict.IsZero() {
		u, err := s.users.FindByID(ctx, restrict)
		if err != nil {
			if errors.Is(err, persistence.ErrNotFound) {
				return nil, fmt.Errorf("user %s not found", restrict.Hex())
			}
			return nil, err
		}
		if u.Disabled {
			return nil, nil
		}
		return []domain.User{*u}, nil
	}
	// Non-disabled users only (PRD-002 §8). Sort by _id so a mid-run
	// restart resumes deterministically; the upsert is idempotent so a
	// re-run of already-snapshotted users is a no-op (DD-002 §3.1).
	return s.users.List(ctx,
		bson.M{"disabled": bson.M{"$ne": true}},
		bson.D{{Key: "_id", Value: 1}},
	)
}
