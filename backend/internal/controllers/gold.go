package controllers

import (
	"context"
	"errors"

	"github.com/samber/lo"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/services"
)

// goldUnavailable is the 503 body served on every gold route while Postgres
// is not configured (DD-003 §1): the flag gate has already passed, so the
// caller is allowed to know the feature exists but is down.
func goldUnavailable() api.GoldUnavailableJSONResponse {
	return api.GoldUnavailableJSONResponse{Error: lo.ToPtr("gold storage unavailable")}
}

// goldCaller resolves the calling user's id in the string form the gold
// store keys on (Mongo ObjectID hex — the two engines share one identity
// space, DD-003 §1).
func (h *Controller) goldCaller(ctx context.Context) (string, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return "", err
	}
	return uid.Hex(), nil
}

func (h *Controller) ListGoldTransactions(ctx context.Context, _ api.ListGoldTransactionsRequestObject) (api.ListGoldTransactionsResponseObject, error) {
	if h.gold == nil {
		return api.ListGoldTransactions503JSONResponse{GoldUnavailableJSONResponse: goldUnavailable()}, nil
	}
	uid, err := h.goldCaller(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := h.gold.ListTransactions(ctx, uid)
	if err != nil {
		h.reqLog(ctx).Error("gold list failed", zap.String("error", err.Error()))
		return nil, err
	}
	return api.ListGoldTransactions200JSONResponse(rows), nil
}

func (h *Controller) CreateGoldTransaction(ctx context.Context, request api.CreateGoldTransactionRequestObject) (api.CreateGoldTransactionResponseObject, error) {
	if h.gold == nil {
		return api.CreateGoldTransaction503JSONResponse{GoldUnavailableJSONResponse: goldUnavailable()}, nil
	}
	uid, err := h.goldCaller(ctx)
	if err != nil {
		return nil, err
	}
	created, err := h.gold.CreateTransaction(ctx, uid, *request.Body)
	if err != nil {
		if errors.Is(err, services.ErrInvalidGoldTransaction) {
			return api.CreateGoldTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr(err.Error())}}, nil
		}
		h.reqLog(ctx).Error("gold create failed", zap.String("error", err.Error()))
		return nil, err
	}
	return api.CreateGoldTransaction201JSONResponse(created), nil
}

func (h *Controller) UpdateGoldTransaction(ctx context.Context, request api.UpdateGoldTransactionRequestObject) (api.UpdateGoldTransactionResponseObject, error) {
	if h.gold == nil {
		return api.UpdateGoldTransaction503JSONResponse{GoldUnavailableJSONResponse: goldUnavailable()}, nil
	}
	uid, err := h.goldCaller(ctx)
	if err != nil {
		return nil, err
	}
	updated, found, err := h.gold.UpdateTransaction(ctx, uid, request.Id, *request.Body)
	if err != nil {
		if errors.Is(err, services.ErrInvalidGoldTransaction) {
			return api.UpdateGoldTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr(err.Error())}}, nil
		}
		h.reqLog(ctx).Error("gold update failed", zap.String("error", err.Error()))
		return nil, err
	}
	if !found {
		return api.UpdateGoldTransaction404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: lo.ToPtr("no such gold transaction")}}, nil
	}
	return api.UpdateGoldTransaction200JSONResponse(updated), nil
}

func (h *Controller) DeleteGoldTransaction(ctx context.Context, request api.DeleteGoldTransactionRequestObject) (api.DeleteGoldTransactionResponseObject, error) {
	if h.gold == nil {
		return api.DeleteGoldTransaction503JSONResponse{GoldUnavailableJSONResponse: goldUnavailable()}, nil
	}
	uid, err := h.goldCaller(ctx)
	if err != nil {
		return nil, err
	}
	found, err := h.gold.DeleteTransaction(ctx, uid, request.Id)
	if err != nil {
		h.reqLog(ctx).Error("gold delete failed", zap.String("error", err.Error()))
		return nil, err
	}
	if !found {
		return api.DeleteGoldTransaction404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: lo.ToPtr("no such gold transaction")}}, nil
	}
	return api.DeleteGoldTransaction204Response{}, nil
}
