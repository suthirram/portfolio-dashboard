package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"portfolio-dashboard/internal/domain"
)

// fakeYahoo serves the cookie → crumb → quoteSummary exchange. Each session
// gets a numbered cookie and crumb; quoteSummary refuses a request whose
// crumb does not match its cookie, so a passing lookup proves the exchange.
type fakeYahoo struct {
	mu             sync.Mutex
	sessions       int
	crumbCalls     int
	summaryCalls   int
	summaryStatus  []int // consumed per quoteSummary call; empty means 200
	crumbStatus    int
	retryAfter     string
	body           string
	delay          time.Duration
	redirectTarget string
}

func (f *fakeYahoo) handler(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case r.URL.Path == "/cookie":
		f.sessions++
		http.SetCookie(w, &http.Cookie{Name: "A3", Value: fmt.Sprintf("session-%d", f.sessions), Path: "/"}) //nolint:gosec // fake provider cookie
		w.WriteHeader(http.StatusNotFound)
	case r.URL.Path == "/crumb":
		f.crumbCalls++
		if f.crumbStatus != 0 {
			w.Header().Set("Retry-After", f.retryAfter)
			w.WriteHeader(f.crumbStatus)
			return
		}
		cookie, err := r.Cookie("A3")
		if err != nil {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_, _ = w.Write([]byte(strings.Replace(cookie.Value, "session", "crumb", 1))) //nolint:gosec // fake provider crumb, plain text
	case strings.HasPrefix(r.URL.Path, "/summary/"):
		f.summaryCalls++
		if f.redirectTarget != "" {
			http.Redirect(w, r, f.redirectTarget, http.StatusFound)
			return
		}
		cookie, err := r.Cookie("A3")
		if err != nil || r.URL.Query().Get("crumb") != strings.Replace(cookie.Value, "session", "crumb", 1) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Query().Get("modules") != "assetProfile,quoteType" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if f.delay > 0 {
			f.mu.Unlock()
			time.Sleep(f.delay)
			f.mu.Lock()
		}
		status := http.StatusOK
		if len(f.summaryStatus) > 0 {
			status, f.summaryStatus = f.summaryStatus[0], f.summaryStatus[1:]
		}
		if status != http.StatusOK {
			w.Header().Set("Retry-After", f.retryAfter)
			w.WriteHeader(status)
			return
		}
		_, _ = w.Write([]byte(f.body))
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (f *fakeYahoo) counts() (crumbs, summaries int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.crumbCalls, f.summaryCalls
}

// fakeClock is a settable clock shared with the service under test.
type fakeClock struct {
	mu      sync.Mutex
	current time.Time
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.current
}

func (c *fakeClock) advance(step time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.current = c.current.Add(step)
}

func newFakeProfileService(t *testing.T, fake *fakeYahoo) (*CompanyProfileService, *fakeClock) {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(fake.handler))
	t.Cleanup(server.Close)
	service := newCompanyProfileService(server.URL+"/cookie", server.URL+"/crumb", server.URL+"/summary/", server.Client().Transport, nil)
	clock := &fakeClock{current: time.Date(2026, 11, 13, 9, 0, 0, 0, time.UTC)}
	service.now = clock.now
	return service, clock
}

func summaryBody(quoteType, sector, sectorKey, industry string) string {
	return fmt.Sprintf(`{"quoteSummary":{"result":[{"assetProfile":{"sector":%q,"sectorKey":%q,"industry":%q},"quoteType":{"quoteType":%q}}],"error":null}}`,
		sector, sectorKey, industry, quoteType)
}

func TestLookupProfile_ClassifiesQuoteSummary(t *testing.T) {
	testCases := []struct {
		name   string
		body   string
		status int
		want   CompanyProfile
	}{
		{
			name: "recognised equity sector",
			body: summaryBody("EQUITY", "Technology", "technology", "Information Technology Services"),
			want: CompanyProfile{Status: ProfileFound, Sector: new(domain.SectorTechnology), Industry: "Information Technology Services", SuggestedType: "stock"},
		},
		{
			name: "sector key only",
			body: summaryBody("EQUITY", "", "financial-services", "Banks - Regional"),
			want: CompanyProfile{Status: ProfileFound, Sector: new(domain.SectorFinancialServices), Industry: "Banks - Regional", SuggestedType: "stock"},
		},
		{
			name: "missing sector",
			body: summaryBody("EQUITY", "", "", ""),
			want: CompanyProfile{Status: ProfileMissing, SuggestedType: "stock"},
		},
		{
			name: "unsupported taxonomy needs review",
			body: summaryBody("EQUITY", "Conglomerates", "conglomerates", "Conglomerates"),
			want: CompanyProfile{Status: ProfileMissing, Industry: "Conglomerates", SuggestedType: "stock"},
		},
		{
			name: "ETF suggests a fund with no sector",
			body: summaryBody("ETF", "Technology", "technology", ""),
			want: CompanyProfile{Status: ProfileFound, SuggestedType: "etf"},
		},
		{
			name: "mutual fund suggestion",
			body: summaryBody("MUTUALFUND", "", "", ""),
			want: CompanyProfile{Status: ProfileFound, SuggestedType: "mutual_fund"},
		},
		{
			name: "sector without quote type",
			body: `{"quoteSummary":{"result":[{"assetProfile":{"sector":"Energy"}}]}}`,
			want: CompanyProfile{Status: ProfileFound, Sector: new(domain.SectorEnergy)},
		},
		{
			name: "empty result",
			body: `{"quoteSummary":{"result":[],"error":null}}`,
			want: CompanyProfile{Status: ProfileMissing},
		},
		{
			name:   "unknown symbol",
			status: http.StatusNotFound,
			want:   CompanyProfile{Status: ProfileMissing},
		},
		{
			name: "malformed JSON",
			body: `{"quoteSummary":`,
			want: CompanyProfile{Status: ProfileUnavailable},
		},
		{
			name:   "server error",
			status: http.StatusInternalServerError,
			want:   CompanyProfile{Status: ProfileUnavailable},
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fake := &fakeYahoo{body: testCase.body}
			if testCase.status != 0 {
				fake.summaryStatus = []int{testCase.status}
			}
			service, _ := newFakeProfileService(t, fake)

			got, err := service.LookupProfile(context.Background(), " tcs.ns ")
			if err != nil {
				t.Fatalf("LookupProfile: %v", err)
			}
			testCase.want.Symbol = "TCS.NS"
			assertProfile(t, got, testCase.want)
		})
	}
}

func assertProfile(t *testing.T, got, want CompanyProfile) {
	t.Helper()
	if got.Symbol != want.Symbol || got.Status != want.Status || got.Industry != want.Industry || got.SuggestedType != want.SuggestedType {
		t.Errorf("profile = %+v, want %+v", got, want)
	}
	if (got.Sector == nil) != (want.Sector == nil) || (got.Sector != nil && *got.Sector != *want.Sector) {
		t.Errorf("sector = %v, want %v", got.Sector, want.Sector)
	}
}

func TestLookupProfile_RejectsInvalidSymbolWithoutRequest(t *testing.T) {
	fake := &fakeYahoo{}
	service, _ := newFakeProfileService(t, fake)
	for _, symbol := range []string{"", "   ", "TCS NS", "A/B", "A?B", "A#B", "A%2F", "A\nB", strings.Repeat("A", 65)} {
		if _, err := service.LookupProfile(context.Background(), symbol); !errors.Is(err, ErrInvalidSymbol) {
			t.Errorf("LookupProfile(%q) err = %v, want ErrInvalidSymbol", symbol, err)
		}
	}
	if crumbs, summaries := fake.counts(); crumbs+summaries != 0 {
		t.Errorf("provider called %d times for invalid symbols", crumbs+summaries)
	}
}

func TestLookupProfile_AcceptsTickerAlphabet(t *testing.T) {
	service, _ := newFakeProfileService(t, &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", "")})
	for _, symbol := range []string{"^NSEI", "EURINR=X", "BRK-B", "M_M.NS", strings.Repeat("A", 64)} {
		got, err := service.LookupProfile(context.Background(), symbol)
		if err != nil || got.Status != ProfileFound {
			t.Errorf("LookupProfile(%q) = %+v, %v; want found", symbol, got, err)
		}
	}
}

func TestLookupProfile_OversizedBodyIsUnavailable(t *testing.T) {
	padding := strings.Repeat(" ", profileBodyLimit)
	service, _ := newFakeProfileService(t, &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", "") + padding})

	got, _ := service.LookupProfile(context.Background(), "ONGC.NS")
	if got.Status != ProfileUnavailable {
		t.Errorf("status = %q, want unavailable", got.Status)
	}
}

func TestLookupProfile_TimeoutIsUnavailable(t *testing.T) {
	service, _ := newFakeProfileService(t, &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", ""), delay: 300 * time.Millisecond})
	service.timeout = 50 * time.Millisecond

	started := time.Now()
	got, _ := service.LookupProfile(context.Background(), "ONGC.NS")
	if got.Status != ProfileUnavailable {
		t.Errorf("status = %q, want unavailable", got.Status)
	}
	if elapsed := time.Since(started); elapsed > 250*time.Millisecond {
		t.Errorf("lookup took %v, want it bounded by the timeout", elapsed)
	}
}

func TestLookupProfile_CallerCancellationIsUnavailable(t *testing.T) {
	service, _ := newFakeProfileService(t, &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", ""), delay: 300 * time.Millisecond})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()

	got, err := service.LookupProfile(ctx, "ONGC.NS")
	if err != nil || got.Status != ProfileUnavailable {
		t.Errorf("LookupProfile = %+v, %v; want unavailable", got, err)
	}
}

func TestLookupProfile_RefreshesRejectedSessionOnce(t *testing.T) {
	t.Run("second session succeeds", func(t *testing.T) {
		fake := &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", ""), summaryStatus: []int{http.StatusUnauthorized}}
		service, _ := newFakeProfileService(t, fake)

		got, _ := service.LookupProfile(context.Background(), "ONGC.NS")
		if got.Status != ProfileFound {
			t.Errorf("status = %q, want found", got.Status)
		}
		if crumbs, summaries := fake.counts(); crumbs != 2 || summaries != 2 {
			t.Errorf("crumb/summary calls = %d/%d, want 2/2", crumbs, summaries)
		}
	})
	t.Run("retry is bounded", func(t *testing.T) {
		fake := &fakeYahoo{summaryStatus: []int{http.StatusForbidden, http.StatusForbidden, http.StatusForbidden}}
		service, _ := newFakeProfileService(t, fake)

		got, _ := service.LookupProfile(context.Background(), "ONGC.NS")
		if got.Status != ProfileUnavailable {
			t.Errorf("status = %q, want unavailable", got.Status)
		}
		if _, summaries := fake.counts(); summaries != 2 {
			t.Errorf("summary calls = %d, want 2", summaries)
		}
	})
}

func TestLookupProfile_RateLimitPausesAllLookups(t *testing.T) {
	fake := &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", ""), summaryStatus: []int{http.StatusTooManyRequests}, retryAfter: "120"}
	service, clock := newFakeProfileService(t, fake)

	if got, _ := service.LookupProfile(context.Background(), "ONGC.NS"); got.Status != ProfileUnavailable {
		t.Fatalf("status = %q, want unavailable", got.Status)
	}
	clock.advance(61 * time.Second)
	if got, _ := service.LookupProfile(context.Background(), "TCS.NS"); got.Status != ProfileUnavailable {
		t.Errorf("status during Retry-After = %q, want unavailable", got.Status)
	}
	if _, summaries := fake.counts(); summaries != 1 {
		t.Errorf("summary calls during pause = %d, want 1 (no retry, no new lookup)", summaries)
	}
	clock.advance(60 * time.Second)
	if got, _ := service.LookupProfile(context.Background(), "INFY.NS"); got.Status != ProfileFound {
		t.Errorf("status after pause = %q, want found", got.Status)
	}
}

func TestLookupProfile_RateLimitPauseIsAtLeastAMinute(t *testing.T) {
	fake := &fakeYahoo{crumbStatus: http.StatusTooManyRequests, retryAfter: "5"}
	service, clock := newFakeProfileService(t, fake)

	_, _ = service.LookupProfile(context.Background(), "ONGC.NS")
	clock.advance(30 * time.Second)
	_, _ = service.LookupProfile(context.Background(), "TCS.NS")
	if crumbs, _ := fake.counts(); crumbs != 1 {
		t.Errorf("crumb calls = %d, want 1 (crumb 429 pauses lookups)", crumbs)
	}
}

func TestLookupProfile_RejectsRedirectToAnotherHost(t *testing.T) {
	otherHits := 0
	other := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		otherHits++
		_, _ = w.Write([]byte(summaryBody("EQUITY", "Energy", "energy", "")))
	}))
	defer other.Close()
	service, _ := newFakeProfileService(t, &fakeYahoo{redirectTarget: other.URL + "/summary/ONGC.NS"})

	got, _ := service.LookupProfile(context.Background(), "ONGC.NS")
	if got.Status != ProfileUnavailable {
		t.Errorf("status = %q, want unavailable", got.Status)
	}
	if otherHits != 0 {
		t.Errorf("redirect followed to another host %d times", otherHits)
	}
}

func TestLookupProfile_RejectsPlainHTTP(t *testing.T) {
	fake := &fakeYahoo{}
	server := httptest.NewServer(http.HandlerFunc(fake.handler))
	defer server.Close()
	service := newCompanyProfileService(server.URL+"/cookie", server.URL+"/crumb", server.URL+"/summary/", server.Client().Transport, nil)

	got, _ := service.LookupProfile(context.Background(), "ONGC.NS")
	if got.Status != ProfileUnavailable {
		t.Errorf("status = %q, want unavailable", got.Status)
	}
	if crumbs, summaries := fake.counts(); crumbs+summaries != 0 || fake.sessions != 0 {
		t.Error("plain-HTTP provider was contacted")
	}
}

func TestLookupProfile_CachesPerStatusTTL(t *testing.T) {
	t.Run("found is cached for a day", func(t *testing.T) {
		fake := &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", "")}
		service, clock := newFakeProfileService(t, fake)

		_, _ = service.LookupProfile(context.Background(), "ONGC.NS")
		clock.advance(23 * time.Hour)
		_, _ = service.LookupProfile(context.Background(), "ongc.ns")
		if _, summaries := fake.counts(); summaries != 1 {
			t.Errorf("summary calls within TTL = %d, want 1", summaries)
		}
		clock.advance(2 * time.Hour)
		_, _ = service.LookupProfile(context.Background(), "ONGC.NS")
		if _, summaries := fake.counts(); summaries != 2 {
			t.Errorf("summary calls after TTL = %d, want 2", summaries)
		}
	})
	t.Run("unavailable is cached for a minute", func(t *testing.T) {
		fake := &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", ""), summaryStatus: []int{http.StatusInternalServerError}}
		service, clock := newFakeProfileService(t, fake)

		_, _ = service.LookupProfile(context.Background(), "ONGC.NS")
		if got, _ := service.LookupProfile(context.Background(), "ONGC.NS"); got.Status != ProfileUnavailable {
			t.Errorf("cached status = %q, want unavailable", got.Status)
		}
		clock.advance(61 * time.Second)
		if got, _ := service.LookupProfile(context.Background(), "ONGC.NS"); got.Status != ProfileFound {
			t.Errorf("status after TTL = %q, want found", got.Status)
		}
	})
}

func TestProfileCache_EvictsAtCap(t *testing.T) {
	service, clock := newFakeProfileService(t, &fakeYahoo{})
	for index := range profileCacheLimit {
		service.store(CompanyProfile{Symbol: fmt.Sprintf("S%d", index), Status: ProfileFound})
		clock.advance(time.Second)
	}
	service.store(CompanyProfile{Symbol: "NEWEST", Status: ProfileFound})

	if len(service.cache) != profileCacheLimit {
		t.Errorf("cache size = %d, want %d", len(service.cache), profileCacheLimit)
	}
	if _, ok := service.cache["S0"]; ok {
		t.Error("entry closest to expiry was not evicted")
	}
	if _, ok := service.cache["NEWEST"]; !ok {
		t.Error("newest entry missing")
	}
}

func TestLookupProfile_DeduplicatesConcurrentLookups(t *testing.T) {
	fake := &fakeYahoo{body: summaryBody("EQUITY", "Energy", "energy", ""), delay: 100 * time.Millisecond}
	service, _ := newFakeProfileService(t, fake)

	var wait sync.WaitGroup
	statuses := make([]ProfileStatus, 10)
	for index := range statuses {
		wait.Go(func() {
			profile, _ := service.LookupProfile(context.Background(), "ONGC.NS")
			statuses[index] = profile.Status
		})
	}
	wait.Wait()

	for index, status := range statuses {
		if status != ProfileFound {
			t.Errorf("lookup %d status = %q, want found", index, status)
		}
	}
	if crumbs, summaries := fake.counts(); crumbs != 1 || summaries != 1 {
		t.Errorf("crumb/summary calls = %d/%d, want 1/1", crumbs, summaries)
	}
}
