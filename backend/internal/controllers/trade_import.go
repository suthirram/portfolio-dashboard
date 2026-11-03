package controllers

import (
	"context"
	"errors"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/services"
)

// Trades CSV import (PRD-008): own portfolio and admin act-as, mirroring the
// dividend import's handlers. A commit-time oversell is a 400 like ErrValidation.

func (h *Controller) PreviewTradeImport(ctx context.Context, request api.PreviewTradeImportRequestObject) (api.PreviewTradeImportResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	preview, err := h.tradeImport.Preview(ctx, currentUserId, *request.Body)
	if err != nil {
		if errors.Is(err, services.ErrValidation) {
			return api.PreviewTradeImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
		}
		return nil, err
	}
	return api.PreviewTradeImport200JSONResponse(preview), nil
}

func (h *Controller) AdminPreviewUserTradeImport(ctx context.Context, request api.AdminPreviewUserTradeImportRequestObject) (api.AdminPreviewUserTradeImportResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminPreviewUserTradeImport404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	preview, err := h.tradeImport.Preview(ctx, target.ID, *request.Body)
	if err != nil {
		if errors.Is(err, services.ErrValidation) {
			return api.AdminPreviewUserTradeImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
		}
		return nil, err
	}
	return api.AdminPreviewUserTradeImport200JSONResponse(preview), nil
}

func (h *Controller) ImportTrades(ctx context.Context, request api.ImportTradesRequestObject) (api.ImportTradesResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	result, err := h.tradeImport.Import(ctx, currentUserId, *request.Body)
	var invalid *services.TradeImportInvalidError
	switch {
	case errors.As(err, &invalid):
		return api.ImportTrades422JSONResponse(invalid.Preview), nil
	case badTransaction(err):
		return api.ImportTrades400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
	case err != nil:
		return nil, err
	}
	return api.ImportTrades200JSONResponse(result), nil
}

func (h *Controller) AdminImportUserTrades(ctx context.Context, request api.AdminImportUserTradesRequestObject) (api.AdminImportUserTradesResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminImportUserTrades404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	result, err := h.tradeImport.Import(ctx, target.ID, *request.Body)
	var invalid *services.TradeImportInvalidError
	switch {
	case errors.As(err, &invalid):
		return api.AdminImportUserTrades422JSONResponse(invalid.Preview), nil
	case badTransaction(err):
		return api.AdminImportUserTrades400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
	case err != nil:
		return nil, err
	}
	return api.AdminImportUserTrades200JSONResponse(result), nil
}
