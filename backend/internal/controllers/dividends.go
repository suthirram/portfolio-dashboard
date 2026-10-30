package controllers

import (
	"context"
	"errors"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/services"
)

func (h *Controller) ListDividends(ctx context.Context, request api.ListDividendsRequestObject) (api.ListDividendsResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	view, err := h.dividends.List(ctx, currentUserId, string(request.Params.Currency))
	if err != nil {
		if errors.Is(err, services.ErrValidation) {
			return api.ListDividends400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
		}
		return nil, err
	}
	return api.ListDividends200JSONResponse(view), nil
}

// AdminListUserDividends is the act-as view of a target user's dividend tab.
func (h *Controller) AdminListUserDividends(ctx context.Context, request api.AdminListUserDividendsRequestObject) (api.AdminListUserDividendsResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminListUserDividends404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	view, err := h.dividends.List(ctx, target.ID, string(request.Params.Currency))
	if err != nil {
		if errors.Is(err, services.ErrValidation) {
			return api.AdminListUserDividends400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
		}
		return nil, err
	}
	return api.AdminListUserDividends200JSONResponse(view), nil
}

func (h *Controller) PreviewDividendImport(ctx context.Context, request api.PreviewDividendImportRequestObject) (api.PreviewDividendImportResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	preview, err := h.dividends.Preview(ctx, currentUserId, *request.Body)
	if err != nil {
		if errors.Is(err, services.ErrValidation) {
			return api.PreviewDividendImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
		}
		return nil, err
	}
	return api.PreviewDividendImport200JSONResponse(preview), nil
}

func (h *Controller) AdminPreviewUserDividendImport(ctx context.Context, request api.AdminPreviewUserDividendImportRequestObject) (api.AdminPreviewUserDividendImportResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminPreviewUserDividendImport404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	preview, err := h.dividends.Preview(ctx, target.ID, *request.Body)
	if err != nil {
		if errors.Is(err, services.ErrValidation) {
			return api.AdminPreviewUserDividendImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
		}
		return nil, err
	}
	return api.AdminPreviewUserDividendImport200JSONResponse(preview), nil
}
