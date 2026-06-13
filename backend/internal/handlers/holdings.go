package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/persistence"
)

// errNotLoggedIn is a defence-in-depth guard: requireAuth middleware should
// reject unauthenticated requests before any handler runs.
var errNotLoggedIn = echo.NewHTTPError(http.StatusUnauthorized, "not logged in")

// currentUserID resolves the caller's user id from the request context.
func currentUserID(ctx context.Context) (primitive.ObjectID, error) {
	if u, ok := auth.UserFromContext(ctx); ok {
		return u.ID, nil
	}
	return primitive.NilObjectID, errNotLoggedIn
}

// ── Scoped cores (shared with the admin act-as endpoints) ──────────────────

func (h *Handler) listHoldingsFor(ctx context.Context, uid primitive.ObjectID) ([]api.Holding, error) {
	holdings, err := h.store.Holdings.ListByUser(ctx, uid)
	if err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "list holdings query failed", slog.String("error", err.Error()))
		return nil, err
	}

	out := make([]api.Holding, 0, len(holdings))
	for _, hld := range holdings {
		out = append(out, holdingToAPI(hld))
	}
	return out, nil
}

func (h *Handler) createHoldingFor(ctx context.Context, uid primitive.ObjectID, input api.HoldingInput) (api.Holding, error) {
	holding := holdingFromInput(input)
	holding.ID = primitive.NewObjectID()
	holding.UserID = uid
	now := time.Now()
	holding.CreatedAt = now
	holding.UpdatedAt = now

	if err := h.store.Holdings.Insert(ctx, holding); err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "create holding failed",
			slog.String("script", holding.Script),
			slog.String("error", err.Error()),
		)
		return api.Holding{}, err
	}
	h.reqLog(ctx).InfoContext(ctx, "holding created",
		slog.String("id", holding.ID.Hex()),
		slog.String("owner", uid.Hex()),
		slog.String("script", holding.Script),
		slog.String("currency", holding.Currency),
	)
	return holdingToAPI(holding), nil
}

// updateHoldingFor applies input to the holding owned by uid. found=false
// when the id is invalid, missing, or owned by someone else.
func (h *Handler) updateHoldingFor(ctx context.Context, uid primitive.ObjectID, idHex string, input api.HoldingInput) (api.Holding, bool, error) {
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
	if input.Currency != nil && validCurrency(*input.Currency) {
		update = append(update, bson.E{Key: "currency", Value: string(*input.Currency)})
	}
	if input.Notes != nil {
		update = append(update, bson.E{Key: "notes", Value: *input.Notes})
	}

	updated, err := h.store.Holdings.UpdateScopedAndReturn(ctx, uid, id, update)
	if err != nil {
		if errors.Is(err, persistence.ErrNotFound) {
			return api.Holding{}, false, nil
		}
		h.reqLog(ctx).ErrorContext(ctx, "update holding failed",
			slog.String("id", idHex),
			slog.String("error", err.Error()),
		)
		return api.Holding{}, false, err
	}
	h.reqLog(ctx).InfoContext(ctx, "holding updated", slog.String("id", idHex))
	return holdingToAPI(updated), true, nil
}

func (h *Handler) deleteHoldingFor(ctx context.Context, uid primitive.ObjectID, idHex string) (bool, error) {
	id, err := primitive.ObjectIDFromHex(idHex)
	if err != nil {
		return false, nil
	}

	deleted, err := h.store.Holdings.DeleteScoped(ctx, uid, id)
	if err != nil {
		h.reqLog(ctx).ErrorContext(ctx, "delete holding failed",
			slog.String("id", idHex),
			slog.String("error", err.Error()),
		)
		return false, err
	}
	if !deleted {
		return false, nil
	}
	h.reqLog(ctx).InfoContext(ctx, "holding deleted", slog.String("id", idHex))
	return true, nil
}

// ── Generated-interface handlers (caller's own portfolio) ──────────────────

func (h *Handler) ListHoldings(ctx context.Context, _ api.ListHoldingsRequestObject) (api.ListHoldingsResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	holdings, err := h.listHoldingsFor(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.ListHoldings200JSONResponse(holdings), nil
}

func (h *Handler) GetHolding(ctx context.Context, request api.GetHoldingRequestObject) (api.GetHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	id, err := primitive.ObjectIDFromHex(request.Id)
	if err != nil {
		return api.GetHolding404JSONResponse{}, nil
	}

	holding, err := h.store.Holdings.GetScoped(ctx, uid, id)
	if err != nil {
		// Someone else's id reads as 404, not 403 — ids must not be enumerable.
		if errors.Is(err, persistence.ErrNotFound) {
			return api.GetHolding404JSONResponse{}, nil
		}
		h.reqLog(ctx).ErrorContext(ctx, "get holding failed",
			slog.String("id", request.Id),
			slog.String("error", err.Error()),
		)
		return nil, err
	}
	return api.GetHolding200JSONResponse(holdingToAPI(holding)), nil
}

func (h *Handler) CreateHolding(ctx context.Context, request api.CreateHoldingRequestObject) (api.CreateHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	created, err := h.createHoldingFor(ctx, uid, *request.Body)
	if err != nil {
		return nil, err
	}
	return api.CreateHolding201JSONResponse(created), nil
}

func (h *Handler) UpdateHolding(ctx context.Context, request api.UpdateHoldingRequestObject) (api.UpdateHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	updated, found, err := h.updateHoldingFor(ctx, uid, request.Id, *request.Body)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.UpdateHolding404JSONResponse{}, nil
	}
	return api.UpdateHolding200JSONResponse(updated), nil
}

func (h *Handler) DeleteHolding(ctx context.Context, request api.DeleteHoldingRequestObject) (api.DeleteHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	deleted, err := h.deleteHoldingFor(ctx, uid, request.Id)
	if err != nil {
		return nil, err
	}
	if !deleted {
		return api.DeleteHolding404JSONResponse{}, nil
	}
	msg := "deleted"
	return api.DeleteHolding200JSONResponse{Message: &msg}, nil
}
