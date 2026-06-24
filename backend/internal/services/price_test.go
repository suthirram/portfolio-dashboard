package services

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// newTestPriceService creates a PriceService pointing at a given base URL,
// used to redirect requests to an httptest server.
func newTestPriceService(baseURL string) *PriceService {
	return &PriceService{
		client:   &http.Client{},
		baseURL:  baseURL,
		cache:    make(map[string]cachedPrice),
		cacheTTL: 5 * time.Minute,
	}
}

func makeYahooResponse(price float64, currency string) []byte {
	type meta struct {
		Currency           string  `json:"currency"`
		RegularMarketPrice float64 `json:"regularMarketPrice"`
	}
	type result struct {
		Meta meta `json:"meta"`
	}
	type chart struct {
		Result []result `json:"result"`
		Error  any      `json:"error"`
	}
	type resp struct {
		Chart chart `json:"chart"`
	}
	b, _ := json.Marshal(resp{Chart: chart{Result: []result{{Meta: meta{Currency: currency, RegularMarketPrice: price}}}}})
	return b
}

func TestGetPrice_ReturnsLivePriceAndCurrency(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(makeYahooResponse(3600.0, "INR")); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	price, currency, err := ps.GetPrice(context.Background(), "TCS.NS")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if price != 3600.0 {
		t.Errorf("price = %v, want 3600.0", price)
	}
	if currency != "INR" {
		t.Errorf("currency = %v, want INR", currency)
	}
}

func TestGetPrice_CachesResultOnSecondCall(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(makeYahooResponse(120.0, "EUR")); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	ctx := context.Background()
	if _, _, err := ps.GetPrice(ctx, "VWCE.DE"); err != nil {
		t.Fatalf("first GetPrice: %v", err)
	}
	if _, _, err := ps.GetPrice(ctx, "VWCE.DE"); err != nil {
		t.Fatalf("second GetPrice: %v", err)
	}

	if calls != 1 {
		t.Errorf("expected exactly 1 HTTP call, got %d (cache miss on second call)", calls)
	}
}

func TestGetPrice_CacheExpiry_RefetchesAfterTTL(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(makeYahooResponse(100.0, "EUR")); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	ctx := context.Background()
	if _, _, err := ps.GetPrice(ctx, "VWCE.DE"); err != nil {
		t.Fatalf("first GetPrice: %v", err)
	}

	// Backdate the cache entry past TTL without sleeping.
	ps.cacheMu.Lock()
	entry := ps.cache["VWCE.DE"]
	entry.fetchedAt = time.Now().Add(-10 * time.Minute)
	ps.cache["VWCE.DE"] = entry
	ps.cacheMu.Unlock()

	if _, _, err := ps.GetPrice(ctx, "VWCE.DE"); err != nil {
		t.Fatalf("second GetPrice: %v", err)
	}

	if calls != 2 {
		t.Errorf("expected 2 HTTP calls after TTL expiry, got %d", calls)
	}
}

func TestGetForexRate_InvertsQuotedPrice(t *testing.T) {
	// Yahoo quotes EURINR=X ≈ 90 (1 EUR = 90 INR).
	// GetForexRate(ctx, "INR","EUR") must return 1/90 (how many EUR per 1 INR).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(makeYahooResponse(90.0, "INR")); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	rate, err := ps.GetForexRate(context.Background(), "INR", "EUR")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := 1.0 / 90.0
	if math.Abs(rate-want) > 1e-10 {
		t.Errorf("rate = %v, want %v", rate, want)
	}
}

func TestGetForexRate_BuildsCorrectSymbol(t *testing.T) {
	var capturedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(makeYahooResponse(90.0, "INR")); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	if _, err := ps.GetForexRate(context.Background(), "INR", "EUR"); err != nil {
		t.Fatalf("GetForexRate: %v", err)
	}

	// GetForexRate(ctx, "INR","EUR") should look up "EURINR=X".
	// r.URL.Path is decoded by the HTTP layer, so %3D appears as =.
	if capturedPath != "/v8/finance/chart/EURINR=X" {
		t.Errorf("unexpected path %q, want /v8/finance/chart/EURINR=X", capturedPath)
	}
}

func TestNewPriceServiceSetsProductionDefaults(t *testing.T) {
	ps := NewPriceService(nil)

	if ps.client == nil {
		t.Fatal("client is nil")
	}
	if ps.client.Timeout != 12*time.Second {
		t.Errorf("client timeout = %s, want 12s", ps.client.Timeout)
	}
	if ps.baseURL != "https://query1.finance.yahoo.com" {
		t.Errorf("baseURL = %q", ps.baseURL)
	}
	if ps.cache == nil {
		t.Fatal("cache is nil")
	}
	if ps.cacheTTL != 5*time.Minute {
		t.Errorf("cacheTTL = %s, want 5m", ps.cacheTTL)
	}
}

func TestGetPrice_ReturnsStatusErrorWithLimitedBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream unavailable", http.StatusBadGateway)
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	_, _, err := ps.GetPrice(context.Background(), "TCS.NS")
	if err == nil {
		t.Fatal("GetPrice() error = nil")
	}
	if !strings.Contains(err.Error(), "yahoo status 502 for TCS.NS") {
		t.Errorf("error = %q, want status and symbol", err.Error())
	}
	if !strings.Contains(err.Error(), "upstream unavailable") {
		t.Errorf("error = %q, want response body", err.Error())
	}
}

func TestGetPrice_ReturnsDecodeErrorForMalformedJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write([]byte(`{"chart":`)); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	_, _, err := ps.GetPrice(context.Background(), "TCS.NS")
	if err == nil {
		t.Fatal("GetPrice() error = nil")
	}
	if !strings.Contains(err.Error(), "decode TCS.NS") {
		t.Errorf("error = %q, want decode context", err.Error())
	}
}

func TestGetPrice_ReturnsErrorWhenQuoteResultMissing(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write([]byte(`{"chart":{"result":[],"error":null}}`)); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	_, _, err := ps.GetPrice(context.Background(), "UNKNOWN.NS")
	if err == nil {
		t.Fatal("GetPrice() error = nil")
	}
	if !strings.Contains(err.Error(), "no quote result for UNKNOWN.NS") {
		t.Errorf("error = %q", err.Error())
	}
}

func TestGetForexRateRejectsZeroInverseQuote(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(makeYahooResponse(0, "INR")); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	rate, err := ps.GetForexRate(context.Background(), "INR", "EUR")
	if err == nil {
		t.Fatal("GetForexRate() error = nil")
	}
	if rate != 0 {
		t.Errorf("rate = %v, want 0", rate)
	}
	if !strings.Contains(err.Error(), "yahoo returned zero for EURINR=X") {
		t.Errorf("error = %q", err.Error())
	}
}
