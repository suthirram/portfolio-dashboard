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

// CurrencyOf maps a holding to its snapshot bucket key. Holding.Currency
// is the sole deciding factor: the monetary amount
// (StocksOwned × AvgCostPrice) is denominated in that field, so it — not
// the listing exchange — determines the bucket. Returns ("unknown", false)
// when the currency can't be classified; the caller logs and excludes it.
//
// PR7 design-review (2026-06-16) moved bucketing from region to currency.
// A prod-cron bug then surfaced: an NYSE holding typed with Currency=INR
// (the user paid in rupees for a US-listed security) was bucketed to USD
// because Exchange beat Currency. Exchange is no longer consulted at all.
//
// Rules:
//   - Holding.Currency = INR | EUR | USD → that bucket.
//   - Currency blank → INR (the Holding.Currency default).
//   - Anything else → "unknown".
func CurrencyOf(h domain.Holding) (string, bool) {
	switch strings.ToUpper(h.Currency) {
	case domain.CurrencyINR, domain.CurrencyEUR, domain.CurrencyUSD:
		return strings.ToUpper(h.Currency), true
	case "":
		return domain.CurrencyINR, true
	}
	return "unknown", false
}

// BuildSnapshot computes the (user, date) snapshot for uid.
//
// On a trading day the position is marked to the live current price
// (PriceService.GetPrice — same source as the dashboard). On a weekend the
// market is closed, so instead of fetching a non-session price we re-value the
// CURRENT positions at the prior snapshot's stored per-stock price (carried
// forward with its original PriceDate). A symbol with no prior line — e.g.
// bought over the weekend — falls back to the live price. A per-symbol price
// error or zero degrades that symbol to current == 0 (worthless, matching the
// dashboard) and is logged. An empty portfolio still produces a row with all
// canonical regions at zero, so the chart starts the day the user signed up
// (PRD-002 §6).
func (s *SnapshotService) BuildSnapshot(ctx context.Context, uid primitive.ObjectID, date time.Time) (domain.PortfolioSnapshot, error) {
	holdings, err := s.holdings.ListByUser(ctx, uid)
	if err != nil {
		return domain.PortfolioSnapshot{}, fmt.Errorf("list holdings: %w", err)
	}

	logger := s.log(ctx)

	// On a weekend, load the most recent prior snapshot once and re-use its
	// per-stock prices rather than fetching a closed-market quote.
	weekend := isWeekend(date)
	priorBySymbol := map[string]domain.HoldingSnapshot{}
	if weekend {
		prev, perr := s.snapshots.LatestBefore(ctx, uid, date)
		switch {
		case perr == nil:
			for _, ln := range prev.Lines {
				priorBySymbol[ln.Symbol] = ln
			}
			logger.Info("snapshot: weekend; re-valuing current positions at prior close",
				zap.String("user_id", uid.Hex()),
				zap.String("date", date.UTC().Format("2006-01-02")),
				zap.String("prior_date", prev.Date.UTC().Format("2006-01-02")),
			)
		case errors.Is(perr, persistence.ErrNotFound):
			// No prior row to carry from (first-ever snapshot lands on a
			// weekend): fall through to live pricing for every holding.
		default:
			return domain.PortfolioSnapshot{}, fmt.Errorf("weekend prior snapshot: %w", perr)
		}
	}

	lines := make([]domain.HoldingSnapshot, 0, len(holdings))
	for _, hld := range holdings {
		cur, ok := CurrencyOf(hld)
		if !ok {
			logger.Warn("snapshot: holding has unknown currency; excluded",
				zap.String("script", hld.Script),
				zap.String("exchange", hld.Exchange),
				zap.String("currency", hld.Currency),
			)
			continue
		}
		invested := hld.StocksOwned * hld.AvgCostPrice
		price, priceCur, priceDate := s.priceFor(ctx, logger, uid, hld, date, priorBySymbol)
		current := 0.0
		if price > 0 {
			current = hld.StocksOwned * price
		}
		logger.Info("snapshot: holding valued",
			zap.String("user_id", uid.Hex()),
			zap.String("script", hld.Script),
			zap.String("symbol", hld.Symbol),
			zap.String("exchange", hld.Exchange),
			zap.String("holding_currency", hld.Currency),
			zap.String("bucket", cur),
			zap.String("price_currency", priceCur),
			zap.String("price_date", priceDate),
			zap.Bool("weekend", weekend),
			zap.Float64("quantity", hld.StocksOwned),
			zap.Float64("avg_cost_price", hld.AvgCostPrice),
			zap.Float64("price", price),
			zap.Float64("invested_value", invested),
			zap.Float64("current_value", current),
		)
		lines = append(lines, domain.HoldingSnapshot{
			Symbol:     hld.Symbol,
			Script:     hld.Script,
			Currency:   cur,
			Quantity:   hld.StocksOwned,
			AvgCost:    hld.AvgCostPrice,
			ClosePrice: price,
			PriceDate:  priceDate,
			Invested:   round(invested),
			Current:    round(current),
		})
	}

	buckets := domain.BucketsFromLines(lines)
	for cur, rs := range buckets {
		logger.Info("snapshot: bucket total",
			zap.String("user_id", uid.Hex()),
			zap.String("bucket", cur),
			zap.Float64("invested", rs.Invested),
			zap.Float64("current", rs.Current),
		)
	}

	return domain.PortfolioSnapshot{
		UserID: uid,
		Date:   domain.UTCDate(date),
		// Currency on the document is the "display anchor" — kept as
		// INR for backwards-compatibility with PR4-era docs. The actual
		// per-bucket amounts live in their native currency under Regions.
		Currency: "INR",
		Buckets:  buckets,
		Lines:    lines,
	}, nil
}

// priceFor returns the price to value one holding at, its currency, and the
// trading date the price belongs to. On a weekend it re-uses the prior
// snapshot's stored price for the symbol (carried forward with its original
// PriceDate, including a 0 — a worthless holding stays worthless). Otherwise —
// a trading day, or a weekend symbol with no prior line — it reads the live
// current price. A fetch error or non-positive quote returns price 0 (the
// holding is valued as worthless, matching the dashboard) and is logged.
func (s *SnapshotService) priceFor(
	ctx context.Context,
	logger *zap.Logger,
	uid primitive.ObjectID,
	hld domain.Holding,
	date time.Time,
	prior map[string]domain.HoldingSnapshot,
) (price float64, currency, priceDate string) {
	if pl, ok := prior[hld.Symbol]; ok {
		// Weekend carry-forward: current position re-valued at the prior
		// stored price. PriceDate keeps the trading day that price belonged to.
		return pl.ClosePrice, hld.Currency, pl.PriceDate
	}

	dateStr := date.UTC().Format("2006-01-02")
	p, cur, perr := s.prices.GetPrice(ctx, hld.Symbol)
	switch {
	case perr != nil:
		logger.Warn("snapshot: price fetch failed; assuming current price 0",
			zap.String("user_id", uid.Hex()),
			zap.String("script", hld.Script),
			zap.String("symbol", hld.Symbol),
			zap.Error(perr),
		)
		return 0, cur, dateStr
	case p <= 0:
		// Zero quote with no error (thin trading / data glitch): treated as
		// worthless, but logged so a silent current=0 is diagnosable.
		logger.Warn("snapshot: zero price with no error; assuming current price 0",
			zap.String("user_id", uid.Hex()),
			zap.String("script", hld.Script),
			zap.String("symbol", hld.Symbol),
		)
		return 0, cur, dateStr
	default:
		return p, cur, dateStr
	}
}

// isWeekend reports whether the snapshot date falls on a Saturday or Sunday
// (UTC). This iteration accounts for weekends only, not exchange holidays.
func isWeekend(t time.Time) bool {
	wd := t.UTC().Weekday()
	return wd == time.Saturday || wd == time.Sunday
}

// RunOptions configures a snapshot run. Zero-value RunOptions = now (UTC),
// every non-disabled user, persist for real. The cron entry point
// (cmd/snapshot) passes yesterday, not now — see that command for why.
type RunOptions struct {
	Date   time.Time          // zero value = now (UTC); cron passes yesterday
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
