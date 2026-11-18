package services

import (
	"context"
	"fmt"

	"portfolio-dashboard/internal/domain"
)

// holdingQuote fetches a holding's live quote in the holding's own currency,
// so shares × price lands in the same units as its average cost. Yahoo
// quotes a US listing in USD; a EUR holding of it is converted USD → EUR at
// the live rate. Every other pairing is returned as quoted. A failed rate
// fails the quote, so the holding is flagged and valued at 0 like any other
// price failure instead of mixing currencies.
func holdingQuote(ctx context.Context, fetcher PriceFetcher, holding domain.Holding) (Quote, error) {
	quote, err := fetcher.GetQuote(ctx, holding.Symbol)
	if err != nil {
		return quote, err
	}
	if quote.Currency != domain.CurrencyUSD || holding.Currency != domain.CurrencyEUR {
		return quote, nil
	}
	usdToEur, err := fetcher.GetForexRate(ctx, domain.CurrencyUSD, domain.CurrencyEUR)
	if err != nil {
		return Quote{}, fmt.Errorf("converting %s USD → EUR: %w", holding.Symbol, err)
	}
	if usdToEur <= 0 {
		return Quote{}, fmt.Errorf("converting %s USD → EUR: rate is %v", holding.Symbol, usdToEur)
	}
	converted := Quote{Price: quote.Price * usdToEur, Currency: domain.CurrencyEUR}
	if quote.PreviousClosePrice != nil {
		previousClose := *quote.PreviousClosePrice * usdToEur
		converted.PreviousClosePrice = &previousClose
	}
	return converted, nil
}
