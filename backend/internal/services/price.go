// Package services contains domain-level services (price + forex).
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"

	"go.opentelemetry.io/otel/attribute"
)

// cachedPrice holds a price with a timestamp for TTL-based invalidation.
type cachedPrice struct {
	price              float64
	currency           string
	previousClosePrice *float64
	fetchedAt          time.Time
}

type Quote struct {
	Price              float64
	Currency           string
	PreviousClosePrice *float64
}

// PriceService fetches live quotes from Yahoo Finance with a TTL cache.
type PriceService struct {
	client   *http.Client
	baseURL  string
	cache    map[string]cachedPrice
	cacheMu  sync.RWMutex
	cacheTTL time.Duration
	logger   *zap.Logger
}

// NewPriceService builds a PriceService with sensible defaults.
func NewPriceService(logger *zap.Logger) *PriceService {
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
func (s *PriceService) log() *zap.Logger {
	if s.logger == nil {
		return zap.NewNop()
	}
	return s.logger
}

// yahooChartResp is the subset of the Yahoo Finance v8 chart response we use.
type yahooChartResp struct {
	Chart struct {
		Result []struct {
			Meta struct {
				Currency           string   `json:"currency"`
				RegularMarketPrice float64  `json:"regularMarketPrice"`
				PreviousClose      *float64 `json:"previousClose"`
				ChartPreviousClose *float64 `json:"chartPreviousClose"`
			} `json:"meta"`
		} `json:"result"`
		Error any `json:"error"`
	} `json:"chart"`
}

// GetPrice fetches the current price for a Yahoo Finance symbol.
// For NSE stocks append ".NS" (e.g. "TCS.NS"), for BSE append ".BO".
// US symbols are plain (e.g. "AAPL").
func (s *PriceService) GetPrice(ctx context.Context, symbol string) (_ float64, _ string, retErr error) {
	ctx, span := tracer.Start(ctx, "PriceService.GetPrice")
	span.SetAttributes(attribute.String("symbol", symbol))
	defer endSpan(span, &retErr)
	quote, err := s.GetQuote(ctx, symbol)
	return quote.Price, quote.Currency, err
}

func (s *PriceService) GetQuote(ctx context.Context, symbol string) (_ Quote, retErr error) {
	ctx, span := tracer.Start(ctx, "PriceService.GetQuote")
	span.SetAttributes(attribute.String("symbol", symbol))
	defer endSpan(span, &retErr)
	logger := s.log()
	if c, ok := s.cacheGet(symbol); ok {
		logger.Debug("price cache hit",
			zap.String("symbol", symbol),
			zap.Float64("price", c.price),
		)
		return Quote{Price: c.price, Currency: c.currency, PreviousClosePrice: c.previousClosePrice}, nil
	}

	quote, err := s.fetch(ctx, symbol)
	if err != nil {
		logger.Warn("price fetch failed",
			zap.String("symbol", symbol),
			zap.Error(err),
		)
		return Quote{}, err
	}

	s.cacheSet(symbol, quote)
	logger.Debug("price fetched",
		zap.String("symbol", symbol),
		zap.Float64("price", quote.Price),
		zap.String("currency", quote.Currency),
	)
	return quote, nil
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

func (s *PriceService) cacheSet(symbol string, quote Quote) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.cache[symbol] = cachedPrice{price: quote.Price, currency: quote.Currency, previousClosePrice: quote.PreviousClosePrice, fetchedAt: time.Now()}
}

func (s *PriceService) fetch(ctx context.Context, symbol string) (_ Quote, retErr error) {
	ctx, span := tracer.Start(ctx, "PriceService.fetch")
	defer endSpan(span, &retErr)
	endpoint := fmt.Sprintf("%s/v8/finance/chart/%s?interval=1d&range=1d",
		s.baseURL, url.PathEscape(symbol))
	yr, err := s.fetchChart(ctx, endpoint, symbol)
	if err != nil {
		return Quote{}, err
	}
	meta := yr.Chart.Result[0].Meta
	previousClose := meta.PreviousClose
	if !validPreviousClose(previousClose) {
		previousClose = meta.ChartPreviousClose
	}
	if !validPreviousClose(previousClose) {
		previousClose = nil
	}
	return Quote{Price: meta.RegularMarketPrice, Currency: meta.Currency, PreviousClosePrice: previousClose}, nil
}

func validPreviousClose(price *float64) bool {
	return price != nil && *price > 0 && !math.IsNaN(*price) && !math.IsInf(*price, 0)
}

// fetchChart performs the Yahoo chart GET and decodes the shared response,
// guaranteeing at least one Result entry. Both fetch (regularMarketPrice) and
// GetClose (daily candles) build on it.
func (s *PriceService) fetchChart(ctx context.Context, endpoint, symbol string) (yahooChartResp, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return yahooChartResp{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", "GUC=AQEBCAFm")

	resp, err := s.client.Do(req)
	if err != nil {
		return yahooChartResp{}, fmt.Errorf("fetch %s: %w", symbol, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return yahooChartResp{}, fmt.Errorf("yahoo status %d for %s: %s", resp.StatusCode, symbol, string(body))
	}

	var yr yahooChartResp
	if err := json.NewDecoder(resp.Body).Decode(&yr); err != nil {
		return yahooChartResp{}, fmt.Errorf("decode %s: %w", symbol, err)
	}
	if len(yr.Chart.Result) == 0 {
		return yahooChartResp{}, fmt.Errorf("no quote result for %s", symbol)
	}
	return yr, nil
}
