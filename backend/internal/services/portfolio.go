package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// fallbackEURRate keeps Summary working when the live forex fetch fails.
// It's only used for the summary aggregate, where a missing rate would
// drop EUR-side totals entirely; the live /prices endpoint instead surfaces
// the fetch error.
const fallbackEURRate = 0.011

// PortfolioService composes holdings + live prices + the INR↔EUR rate. It
// powers /prices (per-holding enrichment) and /summary (portfolio totals),
// for both the caller's own portfolio and admin act-as views.
type PortfolioService struct {
	store        *persistence.HoldingStore
	priceService PriceFetcher
	logger       *slog.Logger
}

// NewPortfolioService wires a PortfolioService.
func NewPortfolioService(store *persistence.HoldingStore, priceService PriceFetcher, logger *slog.Logger) *PortfolioService {
	return &PortfolioService{store: store, priceService: priceService, logger: logger}
}

func (s *PortfolioService) log(ctx context.Context) *slog.Logger {
	if l, ok := logging.FromContext(ctx); ok {
		return l
	}
	if s.logger != nil {
		return s.logger
	}
	return slog.New(slog.DiscardHandler)
}

// Prices returns the holdings owned by uid enriched with live market data,
// plus the live INR→EUR rate. Errors fetching the EUR rate fail the call;
// per-symbol price failures are surfaced inline on each HoldingWithPrice.
func (s *PortfolioService) Prices(ctx context.Context, uid primitive.ObjectID) ([]api.HoldingWithPrice, float64, error) {
	holdings, err := s.store.ListByUser(ctx, uid)
	if err != nil {
		return nil, 0, err
	}

	eurRate, err := s.priceService.GetForexRate(ctx, "INR", "EUR")
	if err != nil || eurRate == 0 {
		if err == nil {
			err = errors.New("EUR rate is zero")
		}
		s.log(ctx).ErrorContext(ctx, "EUR rate fetch failed", slog.String("error", err.Error()))
		return nil, 0, fmt.Errorf("fetching EUR rate: %w", err)
	}

	results := make([]api.HoldingWithPrice, 0, len(holdings))
	for _, hld := range holdings {
		results = append(results, HoldingWithPriceToAPI(ctx, hld, s.priceService, eurRate))
	}
	return results, eurRate, nil
}

// Summary aggregates the portfolio of uid into total cost / current value /
// realized / unrealized, with EUR equivalents. When the EUR rate is
// unavailable Summary uses a fixed fallback so the totals stay computable.
func (s *PortfolioService) Summary(ctx context.Context, uid primitive.ObjectID) (api.Summary, error) {
	holdings, err := s.store.ListByUser(ctx, uid)
	if err != nil {
		return api.Summary{}, err
	}

	eurRate, err := s.priceService.GetForexRate(ctx, "INR", "EUR")
	if err != nil || eurRate == 0 {
		s.log(ctx).WarnContext(ctx, "EUR rate unavailable, using fallback",
			slog.Float64("fallback", fallbackEURRate))
		eurRate = fallbackEURRate
	}

	var totalCost, totalCurrentValue, totalUnrealized, totalRealized float64
	for _, hld := range holdings {
		isEUR := hld.Currency == "EUR"

		var cost, realized float64
		if isEUR {
			cost = (hld.StocksOwned * hld.AvgCostPrice) / eurRate
			realized = hld.RealizedPnL / eurRate
		} else {
			cost = hld.StocksOwned * hld.AvgCostPrice
			realized = hld.RealizedPnL
		}
		totalCost += cost
		totalRealized += realized

		if hld.Symbol != "" && hld.StocksOwned > 0 {
			if price, _, pErr := s.priceService.GetPrice(ctx, hld.Symbol); pErr == nil {
				var cv float64
				if isEUR {
					cv = (hld.StocksOwned * price) / eurRate
				} else {
					cv = hld.StocksOwned * price
				}
				totalCurrentValue += cv
				totalUnrealized += cv - cost
			}
		}
	}

	totalCostEUR := totalCost * eurRate
	totalCurrentValueEUR := totalCurrentValue * eurRate
	totalUnrealizedEUR := totalUnrealized * eurRate
	totalRealizedEUR := totalRealized * eurRate

	return api.Summary{
		TotalCost:            &totalCost,
		TotalCurrentValue:    &totalCurrentValue,
		TotalUnrealized:      &totalUnrealized,
		TotalRealized:        &totalRealized,
		TotalCostEur:         &totalCostEUR,
		TotalCurrentValueEur: &totalCurrentValueEUR,
		TotalUnrealizedEur:   &totalUnrealizedEUR,
		TotalRealizedEur:     &totalRealizedEUR,
		EurRate:              &eurRate,
	}, nil
}
