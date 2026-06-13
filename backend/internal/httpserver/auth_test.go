package httpserver

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/handlers"
)

func newTestServer(mt *mtest.T) http.Handler {
	logger := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))
	h := handlers.New(mt.DB, logger)
	return New(config.Default(), logger, mt.DB, h)
}

// addAuthMocks queues the session + user lookups the session middleware
// performs for an authenticated request.
func addAuthMocks(mt *mtest.T, user bson.D, sessionID string, userID primitive.ObjectID) {
	sessionsNS := mt.DB.Name() + ".sessions"
	usersNS := mt.DB.Name() + ".users"
	mt.AddMockResponses(
		mtest.CreateCursorResponse(0, sessionsNS, mtest.FirstBatch, bson.D{
			{Key: "_id", Value: sessionID},
			{Key: "user_id", Value: userID},
			{Key: "created_at", Value: time.Now()},
			{Key: "expires_at", Value: time.Now().Add(domain.SessionTTL)},
		}),
		mtest.CreateCursorResponse(0, usersNS, mtest.FirstBatch, user),
	)
}

func testUserDoc(id primitive.ObjectID, role, region string, mutate func(bson.M)) bson.D {
	doc := bson.M{
		"_id":                  id,
		"username":             "alice",
		"username_display":     "Alice",
		"name":                 "Alice",
		"password_hash":        "x",
		"role":                 role,
		"region":               region,
		"disabled":             false,
		"locked":               false,
		"must_change_password": false,
		"created_at":           time.Now(),
		"updated_at":           time.Now(),
	}
	if mutate != nil {
		mutate(doc)
	}
	out := bson.D{}
	for k, v := range doc {
		out = append(out, bson.E{Key: k, Value: v})
	}
	return out
}

func doRequest(t *testing.T, srv http.Handler, method, path string, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	return rec
}

func sessionCookie(id string) *http.Cookie {
	// A request cookie only carries the id; Secure/HttpOnly/SameSite are
	// response-side attributes set by the server, not the client.
	return &http.Cookie{Name: handlers.SessionCookieName, Value: id} //nolint:gosec // request-side cookie
}

// ── Public vs protected ────────────────────────────────────────────────────

func TestPublicEndpointsNeedNoLogin(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("regions and question catalogue are public", func(mt *mtest.T) {
		srv := newTestServer(mt)
		for _, path := range []string{"/api/regions", "/api/auth/security-questions"} {
			rec := doRequest(t, srv, http.MethodGet, path, nil)
			if rec.Code != http.StatusOK {
				t.Errorf("GET %s = %d, want 200; body=%s", path, rec.Code, rec.Body.String())
			}
		}
	})
}

func TestProtectedEndpointsRequireLogin(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("anonymous requests get 401", func(mt *mtest.T) {
		srv := newTestServer(mt)
		for _, path := range []string{"/api/holdings", "/api/prices", "/api/summary", "/api/auth/me", "/api/admin/users", "/api/market/price?symbol=TCS.NS"} {
			rec := doRequest(t, srv, http.MethodGet, path, nil)
			if rec.Code != http.StatusUnauthorized {
				t.Errorf("GET %s = %d, want 401; body=%s", path, rec.Code, rec.Body.String())
			}
		}
	})

	mt.Run("valid session reaches the handler", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleUser, "india", nil), "sess-1", uid)
		holdingsNS := mt.DB.Name() + ".holdings"
		mt.AddMockResponses(mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch))

		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/holdings", sessionCookie("sess-1"))
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /api/holdings = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
	})

	mt.Run("expired session gets 401", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		sessionsNS := mt.DB.Name() + ".sessions"
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, sessionsNS, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: "sess-old"},
				{Key: "user_id", Value: uid},
				{Key: "created_at", Value: time.Now().Add(-31 * 24 * time.Hour)},
				{Key: "expires_at", Value: time.Now().Add(-time.Hour)},
			}),
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}), // middleware deletes it
		)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/holdings", sessionCookie("sess-old"))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expired session = %d, want 401", rec.Code)
		}
	})

	mt.Run("hidden user gets 401 on next request", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleUser, "india", func(m bson.M) { m["disabled"] = true }), "sess-2", uid)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/holdings", sessionCookie("sess-2"))
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("hidden user = %d, want 401", rec.Code)
		}
	})
}

// ── Role gates ─────────────────────────────────────────────────────────────

func TestRoleGates(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("plain user cannot reach the admin area", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleUser, "india", nil), "sess-3", uid)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/admin/users", sessionCookie("sess-3"))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("user on /api/admin/users = %d, want 403", rec.Code)
		}
	})

	mt.Run("regional admin cannot reach super-admin routes", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleAdmin, "india", nil), "sess-4", uid)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/admin/admins", sessionCookie("sess-4"))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("admin on /api/admin/admins = %d, want 403", rec.Code)
		}
	})

	mt.Run("super admin reaches the admins list", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleSuperAdmin, "", nil), "sess-5", uid)
		usersNS := mt.DB.Name() + ".users"
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS, mtest.FirstBatch))
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/admin/admins", sessionCookie("sess-5"))
		if rec.Code != http.StatusOK {
			t.Fatalf("super admin on /api/admin/admins = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
	})
}

// ── CSRF ───────────────────────────────────────────────────────────────────

func TestCSRFHeaderRequiredOnStateChanges(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("POST without header is refused", func(mt *mtest.T) {
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodPost, "/api/auth/login", nil)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("POST without X-Requested-With = %d, want 403", rec.Code)
		}
	})

	mt.Run("GET needs no header", func(mt *mtest.T) {
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/regions", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET without header = %d, want 200", rec.Code)
		}
	})
}

// ── Forced onboarding ──────────────────────────────────────────────────────

func TestMustChangePasswordGate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("pending onboarding blocks the app", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleSuperAdmin, "", func(m bson.M) { m["must_change_password"] = true }), "sess-6", uid)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/holdings", sessionCookie("sess-6"))
		if rec.Code != http.StatusForbidden {
			t.Fatalf("must_change_password on /api/holdings = %d, want 403", rec.Code)
		}
	})

	mt.Run("auth/me stays reachable during onboarding", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleSuperAdmin, "", func(m bson.M) { m["must_change_password"] = true }), "sess-7", uid)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/auth/me", sessionCookie("sess-7"))
		if rec.Code != http.StatusOK {
			t.Fatalf("must_change_password on /api/auth/me = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
	})
}
