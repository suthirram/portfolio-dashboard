package handlers

import (
	"context"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func (h *Handler) GetSummary(ctx context.Context, _ api.GetSummaryRequestObject) (api.GetSummaryResponseObject, error) {
	dbCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	cur, err := h.col().Find(dbCtx, bson.M{})
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(dbCtx) }()

	var holdings []domain.Holding
	if err := cur.All(dbCtx, &holdings); err != nil {
		return nil, err
	}

	eurRate, err := h.priceService.GetForexRate(ctx, "INR", "EUR")
	if err != nil || eurRate == 0 {
		h.reqLog(ctx).WarnContext(ctx, "EUR rate unavailable, using fallback",
			slog.Float64("fallback", 0.011),
		)
		eurRate = 0.011
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
			if price, _, err := h.priceService.GetPrice(ctx, hld.Symbol); err == nil {
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

	return api.GetSummary200JSONResponse{
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
