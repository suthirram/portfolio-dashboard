package services

import (
	"encoding/json"
	"fmt"
	"net/http"
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
	client    *http.Client
	cache     map[string]cachedPrice
	cacheMu   sync.RWMutex
	cacheTTL  time.Duration
}

func NewPriceService() *PriceService {
	return &PriceService{
		client:   &http.Client{Timeout: 12 * time.Second},
		cache:    make(map[string]cachedPrice),
		cacheTTL: 5 * time.Minute,
	}
}

// Yahoo Finance v7 quote response shape
type yahooQuoteResp struct {
	QuoteResponse struct {
		Result []struct {
			Symbol             string  `json:"symbol"`
			RegularMarketPrice float64 `json:"regularMarketPrice"`
			Currency           string  `json:"currency"`
		} `json:"result"`
		Error interface{} `json:"error"`
	} `json:"quoteResponse"`
}

// GetPrice fetches the current price for a Yahoo Finance symbol.
// For NSE stocks append ".NS" (e.g. "TCS.NS"), for BSE append ".BO".
// US symbols are plain (e.g. "AAPL").
func (s *PriceService) GetPrice(symbol string) (price float64, currency string, err error) {
	// Check cache first
	s.cacheMu.RLock()
	if c, ok := s.cache[symbol]; ok && time.Since(c.fetchedAt) < s.cacheTTL {
		s.cacheMu.RUnlock()
		return c.price, c.currency, nil
	}
	s.cacheMu.RUnlock()

	url := fmt.Sprintf(
		"https://query1.finance.yahoo.com/v7/finance/quote?symbols=%s&fields=regularMarketPrice,currency",
		symbol,
	)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return 0, "", err
	}
	// Yahoo requires a realistic User-Agent
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, "", fmt.Errorf("fetch error for %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, "", fmt.Errorf("yahoo returned %d for symbol %s", resp.StatusCode, symbol)
	}

	var yr yahooQuoteResp
	if err := json.NewDecoder(resp.Body).Decode(&yr); err != nil {
		return 0, "", fmt.Errorf("decode error for %s: %w", symbol, err)
	}

	if len(yr.QuoteResponse.Result) == 0 {
		return 0, "", fmt.Errorf("no quote result for symbol %s", symbol)
	}

	r := yr.QuoteResponse.Result[0]
	price = r.RegularMarketPrice
	currency = r.Currency

	// Store in cache
	s.cacheMu.Lock()
	s.cache[symbol] = cachedPrice{price: price, currency: currency, fetchedAt: time.Now()}
	s.cacheMu.Unlock()

	return price, currency, nil
}

// GetForexRate returns how many `to` units equal 1 `from` unit.
// e.g. GetForexRate("INR","EUR") → ~0.011
func (s *PriceService) GetForexRate(from, to string) (float64, error) {
	symbol := fmt.Sprintf("%s%s=X", strings.ToUpper(from), strings.ToUpper(to))
	price, _, err := s.GetPrice(symbol)
	return price, err
}

// GetMultiplePrices fetches prices for a slice of symbols concurrently.
// Returns a map of symbol → price; symbols that error are omitted.
func (s *PriceService) GetMultiplePrices(symbols []string) map[string]float64 {
	type result struct {
		symbol string
		price  float64
	}

	ch := make(chan result, len(symbols))
	sem := make(chan struct{}, 5) // max 5 concurrent requests

	for _, sym := range symbols {
		go func(sym string) {
			sem <- struct{}{}
			defer func() { <-sem }()
			p, _, err := s.GetPrice(sym)
			if err == nil {
				ch <- result{sym, p}
			} else {
				ch <- result{sym, 0}
			}
		}(sym)
	}

	out := make(map[string]float64, len(symbols))
	for range symbols {
		r := <-ch
		if r.price > 0 {
			out[r.symbol] = r.price
		}
	}
	return out
}
