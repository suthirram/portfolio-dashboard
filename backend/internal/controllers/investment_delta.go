package controllers

import (
	"context"
	"errors"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/services"
)

// GetInvestmentDelta serves the Transactions page's investment delta from
// the ledger (PD-052). GOLD is included only for gold-enabled callers while
// the gold store is attached, as on History.
func (h *Controller) GetInvestmentDelta(ctx context.Context, request api.GetInvestmentDeltaRequestObject) (api.GetInvestmentDeltaResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	var gold services.GoldInvested
	if caller, ok := auth.UserFromContext(ctx); ok && caller.GoldEnabled && h.gold != nil {
		gold = h.gold
	}
	delta, err := h.transactions.InvestmentDelta(ctx, currentUserId, request.Params.Year, gold)
	if errors.Is(err, services.ErrValidation) {
		return api.GetInvestmentDelta400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetInvestmentDelta200JSONResponse(delta), nil
}
