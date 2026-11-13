package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"go.opentelemetry.io/otel/attribute"
	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/logging"
)

// ProfileStatus is the outcome of a company profile lookup (DD-013 §2).
type ProfileStatus string

const (
	// ProfileFound: a catalogue sector or a fund type was recognised.
	ProfileFound ProfileStatus = "found"
	// ProfileMissing: Yahoo answered but gave no usable classification.
	ProfileMissing ProfileStatus = "missing"
	// ProfileUnavailable: Yahoo could not be reached or refused the lookup.
	ProfileUnavailable ProfileStatus = "unavailable"
)

// ErrInvalidSymbol rejects a symbol outside the accepted ticker alphabet.
var ErrInvalidSymbol = errors.New("invalid symbol")

// CompanyProfile is the normalised, provider-neutral lookup result. Sector is
// set only for a recognised company sector; funds never carry one.
type CompanyProfile struct {
	Symbol        string
	Status        ProfileStatus
	Sector        *domain.SectorKey
	Industry      string
	SuggestedType string // stock | etf | mutual_fund; "" when Yahoo gave no quote type
}

// ProfileFetcher abstracts CompanyProfileService so holding and controller
// tests stay offline. Provider failures are an unavailable profile, never an
// error; the only error is ErrInvalidSymbol.
type ProfileFetcher interface {
	LookupProfile(ctx context.Context, symbol string) (CompanyProfile, error)
}

const (
	profileLookupTimeout = 5 * time.Second
	profileBodyLimit     = 1 << 20
	crumbLimit           = 4 << 10
	industryLimit        = 120
	profileCacheLimit    = 1000
	foundProfileTTL      = 24 * time.Hour
	missingProfileTTL    = time.Hour
	unavailableTTL       = time.Minute
	minRateLimitPause    = time.Minute
	maxRateLimitPause    = 15 * time.Minute
	yahooUserAgent       = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

var profileSymbolPattern = regexp.MustCompile(`^[A-Za-z0-9.\-^=_]{1,64}$`)

// NormalizeProfileSymbol trims and upper-cases a ticker, rejecting control
// characters and URL delimiters (DD-013 §3).
func NormalizeProfileSymbol(symbol string) (string, error) {
	trimmed := strings.TrimSpace(symbol)
	if !profileSymbolPattern.MatchString(trimmed) {
		return "", ErrInvalidSymbol
	}
	return strings.ToUpper(trimmed), nil
}

type profileCacheEntry struct {
	profile   CompanyProfile
	expiresAt time.Time
}

// yahooSession is one cookie jar + crumb pair. A rejected session is dropped
// whole and rebuilt, never patched.
type yahooSession struct {
	client *http.Client
	crumb  string
}

// CompanyProfileService looks up a symbol's sector and quote type directly
// from Yahoo's quoteSummary endpoint (ADR-0004), behind a cookie/crumb
// session, an exact HTTPS host allowlist, response bounds, a TTL cache,
// in-flight deduplication and a 429 cooldown.
type CompanyProfileService struct {
	cookieURL  string
	crumbURL   string
	summaryURL string // quoteSummary prefix; the escaped symbol is appended
	hosts      map[string]bool
	transport  http.RoundTripper
	timeout    time.Duration // whole-lookup budget, session refresh included
	now        func() time.Time
	logger     *zap.Logger

	flights singleflight.Group

	cacheMu sync.Mutex
	cache   map[string]profileCacheEntry

	sessionMu sync.Mutex
	session   *yahooSession

	pauseMu     sync.Mutex
	pausedUntil time.Time
}

// NewCompanyProfileService targets the production Yahoo hosts. The transport
// ignores process proxy settings so requests go straight to Yahoo.
func NewCompanyProfileService(logger *zap.Logger) *CompanyProfileService {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	return newCompanyProfileService(
		"https://fc.yahoo.com/",
		"https://query1.finance.yahoo.com/v1/test/getcrumb",
		"https://query2.finance.yahoo.com/v10/finance/quoteSummary/",
		transport, logger)
}

// newCompanyProfileService is the test seam: tests point every URL at an
// httptest TLS server and pass its transport.
func newCompanyProfileService(cookieURL, crumbURL, summaryURL string, transport http.RoundTripper, logger *zap.Logger) *CompanyProfileService {
	hosts := map[string]bool{}
	for _, rawURL := range []string{cookieURL, crumbURL, summaryURL} {
		if parsed, err := url.Parse(rawURL); err == nil {
			hosts[parsed.Host] = true
		}
	}
	return &CompanyProfileService{
		cookieURL:  cookieURL,
		crumbURL:   crumbURL,
		summaryURL: summaryURL,
		hosts:      hosts,
		transport:  transport,
		timeout:    profileLookupTimeout,
		now:        time.Now,
		logger:     logger,
		cache:      make(map[string]profileCacheEntry),
	}
}

func (s *CompanyProfileService) log(ctx context.Context) *zap.Logger {
	return logging.FromContextOr(ctx, s.logger)
}

// LookupProfile returns the symbol's profile from cache, joining an in-flight
// lookup for the same symbol, or fetching it within a 5-second budget. The
// fetch outlives a cancelled caller so joined callers still get a result.
func (s *CompanyProfileService) LookupProfile(ctx context.Context, symbol string) (_ CompanyProfile, retErr error) {
	ctx, span := tracer.Start(ctx, "CompanyProfileService.LookupProfile")
	defer endSpan(span, &retErr)
	normalized, err := NormalizeProfileSymbol(symbol)
	if err != nil {
		return CompanyProfile{}, err
	}
	span.SetAttributes(attribute.String("symbol", normalized))
	if profile, ok := s.cached(normalized); ok {
		return profile, nil
	}
	results := s.flights.DoChan(normalized, func() (any, error) {
		fetchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), s.timeout)
		defer cancel()
		profile := s.fetch(fetchCtx, normalized)
		s.store(profile)
		return profile, nil
	})
	select {
	case result := <-results:
		profile := result.Val.(CompanyProfile)
		span.SetAttributes(attribute.String("lookup_status", string(profile.Status)))
		return profile, nil
	case <-ctx.Done():
		return unavailableProfile(normalized), nil
	}
}

func unavailableProfile(symbol string) CompanyProfile {
	return CompanyProfile{Symbol: symbol, Status: ProfileUnavailable}
}

func (s *CompanyProfileService) cached(symbol string) (CompanyProfile, bool) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	entry, ok := s.cache[symbol]
	if !ok || !s.now().Before(entry.expiresAt) {
		return CompanyProfile{}, false
	}
	return entry.profile, true
}

// store caches a result for its status's TTL. At the cap it drops expired
// entries first, then the entry closest to expiry.
func (s *CompanyProfileService) store(profile CompanyProfile) {
	ttl := unavailableTTL
	switch profile.Status {
	case ProfileFound:
		ttl = foundProfileTTL
	case ProfileMissing:
		ttl = missingProfileTTL
	}
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	now := s.now()
	if _, exists := s.cache[profile.Symbol]; !exists && len(s.cache) >= profileCacheLimit {
		for symbol, entry := range s.cache {
			if !now.Before(entry.expiresAt) {
				delete(s.cache, symbol)
			}
		}
		if len(s.cache) >= profileCacheLimit {
			oldest := ""
			for symbol, entry := range s.cache {
				if oldest == "" || entry.expiresAt.Before(s.cache[oldest].expiresAt) {
					oldest = symbol
				}
			}
			delete(s.cache, oldest)
		}
	}
	s.cache[profile.Symbol] = profileCacheEntry{profile: profile, expiresAt: now.Add(ttl)}
}

// errRateLimited and errSessionRejected steer fetch's retry/cooldown logic.
var (
	errRateLimited     = errors.New("yahoo rate limited")
	errSessionRejected = errors.New("yahoo session rejected")
)

// fetch runs one lookup: on a rejected session it rebuilds the session and
// retries once inside the same deadline; on 429 it pauses all lookups.
func (s *CompanyProfileService) fetch(ctx context.Context, symbol string) CompanyProfile {
	logger := s.log(ctx)
	if s.paused() {
		logger.Info("company profile lookup skipped", zap.String("symbol", symbol), zap.String("outcome", "rate_limit_pause"))
		return unavailableProfile(symbol)
	}
	var profile CompanyProfile
	var err error
	for range 2 {
		profile, err = s.fetchOnce(ctx, symbol)
		if !errors.Is(err, errSessionRejected) {
			break
		}
	}
	if err != nil {
		logger.Warn("company profile lookup failed", zap.String("symbol", symbol), zap.Error(err))
		return unavailableProfile(symbol)
	}
	logger.Info("company profile lookup", zap.String("symbol", symbol), zap.String("outcome", string(profile.Status)))
	return profile
}

func (s *CompanyProfileService) fetchOnce(ctx context.Context, symbol string) (CompanyProfile, error) {
	session, err := s.currentSession(ctx)
	if err != nil {
		return CompanyProfile{}, err
	}
	query := url.Values{"modules": {"assetProfile,quoteType"}, "crumb": {session.crumb}}
	endpoint := s.summaryURL + url.PathEscape(symbol) + "?" + query.Encode()
	resp, err := s.get(ctx, session.client, endpoint)
	if err != nil {
		return CompanyProfile{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return CompanyProfile{Symbol: symbol, Status: ProfileMissing}, nil
	case http.StatusUnauthorized, http.StatusForbidden:
		s.dropSession(session)
		return CompanyProfile{}, errSessionRejected
	case http.StatusTooManyRequests:
		s.pause(resp.Header.Get("Retry-After"))
		return CompanyProfile{}, errRateLimited
	default:
		return CompanyProfile{}, fmt.Errorf("quoteSummary status %d", resp.StatusCode)
	}
	body, err := readLimited(resp.Body, profileBodyLimit)
	if err != nil {
		return CompanyProfile{}, err
	}
	return parseQuoteSummary(symbol, body)
}

// quoteSummaryResp is the subset of Yahoo's quoteSummary response we use.
type quoteSummaryResp struct {
	QuoteSummary struct {
		Result []struct {
			AssetProfile *struct {
				Sector    string `json:"sector"`
				SectorKey string `json:"sectorKey"`
				Industry  string `json:"industry"`
			} `json:"assetProfile"`
			QuoteType *struct {
				QuoteType string `json:"quoteType"`
			} `json:"quoteType"`
		} `json:"result"`
	} `json:"quoteSummary"`
}

// yahooQuoteTypes maps Yahoo quote types onto holding types.
var yahooQuoteTypes = map[string]string{
	"EQUITY":     domain.HoldingTypeStock,
	"ETF":        domain.HoldingTypeETF,
	"MUTUALFUND": domain.HoldingTypeMutualFund,
}

// parseQuoteSummary classifies a quoteSummary body: a fund type is found with
// no sector; otherwise a catalogue sector is found and anything else missing.
func parseQuoteSummary(symbol string, body []byte) (CompanyProfile, error) {
	var decoded quoteSummaryResp
	if err := json.Unmarshal(body, &decoded); err != nil {
		return CompanyProfile{}, fmt.Errorf("decode quoteSummary: %w", err)
	}
	profile := CompanyProfile{Symbol: symbol, Status: ProfileMissing}
	if len(decoded.QuoteSummary.Result) == 0 {
		return profile, nil
	}
	result := decoded.QuoteSummary.Result[0]
	if result.QuoteType != nil {
		profile.SuggestedType = yahooQuoteTypes[strings.ToUpper(result.QuoteType.QuoteType)]
	}
	if profile.SuggestedType == domain.HoldingTypeETF || profile.SuggestedType == domain.HoldingTypeMutualFund {
		profile.Status = ProfileFound
		return profile, nil
	}
	if result.AssetProfile == nil {
		return profile, nil
	}
	profile.Industry = cleanIndustry(result.AssetProfile.Industry)
	if sector, ok := domain.SectorFromProvider(result.AssetProfile.SectorKey, result.AssetProfile.Sector); ok {
		profile.Sector = &sector
		profile.Status = ProfileFound
	}
	return profile, nil
}

// cleanIndustry drops control characters and caps provider text, which is
// only ever rendered as text.
func cleanIndustry(industry string) string {
	cleaned := []rune(strings.TrimSpace(strings.Map(func(char rune) rune {
		if unicode.IsControl(char) {
			return -1
		}
		return char
	}, industry)))
	if len(cleaned) > industryLimit {
		cleaned = cleaned[:industryLimit]
	}
	return string(cleaned)
}

// currentSession returns the live session, bootstrapping one under the
// session lock so concurrent lookups share a single refresh.
func (s *CompanyProfileService) currentSession(ctx context.Context) (*yahooSession, error) {
	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()
	if s.session != nil {
		return s.session, nil
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Transport: s.transport, Jar: jar, CheckRedirect: s.checkRedirect}
	// fc.yahoo.com answers an error status while still setting the cookie, so
	// its status is ignored; its body is never read.
	resp, err := s.get(ctx, client, s.cookieURL)
	if err != nil {
		return nil, err
	}
	_ = resp.Body.Close()
	resp, err = s.get(ctx, client, s.crumbURL)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusTooManyRequests:
		s.pause(resp.Header.Get("Retry-After"))
		return nil, errRateLimited
	default:
		return nil, fmt.Errorf("crumb status %d", resp.StatusCode)
	}
	body, err := readLimited(resp.Body, crumbLimit)
	if err != nil {
		return nil, err
	}
	crumb := strings.TrimSpace(string(body))
	if !validCrumb(crumb) {
		return nil, errors.New("crumb response is not a token")
	}
	s.session = &yahooSession{client: client, crumb: crumb}
	return s.session, nil
}

func validCrumb(crumb string) bool {
	if crumb == "" {
		return false
	}
	for _, char := range crumb {
		if char <= ' ' || char > '~' || char == '<' {
			return false
		}
	}
	return true
}

// dropSession discards session unless another lookup already replaced it.
func (s *CompanyProfileService) dropSession(session *yahooSession) {
	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()
	if s.session == session {
		s.session = nil
	}
}

// get issues a GET after checking the URL against the host allowlist.
func (s *CompanyProfileService) get(ctx context.Context, client *http.Client, rawURL string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	if err := s.checkURL(req.URL); err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", yahooUserAgent)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		// The error text can carry the URL (and with it the crumb), so only
		// the operation is reported.
		return nil, fmt.Errorf("request to %s failed", req.URL.Host)
	}
	return resp, nil
}

func (s *CompanyProfileService) checkURL(target *url.URL) error {
	if target.Scheme != "https" || !s.hosts[target.Host] {
		return fmt.Errorf("host %q is not allowed", target.Host)
	}
	return nil
}

func (s *CompanyProfileService) checkRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 5 {
		return errors.New("too many redirects")
	}
	return s.checkURL(req.URL)
}

func (s *CompanyProfileService) paused() bool {
	s.pauseMu.Lock()
	defer s.pauseMu.Unlock()
	return s.now().Before(s.pausedUntil)
}

// pause stops outbound lookups for at least a minute, honouring a longer
// Retry-After (in seconds) up to 15 minutes.
func (s *CompanyProfileService) pause(retryAfter string) {
	pause := minRateLimitPause
	if seconds, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil {
		pause = min(max(time.Duration(seconds)*time.Second, minRateLimitPause), maxRateLimitPause)
	}
	s.pauseMu.Lock()
	defer s.pauseMu.Unlock()
	if until := s.now().Add(pause); until.After(s.pausedUntil) {
		s.pausedUntil = until
	}
}

// readLimited reads at most limit bytes and fails when the body is larger.
func readLimited(body io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("response exceeds %d bytes", limit)
	}
	return data, nil
}
