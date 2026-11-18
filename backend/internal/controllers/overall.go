package controllers

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/services"
)

// GetOverallHistory serves the Overview chart (PD-059): the caller's daily
// overall documents plus the gold side. When gold cannot be read for a
// gold-enabled caller the response is flagged and carries no amounts, so a
// stock-only figure never passes as the overall total.
func (h *Controller) GetOverallHistory(ctx context.Context, request api.GetOverallHistoryRequestObject) (api.GetOverallHistoryResponseObject, error) {
	currentUserId, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	days, err := h.overall.Days(ctx, currentUserId, request.Params.From.Time, request.Params.To.Time)
	if errors.Is(err, services.ErrInvalidDate) {
		return api.GetOverallHistory400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new("to before from")}}, nil
	}
	if err != nil {
		return nil, err
	}
	gold := h.overallGold(ctx, currentUserId, days)
	points := services.OverallPoints(days, gold)
	out := api.OverallHistory{Points: make([]api.OverallPoint, 0, len(points)), GoldUnavailable: gold.Unavailable}
	for _, point := range points {
		out.Points = append(out.Points, api.OverallPoint{
			Date: mustParseAPIDate(point.Date), InvestedInr: point.InvestedInr, CurrentInr: point.CurrentInr,
			InvestedEur: point.InvestedEur, CurrentEur: point.CurrentEur, EurInr: point.EurInr,
			FxCarried: point.FxCarried, MissingRate: point.MissingRate, GoldUnvalued: point.GoldUnvalued,
		})
	}
	return api.GetOverallHistory200JSONResponse(out), nil
}

// overallGold reads the gold side for the days: the overlay History uses
// plus whether gold was held each day (to tell "no price yet" from "no gold
// yet"). Unavailable is set for a gold-enabled caller whenever gold cannot
// be read — Postgres not configured or a read error — so no total appears
// without its gold.
func (h *Controller) overallGold(ctx context.Context, userId primitive.ObjectID, days []domain.OverallDay) services.OverallGold {
	caller, ok := auth.UserFromContext(ctx)
	if !ok || !caller.GoldEnabled || len(days) == 0 {
		return services.OverallGold{}
	}
	unavailable := services.OverallGold{Unavailable: true}
	if h.gold == nil {
		return unavailable
	}
	dates := make([]string, 0, len(days))
	times := make([]time.Time, 0, len(days))
	for _, day := range days {
		dates = append(dates, day.Date.UTC().Format("2006-01-02"))
		times = append(times, day.Date)
	}
	logger := h.reqLog(ctx)
	overlay, err := h.gold.HistoryOverlay(ctx, userId.Hex(), dates)
	if err != nil {
		logger.Warn("overall gold overlay failed", zap.Error(err))
		return unavailable
	}
	heldPerDay, err := h.gold.HeldOn(ctx, userId.Hex(), times)
	if err != nil {
		logger.Warn("overall gold holdings read failed", zap.Error(err))
		return unavailable
	}
	held := make(map[string]bool, len(dates))
	for i, date := range dates {
		held[date] = heldPerDay[i]
	}
	return services.OverallGold{Overlay: overlay, Held: held}
}
