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
	dividends := []domain.Transaction{dividendEvent(tcs, "2020-01-01", 300), dividendEvent(tcs, "2020-01-01", 300), eur, dividendEvent(tcs, "2020-03-15", 1250.5)}

	got := DividendOverlay(dividends, holdings, []string{"2020-03-15", "2019-12-31", "2020-01-31"})

	if len(got["2019-12-31"].ByCurrency) != 0 {
		t.Error("no dividends before the first payout")
	}
	if point := got["2020-01-31"].ByCurrency["INR"]; point.ToDate != 600 || point.OnDay != 0 {
		t.Errorf("31 Jan INR = %+v, want to_date 600, on_day 0", point)
	}
	if point := got["2020-03-15"].ByCurrency["INR"]; point.ToDate != 1850.5 || point.OnDay != 1250.5 {
		t.Errorf("15 Mar INR = %+v, want 1850.5 / 1250.5", point)
	}
	if point := got["2020-03-15"].ByCurrency["EUR"]; point.ToDate != 40 {
		t.Errorf("15 Mar EUR = %+v, want 40 (never mixed with INR)", point)
	}
	byStock := got["2020-03-15"].ByStock
	if byStock[StockKey{Currency: "INR", Symbol: "TCS.NS"}] != 1850.5 || byStock[StockKey{Currency: "EUR", Symbol: "SAP.DE"}] != 40 {
		t.Errorf("per stock = %v", byStock)
	}
}

// One symbol held in INR and in EUR is two stock lines: each gets only its
// own currency's dividends (PRD-005 §3, §12).
func TestDividendOverlay_SameSymbolInTwoCurrencies(t *testing.T) {
	inrHolding, eurHolding := primitive.NewObjectID(), primitive.NewObjectID()
	holdings := []domain.Holding{{ID: inrHolding, Symbol: "AAPL", Currency: "INR"}, {ID: eurHolding, Symbol: "AAPL", Currency: "EUR"}}
	eur := dividendEvent(eurHolding, "2020-01-01", 40)
	eur.Currency = "EUR"
	dividends := []domain.Transaction{dividendEvent(inrHolding, "2020-01-01", 300), eur}

	byStock := DividendOverlay(dividends, holdings, []string{"2020-01-31"})["2020-01-31"].ByStock

	if inr := byStock[StockKey{Currency: "INR", Symbol: "AAPL"}]; inr != 300 {
		t.Errorf("INR AAPL = %v, want 300 (EUR not mixed in)", inr)
	}
	if eurTotal := byStock[StockKey{Currency: "EUR", Symbol: "AAPL"}]; eurTotal != 40 {
		t.Errorf("EUR AAPL = %v, want 40 (INR not mixed in)", eurTotal)
	}
}
