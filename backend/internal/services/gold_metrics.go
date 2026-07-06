package services

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

// goldBeesSymbols identifies the GOLDBEES ETF holdings folded into the
// metrics table (PRD-003 §9.6): matched by symbol, NSE or BSE listing.
var goldBeesSymbols = map[string]bool{"GOLDBEES.NS": true, "GOLDBEES.BO": true}

// Metrics assembles the live metrics table (PRD-003 §6, DD-003 §3):
// ledger totals, valuation at the latest price on/before today, the
// GOLDBEES P&L from the stock holdings, and XIRR of the physical flows.
func (s *GoldService) Metrics(ctx context.Context, uid string) (api.GoldMetrics, error) {
	txns, err := s.store.ListTransactions(ctx, uid)
	if err != nil {
		return api.GoldMetrics{}, err
	}

	today := goldToday()
	var latest *float64
	price, err := s.store.LatestPriceOnOrBefore(ctx, uid, today)
	switch {
	case err == nil:
		latest = &price.PricePerGram
	case !errors.Is(err, persistence.ErrNotFound):
		return api.GoldMetrics{}, err
	}

	return buildMetrics(txns, latest, s.beesPL(ctx, uid), today), nil
}

// beesPL sums realised + unrealised P&L over the caller's GOLDBEES
// holdings from the live stocks table — raw, no tax adjustment (PRD
// §9.6/§9.7). nil means unknowable right now (bad uid or a dead quote
// feed); zero means no GOLDBEES held.
func (s *GoldService) beesPL(ctx context.Context, uid string) *float64 {
	oid, err := primitive.ObjectIDFromHex(uid)
	if err != nil {
		return nil
	}
	holdings, err := s.holdings.ListByUser(ctx, oid)
	if err != nil {
		s.logger.Warn("gold metrics: holdings lookup failed", zap.String("error", err.Error()))
		return nil
	}

	total := 0.0
	for _, h := range holdings {
		if !goldBeesSymbols[h.Symbol] {
			continue
		}
		total += h.RealizedPnL
		if h.StocksOwned > 0 {
			live, _, err := s.prices.GetPrice(ctx, h.Symbol)
			if err != nil {
				s.logger.Warn("gold metrics: GOLDBEES quote failed",
					zap.String("symbol", h.Symbol), zap.String("error", err.Error()))
				return nil // a partial sum would silently misstate the P&L
			}
			total += h.StocksOwned * (live - h.AvgCostPrice)
		}
	}
	return &total
}

// buildMetrics derives every PRD-003 §6 row from its inputs. Pure —
// pinned by unit tests. Nullable outputs stay nil when unknowable: no
// price row → no valuation, empty ledger → no averages, missing inputs →
// no XIRR.
func buildMetrics(txns []domain.GoldTransaction, latestGm, beesPL *float64, today time.Time) api.GoldMetrics {
	m := api.GoldMetrics{BeesPl: beesPL, LatestPrice: latestGm}
	for _, t := range txns {
		m.Invested += t.ActualPaid
		m.Grams += t.GramsBought
	}

	if m.Grams > 0 {
		avg := m.Invested / m.Grams
		m.AvgPerGram = &avg
	}
	if latestGm != nil {
		current := m.Grams * *latestGm
		m.Current = &current
		nettEx := current - m.Invested
		m.NettExBees = &nettEx
		if beesPL != nil {
			nettIn := nettEx + *beesPL
			m.NettInBees = &nettIn
		}
	}

	if m.Current != nil && len(txns) > 0 {
		flows := make([]cashFlow, 0, len(txns)+1)
		for _, t := range txns {
			flows = append(flows, cashFlow{Date: dateOnly(t.Date), Amount: -t.ActualPaid})
		}
		flows = append(flows, cashFlow{Date: today, Amount: *m.Current})
		if rate, ok := xirr(flows); ok {
			m.Xirr = &rate
		}
	}
	return m
}
