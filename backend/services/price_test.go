package services

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
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
		w.Write(makeYahooResponse(3600.0, "INR"))
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
		w.Write(makeYahooResponse(120.0, "EUR"))
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	ctx := context.Background()
	ps.GetPrice(ctx, "VWCE.DE")
	ps.GetPrice(ctx, "VWCE.DE")

	if calls != 1 {
		t.Errorf("expected exactly 1 HTTP call, got %d (cache miss on second call)", calls)
	}
}

func TestGetPrice_CacheExpiry_RefetchesAfterTTL(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusOK)
		w.Write(makeYahooResponse(100.0, "EUR"))
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	ctx := context.Background()
	ps.GetPrice(ctx, "VWCE.DE")

	// Backdate the cache entry past TTL without sleeping.
	ps.cacheMu.Lock()
	entry := ps.cache["VWCE.DE"]
	entry.fetchedAt = time.Now().Add(-10 * time.Minute)
	ps.cache["VWCE.DE"] = entry
	ps.cacheMu.Unlock()

	ps.GetPrice(ctx, "VWCE.DE")

	if calls != 2 {
		t.Errorf("expected 2 HTTP calls after TTL expiry, got %d", calls)
	}
}

func TestGetForexRate_InvertsQuotedPrice(t *testing.T) {
	// Yahoo quotes EURINR=X ≈ 90 (1 EUR = 90 INR).
	// GetForexRate(ctx, "INR","EUR") must return 1/90 (how many EUR per 1 INR).
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write(makeYahooResponse(90.0, "INR"))
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
		w.Write(makeYahooResponse(90.0, "INR"))
	}))
	defer srv.Close()

	ps := newTestPriceService(srv.URL)
	ps.GetForexRate(context.Background(), "INR", "EUR")

	// GetForexRate(ctx, "INR","EUR") should look up "EURINR=X".
	// r.URL.Path is decoded by the HTTP layer, so %3D appears as =.
	if capturedPath != "/v8/finance/chart/EURINR=X" {
		t.Errorf("unexpected path %q, want /v8/finance/chart/EURINR=X", capturedPath)
	}
}
