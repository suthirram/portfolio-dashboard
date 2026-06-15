package services

import (
	"context"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// PriceFetcher abstracts PriceService. Services and mappers depend on it
// rather than the concrete type so tests can substitute a stub.
type PriceFetcher interface {
	GetPrice(ctx context.Context, symbol string) (float64, string, error)
	GetForexRate(ctx context.Context, from, to string) (float64, error)
}

// ValidCurrency reports whether s is one of the supported currency codes.
func ValidCurrency[T ~string](s T) bool { return s == "INR" || s == "EUR" }

// HoldingFromInput maps a DTO (HoldingInput) to a DBO (domain.Holding).
// Currency defaults to INR; invalid values are rejected and fall back to INR.
func HoldingFromInput(input api.HoldingInput) domain.Holding {
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
	if input.Currency != nil && ValidCurrency(*input.Currency) {
		h.Currency = string(*input.Currency)
	}
	if input.Notes != nil {
		h.Notes = *input.Notes
	}
	return h
}

// HoldingToAPI maps a DBO (domain.Holding) to a DTO (api.Holding).
// Empty currency is normalised to INR for legacy documents.
func HoldingToAPI(h domain.Holding) api.Holding {
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

// HoldingWithPriceToAPI enriches a DBO with live price data and maps to a DTO.
// All monetary values are normalised to INR; EUR equivalents are also populated.
// eurRate = 1 INR → X EUR, so 1 EUR = 1/eurRate INR.
func HoldingWithPriceToAPI(ctx context.Context, hld domain.Holding, ps PriceFetcher, eurRate float64) api.HoldingWithPrice {
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
		Id:             Ptr(hld.ID.Hex()),
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

// UserToAPI maps a user DBO to the public DTO. Question ids are included
// only for the account itself (profile screen), not in admin listings.
func UserToAPI(u *domain.User, includeQuestionIDs bool) api.User {
	out := api.User{
		Id:                 u.ID.Hex(),
		Username:           u.UsernameDisplay,
		Name:               u.Name,
		Role:               api.UserRole(u.Role),
		Region:             u.Region,
		Disabled:           u.Disabled,
		Locked:             u.Locked,
		MustChangePassword: u.MustChangePassword,
	}
	if out.Username == "" {
		out.Username = u.Username
	}
	if !u.CreatedAt.IsZero() {
		out.CreatedAt = &u.CreatedAt
	}
	out.LastLoginAt = u.LastLoginAt
	if includeQuestionIDs {
		ids := make([]string, 0, len(u.SecurityQuestions))
		for _, q := range u.SecurityQuestions {
			ids = append(ids, q.QuestionID)
		}
		out.SecurityQuestionIds = &ids
	}
	return out
}

// Ptr returns &v. Convenience for nullable api fields.
func Ptr[T any](v T) *T { return &v }

// ErrPtr returns &msg. Convenience for the api.Error.Error field.
func ErrPtr(msg string) *string { return &msg }
