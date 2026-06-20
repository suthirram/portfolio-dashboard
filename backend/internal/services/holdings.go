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
	if l, ok := logging.FromContext(ctx); ok {
		return l
	}
	if s.logger != nil {
		return s.logger
	}
	return zap.NewNop()
}

// List returns the holdings owned by uid, mapped to API DTOs.
func (s *HoldingsService) List(ctx context.Context, uid primitive.ObjectID) ([]api.Holding, error) {
	holdings, err := s.store.ListByUser(ctx, uid)
	if err != nil {
		s.log(ctx).Error("list holdings query failed", zap.String("error", err.Error()))
		return nil, err
	}
	out := make([]api.Holding, 0, len(holdings))
	for _, hld := range holdings {
		out = append(out, HoldingToAPI(hld))
	}
	return out, nil
}

// Get returns the single holding owned by uid. ok=false when the id is
// invalid, missing, or owned by someone else (so callers respond 404 without
// leaking ownership).
func (s *HoldingsService) Get(ctx context.Context, uid primitive.ObjectID, idHex string) (api.Holding, bool, error) {
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Holding{}, false, nil
	}
	holding, err := s.store.GetScoped(ctx, uid, id)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Holding{}, false, nil
		}
		s.log(ctx).Error("get holding failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return api.Holding{}, false, err
	}
	return HoldingToAPI(holding), true, nil
}

// Create inserts a new holding owned by uid. The position fields become
// derived: any opening stocks_owned/avg_cost_price/realized_pnl are recorded as
// an `opening` ledger event and the holding is recomputed from it.
func (s *HoldingsService) Create(ctx context.Context, uid primitive.ObjectID, input api.HoldingInput) (api.Holding, error) {
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
		s.log(ctx).Error("create holding failed",
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
			s.log(ctx).Error("create opening transaction failed", zap.String("error", err.Error()))
			return api.Holding{}, err
		}
		if updated, err := recomputeAndPersist(ctx, s.store, s.txns, uid, holding.ID); err != nil {
			s.log(ctx).Error("recompute after create failed", zap.String("error", err.Error()))
		} else {
			holding = updated
		}
	}

	s.log(ctx).Info("holding created",
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
func (s *HoldingsService) Update(ctx context.Context, uid primitive.ObjectID, idHex string, input api.HoldingInput) (api.Holding, bool, error) {
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Holding{}, false, nil
	}

	// Identity fields update the holding directly. The position fields
	// (stocks_owned/avg_cost_price/realized_pnl) are derived — they instead
	// edit the holding's opening ledger event below.
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
		s.log(ctx).Error("update holding failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return api.Holding{}, false, err
	}

	if input.StocksOwned != nil || input.AvgCostPrice != nil || input.RealizedPnl != nil {
		if err := s.upsertOpening(ctx, uid, updated, input); err != nil {
			s.log(ctx).Error("opening-balance override failed",
				zap.String("id", idHex), zap.String("error", err.Error()))
			return api.Holding{}, false, err
		}
		if recomputed, err := recomputeAndPersist(ctx, s.store, s.txns, uid, id); err != nil {
			s.log(ctx).Error("recompute after update failed", zap.String("error", err.Error()))
		} else {
			updated = recomputed
		}
	}

	s.log(ctx).Info("holding updated", zap.String("id", idHex))
	return HoldingToAPI(updated), true, nil
}

// upsertOpening edits the holding's `opening` ledger event from the form's
// position fields (manual override), inserting one if none exists. Only the
// provided fields are changed; amount is qty × avg cost price.
func (s *HoldingsService) upsertOpening(ctx context.Context, uid primitive.ObjectID, holding domain.Holding, input api.HoldingInput) error {
	list, err := s.txns.ListByHolding(ctx, uid, holding.ID)
	if err != nil {
		return err
	}
	var opening *domain.Transaction
	for i := range list {
		if list[i].Type == domain.TxnOpening {
			opening = &list[i]
			break
		}
	}
	now := time.Now()

	if opening == nil {
		qty, amount, seed, _ := openingFromInput(input)
		return s.txns.Insert(ctx, domain.Transaction{
			ID:           primitive.NewObjectID(),
			UserID:       uid,
			HoldingID:    holding.ID,
			Type:         domain.TxnOpening,
			Date:         holding.CreatedAt,
			Quantity:     qty,
			Amount:       amount,
			RealizedSeed: seed,
			Currency:     holding.Currency,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
	}

	// Patch only the provided fields; recompute amount from the resulting qty
	// and avg cost so the running cost basis is qty × avg.
	qty := opening.Quantity
	if input.StocksOwned != nil {
		qty = *input.StocksOwned
	}
	set := bson.D{{Key: "quantity", Value: qty}, {Key: "updated_at", Value: now}}
	if input.AvgCostPrice != nil {
		set = append(set, bson.E{Key: "amount", Value: qty * *input.AvgCostPrice})
	} else if input.StocksOwned != nil && opening.Quantity != 0 {
		// keep the same per-share cost when only the quantity changed
		set = append(set, bson.E{Key: "amount", Value: qty * (opening.Amount / opening.Quantity)})
	}
	if input.RealizedPnl != nil {
		set = append(set, bson.E{Key: "realized_seed", Value: *input.RealizedPnl})
	}
	_, err = s.txns.UpdateScopedAndReturn(ctx, uid, opening.ID, set)
	return err
}

// Delete removes the holding owned by uid. ok=false when the id is invalid,
// missing, or owned by someone else.
func (s *HoldingsService) Delete(ctx context.Context, uid primitive.ObjectID, idHex string) (bool, error) {
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, nil
	}
	deleted, err := s.store.DeleteScoped(ctx, uid, id)
	if err != nil {
		s.log(ctx).Error("delete holding failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return false, err
	}
	if !deleted {
		return false, nil
	}
	// Cascade: remove the holding's ledger so no orphan transactions linger.
	if err := s.txns.DeleteByHolding(ctx, uid, id); err != nil {
		s.log(ctx).Error("delete holding transactions failed",
			zap.String("id", idHex), zap.String("error", err.Error()))
		return false, err
	}
	s.log(ctx).Info("holding deleted", zap.String("id", idHex))
	return true, nil
}
