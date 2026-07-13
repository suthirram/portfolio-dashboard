package httpserver

import (
	"strings"
	"testing"

	"go.uber.org/zap"

	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/controllers"
)

// TestAuthGate_TierTableMatchesGeneratedRoutes guards the routeTiers
// table against drift. Any /api/admin/... path registered by the
// generated server must have an entry; otherwise a new operation would
// silently inherit tierUser and serve admin data to plain users.
func TestAuthGate_TierTableMatchesGeneratedRoutes(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("admin routes are explicitly classified", func(mt *mtest.T) {
		logger := zap.NewNop()
		h := controllers.New(mt.DB, logger, false)
		e := New(config.Default(), logger, mt.DB, h)

		for _, r := range e.Routes() {
			if !strings.HasPrefix(r.Path, "/api/admin/") {
				continue
			}
			key := r.Method + " " + r.Path
			if _, ok := routeTiers[key]; !ok {
				t.Errorf("route %q has no routeTiers entry — every admin route must declare a tier explicitly", key)
			}
		}
	})
}

// TestIsPublicSpecRoute documents the prefix gate: GETs under /api/specs/
// pass unauthenticated, every other method or non-spec path does not.
func TestIsPublicSpecRoute(t *testing.T) {
	cases := []struct {
		method, path string
		want         bool
	}{
		{"GET", "/api/specs/openapi.yaml", true},
		{"GET", "/api/specs/holdings/holdings.yaml", true},
		{"GET", "/api/specs/portfolio-api.yaml", true},
		{"GET", "/api/healthz", false},
		{"POST", "/api/specs/openapi.yaml", false},
		{"GET", "/api/admin/users", false},
	}
	for _, tc := range cases {
		if got := isPublicSpecRoute(tc.method, tc.path); got != tc.want {
			t.Errorf("isPublicSpecRoute(%q, %q) = %v, want %v", tc.method, tc.path, got, tc.want)
		}
	}
}

// TestTierFor checks the lookup helper returns the configured tier and
// defaults to tierUser for unknown keys.
func TestTierFor(t *testing.T) {
	if got := tierFor("GET /api/admin/admins"); got != tierSuperAdmin {
		t.Errorf("GET /api/admin/admins tier = %v, want tierSuperAdmin", got)
	}
	if got := tierFor("GET /api/admin/users"); got != tierAdmin {
		t.Errorf("GET /api/admin/users tier = %v, want tierAdmin", got)
	}
	if got := tierFor("GET /api/holdings"); got != tierUser {
		t.Errorf("GET /api/holdings tier = %v, want tierUser (default)", got)
	}
	if got := tierFor("GET /nope/this/does/not/exist"); got != tierUser {
		t.Errorf("unknown key tier = %v, want tierUser (default)", got)
	}
	if got := tierFor("PUT /api/admin/users/:id/gold"); got != tierSuperAdmin {
		t.Errorf("PUT /api/admin/users/:id/gold tier = %v, want tierSuperAdmin", got)
	}
	if got := tierFor("PUT /api/admin/users/:id/premium"); got != tierSuperAdmin {
		t.Errorf("PUT /api/admin/users/:id/premium tier = %v, want tierSuperAdmin", got)
	}
	if got := tierFor("PUT /api/admin/branding"); got != tierSuperAdmin {
		t.Errorf("PUT /api/admin/branding tier = %v, want tierSuperAdmin", got)
	}
}

// TestIsGoldRoute documents the prefix rule that scopes the gold_enabled
// gate: everything under /api/gold is gold, nothing else is.
func TestIsGoldRoute(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/api/gold", true},
		{"/api/gold/transactions", true},
		{"/api/gold/prices", true},
		{"/api/goldsmith", false},
		{"/api/holdings", false},
		{"/api/admin/users/:id/gold", false},
	}
	for _, tc := range cases {
		if got := isGoldRoute(tc.path); got != tc.want {
			t.Errorf("isGoldRoute(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}
