package services

import (
	"context"
	"errors"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// HoldingsService owns CRUD operations against the holdings collection.
// Every call is scoped by owner id; the underlying store enforces the same
// invariant so mis-routed reads return ErrNotFound, never another user's row.
type HoldingsService struct {
	store  *persistence.HoldingStore
	logger *zap.Logger
}

// NewHoldingsService wires a HoldingsService.
func NewHoldingsService(store *persistence.HoldingStore, logger *zap.Logger) *HoldingsService {
	return &HoldingsService{store: store, logger: logger}
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

// Create inserts a new holding owned by uid.
func (s *HoldingsService) Create(ctx context.Context, uid primitive.ObjectID, input api.HoldingInput) (api.Holding, error) {
	holding := HoldingFromInput(input)
	holding.ID = primitive.NewObjectID()
	holding.UserID = uid
	now := time.Now()
	holding.CreatedAt = now
	holding.UpdatedAt = now

	if err := s.store.Insert(ctx, holding); err != nil {
		s.log(ctx).Error("create holding failed",
			zap.String("script", holding.Script), zap.String("error", err.Error()))
		return api.Holding{}, err
	}
	s.log(ctx).Info("holding created",
		zap.String("id", holding.ID.Hex()),
		zap.String("owner", uid.Hex()),
		zap.String("script", holding.Script),
		zap.String("currency", holding.Currency),
	)
	return HoldingToAPI(holding), nil
}

// Update applies input to the holding owned by uid. found=false when the id is
// invalid, missing, or owned by someone else.
func (s *HoldingsService) Update(ctx context.Context, uid primitive.ObjectID, idHex string, input api.HoldingInput) (api.Holding, bool, error) {
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return api.Holding{}, false, nil
	}

	update := bson.D{
		{Key: "script", Value: input.Script},
		{Key: "exchange", Value: string(input.Exchange)},
		{Key: "type", Value: string(input.Type)},
		{Key: "updated_at", Value: time.Now()},
	}
	if input.Symbol != nil {
		update = append(update, bson.E{Key: "symbol", Value: *input.Symbol})
	}
	if input.StocksOwned != nil {
		update = append(update, bson.E{Key: "stocks_owned", Value: *input.StocksOwned})
	}
	if input.AvgCostPrice != nil {
		update = append(update, bson.E{Key: "avg_cost_price", Value: *input.AvgCostPrice})
	}
	if input.RealizedPnl != nil {
		update = append(update, bson.E{Key: "realized_pnl", Value: *input.RealizedPnl})
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
	s.log(ctx).Info("holding updated", zap.String("id", idHex))
	return HoldingToAPI(updated), true, nil
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
	s.log(ctx).Info("holding deleted", zap.String("id", idHex))
	return true, nil
}
