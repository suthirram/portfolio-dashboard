package controllers

import (
	"context"

	"portfolio-dashboard/api"
)

func (h *Controller) GetSummary(ctx context.Context, _ api.GetSummaryRequestObject) (api.GetSummaryResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	summary, err := h.portfolio.Summary(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.GetSummary200JSONResponse(summary), nil
}
