package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
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
	snapshots    *persistence.SnapshotStore
	priceService PriceFetcher
	logger       *zap.Logger
	// Now lets tests pin "today" for the previous-close lookup.
	Now func() time.Time
}

// NewPortfolioService wires a PortfolioService.
func NewPortfolioService(store *persistence.HoldingStore, snapshots *persistence.SnapshotStore, priceService PriceFetcher, logger *zap.Logger) *PortfolioService {
	return &PortfolioService{
		store:        store,
		snapshots:    snapshots,
		priceService: priceService,
		logger:       logger,
		Now:          func() time.Time { return time.Now().UTC() },
	}
}

func (s *PortfolioService) log(ctx context.Context) *zap.Logger {
	if l, ok := logging.FromContext(ctx); ok {
		return l
	}
	if s.logger != nil {
		return s.logger
	}
	return zap.NewNop()
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
		s.log(ctx).Error("EUR rate fetch failed", zap.String("error", err.Error()))
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
		s.log(ctx).Warn("EUR rate unavailable, using fallback",
			zap.Float64("fallback", fallbackEURRate))
		eurRate = fallbackEURRate
	}

	var totalCost, totalCurrentValue, totalUnrealized, totalRealized float64
	// nativeCurrent holds today's live current value per currency in its
	// own units (no FX), keyed "INR"|"EUR"|"USD" — the basis for the
	// per-currency change vs previous close.
	nativeCurrent := map[string]float64{}
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
			// A failed/delisted price (Yahoo 404) is treated as a market
			// price of 0: native value 0, full cost shows as unrealized
			// loss. Keeps the dashboard in lock-step with the cron snapshot
			// (SnapshotService.BuildSnapshot).
			var native float64
			if price, _, pErr := s.priceService.GetPrice(ctx, hld.Symbol); pErr == nil && price > 0 {
				native = hld.StocksOwned * price
			}
			nativeCurrent[currencyOf(hld.Currency)] += native
			var cv float64
			if isEUR {
				cv = native / eurRate
			} else {
				cv = native
			}
			totalCurrentValue += cv
			totalUnrealized += cv - cost
		}
	}

	totalCostEUR := totalCost * eurRate
	totalCurrentValueEUR := totalCurrentValue * eurRate
	totalUnrealizedEUR := totalUnrealized * eurRate
	totalRealizedEUR := totalRealized * eurRate

	summary := api.Summary{
		TotalCost:            &totalCost,
		TotalCurrentValue:    &totalCurrentValue,
		TotalUnrealized:      &totalUnrealized,
		TotalRealized:        &totalRealized,
		TotalCostEur:         &totalCostEUR,
		TotalCurrentValueEur: &totalCurrentValueEUR,
		TotalUnrealizedEur:   &totalUnrealizedEUR,
		TotalRealizedEur:     &totalRealizedEUR,
		EurRate:              &eurRate,
	}
	s.attachPreviousClose(ctx, uid, &summary, nativeCurrent, totalCurrentValue, eurRate)
	return summary, nil
}

// currencyOf normalises a holding's currency to a snapshot bucket key,
// defaulting empty to INR (Holding.Currency defaults to "INR").
func currencyOf(c string) string {
	if c == "" {
		return domain.CurrencyINR
	}
	return c
}

// attachPreviousClose enriches summary with the daily-change fields by
// comparing today's value against the most recent snapshot strictly before
// today. A missing snapshot store, no prior snapshot, or a lookup error
// leaves the change fields nil (the indicator simply hides). The headline
// uses the INR base (same conversion as totalCurrentValue: EUR ÷ rate,
// other currencies treated as base); per-currency entries stay native.
func (s *PortfolioService) attachPreviousClose(
	ctx context.Context, uid primitive.ObjectID, summary *api.Summary,
	nativeCurrent map[string]float64, totalCurrentValue, eurRate float64,
) {
	if s.snapshots == nil {
		return
	}
	snap, err := s.snapshots.LatestBefore(ctx, uid, s.Now())
	if err != nil {
		if !errors.Is(err, persistence.ErrNotFound) {
			s.log(ctx).Warn("previous-close lookup failed", zap.String("error", err.Error()))
		}
		return
	}

	// Legacy snapshots written before the 2026-06 currency-only bucketing can
	// carry a USD bucket: US-listed holdings paid for in rupees were
	// mislabelled USD because the old cron bucketed by listing exchange, not
	// currency (see services.CurrencyOf). That money is really INR — the UI
	// only ever denominates positions in INR or EUR — and today those holdings
	// sit in the INR bucket. Fold the legacy USD bucket back into INR so the
	// per-currency comparison is like-for-like and no phantom USD row appears.
	prevNative := func(ccy string) float64 {
		v := snap.Buckets[ccy].Current
		if ccy == domain.CurrencyINR {
			v += snap.Buckets[domain.CurrencyUSD].Current
		}
		return v
	}

	// Headline previous close in INR base: EUR bucket converts via the
	// live rate; INR (incl. the folded USD bucket) counts as base, mirroring
	// how totalCurrentValue is built above. Deliberately uses today's rate for
	// the previous close too, so the headline change absorbs FX drift on
	// mixed-currency portfolios; the native per-currency strip below is the
	// FX-clean view of each price move.
	prevBaseINR := prevNative(domain.CurrencyINR) + prevNative(domain.CurrencyEUR)/eurRate

	prevEUR := prevBaseINR * eurRate
	changeValue := totalCurrentValue - prevBaseINR
	changeEUR := changeValue * eurRate
	dateStr := domain.UTCDate(snap.Date).Format("2006-01-02")

	summary.PreviousCloseValue = &prevBaseINR
	summary.PreviousCloseValueEur = &prevEUR
	summary.PreviousCloseDate = &dateStr
	summary.ChangeValue = &changeValue
	summary.ChangeValueEur = &changeEUR
	if pct := pctChange(prevBaseINR, changeValue); pct != nil {
		summary.ChangePct = pct
	}

	// Per-currency native deltas. Include a currency when it has value
	// today or had value at the previous close.
	perCcy := make([]api.CurrencyChange, 0, len(domain.AllCurrencies))
	for _, ccy := range domain.AllCurrencies {
		if ccy == domain.CurrencyUSD {
			continue // folded into INR above; the UI never holds native USD
		}
		cur := nativeCurrent[ccy]
		prev := prevNative(ccy)
		if cur == 0 && prev == 0 {
			continue
		}
		change := cur - prev
		code := ccy
		entry := api.CurrencyChange{
			Currency:      &code,
			Current:       &cur,
			PreviousClose: &prev,
			ChangeValue:   &change,
		}
		if pct := pctChange(prev, change); pct != nil {
			entry.ChangePct = pct
		}
		perCcy = append(perCcy, entry)
	}
	if len(perCcy) > 0 {
		summary.PerCurrency = &perCcy
	}
}

// pctChange returns 100*change/base, or nil when base is zero (the change
// percentage is undefined against a zero previous close).
func pctChange(base, change float64) *float64 {
	if base == 0 {
		return nil
	}
	pct := change / base * 100
	return &pct
}
