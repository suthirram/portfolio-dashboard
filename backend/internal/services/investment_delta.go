package services

import (
	"context"
	"fmt"
	"slices"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.uber.org/zap"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// The Transactions page's investment delta computed from the ledger
// (PD-052): per currency, the cost basis at each month end and its change
// from the previous month end. Each day replays every holding's ledger as of
// that day with the History heal's own replay (asOfLedger +
// RecomputePosition), so a month end reads what a healed History row on that
// day holds as invested.

// minInvestmentDeltaYear is the chart's first year (the frontend's MIN_YEAR).
const minInvestmentDeltaYear = 2020

// goldColumn is the chart column of the physical-gold ledger.
const goldColumn = "GOLD"

// GoldInvested is the gold ledger's invested amount per date
// (GoldService.HistoryOverlay). The caller passes nil when the user has no
// gold, or Postgres is not configured.
type GoldInvested interface {
	HistoryOverlay(ctx context.Context, uid string, dates []string) (map[string]domain.GoldHistoryPoint, error)
}

// monthEnds lists the days the chart reads for year: 31 Dec of the previous
// year (January's opening), then each month's last day, or today for the
// current month. Months after today have no day.
func monthEnds(year int, today time.Time) []time.Time {
	days := []time.Time{time.Date(year, time.January, 0, 0, 0, 0, 0, time.UTC)}
	for month := time.January; month <= time.December; month++ {
		if time.Date(year, month, 1, 0, 0, 0, 0, time.UTC).After(today) {
			break
		}
		end := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC)
		if end.After(today) {
			end = today
		}
		days = append(days, end)
	}
	return days
}

// investedOn is, per currency, the cost basis (shares × average cost) of
// every holding at the end of day. An oversold as-of ledger counts at its
// clamped position, as the History heal values it.
func investedOn(holdings []domain.Holding, ledgers map[primitive.ObjectID][]domain.Transaction, day time.Time) map[string]float64 {
	invested := map[string]float64{}
	for _, holding := range holdings {
		currency, ok := CurrencyOf(holding)
		if !ok {
			continue
		}
		ledger := asOfLedger(ledgers[holding.ID], day.AddDate(0, 0, 1))
		if len(ledger) == 0 {
			continue
		}
		position, _ := RecomputePosition(ledger)
		invested[currency] += position.StocksOwned * position.AvgCostPrice
	}
	return invested
}

// deltaColumns turns each column's invested amount on the monthEnds days
// (values[0] = January's opening) into the chart's columns, in chart order.
// A column appears when some month end of the year has money invested.
func deltaColumns(figures map[string][]float64) []api.InvestmentDeltaColumn {
	columns := []api.InvestmentDeltaColumn{}
	for _, column := range []string{domain.CurrencyINR, domain.CurrencyEUR, goldColumn} {
		values, ok := figures[column]
		if !ok || !slices.ContainsFunc(values[1:], func(value float64) bool { return round(value) > 0 }) {
			continue
		}
		months := make([]api.InvestmentDeltaMonth, 12)
		for month0 := range months {
			months[month0].Month0 = month0
			if month0+1 < len(values) {
				invested, delta := round(values[month0+1]), round(values[month0+1]-values[month0])
				months[month0].Invested, months[month0].Delta = &invested, &delta
			}
		}
		columns = append(columns, api.InvestmentDeltaColumn{Column: api.InvestmentDeltaColumnColumn(column), Months: months})
	}
	return columns
}

// InvestmentDelta is the Transactions page's monthly investment delta for
// year, from the ledger (PD-052). GOLD comes from gold when it is non-nil;
// a gold failure leaves the column out rather than failing the chart, as
// History does with its gold overlay.
func (s *TransactionsService) InvestmentDelta(ctx context.Context, userId primitive.ObjectID, year int, gold GoldInvested) (_ api.InvestmentDelta, retErr error) {
	ctx, span := tracer.Start(ctx, "TransactionsService.InvestmentDelta")
	defer endSpan(span, &retErr)
	logger := s.log(ctx)
	today := istDayOf(s.currentTime())
	if year < minInvestmentDeltaYear || year > today.Year() {
		return api.InvestmentDelta{}, fmt.Errorf("%w: year must be %d to %d", ErrValidation, minInvestmentDeltaYear, today.Year())
	}
	holdings, err := s.holdings.ListByUser(ctx, userId)
	if err != nil {
		logger.Error("investment delta: list holdings failed", zap.Error(err))
		return api.InvestmentDelta{}, err
	}
	txns, err := s.txns.ListByUser(ctx, userId)
	if err != nil {
		logger.Error("investment delta: list transactions failed", zap.Error(err))
		return api.InvestmentDelta{}, err
	}
	ledgers := map[primitive.ObjectID][]domain.Transaction{}
	for _, txn := range txns {
		ledgers[txn.HoldingID] = append(ledgers[txn.HoldingID], txn)
	}

	days := monthEnds(year, today)
	figures := map[string][]float64{domain.CurrencyINR: make([]float64, len(days)), domain.CurrencyEUR: make([]float64, len(days))}
	for i, day := range days {
		for currency, invested := range investedOn(holdings, ledgers, day) {
			figures[currency][i] = invested
		}
	}
	if gold != nil {
		dates := make([]string, len(days))
		for i, day := range days {
			dates[i] = day.Format(time.DateOnly)
		}
		overlay, err := gold.HistoryOverlay(ctx, userId.Hex(), dates)
		if err != nil {
			logger.Warn("investment delta: gold overlay failed", zap.Error(err))
		} else {
			values := make([]float64, len(days))
			for i, date := range dates {
				values[i] = overlay[date].Invested
			}
			figures[goldColumn] = values
		}
	}
	return api.InvestmentDelta{Year: year, Columns: deltaColumns(figures)}, nil
}
