package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// ErrValidation marks a transaction that fails input validation (wrong shape
// for its type). Controllers map it — and ErrOversell — to 400.
var ErrValidation = errors.New("transaction: invalid input")

// TransactionsService owns the per-holding ledger. Every mutating call
// recomputes the owning holding's derived position (average cost) and persists
// it, so holdings stay a materialized projection of the ledger. All reads and
// writes are owner-scoped (DD-001 §6.1).
type TransactionsService struct {
	txns       *persistence.TransactionStore
	holdings   *persistence.HoldingStore
	recomputer snapshotRecomputer
	logger     *zap.Logger
	// now lets tests pin "today" for the backdated-heal skip; defaults to
	// wall-clock UTC, matching SnapshotRecomputer.Now.
	now func() time.Time
}

// snapshotRecomputer heals stored snapshots after a backdated ledger change.
// Optional: nil disables the heal (the ledger/holding still update normally),
// so tests that don't exercise history can omit it.
type snapshotRecomputer interface {
	RecomputeFrom(ctx context.Context, uid primitive.ObjectID, from time.Time) error
}

// NewTransactionsService wires a TransactionsService. recomputer may be nil.
func NewTransactionsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, recomputer snapshotRecomputer, logger *zap.Logger) *TransactionsService {
	return &TransactionsService{
		txns:       txns,
		holdings:   holdings,
		recomputer: recomputer,
		logger:     logger,
		now:        func() time.Time { return time.Now().UTC() },
	}
}

// healSnapshots recomputes stored snapshots from the earliest affected date
// when a ledger event touches a past date. A no-op when the recomputer is
// unset or the date is today/future (today's row is the cron's job). Best
// effort: a recompute failure is logged, not surfaced — the ledger write has
// already succeeded and must not be rolled back for a history-heal miss.
func (s *TransactionsService) healSnapshots(ctx context.Context, uid primitive.ObjectID, dates ...time.Time) {
	if s.recomputer == nil {
		return
	}
	var earliest time.Time
	for _, d := range dates {
		if earliest.IsZero() || d.Before(earliest) {
			earliest = d
		}
	}
	if earliest.IsZero() {
		return
	}
	now := time.Now().UTC()
	if s.now != nil {
		now = s.now()
	}
	if !domain.UTCDate(earliest).Before(domain.UTCDate(now)) {
		return // today or future: nothing earlier to heal
	}
	if err := s.recomputer.RecomputeFrom(ctx, uid, earliest); err != nil {
		logger := s.log(ctx)
		logger.Warn("snapshot heal failed", zap.String("user_id", uid.Hex()), zap.Error(err))
	}
}

func (s *TransactionsService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// List returns a holding's transactions. found=false when the holding id is
// invalid, missing, or owned by someone else (so callers respond 404).
func (s *TransactionsService) List(ctx context.Context, uid primitive.ObjectID, holdingHex string) ([]api.Transaction, bool, error) {
	ctx, span := tracer.Start(ctx, "TransactionsService.List")
	defer span.End()
	hid, err := primitive.ObjectIDFromHex(holdingHex)
	if err != nil {
		return nil, false, nil
	}
	if _, err := s.holdings.GetScoped(ctx, uid, hid); err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	list, err := s.txns.ListByHolding(ctx, uid, hid)
	if err != nil {
		logger := s.log(ctx)
		logger.Error("list transactions failed", zap.String("error", err.Error()))
		return nil, false, err
	}
	out := make([]api.Transaction, 0, len(list))
	for _, t := range list {
		out = append(out, TransactionToAPI(t))
	}
	return out, true, nil
}

// Create appends a transaction to a holding and recomputes its position.
// found=false ⇒ 404 (bad holding); a returned ErrValidation/ErrOversell ⇒ 400.
func (s *TransactionsService) Create(ctx context.Context, uid primitive.ObjectID, holdingHex string, input api.TransactionInput) (api.Transaction, bool, error) {
	ctx, span := tracer.Start(ctx, "TransactionsService.Create")
	defer span.End()
	logger := s.log(ctx)
	hid, err := primitive.ObjectIDFromHex(holdingHex)
	if err != nil {
		return api.Transaction{}, false, nil
	}
	holding, err := s.holdings.GetScoped(ctx, uid, hid)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Transaction{}, false, nil
		}
		return api.Transaction{}, false, err
	}
	if err := validateTxnInput(input); err != nil {
		return api.Transaction{}, true, err
	}

	t := TransactionFromInput(input)
	t.ID = primitive.NewObjectID()
	t.UserID = uid
	t.HoldingID = hid
	t.Currency = holding.Currency
	now := time.Now()
	t.CreatedAt = now
	t.UpdatedAt = now

	if err := s.txns.Insert(ctx, t); err != nil {
		logger.Error("insert transaction failed", zap.String("error", err.Error()))
		return api.Transaction{}, true, err
	}
	if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, uid, hid); err != nil {
		// Roll back the just-inserted event (e.g. it oversold).
		_, _ = s.txns.DeleteScoped(ctx, uid, t.ID)
		if errors.Is(err, ErrOversell) {
			return api.Transaction{}, true, err
		}
		return api.Transaction{}, true, err
	}
	logger.Info("transaction created",
		zap.String("id", t.ID.Hex()), zap.String("holding", hid.Hex()), zap.String("type", string(t.Type)))
	s.healSnapshots(ctx, uid, t.Date)
	return TransactionToAPI(t), true, nil
}

// Update edits a transaction by its id and recomputes the holding. found=false
// ⇒ 404; ErrValidation/ErrOversell ⇒ 400. On oversell the prior values are
// restored so the ledger never lands in a rejected state.
func (s *TransactionsService) Update(ctx context.Context, uid primitive.ObjectID, idHex string, input api.TransactionInput) (api.Transaction, bool, error) {
	ctx, span := tracer.Start(ctx, "TransactionsService.Update")
	defer span.End()
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Transaction{}, false, nil
	}
	prev, err := s.txns.GetScoped(ctx, uid, id)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Transaction{}, false, nil
		}
		return api.Transaction{}, false, err
	}
	if err := validateTxnInput(input); err != nil {
		return api.Transaction{}, true, err
	}

	patch := TransactionFromInput(input)
	set := bson.D{
		{Key: "type", Value: string(patch.Type)},
		{Key: "date", Value: patch.Date},
		{Key: "quantity", Value: patch.Quantity},
		{Key: "amount", Value: patch.Amount},
		{Key: "ratio", Value: patch.Ratio},
		{Key: "realized_seed", Value: patch.RealizedSeed},
		{Key: "notes", Value: patch.Notes},
		{Key: "updated_at", Value: time.Now()},
	}
	// The ledger API carries no opening_date field, but editing an opening's
	// date in the modal IS the user declaring its effective date. Keep the two
	// in sync (mirroring setOpeningDate) whenever an opening's effective day
	// changes, so the snapshot heal's as-of filter (asOfLedger) gates the
	// baseline on the new date instead of retaining it on rows before the
	// position existed. A non-date edit (e.g. quantity only) leaves opening_date
	// untouched: an unset baseline stays unset (retained everywhere), a declared
	// one stays put.
	if patch.Type == domain.TxnOpening && !domain.UTCDate(patch.Date).Equal(domain.UTCDate(prev.Date)) {
		set = append(set, bson.E{Key: "opening_date", Value: patch.Date})
	}
	updated, err := s.txns.UpdateScopedAndReturn(ctx, uid, id, set)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Transaction{}, false, nil
		}
		return api.Transaction{}, false, err
	}
	if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, uid, prev.HoldingID); err != nil {
		// Restore the prior values and re-derive the holding.
		s.restore(ctx, uid, prev)
		return api.Transaction{}, true, err
	}
	logger := s.log(ctx)
	logger.Info("transaction updated", zap.String("id", idHex))
	// Heal from the earliest of the old and new dates — moving a txn earlier
	// or later both invalidate the range between them.
	s.healSnapshots(ctx, uid, prev.Date, updated.Date)
	return TransactionToAPI(updated), true, nil
}

// Delete removes a transaction and recomputes the holding. Removing a buy can
// leave a later sell oversold; in that case the transaction is re-inserted and
// the delete rejected with ErrOversell.
func (s *TransactionsService) Delete(ctx context.Context, uid primitive.ObjectID, idHex string) (bool, error) {
	ctx, span := tracer.Start(ctx, "TransactionsService.Delete")
	defer span.End()
	logger := s.log(ctx)
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, nil
	}
	prev, err := s.txns.GetScoped(ctx, uid, id)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	deleted, err := s.txns.DeleteScoped(ctx, uid, id)
	if err != nil {
		return false, err
	}
	if !deleted {
		return false, nil
	}
	if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, uid, prev.HoldingID); err != nil {
		// Re-insert and re-derive so the ledger stays consistent. Best-effort:
		// a failed rollback must still surface the original error, but leaves
		// the ledger inconsistent, so log it loudly.
		if insErr := s.txns.Insert(ctx, prev); insErr != nil {
			logger.Error("delete rollback: re-insert failed, ledger missing transaction",
				zap.String("transaction_id", idHex), zap.Error(insErr))
		} else if _, rcErr := recomputeAndPersist(ctx, s.holdings, s.txns, uid, prev.HoldingID); rcErr != nil {
			logger.Error("delete rollback: recompute failed, holding position stale",
				zap.String("transaction_id", idHex), zap.Error(rcErr))
		}
		return false, err
	}
	logger.Info("transaction deleted", zap.String("id", idHex))
	s.healSnapshots(ctx, uid, prev.Date)
	return true, nil
}

// restore rewrites prev's stored fields and re-derives its holding. Used to
// undo an Update that left the ledger oversold.
func (s *TransactionsService) restore(ctx context.Context, uid primitive.ObjectID, prev domain.Transaction) {
	logger := s.log(ctx)
	set := bson.D{
		{Key: "type", Value: string(prev.Type)},
		{Key: "date", Value: prev.Date},
		{Key: "quantity", Value: prev.Quantity},
		{Key: "amount", Value: prev.Amount},
		{Key: "ratio", Value: prev.Ratio},
		{Key: "realized_seed", Value: prev.RealizedSeed},
		{Key: "notes", Value: prev.Notes},
		{Key: "updated_at", Value: prev.UpdatedAt},
		// Update may stamp opening_date when an opening's date changes; the
		// rollback must restore the prior value (nil = unset) so a rejected edit
		// can't leave asOfLedger gating history on a date that was reverted.
		{Key: "opening_date", Value: prev.OpeningDate},
	}
	if _, err := s.txns.UpdateScopedAndReturn(ctx, uid, prev.ID, set); err != nil {
		logger.Error("restore transaction failed", zap.String("error", err.Error()))
		return
	}
	if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, uid, prev.HoldingID); err != nil {
		logger.Error("restore rollback: recompute failed, holding position stale",
			zap.String("transaction_id", prev.ID.Hex()), zap.Error(err))
	}
}

// validateTxnInput enforces the shape required by each transaction type.
func validateTxnInput(input api.TransactionInput) error {
	typ := domain.TxnType(input.Type)
	switch typ {
	case domain.TxnBuy, domain.TxnSell:
		if input.Quantity == nil || *input.Quantity <= 0 {
			return fmt.Errorf("%w: %s requires a positive quantity", ErrValidation, typ)
		}
		if input.Amount == nil || *input.Amount < 0 {
			return fmt.Errorf("%w: %s requires a non-negative amount", ErrValidation, typ)
		}
	case domain.TxnOpening:
		if input.Quantity != nil && *input.Quantity < 0 {
			return fmt.Errorf("%w: opening quantity cannot be negative", ErrValidation)
		}
	case domain.TxnDividend:
		if input.Amount == nil || *input.Amount <= 0 {
			return fmt.Errorf("%w: dividend requires a positive amount", ErrValidation)
		}
	case domain.TxnSplit, domain.TxnBonus:
		if input.Ratio == nil || *input.Ratio <= 0 {
			return fmt.Errorf("%w: %s requires a positive ratio", ErrValidation, typ)
		}
	case domain.TxnMerger:
		// recorded only; no shape requirement
	default:
		return fmt.Errorf("%w: unknown type %q", ErrValidation, input.Type)
	}
	return nil
}
