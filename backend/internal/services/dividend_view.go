package services

import (
	"cmp"
	"slices"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// periodTotals accumulates dividend cents per period (YYYY or YYYY-MM).
// Events arrive chronologically, so first-seen order is ascending.
type periodTotals struct {
	order []string
	cents map[string]int64
	count map[string]int
}

func newPeriodTotals() *periodTotals {
	return &periodTotals{cents: map[string]int64{}, count: map[string]int{}}
}

func (p *periodTotals) add(period string, cents int64) {
	if _, seen := p.cents[period]; !seen {
		p.order = append(p.order, period)
	}
	p.cents[period] += cents
	p.count[period]++
}

func (p *periodTotals) toAPI() []api.DividendPeriodTotal {
	out := make([]api.DividendPeriodTotal, 0, len(p.order))
	for _, period := range p.order {
		out = append(out, api.DividendPeriodTotal{Period: period, Total: domain.CentsToMoney(p.cents[period]), Count: p.count[period]})
	}
	return out
}

// buildDividendView turns one currency's dividend events (tab order) into the
// tab: rows with both running totals, summary, by-year, by-month and
// by-holding totals (PRD-005 §8). Always non-nil slices.
func buildDividendView(txns []domain.Transaction, holdings []domain.Holding) api.DividendView {
	holdingsById := make(map[primitive.ObjectID]*domain.Holding, len(holdings))
	for i := range holdings {
		holdingsById[holdings[i].ID] = &holdings[i]
	}

	view := api.DividendView{Rows: make([]api.DividendRow, 0, len(txns))}
	var totalCents int64
	holdingCents := map[primitive.ObjectID]int64{}
	holdingCount := map[primitive.ObjectID]int{}
	var holdingOrder []primitive.ObjectID
	years, months := newPeriodTotals(), newPeriodTotals()

	for _, t := range txns {
		cents := domain.AmountCents(t.Amount)
		totalCents += cents
		if _, seen := holdingCents[t.HoldingID]; !seen {
			holdingOrder = append(holdingOrder, t.HoldingID)
		}
		holdingCents[t.HoldingID] += cents
		holdingCount[t.HoldingID]++
		day := domain.UTCDate(t.Date)
		years.add(day.Format("2006"), cents)
		months.add(day.Format("2006-01"), cents)
		view.Rows = append(view.Rows, DividendRowToAPI(t, holdingsById[t.HoldingID],
			domain.CentsToMoney(totalCents), domain.CentsToMoney(holdingCents[t.HoldingID])))
	}

	view.ByYear, view.ByMonth = years.toAPI(), months.toAPI()
	view.ByHolding = make([]api.DividendHoldingTotal, 0, len(holdingOrder))
	for _, holdingId := range holdingOrder {
		var script, symbol string
		if h := holdingsById[holdingId]; h != nil {
			script, symbol = h.Script, h.Symbol
		}
		share := 0.0
		if totalCents > 0 {
			share = float64(holdingCents[holdingId]) / float64(totalCents)
		}
		view.ByHolding = append(view.ByHolding, api.DividendHoldingTotal{
			HoldingId: holdingId.Hex(), Script: script, Symbol: symbol,
			Total: domain.CentsToMoney(holdingCents[holdingId]), Count: holdingCount[holdingId], Share: share,
		})
	}
	slices.SortStableFunc(view.ByHolding, func(a, b api.DividendHoldingTotal) int { return cmp.Compare(b.Total, a.Total) })

	view.Summary = api.DividendSummary{Total: domain.CentsToMoney(totalCents), Count: len(txns), Holdings: len(holdingOrder)}
	if len(txns) > 0 {
		first, last := domain.UTCDate(txns[0].Date), domain.UTCDate(txns[len(txns)-1].Date)
		view.Summary.FirstDate, view.Summary.LastDate = apiDate(&first), apiDate(&last)
	}
	return view
}
