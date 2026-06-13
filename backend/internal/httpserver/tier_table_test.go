package httpserver

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/handlers"
)

// TestAuthGate_TierTableMatchesGeneratedRoutes guards the routeTiers
// table against drift. Any /api/admin/... path registered by the
// generated server must have an entry; otherwise a new operation would
// silently inherit tierUser and serve admin data to plain users.
func TestAuthGate_TierTableMatchesGeneratedRoutes(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("admin routes are explicitly classified", func(mt *mtest.T) {
		logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
		h := handlers.New(mt.DB, logger, false)
		e := New(config.Default(), logger, mt.DB, h)

		for _, r := range e.Routes() {
			if !strings.HasPrefix(r.Path, "/api/admin") {
				continue
			}
			key := r.Method + " " + r.Path
			if _, ok := routeTiers[key]; !ok {
				t.Errorf("route %q has no routeTiers entry — every admin route must declare a tier explicitly", key)
			}
		}
	})
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
}
