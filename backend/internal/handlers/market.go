package handlers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
)

// pricesFor enriches the holdings owned by uid with live market data.
// Shared by GetPrices and the admin act-as prices endpoint.
func (h *Handler) pricesFor(ctx context.Context, uid primitive.ObjectID) ([]api.HoldingWithPrice, float64, error) {
	holdings, err := h.store.Holdings.ListByUser(ctx, uid)
	if err != nil {
		return nil, 0, err
	}

	eurRate, err := h.priceService.GetForexRate(ctx, "INR", "EUR")
	if err != nil || eurRate == 0 {
		if err == nil {
			err = errors.New("EUR rate is zero")
		}
		h.reqLog(ctx).ErrorContext(ctx, "EUR rate fetch failed", slog.String("error", err.Error()))
		return nil, 0, fmt.Errorf("fetching EUR rate: %w", err)
	}

	results := make([]api.HoldingWithPrice, 0, len(holdings))
	for _, hld := range holdings {
		results = append(results, holdingWithPriceToAPI(ctx, hld, h.priceService, eurRate))
	}
	return results, eurRate, nil
}

func (h *Handler) GetPrices(ctx context.Context, _ api.GetPricesRequestObject) (api.GetPricesResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	results, eurRate, err := h.pricesFor(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.GetPrices200JSONResponse{Holdings: &results, EurRate: &eurRate}, nil
}

func (h *Handler) GetMarketPrice(ctx context.Context, request api.GetMarketPriceRequestObject) (api.GetMarketPriceResponseObject, error) {
	symbol := request.Params.Symbol
	price, currency, err := h.priceService.GetPrice(ctx, symbol)
	if err != nil {
		errMsg := err.Error()
		return api.GetMarketPrice502JSONResponse{BadGatewayJSONResponse: api.BadGatewayJSONResponse{Error: &errMsg}}, nil
	}
	return api.GetMarketPrice200JSONResponse{Symbol: &symbol, Price: &price, Currency: &currency}, nil
}

func (h *Handler) GetForexRate(ctx context.Context, request api.GetForexRateRequestObject) (api.GetForexRateResponseObject, error) {
	from := "INR"
	to := "EUR"
	if request.Params.From != nil {
		from = *request.Params.From
	}
	if request.Params.To != nil {
		to = *request.Params.To
	}

	rate, err := h.priceService.GetForexRate(ctx, from, to)
	if err != nil {
		errMsg := err.Error()
		return nil, &forexError{errMsg}
	}
	return api.GetForexRate200JSONResponse{From: &from, To: &to, Rate: &rate}, nil
}

// forexError surfaces a 502 for upstream failures on the forex endpoint.
// The spec doesn't define a 502 for GetForexRate, so we use a plain error
// which becomes a 500 via the strict handler's ResponseErrorHandlerFunc.
type forexError struct{ msg string }

func (e *forexError) Error() string { return e.msg }
