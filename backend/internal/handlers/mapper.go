package handlers

import (
	"context"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func validCurrency[T ~string](s T) bool { return s == "INR" || s == "EUR" }

// holdingFromInput maps a DTO (HoldingInput) to a DBO (domain.Holding).
// Currency defaults to INR; invalid values are rejected and fall back to INR.
func holdingFromInput(input api.HoldingInput) domain.Holding {
	h := domain.Holding{
		Script:   input.Script,
		Exchange: string(input.Exchange),
		Type:     string(input.Type),
		Currency: "INR",
	}
	if input.Symbol != nil {
		h.Symbol = *input.Symbol
	}
	if input.StocksOwned != nil {
		h.StocksOwned = *input.StocksOwned
	}
	if input.AvgCostPrice != nil {
		h.AvgCostPrice = *input.AvgCostPrice
	}
	if input.RealizedPnl != nil {
		h.RealizedPnL = *input.RealizedPnl
	}
	if input.Currency != nil && validCurrency(*input.Currency) {
		h.Currency = string(*input.Currency)
	}
	if input.Notes != nil {
		h.Notes = *input.Notes
	}
	return h
}

// holdingToAPI maps a DBO (domain.Holding) to a DTO (api.Holding).
// Empty currency is normalised to INR for legacy documents.
func holdingToAPI(h domain.Holding) api.Holding {
	id := h.ID.Hex()
	exchange := api.HoldingExchange(h.Exchange)
	holdingType := api.HoldingType(h.Type)
	currency := api.HoldingCurrency(h.Currency)
	if currency == "" {
		currency = api.HoldingCurrencyINR
	}
	return api.Holding{
		Id:           &id,
		Script:       &h.Script,
		Symbol:       &h.Symbol,
		Exchange:     &exchange,
		Type:         &holdingType,
		StocksOwned:  &h.StocksOwned,
		AvgCostPrice: &h.AvgCostPrice,
		RealizedPnl:  &h.RealizedPnL,
		Currency:     &currency,
		Notes:        &h.Notes,
		CreatedAt:    &h.CreatedAt,
		UpdatedAt:    &h.UpdatedAt,
	}
}

// holdingWithPriceToAPI enriches a DBO with live price data and maps to a DTO.
// All monetary values are normalised to INR; EUR equivalents are also populated.
// eurRate = 1 INR → X EUR, so 1 EUR = 1/eurRate INR.
func holdingWithPriceToAPI(ctx context.Context, hld domain.Holding, ps priceFetcher, eurRate float64) api.HoldingWithPrice {
	isEUR := hld.Currency == "EUR"
	currency := api.HoldingWithPriceCurrency(hld.Currency)
	if currency == "" {
		currency = api.HoldingWithPriceCurrency("INR")
	}

	var costPrice, costPriceEUR, realizedPnLEUR float64
	if isEUR {
		costPriceEUR = hld.StocksOwned * hld.AvgCostPrice
		costPrice = costPriceEUR / eurRate
		realizedPnLEUR = hld.RealizedPnL
	} else {
		costPrice = hld.StocksOwned * hld.AvgCostPrice
		costPriceEUR = costPrice * eurRate
		realizedPnLEUR = hld.RealizedPnL * eurRate
	}

	hwp := api.HoldingWithPrice{
		Id:             ptr(hld.ID.Hex()),
		Script:         &hld.Script,
		Symbol:         &hld.Symbol,
		Exchange:       (*api.HoldingWithPriceExchange)(&hld.Exchange),
		Type:           (*api.HoldingWithPriceType)(&hld.Type),
		StocksOwned:    &hld.StocksOwned,
		AvgCostPrice:   &hld.AvgCostPrice,
		RealizedPnl:    &hld.RealizedPnL,
		Currency:       &currency,
		Notes:          &hld.Notes,
		CreatedAt:      &hld.CreatedAt,
		UpdatedAt:      &hld.UpdatedAt,
		CostPrice:      &costPrice,
		CostPriceEur:   &costPriceEUR,
		RealizedPnlEur: &realizedPnLEUR,
	}

	if hld.Symbol != "" {
		price, _, priceErr := ps.GetPrice(ctx, hld.Symbol)
		if priceErr != nil {
			errMsg := priceErr.Error()
			hwp.PriceError = &errMsg
		} else {
			var currentValue, currentValueEUR, unrealizedPnL, unrealizedPnLEUR float64
			if isEUR {
				// Yahoo returns price in EUR for EUR-traded symbols (e.g. VWCE.DE)
				currentValueEUR = hld.StocksOwned * price
				currentValue = currentValueEUR / eurRate
				unrealizedPnLEUR = currentValueEUR - costPriceEUR
				unrealizedPnL = unrealizedPnLEUR / eurRate
			} else {
				currentValue = hld.StocksOwned * price
				unrealizedPnL = currentValue - costPrice
				currentValueEUR = currentValue * eurRate
				unrealizedPnLEUR = unrealizedPnL * eurRate
			}

			hwp.CurrentPrice = &price
			hwp.CurrentValue = &currentValue
			hwp.UnrealizedPnl = &unrealizedPnL
			hwp.CurrentValueEur = &currentValueEUR
			hwp.UnrealizedPnlEur = &unrealizedPnLEUR
		}
	}

	return hwp
}

func ptr[T any](v T) *T { return &v }
