// Package services contains domain-level services (price + forex).
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// cachedPrice holds a price with a timestamp for TTL-based invalidation.
type cachedPrice struct {
	price     float64
	currency  string
	fetchedAt time.Time
}

// PriceService fetches live quotes from Yahoo Finance with a TTL cache.
type PriceService struct {
	client   *http.Client
	baseURL  string
	cache    map[string]cachedPrice
	cacheMu  sync.RWMutex
	cacheTTL time.Duration
	logger   *slog.Logger
}

// NewPriceService builds a PriceService with sensible defaults.
func NewPriceService(logger *slog.Logger) *PriceService {
	return &PriceService{
		client:   &http.Client{Timeout: 12 * time.Second},
		baseURL:  "https://query1.finance.yahoo.com",
		cache:    make(map[string]cachedPrice),
		cacheTTL: 5 * time.Minute,
		logger:   logger,
	}
}

// log returns the configured logger or a discarding one (for tests that
// construct PriceService via struct literal).
func (s *PriceService) log() *slog.Logger {
	if s.logger == nil {
		return slog.New(slog.DiscardHandler)
	}
	return s.logger
}

// yahooChartResp is the subset of the Yahoo Finance v8 chart response we use.
type yahooChartResp struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency           string  `json:"currency"`
				RegularMarketPrice float64 `json:"regularMarketPrice"`
			} `json:"meta"`
		} `json:"result"`
		Error any `json:"error"`
	} `json:"chart"`
}

// GetPrice fetches the current price for a Yahoo Finance symbol.
// For NSE stocks append ".NS" (e.g. "TCS.NS"), for BSE append ".BO".
// US symbols are plain (e.g. "AAPL").
func (s *PriceService) GetPrice(ctx context.Context, symbol string) (float64, string, error) {
	if c, ok := s.cacheGet(symbol); ok {
		s.log().DebugContext(ctx, "price cache hit",
			slog.String("symbol", symbol),
			slog.Float64("price", c.price),
		)
		return c.price, c.currency, nil
	}

	price, currency, err := s.fetch(ctx, symbol)
	if err != nil {
		s.log().WarnContext(ctx, "price fetch failed",
			slog.String("symbol", symbol),
			slog.String("error", err.Error()),
		)
		return 0, "", err
	}

	s.cacheSet(symbol, price, currency)
	s.log().DebugContext(ctx, "price fetched",
		slog.String("symbol", symbol),
		slog.Float64("price", price),
		slog.String("currency", currency),
	)
	return price, currency, nil
}

// GetForexRate returns how many `to` units equal 1 `from` unit.
// e.g. GetForexRate(ctx, "INR","EUR") → ~0.011
// Fetches the inverse pair (EURINR=X) which Yahoo quotes natively, then inverts.
func (s *PriceService) GetForexRate(ctx context.Context, from, to string) (float64, error) {
	symbol := fmt.Sprintf("%s%s=X", strings.ToUpper(to), strings.ToUpper(from))
	price, _, err := s.GetPrice(ctx, symbol)
	if err != nil {
		return 0, err
	}
	if price == 0 {
		return 0, fmt.Errorf("yahoo returned zero for %s", symbol)
	}
	return 1 / price, nil
}

func (s *PriceService) cacheGet(symbol string) (cachedPrice, bool) {
	s.cacheMu.RLock()
	defer s.cacheMu.RUnlock()
	c, ok := s.cache[symbol]
	if !ok || time.Since(c.fetchedAt) >= s.cacheTTL {
		return cachedPrice{}, false
	}
	return c, true
}

func (s *PriceService) cacheSet(symbol string, price float64, currency string) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.cache[symbol] = cachedPrice{price: price, currency: currency, fetchedAt: time.Now()}
}

func (s *PriceService) fetch(ctx context.Context, symbol string) (float64, string, error) {
	endpoint := fmt.Sprintf("%s/v8/finance/chart/%s?interval=1d&range=1d",
		s.baseURL, url.PathEscape(symbol))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", "GUC=AQEBCAFm")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("fetch %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, "", fmt.Errorf("yahoo status %d for %s: %s", resp.StatusCode, symbol, string(body))
	}

	var yr yahooChartResp
	if err := json.NewDecoder(resp.Body).Decode(&yr); err != nil {
		return 0, "", fmt.Errorf("decode %s: %w", symbol, err)
	}
	if len(yr.Chart.Result) == 0 {
		return 0, "", fmt.Errorf("no quote result for %s", symbol)
	}
	meta := yr.Chart.Result[0].Meta
	return meta.RegularMarketPrice, meta.Currency, nil
}
