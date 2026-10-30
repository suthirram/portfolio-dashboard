package services

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/domain"
)

func TestDividendOverlay(t *testing.T) {
	tcs, sap := primitive.NewObjectID(), primitive.NewObjectID()
	holdings := []domain.Holding{{ID: tcs, Symbol: "TCS.NS"}, {ID: sap, Symbol: "SAP.DE"}}
	eur := dividendEvent(sap, "2020-02-10", 40)
	eur.Currency = "EUR"
	txns := []domain.Transaction{dividendEvent(tcs, "2020-01-01", 300), dividendEvent(tcs, "2020-01-01", 300), eur, dividendEvent(tcs, "2020-03-15", 1250.5)}

	got := DividendOverlay(txns, holdings, []string{"2020-03-15", "2019-12-31", "2020-01-31"})

	if len(got["2019-12-31"].ByCurrency) != 0 {
		t.Error("no dividends before the first payout")
	}
	if p := got["2020-01-31"].ByCurrency["INR"]; p.ToDate != 600 || p.OnDay != 0 {
		t.Errorf("31 Jan INR = %+v, want to_date 600, on_day 0", p)
	}
	if p := got["2020-03-15"].ByCurrency["INR"]; p.ToDate != 1850.5 || p.OnDay != 1250.5 {
		t.Errorf("15 Mar INR = %+v, want 1850.5 / 1250.5", p)
	}
	if p := got["2020-03-15"].ByCurrency["EUR"]; p.ToDate != 40 {
		t.Errorf("15 Mar EUR = %+v, want 40 (never mixed with INR)", p)
	}
	if got["2020-03-15"].BySymbol["TCS.NS"] != 1850.5 || got["2020-03-15"].BySymbol["SAP.DE"] != 40 {
		t.Errorf("per symbol = %v", got["2020-03-15"].BySymbol)
	}
}
