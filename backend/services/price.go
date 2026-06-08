package services

import (
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

type cachedPrice struct {
	price     float64
	currency  string
	fetchedAt time.Time
}

// PriceService fetches live quotes from Google Finance
type PriceService struct {
	client   *http.Client
	cache    map[string]cachedPrice
	cacheMu  sync.RWMutex
	cacheTTL time.Duration
}

func NewPriceService() *PriceService {
	return &PriceService{
		client:   &http.Client{Timeout: 12 * time.Second},
		cache:    make(map[string]cachedPrice),
		cacheTTL: 5 * time.Minute,
	}
}

var (
	// Google Finance embeds the last price as a data attribute
	reLastPrice = regexp.MustCompile(`data-last-price="([\d.]+)"`)
	// Fallback: price in the main quote div
	reQuoteDiv = regexp.MustCompile(`class="YMlKec fxKbKc"[^>]*>([\d,\.]+)<`)
)

// convertSymbol maps Yahoo Finance symbol format to Google Finance ticker + exchange.
// Yahoo: TCS.NS, RELIANCE.BO, AAPL, INREUR=X
// Google: NSE:TCS, BOM:RELIANCE, NASDAQ:AAPL, INR-EUR
func convertSymbol(symbol string) (ticker, exchange, currency string) {
	switch {
	case strings.HasSuffix(symbol, ".NS"):
		return strings.TrimSuffix(symbol, ".NS"), "NSE", "INR"
	case strings.HasSuffix(symbol, ".BO"):
		return strings.TrimSuffix(symbol, ".BO"), "BOM", "INR"
	default:
		return symbol, "", "USD"
	}
}

func extractPrice(body string) (float64, error) {
	if m := reLastPrice.FindStringSubmatch(body); len(m) == 2 {
		return strconv.ParseFloat(m[1], 64)
	}
	if m := reQuoteDiv.FindStringSubmatch(body); len(m) == 2 {
		clean := strings.ReplaceAll(m[1], ",", "")
		return strconv.ParseFloat(clean, 64)
	}
	return 0, fmt.Errorf("price not found in page")
}

func (s *PriceService) fetchPage(url string) (string, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("google finance returned %d", resp.StatusCode)
	}

	b, err := io.ReadAll(resp.Body)
	return string(b), err
}

// GetPrice fetches the current price for a symbol.
// Accepts Yahoo Finance format (TCS.NS, RELIANCE.BO, AAPL) for backwards compatibility.
func (s *PriceService) GetPrice(symbol string) (price float64, currency string, err error) {
	s.cacheMu.RLock()
	if c, ok := s.cache[symbol]; ok && time.Since(c.fetchedAt) < s.cacheTTL {
		s.cacheMu.RUnlock()
		return c.price, c.currency, nil
	}
	s.cacheMu.RUnlock()

	ticker, exchange, currency := convertSymbol(symbol)

	var url string
	if exchange != "" {
		url = fmt.Sprintf("https://www.google.com/finance/quote/%s:%s", ticker, exchange)
	} else {
		url = fmt.Sprintf("https://www.google.com/finance/quote/%s", ticker)
	}

	body, err := s.fetchPage(url)
	if err != nil {
		return 0, "", fmt.Errorf("fetch error for %s: %w", symbol, err)
	}

	price, err = extractPrice(body)
	if err != nil {
		return 0, "", fmt.Errorf("parse error for %s: %w", symbol, err)
	}

	s.cacheMu.Lock()
	s.cache[symbol] = cachedPrice{price: price, currency: currency, fetchedAt: time.Now()}
	s.cacheMu.Unlock()

	return price, currency, nil
}

// GetForexRate returns how many `to` units equal 1 `from` unit.
// e.g. GetForexRate("INR","EUR") → ~0.011
func (s *PriceService) GetForexRate(from, to string) (float64, error) {
	from = strings.ToUpper(from)
	to = strings.ToUpper(to)
	cacheKey := from + to + "=X"

	s.cacheMu.RLock()
	if c, ok := s.cache[cacheKey]; ok && time.Since(c.fetchedAt) < s.cacheTTL {
		s.cacheMu.RUnlock()
		return c.price, nil
	}
	s.cacheMu.RUnlock()

	url := fmt.Sprintf("https://www.google.com/finance/quote/%s-%s", from, to)
	body, err := s.fetchPage(url)
	if err != nil {
		return 0, fmt.Errorf("forex fetch error %s→%s: %w", from, to, err)
	}

	rate, err := extractPrice(body)
	if err != nil {
		return 0, fmt.Errorf("forex parse error %s→%s: %w", from, to, err)
	}

	s.cacheMu.Lock()
	s.cache[cacheKey] = cachedPrice{price: rate, fetchedAt: time.Now()}
	s.cacheMu.Unlock()

	return rate, nil
}

// GetMultiplePrices fetches prices for a slice of symbols concurrently.
func (s *PriceService) GetMultiplePrices(symbols []string) map[string]float64 {
	type result struct {
		symbol string
		price  float64
	}

	ch := make(chan result, len(symbols))
	sem := make(chan struct{}, 5)

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
