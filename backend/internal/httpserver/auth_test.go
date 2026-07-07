package httpserver

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.uber.org/zap"

	"github.com/labstack/echo/v4"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/config"
	"portfolio-dashboard/internal/controllers"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func newTestServer(mt *mtest.T) http.Handler {
	logger := zap.NewNop()
	h := controllers.New(mt.DB, logger, false)
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
	return &http.Cookie{Name: controllers.SessionCookieName, Value: id} //nolint:gosec // request-side cookie
}

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
		txnsNS := mt.DB.Name() + ".transactions"
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch),
			// List enriches holdings with opening-date status (Find transactions).
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch),
		)

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

// TestGoldRouteGate pins the /api/gold/* access rule (DD-003 §2.1): a
// session whose user lacks gold_enabled reads 404 (not 403 — the feature
// must not be enumerable), an enabled user passes. A stub route behind the
// same AuthGate middleware keeps the test independent of the generated
// route surface (and of Postgres, which the real gold handlers need).
func TestGoldRouteGate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	newGoldServer := func(mt *mtest.T) http.Handler {
		e := echo.New()
		e.Use(AuthGate(persistence.New(mt.DB), zap.NewNop(), false))
		e.GET("/api/gold/transactions", func(c echo.Context) error {
			return c.NoContent(http.StatusOK)
		})
		return e
	}

	mt.Run("anonymous request gets 401", func(mt *mtest.T) {
		srv := newGoldServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/gold/transactions", nil)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous = %d, want 401", rec.Code)
		}
	})

	mt.Run("gold-disabled user gets 404", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleUser, "india", nil), "sess-g1", uid)
		srv := newGoldServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/gold/transactions", sessionCookie("sess-g1"))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("gold-disabled = %d, want 404; body=%s", rec.Code, rec.Body.String())
		}
	})

	mt.Run("gold-enabled user reaches the handler", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleUser, "india", func(m bson.M) { m["gold_enabled"] = true }), "sess-g2", uid)
		srv := newGoldServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/gold/transactions", sessionCookie("sess-g2"))
		if rec.Code != http.StatusOK {
			t.Fatalf("gold-enabled = %d, want 200; body=%s", rec.Code, rec.Body.String())
		}
	})

	mt.Run("gold-disabled super admin gets 404 too", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleSuperAdmin, "", nil), "sess-g3", uid)
		srv := newGoldServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/gold/transactions", sessionCookie("sess-g3"))
		if rec.Code != http.StatusNotFound {
			t.Fatalf("gold-disabled super admin = %d, want 404 (flag, not role, gates gold)", rec.Code)
		}
	})

	mt.Run("gold-enabled user gets 503 while Postgres is unattached", func(mt *mtest.T) {
		// The real server without AttachGold: the flag gate passes, then
		// goldGate degrades every gold operation to 503 (DD-003 §1).
		uid := primitive.NewObjectID()
		addAuthMocks(mt, testUserDoc(uid, domain.RoleUser, "india", func(m bson.M) { m["gold_enabled"] = true }), "sess-g4", uid)
		srv := newTestServer(mt)
		rec := doRequest(t, srv, http.MethodGet, "/api/gold/transactions", sessionCookie("sess-g4"))
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("gold without Postgres = %d, want 503; body=%s", rec.Code, rec.Body.String())
		}
	})
}

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
