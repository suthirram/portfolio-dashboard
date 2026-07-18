package services

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// HoldingsService owns CRUD operations against the holdings collection.
// Every call is scoped by owner id; the underlying store enforces the same
// invariant so mis-routed reads return ErrNotFound, never another user's row.
type HoldingsService struct {
	store  *persistence.HoldingStore
	txns   *persistence.TransactionStore
	logger *zap.Logger
}

// NewHoldingsService wires a HoldingsService. The transaction store lets the
// opening-balance fields (stocks_owned/avg_cost_price/realized_pnl) be recorded
// as an `opening` ledger event so the holding's derived position stays a
// projection of its ledger.
func NewHoldingsService(store *persistence.HoldingStore, txns *persistence.TransactionStore, logger *zap.Logger) *HoldingsService {
	return &HoldingsService{store: store, txns: txns, logger: logger}
}

func (s *HoldingsService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// List returns the holdings owned by uid, mapped to API DTOs.
func (s *HoldingsService) List(ctx context.Context, uid primitive.ObjectID) (_ []api.Holding, retErr error) {
	ctx, span := tracer.Start(ctx, "HoldingsService.List")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	holdings, err := s.store.ListByUser(ctx, uid)
	if err != nil {
		logger.Error("list holdings query failed", zap.String("error", err.Error()))
		return nil, err
	}
	openings, err := s.txns.OpeningsByUser(ctx, uid)
	if err != nil {
		logger.Error("list openings query failed", zap.String("error", err.Error()))
		return nil, err
	}
	out := make([]api.Holding, 0, len(holdings))
	for _, hld := range holdings {
		h := HoldingToAPI(hld)
		h.HasOpening, h.OpeningDate = openingStatus(openings, hld.ID)
		out = append(out, h)
	}
	return out, nil
}

// Get returns the single holding owned by uid. ok=false when the id is
// invalid, missing, or owned by someone else (so callers respond 404 without
// leaking ownership).
func (s *HoldingsService) Get(ctx context.Context, uid primitive.ObjectID, idHex string) (_ api.Holding, _ bool, retErr error) {
	ctx, span := tracer.Start(ctx, "HoldingsService.Get")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Holding{}, false, nil
	}
	holding, err := s.store.GetScoped(ctx, uid, id)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Holding{}, false, nil
		}
		logger.Error("get holding failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return api.Holding{}, false, err
	}
	openings := map[primitive.ObjectID]domain.Transaction{}
	opening, err := s.txns.OpeningByHolding(ctx, uid, holding.ID)
	if err != nil && !errors.Is(err, persistence.ErrNotFound) {
		return api.Holding{}, false, err
	}
	if err == nil {
		openings[holding.ID] = opening
	}
	h := HoldingToAPI(holding)
	h.HasOpening, h.OpeningDate = openingStatus(openings, holding.ID)
	return h, true, nil
}

// Create inserts a new holding owned by uid. The position fields become
// derived: any opening stocks_owned/avg_cost_price/realized_pnl are recorded as
// an `opening` ledger event and the holding is recomputed from it.
func (s *HoldingsService) Create(ctx context.Context, uid primitive.ObjectID, input api.HoldingInput) (_ api.Holding, retErr error) {
	ctx, span := tracer.Start(ctx, "HoldingsService.Create")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	holding := HoldingFromInput(input)
	holding.ID = primitive.NewObjectID()
	holding.UserID = uid
	now := time.Now()
	holding.CreatedAt = now
	holding.UpdatedAt = now
	// Position fields are derived from the ledger; start flat and let the
	// opening event (if any) populate them.
	holding.StocksOwned = 0
	holding.AvgCostPrice = 0
	holding.RealizedPnL = 0
	holding.TotalDividends = 0

	if err := s.store.Insert(ctx, holding); err != nil {
		logger.Error("create holding failed",
			zap.String("script", holding.Script), zap.String("error", err.Error()))
		return api.Holding{}, err
	}

	if qty, amount, seed, ok := openingFromInput(input); ok {
		opening := domain.Transaction{
			ID:           primitive.NewObjectID(),
			UserID:       uid,
			HoldingID:    holding.ID,
			Type:         domain.TxnOpening,
			Date:         now,
			Quantity:     qty,
			Amount:       amount,
			RealizedSeed: seed,
			Currency:     holding.Currency,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := s.txns.Insert(ctx, opening); err != nil {
			logger.Error("create opening transaction failed", zap.String("error", err.Error()))
			return api.Holding{}, err
		}
		if updated, err := recomputeAndPersist(ctx, s.store, s.txns, uid, holding.ID); err != nil {
			logger.Error("recompute after create failed", zap.String("error", err.Error()))
		} else {
			holding = updated
		}
	}

	logger.Info("holding created",
		zap.String("id", holding.ID.Hex()),
		zap.String("owner", uid.Hex()),
		zap.String("script", holding.Script),
		zap.String("currency", holding.Currency),
	)
	return HoldingToAPI(holding), nil
}

// openingFromInput derives the opening ledger event from the holding form's
// position fields. amount is the total cost (qty × avg cost price). ok is false
// when there is nothing to seed.
func openingFromInput(input api.HoldingInput) (qty, amount, seed float64, ok bool) {
	if input.StocksOwned != nil {
		qty = *input.StocksOwned
	}
	if input.AvgCostPrice != nil {
		amount = qty * *input.AvgCostPrice
	}
	if input.RealizedPnl != nil {
		seed = *input.RealizedPnl
	}
	ok = qty != 0 || amount != 0 || seed != 0
	return qty, amount, seed, ok
}

// Update applies input to the holding owned by uid. found=false when the id is
// invalid, missing, or owned by someone else.
func (s *HoldingsService) Update(ctx context.Context, uid primitive.ObjectID, idHex string, input api.HoldingInput) (_ api.Holding, _ bool, retErr error) {
	ctx, span := tracer.Start(ctx, "HoldingsService.Update")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Holding{}, false, nil
	}

	// Update edits identity fields only. The position fields
	// (stocks_owned/avg_cost_price/realized_pnl) are derived from the ledger
	// and are deliberately NOT written here: the edit form pre-fills them with
	// the current derived position, so honouring them would rewrite the opening
	// event on top of existing buys/sells and double-count. The opening balance
	// is seeded at create and edited via the transactions ledger instead.
	update := bson.D{
		{Key: "script", Value: input.Script},
		{Key: "exchange", Value: string(input.Exchange)},
		{Key: "type", Value: string(input.Type)},
		{Key: "updated_at", Value: time.Now()},
	}
	if input.Symbol != nil {
		update = append(update, bson.E{Key: "symbol", Value: *input.Symbol})
	}
	if input.Currency != nil && ValidCurrency(*input.Currency) {
		update = append(update, bson.E{Key: "currency", Value: string(*input.Currency)})
	}
	if input.Notes != nil {
		update = append(update, bson.E{Key: "notes", Value: *input.Notes})
	}

	updated, err := s.store.UpdateScopedAndReturn(ctx, uid, id, update)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Holding{}, false, nil
		}
		logger.Error("update holding failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return api.Holding{}, false, err
	}

	// Setting the opening date stamps the holding's opening event with the
	// user-chosen effective date (and syncs the ordering Date to it), then
	// re-derives the position. No-op when the holding has no opening event.
	if input.OpeningDate != nil {
		if err := s.setOpeningDate(ctx, uid, id, input.OpeningDate.Time); err != nil {
			logger.Error("set opening date failed",
				zap.String("id", idHex), zap.String("error", err.Error()))
			return api.Holding{}, false, err
		}
	}

	logger.Info("holding updated", zap.String("id", idHex))
	return HoldingToAPI(updated), true, nil
}

// setOpeningDate stamps the holding's opening event with date as its effective
// (user-set) opening date, syncs the event's ordering Date to it, and
// re-derives the position. A no-op when the holding has no opening event.
func (s *HoldingsService) setOpeningDate(ctx context.Context, uid, holdingID primitive.ObjectID, date time.Time) error {
	openings, err := s.txns.OpeningsByUser(ctx, uid)
	if err != nil {
		return err
	}
	opening, ok := openings[holdingID]
	if !ok {
		return nil
	}
	set := bson.D{
		{Key: "opening_date", Value: date},
		{Key: "date", Value: date},
		{Key: "updated_at", Value: time.Now()},
	}
	if _, err := s.txns.UpdateScopedAndReturn(ctx, uid, opening.ID, set); err != nil {
		return err
	}
	_, err = recomputeAndPersist(ctx, s.store, s.txns, uid, holdingID)
	return err
}

// Delete removes the holding owned by uid. ok=false when the id is invalid,
// missing, or owned by someone else.
func (s *HoldingsService) Delete(ctx context.Context, uid primitive.ObjectID, idHex string) (_ bool, retErr error) {
	ctx, span := tracer.Start(ctx, "HoldingsService.Delete")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, nil
	}
	deleted, err := s.store.DeleteScoped(ctx, uid, id)
	if err != nil {
		logger.Error("delete holding failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return false, err
	}
	if !deleted {
		return false, nil
	}
	// Cascade: remove the holding's ledger so no orphan transactions linger.
	if err := s.txns.DeleteByHolding(ctx, uid, id); err != nil {
		logger.Error("delete holding transactions failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return false, err
	}
	logger.Info("holding deleted", zap.String("id", idHex))
	return true, nil
}
