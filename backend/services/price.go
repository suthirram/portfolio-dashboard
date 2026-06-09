package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// cachedPrice holds a price with a timestamp for TTL-based invalidation
type cachedPrice struct {
	price     float64
	currency  string
	fetchedAt time.Time
}

// PriceService fetches live quotes from Yahoo Finance
type PriceService struct {
	client   *http.Client
	baseURL  string
	cache    map[string]cachedPrice
	cacheMu  sync.RWMutex
	cacheTTL time.Duration
}

func NewPriceService() *PriceService {
	return &PriceService{
		client:   &http.Client{Timeout: 12 * time.Second},
		baseURL:  "https://query1.finance.yahoo.com",
		cache:    make(map[string]cachedPrice),
		cacheTTL: 5 * time.Minute,
	}
}

// Yahoo Finance v8 chart response shape
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
func (s *PriceService) GetPrice(ctx context.Context, symbol string) (price float64, currency string, err error) {
	s.cacheMu.RLock()
	if c, ok := s.cache[symbol]; ok && time.Since(c.fetchedAt) < s.cacheTTL {
		s.cacheMu.RUnlock()
		return c.price, c.currency, nil
	}
	s.cacheMu.RUnlock()

	endpoint := fmt.Sprintf(
		"%s/v8/finance/chart/%s?interval=1d&range=1d",
		s.baseURL,
		url.PathEscape(symbol),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Cookie", "GUC=AQEBCAFm")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("fetch error for %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("yahoo returned %d for symbol %s", resp.StatusCode, symbol)
	}

	var yr yahooChartResp
	if err := json.NewDecoder(resp.Body).Decode(&yr); err != nil {
		return 0, "", fmt.Errorf("decode error for %s: %w", symbol, err)
	}

	if len(yr.Chart.Result) == 0 {
		return 0, "", fmt.Errorf("no quote result for symbol %s", symbol)
	}

	meta := yr.Chart.Result[0].Meta
	price = meta.RegularMarketPrice
	currency = meta.Currency

	// Store in cache
	s.cacheMu.Lock()
	s.cache[symbol] = cachedPrice{price: price, currency: currency, fetchedAt: time.Now()}
	s.cacheMu.Unlock()

	return price, currency, nil
}

// GetForexRate returns how many `to` units equal 1 `from` unit.
// e.g. GetForexRate(ctx, "INR","EUR") → ~0.0091
// Fetches the inverse pair (EURINR=X) which Yahoo quotes natively, then inverts.
func (s *PriceService) GetForexRate(ctx context.Context, from, to string) (float64, error) {
	symbol := fmt.Sprintf("%s%s=X", strings.ToUpper(to), strings.ToUpper(from))
	price, _, err := s.GetPrice(ctx, symbol)
	if err != nil || price == 0 {
		return 0, err
	}
	return 1 / price, nil
}
