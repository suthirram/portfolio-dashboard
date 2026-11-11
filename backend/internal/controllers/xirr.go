package controllers

import (
	"context"

	"portfolio-dashboard/api"
)

// GetStockXirr is the caller's own stock XIRR view (PRD-012).
func (h *Controller) GetStockXirr(ctx context.Context, _ api.GetStockXirrRequestObject) (api.GetStockXirrResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	view, err := h.stockXirr.View(ctx, currentUserId)
	if err != nil {
		return nil, err
	}
	return api.GetStockXirr200JSONResponse(view), nil
}

// AdminGetUserStockXirr is the act-as view of a target user's stock XIRR;
// region scope is enforced by loadTargetUser like every act-as read.
func (h *Controller) AdminGetUserStockXirr(ctx context.Context, request api.AdminGetUserStockXirrRequestObject) (api.AdminGetUserStockXirrResponseObject, error) {
	caller, err := adminCaller(ctx)
	if err != nil {
		return nil, err
	}
	target, found, err := h.loadTargetUser(ctx, caller, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.AdminGetUserStockXirr404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
	}
	view, err := h.stockXirr.View(ctx, target.ID)
	if err != nil {
		return nil, err
	}
	return api.AdminGetUserStockXirr200JSONResponse(view), nil
}
