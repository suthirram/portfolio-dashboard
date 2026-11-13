package controllers

import (
	"context"
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/services"
)

// errNotLoggedIn is a defence-in-depth guard: requireAuth middleware should
// reject unauthenticated requests before any controller runs.
var errNotLoggedIn = echo.NewHTTPError(http.StatusUnauthorized, "not logged in")

// currentUserID resolves the caller's user id from the request context.
func currentUserID(ctx context.Context) (primitive.ObjectID, error) {
	if u, ok := auth.UserFromContext(ctx); ok {
		return u.ID, nil
	}
	return primitive.NilObjectID, errNotLoggedIn
}

func (h *Controller) ListHoldings(ctx context.Context, _ api.ListHoldingsRequestObject) (api.ListHoldingsResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	holdings, err := h.holdings.List(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.ListHoldings200JSONResponse(holdings), nil
}

func (h *Controller) GetHolding(ctx context.Context, request api.GetHoldingRequestObject) (api.GetHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	holding, found, err := h.holdings.Get(ctx, uid, request.Id)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.GetHolding404JSONResponse{}, nil
	}
	return api.GetHolding200JSONResponse(holding), nil
}

func (h *Controller) CreateHolding(ctx context.Context, request api.CreateHoldingRequestObject) (api.CreateHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	created, err := h.holdings.Create(ctx, uid, *request.Body)
	if err != nil {
		return nil, err
	}
	return api.CreateHolding201JSONResponse(created), nil
}

func (h *Controller) UpdateHolding(ctx context.Context, request api.UpdateHoldingRequestObject) (api.UpdateHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	updated, found, err := h.holdings.Update(ctx, uid, request.Id, *request.Body)
	if err != nil {
		return nil, err
	}
	if !found {
		return api.UpdateHolding404JSONResponse{}, nil
	}
	return api.UpdateHolding200JSONResponse(updated), nil
}

func (h *Controller) ConfirmHoldingClassification(ctx context.Context, request api.ConfirmHoldingClassificationRequestObject) (api.ConfirmHoldingClassificationResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	confirmed, found, err := h.holdings.ConfirmClassification(ctx, currentUserId, request.Id, string(request.Body.Type), request.Body.Sector)
	switch {
	case errors.Is(err, services.ErrInvalidClassification):
		return api.ConfirmHoldingClassification400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
	case errors.Is(err, services.ErrClassificationConflict):
		return api.ConfirmHoldingClassification409JSONResponse{Error: new(err.Error())}, nil
	case err != nil:
		return nil, err
	case !found:
		return api.ConfirmHoldingClassification404JSONResponse{NotFoundJSONResponse: api.NotFoundJSONResponse{Error: new("no such holding")}}, nil
	}
	return api.ConfirmHoldingClassification200JSONResponse(confirmed), nil
}

func (h *Controller) DeleteHolding(ctx context.Context, request api.DeleteHoldingRequestObject) (api.DeleteHoldingResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	deleted, err := h.holdings.Delete(ctx, uid, request.Id)
	if err != nil {
		return nil, err
	}
	if !deleted {
		return api.DeleteHolding404JSONResponse{}, nil
	}
	msg := "deleted"
	return api.DeleteHolding200JSONResponse{Message: &msg}, nil
}
