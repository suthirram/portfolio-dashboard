package httpserver

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

// TestRateLimitMiddleware_BlocksAfterBurst exercises the per-IP limiter:
// the burst equals rpm, so the (rpm+1)-th request from the same IP must 429.
func TestRateLimitMiddleware_BlocksAfterBurst(t *testing.T) {
	const rpm = 3

	e := echo.New()
	e.HideBanner = true
	e.Use(rateLimitMiddleware(rpm, nil))
	e.GET("/x", func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	})

	hit := func() int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = "203.0.113.1:1234"
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec.Code
	}

	for i := range rpm {
		if got := hit(); got != http.StatusOK {
			t.Fatalf("request %d: status = %d, want 200", i+1, got)
		}
	}
	if got := hit(); got != http.StatusTooManyRequests {
		t.Fatalf("request %d (post-burst): status = %d, want 429", rpm+1, got)
	}
}

func TestRateLimitMiddleware_SkipperBypassesLimit(t *testing.T) {
	const rpm = 1

	e := echo.New()
	e.HideBanner = true
	e.Use(rateLimitMiddleware(rpm, func(c echo.Context) bool {
		return strings.HasPrefix(c.Request().URL.Path, "/skip/")
	}))
	e.GET("/skip/me", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })
	e.GET("/count/me", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })

	hit := func(path string) int {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.RemoteAddr = "203.0.113.2:1234"
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec.Code
	}

	for i := range 5 {
		if got := hit("/skip/me"); got != http.StatusOK {
			t.Fatalf("/skip/me request %d: status = %d, want 200", i+1, got)
		}
	}

	if got := hit("/count/me"); got != http.StatusOK {
		t.Fatalf("/count/me first hit: status = %d, want 200", got)
	}
	if got := hit("/count/me"); got != http.StatusTooManyRequests {
		t.Fatalf("/count/me second hit: status = %d, want 429", got)
	}
}

func TestRateLimitMiddleware_DistinctIPsTrackedSeparately(t *testing.T) {
	const rpm = 1

	e := echo.New()
	e.HideBanner = true
	e.Use(rateLimitMiddleware(rpm, nil))
	e.GET("/x", func(c echo.Context) error { return c.String(http.StatusOK, "ok") })

	hit := func(ip string) int {
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = ip + ":1234"
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec.Code
	}

	if got := hit("203.0.113.10"); got != http.StatusOK {
		t.Fatalf("IP A first hit: status = %d, want 200", got)
	}
	if got := hit("203.0.113.11"); got != http.StatusOK {
		t.Fatalf("IP B first hit: status = %d, want 200", got)
	}
	if got := hit("203.0.113.10"); got != http.StatusTooManyRequests {
		t.Fatalf("IP A second hit: status = %d, want 429", got)
	}
}
