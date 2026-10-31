package services

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

func dividendEvent(holdingId primitive.ObjectID, day string, amount float64) domain.Transaction {
	d, _ := time.Parse(time.DateOnly, day)
	return domain.Transaction{ID: primitive.NewObjectID(), HoldingID: holdingId, Type: domain.TxnDividend, Date: d, Amount: amount, Currency: "INR"}
}

func TestBuildDividendView_RunningTotalsAndAnalytics(t *testing.T) {
	tcs, jio := primitive.NewObjectID(), primitive.NewObjectID()
	holdings := []domain.Holding{{ID: tcs, Script: "TCS", Symbol: "TCS.NS"}, {ID: jio, Script: "Jio Platforms Ltd", Symbol: "JIOPLA.NS"}}
	txns := []domain.Transaction{
		dividendEvent(tcs, "2020-01-01", 300),
		dividendEvent(tcs, "2020-01-01", 300),
		dividendEvent(jio, "2020-03-15", 1250.5),
		dividendEvent(tcs, "2021-08-20", 1200),
	}
	view := buildDividendView(txns, holdings)

	wantCum := []float64{300, 600, 1850.5, 3050.5}
	wantHoldingCum := []float64{300, 600, 1250.5, 1800}
	for i, r := range view.Rows {
		if r.Cumulative != wantCum[i] || r.HoldingCumulative != wantHoldingCum[i] {
			t.Errorf("row %d: cumulative %v / holding %v, want %v / %v", i, r.Cumulative, r.HoldingCumulative, wantCum[i], wantHoldingCum[i])
		}
	}
	if view.Rows[2].Script != "Jio Platforms Ltd" {
		t.Errorf("row 2 script = %q, want the holding label", view.Rows[2].Script)
	}
	if len(view.ByYear) != 2 || view.ByYear[0].Period != "2020" || view.ByYear[0].Total != 1850.5 || view.ByYear[1].Total != 1200 {
		t.Errorf("by_year = %+v", view.ByYear)
	}
	if len(view.ByMonth) != 3 || view.ByMonth[0].Period != "2020-01" || view.ByMonth[0].Count != 2 {
		t.Errorf("by_month = %+v", view.ByMonth)
	}
	if view.ByHolding[0].Script != "TCS" || view.ByHolding[0].Total != 1800 || view.ByHolding[1].Total != 1250.5 {
		t.Errorf("by_holding not biggest-first: %+v", view.ByHolding)
	}
	if got := view.ByHolding[0].Share + view.ByHolding[1].Share; got < 0.9999 || got > 1.0001 {
		t.Errorf("shares sum to %v, want 1", got)
	}
	if view.Summary.Total != 3050.5 || view.Summary.Count != 4 || view.Summary.Holdings != 2 {
		t.Errorf("summary = %+v", view.Summary)
	}
	if view.Summary.FirstDate.Format(time.DateOnly) != "2020-01-01" || view.Summary.LastDate.Format(time.DateOnly) != "2021-08-20" {
		t.Errorf("summary dates = %v → %v", view.Summary.FirstDate, view.Summary.LastDate)
	}
}

// The per-holding total must equal what RecomputePosition stores as the
// holding's total_dividends — the no-double-counting guarantee (PRD-005 §9).
// Legacy sub-cent amounts (1.004 ×3) must not split the two: both sum cents.
func TestBuildDividendView_HoldingTotalMatchesPosition(t *testing.T) {
	cases := []struct {
		name   string
		amount float64
		want   float64
	}{
		{"float noise", 0.1, 0.3},
		{"fractional cents", 1.004, 3.0},
		{"fractional cents rounding up", 1.006, 3.03},
	}
	for _, c := range cases {
		tcs := primitive.NewObjectID()
		txns := []domain.Transaction{dividendEvent(tcs, "2020-01-01", c.amount), dividendEvent(tcs, "2020-02-01", c.amount), dividendEvent(tcs, "2020-03-01", c.amount)}
		pos, err := RecomputePosition(txns)
		if err != nil {
			t.Fatal(err)
		}
		view := buildDividendView(txns, []domain.Holding{{ID: tcs, Script: "TCS"}})
		if view.ByHolding[0].Total != pos.TotalDividends || view.Summary.Total != pos.TotalDividends {
			t.Errorf("%s: by_holding %v / summary %v ≠ total_dividends %v", c.name, view.ByHolding[0].Total, view.Summary.Total, pos.TotalDividends)
		}
		if pos.TotalDividends != c.want {
			t.Errorf("%s: total_dividends = %v, want %v", c.name, pos.TotalDividends, c.want)
		}
	}
}

// A dividend is stored at cent precision, so the stored amount is exactly
// what every total sums; other types keep their full amount.
func TestTransactionFromInput_RoundsDividendToCents(t *testing.T) {
	amount := 1.004
	if got := TransactionFromInput(api.TransactionInput{Type: "dividend", Amount: &amount}).Amount; got != 1.0 {
		t.Errorf("dividend amount = %v, want 1", got)
	}
	if got := TransactionFromInput(api.TransactionInput{Type: "buy", Amount: &amount}).Amount; got != 1.004 {
		t.Errorf("buy amount = %v, want 1.004", got)
	}
}

func TestBuildDividendView_Empty(t *testing.T) {
	view := buildDividendView(nil, nil)
	if view.Rows == nil || view.ByYear == nil || view.ByMonth == nil || view.ByHolding == nil {
		t.Error("an empty tab must serialise as [] not null")
	}
	if view.Summary.FirstDate != nil {
		t.Error("an empty tab has no first date")
	}
}
