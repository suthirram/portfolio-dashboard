package services

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// SnapshotRecomputer rewrites already-stored snapshots after a backdated
// ledger change. A transaction added or edited with a past date breaks every
// snapshot from that date forward — the position they recorded no longer
// matches the corrected ledger. RecomputeFrom replays the ledger as-of each
// affected date and revalues it against the close price already stored on that
// snapshot's per-stock lines, so the history self-heals without refetching
// prices a closed market can no longer provide (PD-0xx).
//
// It is the read/write counterpart to SnapshotService.BuildSnapshot: build
// writes today's row from live closes; recompute rewrites past rows from
// stored closes.
type SnapshotRecomputer struct {
	holdings  *persistence.HoldingStore
	txns      *persistence.TransactionStore
	snapshots *persistence.SnapshotStore
	logger    *zap.Logger
	Now       func() time.Time
}

// NewSnapshotRecomputer wires a SnapshotRecomputer.
func NewSnapshotRecomputer(
	holdings *persistence.HoldingStore,
	txns *persistence.TransactionStore,
	snapshots *persistence.SnapshotStore,
	logger *zap.Logger,
) *SnapshotRecomputer {
	return &SnapshotRecomputer{
		holdings:  holdings,
		txns:      txns,
		snapshots: snapshots,
		logger:    logger,
		Now:       func() time.Time { return time.Now().UTC() },
	}
}

func (r *SnapshotRecomputer) log() *zap.Logger {
	if r.logger != nil {
		return r.logger
	}
	return zap.NewNop()
}

// RecomputeFrom rewrites every existing snapshot for uid in [from, today].
// Missing dates are left alone (forward-only: recompute heals rows that exist,
// it does not fabricate history). Manual bucket overrides are preserved by the
// store's upsert merge; only cron-sourced buckets are revalued.
//
// Each holding's as-of position is replayed from its ledger truncated to the
// snapshot date, then valued at the close already stored on that date's line
// for the symbol. A symbol with no stored close on a date (e.g. the backdated
// transaction introduced it before any cron ran) carries forward at average
// cost — current == invested — per the agreed degradation.
func (r *SnapshotRecomputer) RecomputeFrom(ctx context.Context, uid primitive.ObjectID, from time.Time) error {
	today := domain.UTCDate(r.Now())
	fromDay := domain.UTCDate(from)
	if fromDay.After(today) {
		return nil
	}

	snaps, err := r.snapshots.List(ctx, uid, fromDay, today)
	if err != nil {
		return err
	}
	if len(snaps) == 0 {
		return nil
	}

	holdings, err := r.holdings.ListByUser(ctx, uid)
	if err != nil {
		return err
	}
	allTxns, err := r.txns.ListByUser(ctx, uid)
	if err != nil {
		return err
	}
	byHolding := make(map[primitive.ObjectID][]domain.Transaction, len(holdings))
	for _, t := range allTxns {
		byHolding[t.HoldingID] = append(byHolding[t.HoldingID], t)
	}

	for _, snap := range snaps {
		// Forward-only: only line-backed rows are recomputable. A pre-change
		// total-only row (or a purely manual row) has a nil/absent `holdings`
		// field — no stored per-stock close to replay against; recomputing it
		// would carry every holding at average cost and overwrite its cron
		// buckets, corrupting legacy history. Leave those untouched. Guard on
		// nil (absent), NOT len==0: an empty-portfolio cron row stores an
		// explicit empty array and IS recomputable (a backdated first buy must
		// be able to populate it).
		if snap.Lines == nil {
			r.log().Debug("snapshot skipped: no stored lines (forward-only)",
				zap.String("user_id", uid.Hex()),
				zap.String("date", snap.Date.UTC().Format("2006-01-02")),
			)
			continue
		}
		lines := r.linesAsOf(holdings, byHolding, snap)
		rebuilt := domain.PortfolioSnapshot{
			UserID:   uid,
			Date:     snap.Date,
			Currency: "INR",
			Buckets:  domain.BucketsFromLines(lines),
			Lines:    lines,
		}
		if err := r.snapshots.Upsert(ctx, rebuilt); err != nil {
			return err
		}
		r.log().Info("snapshot recomputed",
			zap.String("user_id", uid.Hex()),
			zap.String("date", snap.Date.UTC().Format("2006-01-02")),
			zap.Int("lines", len(lines)),
		)
	}
	return nil
}

// linesAsOf builds the per-stock lines for one snapshot date: each holding's
// ledger replayed as-of that date, valued at the close stored on the existing
// line for the symbol (carry-forward at average cost when none exists).
func (r *SnapshotRecomputer) linesAsOf(
	holdings []domain.Holding,
	byHolding map[primitive.ObjectID][]domain.Transaction,
	existing domain.PortfolioSnapshot,
) []domain.HoldingSnapshot {
	priorClose := make(map[string]domain.HoldingSnapshot, len(existing.Lines))
	for _, ln := range existing.Lines {
		priorClose[ln.Symbol] = ln
	}
	// As-of cutoff: include events dated on or before this snapshot's day.
	cutoff := domain.UTCDate(existing.Date).Add(24 * time.Hour)

	lines := make([]domain.HoldingSnapshot, 0, len(holdings))
	for _, h := range holdings {
		cur, ok := CurrencyOf(h)
		if !ok {
			continue
		}
		ledger := asOfLedger(byHolding[h.ID], cutoff)
		pos, oversell := RecomputePosition(ledger)
		if oversell != nil {
			// A backdated edit made the as-of ledger oversold (e.g. a sell
			// now precedes its covering buy); the position is clamped at 0.
			// The live txn path rejects this, but the recompute write already
			// happened — surface it rather than writing a silently-clamped
			// line with no trace.
			r.log().Warn("recompute: as-of ledger oversold; position clamped to 0",
				zap.String("symbol", h.Symbol),
				zap.String("date", existing.Date.UTC().Format("2006-01-02")),
			)
		}
		prior, hadPrior := priorClose[h.Symbol]
		if pos.StocksOwned == 0 && !hadPrior {
			continue
		}

		// Reuse the close recorded on this date's stored line — even a 0. A
		// holding the snapshot recorded as worthless (delisted / failed fetch,
		// close=0) must stay worthless on recompute, not be resurrected to
		// cost. Only a holding with NO stored line on this date (a backdated
		// txn introduced it on an unpriced day) carries forward at avg cost.
		close := pos.AvgCostPrice
		priceDate := ""
		if hadPrior {
			close, priceDate = prior.ClosePrice, prior.PriceDate
		}
		invested := round(pos.StocksOwned * pos.AvgCostPrice)
		current := round(pos.StocksOwned * close)
		lines = append(lines, domain.HoldingSnapshot{
			Symbol:     h.Symbol,
			Script:     h.Script,
			Currency:   cur,
			Quantity:   pos.StocksOwned,
			AvgCost:    pos.AvgCostPrice,
			ClosePrice: close,
			PriceDate:  priceDate,
			Invested:   invested,
			Current:    current,
		})
	}
	return lines
}

// asOfLedger keeps every event dated before cutoff. Filtering is purely by
// date — including for an opening: an opening dated AFTER the snapshot date is
// a baseline that did not yet exist on that date and must not inflate a past
// row. RecomputePosition still sorts a retained opening first as the baseline;
// ordering and as-of membership are separate concerns. A normal opening dated
// at/before the snapshot (the common case, incl. zero-dated migration
// openings) is < cutoff and stays.
func asOfLedger(txns []domain.Transaction, cutoff time.Time) []domain.Transaction {
	out := make([]domain.Transaction, 0, len(txns))
	for _, t := range txns {
		if t.Date.Before(cutoff) {
			out = append(out, t)
		}
	}
	return out
}
