package services

import (
	"context"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/persistence"
)

// StockXirrService computes the money-weighted annual return (XIRR) of the
// stock ledger, per currency and per holding (PRD-012 / DD-012). It reads
// the ledger as cash flows — buys and openings out, sells and dividends in —
// and closes each series with today's market value.
type StockXirrService struct {
	holdings     *persistence.HoldingStore
	transactions *persistence.TransactionStore
	prices       PriceFetcher
	logger       *zap.Logger
	// Today lets tests pin the IST day the terminal value is dated on.
	Today func() time.Time
}

// NewStockXirrService wires a StockXirrService.
func NewStockXirrService(holdings *persistence.HoldingStore, transactions *persistence.TransactionStore, prices PriceFetcher, logger *zap.Logger) *StockXirrService {
	return &StockXirrService{holdings: holdings, transactions: transactions, prices: prices, logger: logger, Today: istToday}
}

func (s *StockXirrService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// View returns the XIRR view of userId's stock portfolio.
func (s *StockXirrService) View(ctx context.Context, userId primitive.ObjectID) (_ api.StockXirrView, retErr error) {
	ctx, span := tracer.Start(ctx, "StockXirrService.View")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)

	holdings, err := s.holdings.ListByUser(ctx, userId)
	if err != nil {
		return api.StockXirrView{}, err
	}
	txns, err := s.transactions.ListByUser(ctx, userId)
	if err != nil {
		return api.StockXirrView{}, err
	}

	active := make([]domain.Holding, 0, len(holdings))
	for _, holding := range holdings {
		if holding.StocksOwned > 0 && holding.Symbol != "" {
			active = append(active, holding)
		}
	}
	prefetchPrices(ctx, s.prices, active)
	// A failed quote values the position at 0, exactly as Summary does, so
	// the XIRR agrees with the Current Value card beside it.
	marketValues := make(map[primitive.ObjectID]float64, len(active))
	for _, holding := range active {
		price, _, priceErr := s.prices.GetPrice(ctx, holding.Symbol)
		if priceErr != nil || price <= 0 {
			logger.Warn("stock xirr: quote unavailable, valuing at 0",
				zap.String("symbol", holding.Symbol), zap.Error(priceErr))
			continue
		}
		marketValues[holding.ID] = holding.StocksOwned * price
	}
	return buildStockXirr(holdings, txns, marketValues, s.Today()), nil
}

// ledgerFlow maps one ledger event to its cash flow from the investor's
// side: money paid in (opening, buy) is negative, money received (sell,
// dividend) positive. Splits, bonuses and mergers move no cash. An opening
// is dated on its user-set OpeningDate when there is one; undated reports
// that it fell back to the ledger's ordering date.
func ledgerFlow(txn domain.Transaction) (flow cashFlow, undated bool, ok bool) {
	switch txn.Type {
	case domain.TxnOpening:
		if txn.OpeningDate != nil {
			return cashFlow{Date: dateOnly(*txn.OpeningDate), Amount: -txn.Amount}, false, true
		}
		return cashFlow{Date: dateOnly(txn.Date), Amount: -txn.Amount}, true, true
	case domain.TxnBuy:
		return cashFlow{Date: dateOnly(txn.Date), Amount: -txn.Amount}, false, true
	case domain.TxnSell, domain.TxnDividend:
		return cashFlow{Date: dateOnly(txn.Date), Amount: txn.Amount}, false, true
	}
	return cashFlow{}, false, false
}

// flowSeries collects one series' flows plus what the UI flags about it.
type flowSeries struct {
	flows    []cashFlow
	undated  int
	earliest *time.Time
}

func (series *flowSeries) add(flow cashFlow) {
	series.flows = append(series.flows, flow)
	if series.earliest == nil || flow.Date.Before(*series.earliest) {
		date := flow.Date
		series.earliest = &date
	}
}

// rate is the series' XIRR closed by a terminal value on today; a zero
// terminal (sold out, or a dead quote) adds no flow, so a sold-out series
// is measured on its realised cash alone.
func (series *flowSeries) rate(terminal float64, today time.Time) *float64 {
	flows := series.flows
	if terminal > 0 {
		flows = append(append([]cashFlow(nil), flows...), cashFlow{Date: today, Amount: terminal})
	}
	if rate, ok := xirr(flows); ok {
		return &rate
	}
	return nil
}

func (series *flowSeries) since() *openapi_types.Date {
	if series.earliest == nil {
		return nil
	}
	return &openapi_types.Date{Time: *series.earliest}
}

// buildStockXirr derives the per-holding and per-currency XIRR from the
// holdings, their ledger and today's market value per holding. Pure —
// pinned by unit tests. Holdings in a currency outside CurrencyOf's buckets
// are left out, as the snapshot job leaves them out; events of a holding
// not in the list are ignored.
func buildStockXirr(holdings []domain.Holding, txns []domain.Transaction, marketValues map[primitive.ObjectID]float64, today time.Time) api.StockXirrView {
	txnsByHolding := make(map[primitive.ObjectID][]domain.Transaction, len(holdings))
	for _, txn := range txns {
		txnsByHolding[txn.HoldingID] = append(txnsByHolding[txn.HoldingID], txn)
	}

	byCurrency := map[string]*flowSeries{}
	currencyValue := map[string]float64{}
	view := api.StockXirrView{
		AsOf:       openapi_types.Date{Time: today},
		Currencies: []api.StockXirrCurrency{},
		Holdings:   make([]api.StockXirrHolding, 0, len(holdings)),
	}
	for _, holding := range holdings {
		currency, ok := CurrencyOf(holding)
		if !ok {
			continue
		}
		bucket := byCurrency[currency]
		if bucket == nil {
			bucket = &flowSeries{}
			byCurrency[currency] = bucket
		}
		own := &flowSeries{}
		for _, txn := range txnsByHolding[holding.ID] {
			flow, undated, isCash := ledgerFlow(txn)
			if !isCash {
				continue
			}
			own.add(flow)
			bucket.add(flow)
			if undated {
				own.undated++
				bucket.undated++
			}
		}
		currencyValue[currency] += marketValues[holding.ID]
		view.Holdings = append(view.Holdings, api.StockXirrHolding{
			HoldingId:      holding.ID.Hex(),
			Xirr:           own.rate(marketValues[holding.ID], today),
			Since:          own.since(),
			UndatedOpening: own.undated > 0,
		})
	}

	// CurrencyOf only yields AllCurrencies, so walking it covers every bucket
	// in the dashboard's order (INR, then EUR).
	for _, currency := range domain.AllCurrencies {
		bucket := byCurrency[currency]
		if bucket == nil {
			continue
		}
		view.Currencies = append(view.Currencies, api.StockXirrCurrency{
			Currency:        api.StockXirrCurrencyCurrency(currency),
			Xirr:            bucket.rate(currencyValue[currency], today),
			Since:           bucket.since(),
			UndatedOpenings: bucket.undated,
		})
	}
	return view
}
