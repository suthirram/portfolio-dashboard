package controllers

import (
	"context"
	"errors"

	"github.com/samber/lo"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/services"
)

// badTransaction reports whether err is a client-side ledger error (invalid
// input or an oversell) that should surface as 400 rather than 500.
func badTransaction(err error) bool {
	return errors.Is(err, services.ErrValidation) || errors.Is(err, services.ErrOversell)
}

func (h *Controller) ListTransactions(ctx context.Context, request api.ListTransactionsRequestObject) (api.ListTransactionsResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	txns, found, err := h.transactions.List(ctx, uid, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.ListTransactions404JSONResponse{}, nil
	}
	return api.ListTransactions200JSONResponse(txns), nil
}

func (h *Controller) CreateTransaction(ctx context.Context, request api.CreateTransactionRequestObject) (api.CreateTransactionResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	created, found, err := h.transactions.Create(ctx, uid, request.Id, *request.Body)
	if err != nil {
		if badTransaction(err) {
			return api.CreateTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr(err.Error())}}, nil
		}
		return nil, err
	}
	if !found {
		return api.CreateTransaction404JSONResponse{}, nil
	}
	return api.CreateTransaction201JSONResponse(created), nil
}

func (h *Controller) UpdateTransaction(ctx context.Context, request api.UpdateTransactionRequestObject) (api.UpdateTransactionResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	updated, found, err := h.transactions.Update(ctx, uid, request.Id, *request.Body)
	if err != nil {
		if badTransaction(err) {
			return api.UpdateTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr(err.Error())}}, nil
		}
		return nil, err
	}
	if !found {
		return api.UpdateTransaction404JSONResponse{}, nil
	}
	return api.UpdateTransaction200JSONResponse(updated), nil
}

func (h *Controller) DeleteTransaction(ctx context.Context, request api.DeleteTransactionRequestObject) (api.DeleteTransactionResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	deleted, err := h.transactions.Delete(ctx, uid, request.Id)
	if err != nil {
		if badTransaction(err) {
			return api.DeleteTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: lo.ToPtr(err.Error())}}, nil
		}
		return nil, err
	}
	if !deleted {
		return api.DeleteTransaction404JSONResponse{}, nil
	}
	msg := "deleted"
	return api.DeleteTransaction200JSONResponse{Message: &msg}, nil
}
