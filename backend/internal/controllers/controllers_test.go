package controllers

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
	"portfolio-dashboard/internal/services"
)

// ── mock price fetcher ─────────────────────────────────────────────────────

type mockPriceFetcher struct {
	prices     map[string]float64
	currencies map[string]string
	priceErrs  map[string]error
	forexRate  float64
	forexErr   error
}

func (m *mockPriceFetcher) GetPrice(_ context.Context, symbol string) (float64, string, error) {
	if err, ok := m.priceErrs[symbol]; ok {
		return 0, "", err
	}
	p, ok := m.prices[symbol]
	if !ok {
		return 0, "", errors.New("symbol not found: " + symbol)
	}
	cur := "INR"
	if c, ok := m.currencies[symbol]; ok {
		cur = c
	}
	return p, cur, nil
}

func (m *mockPriceFetcher) GetForexRate(_ context.Context, _, _ string) (float64, error) {
	if m.forexErr != nil {
		return 0, m.forexErr
	}
	return m.forexRate, nil
}

func TestNewBuildsHandlerWithDefaultDependencies(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("default deps wired", func(mt *mtest.T) {
		h := New(mt.DB, nil, false)

		if h.store == nil {
			t.Fatal("store is nil")
		}
		if h.priceService == nil {
			t.Fatal("priceService is nil")
		}
		if h.log() == nil {
			t.Fatal("log() returned nil")
		}
		if h.reqLog(context.Background()) == nil {
			t.Fatal("reqLog() returned nil")
		}
	})
}

func TestReqLogPrefersRequestScopedLogger(t *testing.T) {
	handlerLogger := slog.New(slog.DiscardHandler)
	requestLogger := slog.New(slog.DiscardHandler)
	h := &Controller{logger: handlerLogger}

	got := h.reqLog(logging.IntoContext(context.Background(), requestLogger))
	if got != requestLogger {
		t.Error("reqLog() did not return request-scoped logger")
	}
	if h.log() != handlerLogger {
		t.Error("log() did not return handler logger")
	}
}

func TestGetMarketPrice_ReturnsPriceFromService(t *testing.T) {
	h := &Controller{priceService: &mockPriceFetcher{
		prices:     map[string]float64{"TCS.NS": 3600},
		currencies: map[string]string{"TCS.NS": "INR"},
	}}

	resp, err := h.GetMarketPrice(context.Background(), api.GetMarketPriceRequestObject{
		Params: api.GetMarketPriceParams{Symbol: "TCS.NS"},
	})
	if err != nil {
		t.Fatalf("GetMarketPrice: %v", err)
	}
	got := resp.(api.GetMarketPrice200JSONResponse)
	if *got.Symbol != "TCS.NS" {
		t.Errorf("Symbol = %q, want TCS.NS", *got.Symbol)
	}
	if *got.Price != 3600 {
		t.Errorf("Price = %v, want 3600", *got.Price)
	}
	if *got.Currency != "INR" {
		t.Errorf("Currency = %q, want INR", *got.Currency)
	}
}

func TestGetMarketPrice_UpstreamErrorReturnsBadGateway(t *testing.T) {
	h := &Controller{priceService: &mockPriceFetcher{
		priceErrs: map[string]error{"TCS.NS": errors.New("price provider unavailable")},
	}}

	resp, err := h.GetMarketPrice(context.Background(), api.GetMarketPriceRequestObject{
		Params: api.GetMarketPriceParams{Symbol: "TCS.NS"},
	})
	if err != nil {
		t.Fatalf("GetMarketPrice: %v", err)
	}
	got := resp.(api.GetMarketPrice502JSONResponse)
	if got.Error == nil || *got.Error != "price provider unavailable" {
		t.Errorf("Error = %v, want price provider unavailable", got.Error)
	}
}

func TestGetForexRate_UsesDefaultsAndCustomParams(t *testing.T) {
	h := &Controller{priceService: &mockPriceFetcher{forexRate: 0.011}}

	defaultResp, err := h.GetForexRate(context.Background(), api.GetForexRateRequestObject{})
	if err != nil {
		t.Fatalf("GetForexRate defaults: %v", err)
	}
	gotDefault := defaultResp.(api.GetForexRate200JSONResponse)
	if *gotDefault.From != "INR" || *gotDefault.To != "EUR" || *gotDefault.Rate != 0.011 {
		t.Errorf("default response = %#v", gotDefault)
	}

	from := "EUR"
	to := "INR"
	customResp, err := h.GetForexRate(context.Background(), api.GetForexRateRequestObject{
		Params: api.GetForexRateParams{From: &from, To: &to},
	})
	if err != nil {
		t.Fatalf("GetForexRate custom: %v", err)
	}
	gotCustom := customResp.(api.GetForexRate200JSONResponse)
	if *gotCustom.From != "EUR" || *gotCustom.To != "INR" || *gotCustom.Rate != 0.011 {
		t.Errorf("custom response = %#v", gotCustom)
	}
}

func TestGetForexRate_ServiceErrorIsReturned(t *testing.T) {
	h := &Controller{priceService: &mockPriceFetcher{forexErr: errors.New("forex provider unavailable")}}

	resp, err := h.GetForexRate(context.Background(), api.GetForexRateRequestObject{})
	if err == nil {
		t.Fatal("GetForexRate() error = nil")
	}
	if resp != nil {
		t.Errorf("response = %#v, want nil", resp)
	}
	if err.Error() != "forex provider unavailable" {
		t.Errorf("error = %q", err.Error())
	}
}

// ── services.HoldingToAPI ───────────────────────────────────────────────────────────

func TestHoldingToAPI_DefaultsCurrencyToINR(t *testing.T) {
	h := domain.Holding{ID: primitive.NewObjectID(), Currency: ""}
	got := services.HoldingToAPI(h)
	if *got.Currency != "INR" {
		t.Errorf("currency = %q, want INR", *got.Currency)
	}
}

func TestHoldingToAPI_PreservesEURCurrency(t *testing.T) {
	h := domain.Holding{ID: primitive.NewObjectID(), Currency: "EUR"}
	got := services.HoldingToAPI(h)
	if *got.Currency != "EUR" {
		t.Errorf("currency = %q, want EUR", *got.Currency)
	}
}

func TestHoldingToAPI_MapsAllFields(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	id := primitive.NewObjectID()
	h := domain.Holding{
		ID:           id,
		Script:       "VWCE",
		Symbol:       "VWCE.DE",
		Exchange:     "OTHER",
		Type:         "etf",
		StocksOwned:  10,
		AvgCostPrice: 100.5,
		RealizedPnL:  50.0,
		Currency:     "EUR",
		Notes:        "some notes",
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	got := services.HoldingToAPI(h)

	checks := []struct {
		name string
		got  any
		want any
	}{
		{"Script", *got.Script, "VWCE"},
		{"Symbol", *got.Symbol, "VWCE.DE"},
		{"StocksOwned", *got.StocksOwned, 10.0},
		{"AvgCostPrice", *got.AvgCostPrice, 100.5},
		{"RealizedPnl", *got.RealizedPnl, 50.0},
		{"Currency", string(*got.Currency), "EUR"},
		{"Notes", *got.Notes, "some notes"},
	}
	for _, c := range checks {
		if c.got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, c.got, c.want)
		}
	}
}

// ── services.HoldingFromInput ───────────────────────────────────────────────────────

func TestHoldingFromInput_DefaultsCurrencyToINR(t *testing.T) {
	input := api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock"}
	got := services.HoldingFromInput(input)
	if got.Currency != "INR" {
		t.Errorf("currency = %q, want INR", got.Currency)
	}
}

func TestHoldingFromInput_AcceptsEUR(t *testing.T) {
	cur := api.HoldingInputCurrency("EUR")
	input := api.HoldingInput{Script: "VWCE", Exchange: "OTHER", Type: "etf", Currency: &cur}
	got := services.HoldingFromInput(input)
	if got.Currency != "EUR" {
		t.Errorf("currency = %q, want EUR", got.Currency)
	}
}

func TestHoldingFromInput_AcceptsINR(t *testing.T) {
	cur := api.HoldingInputCurrency("INR")
	input := api.HoldingInput{Script: "TCS", Exchange: "NSE", Type: "stock", Currency: &cur}
	got := services.HoldingFromInput(input)
	if got.Currency != "INR" {
		t.Errorf("currency = %q, want INR", got.Currency)
	}
}

func TestHoldingFromInput_RejectsInvalidCurrencyFallsBackToINR(t *testing.T) {
	cur := api.HoldingInputCurrency("USD")
	input := api.HoldingInput{Script: "AAPL", Exchange: "NASDAQ", Type: "stock", Currency: &cur}
	got := services.HoldingFromInput(input)
	if got.Currency != "INR" {
		t.Errorf("invalid currency %q should fall back to INR, got %q", cur, got.Currency)
	}
}

func TestHoldingFromInput_PopulatesOptionalFields(t *testing.T) {
	sym := "TCS.NS"
	qty := 5.0
	avg := 3000.0
	rpnl := 100.0
	note := "test note"
	input := api.HoldingInput{
		Script:       "TCS",
		Exchange:     "NSE",
		Type:         "stock",
		Symbol:       &sym,
		StocksOwned:  &qty,
		AvgCostPrice: &avg,
		RealizedPnl:  &rpnl,
		Notes:        &note,
	}
	got := services.HoldingFromInput(input)

	if got.Symbol != "TCS.NS" {
		t.Errorf("Symbol = %q", got.Symbol)
	}
	if got.StocksOwned != 5.0 {
		t.Errorf("StocksOwned = %v", got.StocksOwned)
	}
	if got.AvgCostPrice != 3000.0 {
		t.Errorf("AvgCostPrice = %v", got.AvgCostPrice)
	}
	if got.RealizedPnL != 100.0 {
		t.Errorf("RealizedPnL = %v", got.RealizedPnL)
	}
	if got.Notes != "test note" {
		t.Errorf("Notes = %q", got.Notes)
	}
}

// ── services.HoldingWithPriceToAPI ──────────────────────────────────────────────────

const testEurRate = 0.011 // 1 INR = 0.011 EUR  →  1 EUR ≈ 90.909 INR

func approxEqual(a, b float64) bool {
	const eps = 1e-9
	return math.Abs(a-b) <= eps*math.Max(1.0, math.Max(math.Abs(a), math.Abs(b)))
}

func TestHoldingWithPriceToAPI_INRHolding_PriceAndPnLInINR(t *testing.T) {
	ps := &mockPriceFetcher{
		prices:     map[string]float64{"TCS.NS": 3600.0},
		currencies: map[string]string{"TCS.NS": "INR"},
	}
	hld := domain.Holding{
		ID:           primitive.NewObjectID(),
		Symbol:       "TCS.NS",
		Currency:     "INR",
		StocksOwned:  10,
		AvgCostPrice: 3000.0,
		RealizedPnL:  500.0,
	}
	got := services.HoldingWithPriceToAPI(context.Background(), hld, ps, testEurRate)

	// cost_price  = 10 × 3000 = 30 000 INR
	// cost_eur    = 30 000 × 0.011 = 330 EUR
	// cv          = 10 × 3600 = 36 000 INR
	// cv_eur      = 36 000 × 0.011 = 396 EUR
	// unrealized  = 36 000 − 30 000 = 6 000 INR
	// real_eur    = 500 × 0.011 = 5.5 EUR
	cases := []struct {
		name      string
		got, want float64
	}{
		{"CostPrice", *got.CostPrice, 30000.0},
		{"CostPriceEur", *got.CostPriceEur, 330.0},
		{"CurrentValue", *got.CurrentValue, 36000.0},
		{"CurrentValueEur", *got.CurrentValueEur, 396.0},
		{"UnrealizedPnl", *got.UnrealizedPnl, 6000.0},
		{"RealizedPnlEur", *got.RealizedPnlEur, 5.5},
	}
	for _, c := range cases {
		if !approxEqual(c.got, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, c.got, c.want)
		}
	}
	if *got.Currency != "INR" {
		t.Errorf("Currency = %q, want INR", *got.Currency)
	}
}

func TestHoldingWithPriceToAPI_EURHolding_NormalisedToINR(t *testing.T) {
	ps := &mockPriceFetcher{
		prices:     map[string]float64{"VWCE.DE": 120.0},
		currencies: map[string]string{"VWCE.DE": "EUR"},
	}
	hld := domain.Holding{
		ID:           primitive.NewObjectID(),
		Symbol:       "VWCE.DE",
		Currency:     "EUR",
		StocksOwned:  5,
		AvgCostPrice: 100.0, // EUR per share
		RealizedPnL:  50.0,  // EUR
	}
	got := services.HoldingWithPriceToAPI(context.Background(), hld, ps, testEurRate)

	// cost_eur  = 5 × 100 = 500 EUR  (native)
	// cost_inr  = 500 / 0.011 ≈ 45 454.5 INR
	// real_eur  = 50 EUR  (native, no conversion)
	// cv_eur    = 5 × 120 = 600 EUR
	// cv_inr    = 600 / 0.011 ≈ 54 545.5 INR
	// unreal_eur = 600 − 500 = 100 EUR
	// unreal_inr = 100 / 0.011 ≈ 9 090.9 INR
	cases := []struct {
		name      string
		got, want float64
	}{
		{"CostPriceEur", *got.CostPriceEur, 500.0},
		{"CostPrice", *got.CostPrice, 500.0 / testEurRate},
		{"RealizedPnlEur", *got.RealizedPnlEur, 50.0},
		{"CurrentValueEur", *got.CurrentValueEur, 600.0},
		{"CurrentValue", *got.CurrentValue, 600.0 / testEurRate},
		{"UnrealizedPnlEur", *got.UnrealizedPnlEur, 100.0},
		{"UnrealizedPnl", *got.UnrealizedPnl, 100.0 / testEurRate},
	}
	for _, c := range cases {
		if !approxEqual(c.got, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, c.got, c.want)
		}
	}
	if *got.Currency != "EUR" {
		t.Errorf("Currency = %q, want EUR", *got.Currency)
	}
}

func TestHoldingWithPriceToAPI_LegacyEmptyCurrencyTreatedAsINR(t *testing.T) {
	ps := &mockPriceFetcher{
		prices:     map[string]float64{"INFY.NS": 1800.0},
		currencies: map[string]string{"INFY.NS": "INR"},
	}
	hld := domain.Holding{
		ID:           primitive.NewObjectID(),
		Symbol:       "INFY.NS",
		Currency:     "", // legacy document without currency field
		StocksOwned:  2,
		AvgCostPrice: 1500.0,
	}
	got := services.HoldingWithPriceToAPI(context.Background(), hld, ps, testEurRate)

	if *got.Currency != "INR" {
		t.Errorf("Currency = %q, want INR for empty currency", *got.Currency)
	}
	// INR path: cost_price = 2 × 1500 = 3000
	if !approxEqual(*got.CostPrice, 3000.0) {
		t.Errorf("CostPrice = %v, want 3000", *got.CostPrice)
	}
}

func TestHoldingWithPriceToAPI_EmptySymbolProducesNoPriceFields(t *testing.T) {
	ps := &mockPriceFetcher{prices: map[string]float64{}}
	hld := domain.Holding{
		ID:       primitive.NewObjectID(),
		Symbol:   "",
		Currency: "INR",
	}
	got := services.HoldingWithPriceToAPI(context.Background(), hld, ps, testEurRate)

	if got.CurrentPrice != nil {
		t.Errorf("CurrentPrice should be nil for empty symbol, got %v", *got.CurrentPrice)
	}
	if got.CurrentValue != nil {
		t.Errorf("CurrentValue should be nil for empty symbol, got %v", *got.CurrentValue)
	}
	if got.UnrealizedPnl != nil {
		t.Errorf("UnrealizedPnl should be nil for empty symbol, got %v", *got.UnrealizedPnl)
	}
}

func TestHoldingWithPriceToAPI_PriceErrorSetsErrorField(t *testing.T) {
	ps := &mockPriceFetcher{prices: map[string]float64{}} // no price → error
	hld := domain.Holding{
		ID:       primitive.NewObjectID(),
		Symbol:   "UNKNOWN.NS",
		Currency: "INR",
	}
	got := services.HoldingWithPriceToAPI(context.Background(), hld, ps, testEurRate)

	if got.PriceError == nil {
		t.Error("PriceError should be set when GetPrice fails")
	}
	if got.CurrentPrice != nil {
		t.Errorf("CurrentPrice should be nil on error, got %v", *got.CurrentPrice)
	}
}
