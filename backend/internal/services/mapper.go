package services

import (
	"context"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/samber/lo"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// openingStatus reports a holding's opening-date status for the API: whether an
// opening event seeds it, and the user-set opening date (nil until the user sets
// it). Drives the dashboard's opening-date prompt.
func openingStatus(openings map[primitive.ObjectID]domain.Transaction, holdingID primitive.ObjectID) (hasOpening *bool, openingDate *openapi_types.Date) {
	opening, ok := openings[holdingID]
	hasOpening = &ok
	if ok && opening.OpeningDate != nil {
		openingDate = &openapi_types.Date{Time: *opening.OpeningDate}
	}
	return hasOpening, openingDate
}

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
		Id:             &id,
		Script:         &h.Script,
		Symbol:         &h.Symbol,
		Exchange:       &exchange,
		Type:           &holdingType,
		StocksOwned:    &h.StocksOwned,
		AvgCostPrice:   &h.AvgCostPrice,
		RealizedPnl:    &h.RealizedPnL,
		TotalDividends: &h.TotalDividends,
		Currency:       &currency,
		Notes:          &h.Notes,
		CreatedAt:      &h.CreatedAt,
		UpdatedAt:      &h.UpdatedAt,
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
	// Round monetary table values to two decimals at the response boundary.
	costPrice = round(costPrice)
	costPriceEUR = round(costPriceEUR)
	realizedPnLEUR = round(realizedPnLEUR)

	hwp := api.HoldingWithPrice{
		Id:             lo.ToPtr(hld.ID.Hex()),
		Script:         &hld.Script,
		Symbol:         &hld.Symbol,
		Exchange:       (*api.HoldingWithPriceExchange)(&hld.Exchange),
		Type:           (*api.HoldingWithPriceType)(&hld.Type),
		StocksOwned:    &hld.StocksOwned,
		AvgCostPrice:   &hld.AvgCostPrice,
		RealizedPnl:    &hld.RealizedPnL,
		TotalDividends: &hld.TotalDividends,
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
			// A failed/delisted price (Yahoo 404) is treated as a market
			// price of 0: current value 0, full cost as unrealized loss.
			// The error is still surfaced so the UI can flag the row, but
			// the numbers match the cron snapshot and summary totals.
			errMsg := priceErr.Error()
			hwp.PriceError = &errMsg
			price = 0
		}
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

		currentValue = round(currentValue)
		currentValueEUR = round(currentValueEUR)
		unrealizedPnL = round(unrealizedPnL)
		unrealizedPnLEUR = round(unrealizedPnLEUR)

		hwp.CurrentPrice = &price
		hwp.CurrentValue = &currentValue
		hwp.UnrealizedPnl = &unrealizedPnL
		hwp.CurrentValueEur = &currentValueEUR
		hwp.UnrealizedPnlEur = &unrealizedPnLEUR
	}

	return hwp
}

// TransactionFromInput maps a DTO (TransactionInput) to a DBO. UserID,
// HoldingID, Currency, ID and timestamps are set by the service.
func TransactionFromInput(input api.TransactionInput) domain.Transaction {
	t := domain.Transaction{
		Type: domain.TxnType(input.Type),
		Date: input.Date,
	}
	if input.Quantity != nil {
		t.Quantity = *input.Quantity
	}
	if input.Amount != nil {
		t.Amount = *input.Amount
	}
	if input.Ratio != nil {
		t.Ratio = *input.Ratio
	}
	if input.RealizedSeed != nil {
		t.RealizedSeed = *input.RealizedSeed
	}
	if input.Notes != nil {
		t.Notes = *input.Notes
	}
	return t
}

// TransactionToAPI maps a DBO (domain.Transaction) to a DTO (api.Transaction).
func TransactionToAPI(t domain.Transaction) api.Transaction {
	id := t.ID.Hex()
	holdingID := t.HoldingID.Hex()
	typ := api.TransactionType(t.Type)
	currency := api.TransactionCurrency(t.Currency)
	date := t.Date
	return api.Transaction{
		Id:           &id,
		HoldingId:    &holdingID,
		Type:         &typ,
		Date:         &date,
		Quantity:     &t.Quantity,
		Amount:       &t.Amount,
		Ratio:        &t.Ratio,
		RealizedSeed: &t.RealizedSeed,
		Currency:     &currency,
		Notes:        &t.Notes,
		CreatedAt:    &t.CreatedAt,
		UpdatedAt:    &t.UpdatedAt,
	}
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
		GoldEnabled:        u.GoldEnabled,
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
