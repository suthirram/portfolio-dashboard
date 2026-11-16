package controllers

import (
	"context"
	"errors"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/services"
)

func (h *Controller) GetPrices(ctx context.Context, _ api.GetPricesRequestObject) (api.GetPricesResponseObject, error) {
	uid, err := currentUserID(ctx)
	if err != nil {
		return nil, err
	}
	results, eurRate, err := h.portfolio.Prices(ctx, uid)
	if err != nil {
		return nil, err
	}
	return api.GetPrices200JSONResponse{Holdings: &results, EurRate: &eurRate}, nil
}

func (h *Controller) GetMarketPrice(ctx context.Context, request api.GetMarketPriceRequestObject) (api.GetMarketPriceResponseObject, error) {
	symbol := request.Params.Symbol
	price, currency, err := h.priceService.GetPrice(ctx, symbol)
	if err != nil {
		errMsg := err.Error()
		return api.GetMarketPrice502JSONResponse{BadGatewayJSONResponse: api.BadGatewayJSONResponse{Error: &errMsg}}, nil
	}
	return api.GetMarketPrice200JSONResponse{Symbol: &symbol, Price: &price, Currency: &currency}, nil
}

// GetMarketProfile answers 200 even when Yahoo is unavailable (the status says
// so), keeping manual classification possible; only a bad symbol is a 400.
func (h *Controller) GetMarketProfile(ctx context.Context, request api.GetMarketProfileRequestObject) (api.GetMarketProfileResponseObject, error) {
	profile, err := h.profiles.LookupProfile(ctx, request.Params.Symbol)
	if errors.Is(err, services.ErrInvalidSymbol) {
		errMsg := "symbol must be 1–64 letters, digits or . - ^ = _"
		return api.GetMarketProfile400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: &errMsg}}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetMarketProfile200JSONResponse(services.ProfileToAPI(profile)), nil
}

func (h *Controller) GetForexRate(ctx context.Context, request api.GetForexRateRequestObject) (api.GetForexRateResponseObject, error) {
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
