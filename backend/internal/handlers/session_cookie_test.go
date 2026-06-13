package handlers

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

func newCookieCtx(t *testing.T, scheme string) (echo.Context, *httptest.ResponseRecorder) {
	t.Helper()
	url := scheme + "://example.com/path"
	req := httptest.NewRequest(http.MethodGet, url, nil)
	if scheme == "https" {
		// Echo derives Scheme() from req.TLS != nil.
		req.TLS = &tls.ConnectionState{}
	}
	rec := httptest.NewRecorder()
	e := echo.New()
	return e.NewContext(req, rec), rec
}

func TestSetSessionCookieSecureModeIgnoresRequestScheme(t *testing.T) {
	// Plain-HTTP request, but config says Secure → cookie must be Secure.
	c, rec := newCookieCtx(t, "http")
	SetSessionCookie(c, "abc", time.Now().Add(time.Hour), true)

	got := rec.Header().Get("Set-Cookie")
	if !strings.Contains(got, "Secure") {
		t.Errorf("Set-Cookie missing Secure: %q", got)
	}
	if !strings.Contains(got, "SameSite=None") {
		t.Errorf("Set-Cookie missing SameSite=None: %q", got)
	}
}

func TestSetSessionCookieInsecureModeIgnoresRequestScheme(t *testing.T) {
	// HTTPS request, but config says insecure → cookie must NOT be Secure
	// and falls back to SameSite=Lax.
	c, rec := newCookieCtx(t, "https")
	SetSessionCookie(c, "abc", time.Now().Add(time.Hour), false)

	got := rec.Header().Get("Set-Cookie")
	if strings.Contains(got, "Secure") {
		t.Errorf("Set-Cookie unexpectedly Secure: %q", got)
	}
	if !strings.Contains(got, "SameSite=Lax") {
		t.Errorf("Set-Cookie missing SameSite=Lax: %q", got)
	}
}

func TestClearSessionCookieMirrorsSecureFlag(t *testing.T) {
	c, rec := newCookieCtx(t, "http")
	ClearSessionCookie(c, true)
	got := rec.Header().Get("Set-Cookie")
	if !strings.Contains(got, "Secure") || !strings.Contains(got, "SameSite=None") {
		t.Errorf("clear (secure) Set-Cookie = %q, want Secure + SameSite=None", got)
	}

	c, rec = newCookieCtx(t, "https")
	ClearSessionCookie(c, false)
	got = rec.Header().Get("Set-Cookie")
	if strings.Contains(got, "Secure") || !strings.Contains(got, "SameSite=Lax") {
		t.Errorf("clear (insecure) Set-Cookie = %q, want no Secure + SameSite=Lax", got)
	}
}
