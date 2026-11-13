package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func TestProfileRequestKeepsSymbolAndQueryOutOfAuthority(t *testing.T) {
	t.Parallel()
	type observedRequest struct {
		host, path, escapedPath, crumb, accept string
	}
	requests := make(chan observedRequest, 1)
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests <- observedRequest{host: request.Host, path: request.URL.Path, escapedPath: request.URL.EscapedPath(),
			crumb: request.URL.Query().Get("crumb"), accept: request.Header.Get("Accept")}
		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	service := newCompanyProfileService(server.URL+"/cookie", server.URL+"/crumb", server.URL+"/summary/", server.Client().Transport, nil)
	// URL-like token text must remain an encoded query value, never a destination.
	crumb := "https://127.0.0.1:1/?next=//example.invalid/#fragment"
	response, err := service.get(context.Background(), server.Client(), service.summaryURL, " ^nsei ", url.Values{"crumb": {crumb}}, "application/json")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	_ = response.Body.Close()
	got := <-requests
	if got.host != strings.TrimPrefix(server.URL, "https://") || got.path != "/summary/^NSEI" || got.escapedPath != "/summary/%5ENSEI" || got.crumb != crumb || got.accept != "application/json" {
		t.Errorf("request = %+v; want fixed test authority, encoded ticker path, intact query value and JSON Accept", got)
	}
}

func TestProfileRequestRejectsUnsafeTargetsBeforeSending(t *testing.T) {
	t.Parallel()
	var hits atomic.Int32
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		writer.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	service := newCompanyProfileService(server.URL+"/cookie", server.URL+"/crumb", server.URL+"/summary/", server.Client().Transport, nil)
	credentialURL, err := url.Parse(service.summaryURL)
	if err != nil {
		t.Fatal(err)
	}
	credentialURL.User = url.UserPassword("fixture-user", "fixture-password")
	for _, testCase := range []struct{ name, endpoint, symbol string }{
		{"HTTP", strings.Replace(service.summaryURL, "https:", "http:", 1), "TCS.NS"},
		{"metadata address", "https://169.254.169.254/", "TCS.NS"},
		{"credentials on allowed host", credentialURL.String(), "TCS.NS"},
		{"dot path", service.summaryURL, "."},
		{"parent path", service.summaryURL, ".."},
		{"absolute symbol", service.summaryURL, "https://example.invalid/"},
		{"network-path symbol", service.summaryURL, "//example.invalid/"},
		{"escaped separator", service.summaryURL, "%2F%2Fexample.invalid"},
		{"query injection", service.summaryURL, "TCS.NS?url=https://example.invalid"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response, err := service.get(context.Background(), server.Client(), testCase.endpoint, testCase.symbol, nil, "application/json")
			if response != nil {
				_ = response.Body.Close()
			}
			if err == nil {
				t.Error("unsafe request accepted")
			}
		})
	}
	if got := hits.Load(); got != 0 {
		t.Errorf("sent %d unsafe requests, want none", got)
	}
}

func TestProfileRedirectRejectsCredentialsOnAllowedHost(t *testing.T) {
	t.Parallel()
	var hits atomic.Int32
	server := httptest.NewUnstartedServer(nil)
	server.Config.Handler = http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		hits.Add(1)
		http.Redirect(writer, request, "https://fixture-user:fixture-password@"+strings.TrimPrefix(server.URL, "https://")+"/redirected", http.StatusFound)
	})
	server.StartTLS()
	defer server.Close()
	service := newCompanyProfileService(server.URL+"/cookie", server.URL+"/crumb", server.URL+"/summary/", server.Client().Transport, nil)
	client := server.Client()
	client.CheckRedirect = service.checkRedirect
	response, err := service.get(context.Background(), client, service.cookieURL, "", nil, "*/*")
	if response != nil {
		_ = response.Body.Close()
	}
	if err == nil || hits.Load() != 1 {
		t.Errorf("redirect error = %v, requests = %d; want rejection before a second request", err, hits.Load())
	}
}
