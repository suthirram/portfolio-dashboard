package httpserver

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/handlers"
	"portfolio-dashboard/internal/persistence"
)

// CSRFHeaderValue must be sent in X-Requested-With on every state-changing
// request. A cross-origin form cannot add custom headers without a CORS
// preflight, which the explicit-origin CORS config denies (DD-001 §5).
const CSRFHeaderValue = "portfolio-dashboard"

// publicRoutes need no session. Keys are "<METHOD> <echo route pattern>".
var publicRoutes = map[string]bool{
	"GET /api/healthz":                 true,
	"GET /api/openapi.yaml":            true,
	"GET /api/regions":                 true,
	"GET /api/auth/security-questions": true,
	"POST /api/auth/signup":            true,
	"POST /api/auth/login":             true,
	"POST /api/auth/recover":           true,
	"POST /api/auth/recover/questions": true,
}

// onboardingRoutes stay reachable while must_change_password is set, so the
// forced-onboarding flow itself can run (PRD-001 §6.5).
var onboardingRoutes = map[string]bool{
	"GET /api/auth/me":          true,
	"POST /api/auth/logout":     true,
	"POST /api/auth/onboarding": true,
}

func routeKey(c echo.Context) string {
	return c.Request().Method + " " + c.Path()
}

// routeTier is the auth-tier required to reach a route.
//
// Unknown routes default to tierUser, so a new endpoint that nobody
// remembered to classify still requires a login — deny-by-default holds.
// Promoting a route to tierAdmin or tierSuperAdmin is an explicit
// decision recorded in routeTiers below.
type routeTier int

const (
	tierUser routeTier = iota
	tierAdmin
	tierSuperAdmin
)

// routeTiers maps "<METHOD> <echo route pattern>" to the tier required to
// reach the route, mirroring the keys publicRoutes and onboardingRoutes
// already use. Keep this table in lock-step with api/openapi.yaml — the
// TestAuthGate_TierTableMatchesGeneratedRoutes test fails when a new
// /api/admin/... route is registered without a matching entry.
var routeTiers = map[string]routeTier{
	// Super-admin only — promote / demote / change-region, plus the
	// admin-roster view itself.
	"GET /api/admin/admins":             tierSuperAdmin,
	"POST /api/admin/users/:id/promote": tierSuperAdmin,
	"POST /api/admin/users/:id/demote":  tierSuperAdmin,
	"PUT /api/admin/users/:id/region":   tierSuperAdmin,

	// Admin or super-admin — every other /api/admin/... route.
	"GET /api/admin/users":                            tierAdmin,
	"GET /api/admin/users/:id":                        tierAdmin,
	"DELETE /api/admin/users/:id":                     tierAdmin,
	"POST /api/admin/users/:id/hide":                  tierAdmin,
	"POST /api/admin/users/:id/reactivate":            tierAdmin,
	"POST /api/admin/users/:id/reset-lockout":         tierAdmin,
	"GET /api/admin/users/:id/holdings":               tierAdmin,
	"POST /api/admin/users/:id/holdings":              tierAdmin,
	"PUT /api/admin/users/:id/holdings/:holdingId":    tierAdmin,
	"DELETE /api/admin/users/:id/holdings/:holdingId": tierAdmin,
	"GET /api/admin/users/:id/prices":                 tierAdmin,
	"GET /api/admin/users/:id/summary":                tierAdmin,
}

// tierFor returns the tier required for the route key, defaulting to
// tierUser when the key is not in the table.
func tierFor(key string) routeTier {
	return routeTiers[key]
}

// userSatisfiesTier reports whether the caller meets the route's tier.
func userSatisfiesTier(user *domain.User, tier routeTier) bool {
	switch tier {
	case tierSuperAdmin:
		return user.IsSuperAdmin()
	case tierAdmin:
		return user.IsAdmin()
	default:
		return true
	}
}

// CSRFCheck refuses state-changing requests that lack the custom header.
func CSRFCheck() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			switch c.Request().Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				return next(c)
			}
			if c.Request().Header.Get("X-Requested-With") != CSRFHeaderValue {
				return echo.NewHTTPError(http.StatusForbidden, "missing X-Requested-With header")
			}
			return next(c)
		}
	}
}

// AuthGate loads the session (when a cookie is present), stashes the user on
// the request context, and enforces per-route requirements: public routes
// pass through, everything else needs a login, /api/admin needs an admin,
// and the super-admin routes need the super admin. While
// must_change_password is set, only the onboarding routes are reachable.
func AuthGate(st *persistence.Store, logger *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			user, sessionID := loadSession(c, st, logger)
			if user != nil {
				ctx := auth.WithUser(c.Request().Context(), user)
				ctx = auth.WithSessionID(ctx, sessionID)
				c.SetRequest(c.Request().WithContext(ctx))
			}

			key := routeKey(c)
			if publicRoutes[key] {
				return next(c)
			}
			if user == nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "not logged in")
			}
			if user.MustChangePassword && !onboardingRoutes[key] {
				return echo.NewHTTPError(http.StatusForbidden, "password change required")
			}

			tier := tierFor(key)
			if !userSatisfiesTier(user, tier) {
				switch tier {
				case tierSuperAdmin:
					return echo.NewHTTPError(http.StatusForbidden, "super admin access required")
				case tierAdmin:
					return echo.NewHTTPError(http.StatusForbidden, "admin access required")
				}
			}
			return next(c)
		}
	}
}

// loadSession resolves the session cookie to a live user. Returns (nil, "")
// for missing/expired sessions and hidden users; expired sessions are
// deleted and the cookie is cleared so the browser stops sending it.
func loadSession(c echo.Context, st *persistence.Store, logger *slog.Logger) (*domain.User, string) {
	cookie, err := c.Cookie(handlers.SessionCookieName)
	if err != nil || cookie.Value == "" {
		return nil, ""
	}

	ctx := c.Request().Context()

	sess, err := st.Sessions.Get(ctx, cookie.Value)
	if err != nil {
		if !errors.Is(err, persistence.ErrNotFound) {
			logger.Error("session lookup failed", slog.String("error", err.Error()))
		}
		handlers.ClearSessionCookie(c)
		return nil, ""
	}

	if time.Now().After(sess.ExpiresAt) {
		// The TTL index removes these eventually; delete eagerly so a stale
		// cookie cannot linger until the TTL monitor runs.
		if err := st.Sessions.Delete(ctx, sess.ID); err != nil {
			logger.Warn("expired session delete failed", slog.String("error", err.Error()))
		}
		handlers.ClearSessionCookie(c)
		return nil, ""
	}

	user, err := st.Users.FindByID(ctx, sess.UserID)
	if err != nil {
		if !errors.Is(err, persistence.ErrNotFound) {
			logger.Error("session user lookup failed", slog.String("error", err.Error()))
		}
		handlers.ClearSessionCookie(c)
		return nil, ""
	}
	if user.Disabled {
		// Hidden users lose access on their next request (PRD-001 §6.6).
		handlers.ClearSessionCookie(c)
		return nil, ""
	}

	refreshSession(c, st, &sess, logger)
	return user, sess.ID
}

// refreshSession slides the expiry forward, at most once per day so steady
// traffic does not write on every request.
func refreshSession(c echo.Context, st *persistence.Store, sess *domain.Session, logger *slog.Logger) {
	if time.Until(sess.ExpiresAt) > domain.SessionTTL-24*time.Hour {
		return
	}
	newExpiry := time.Now().Add(domain.SessionTTL)
	if err := st.Sessions.SetExpiry(c.Request().Context(), sess.ID, newExpiry); err != nil {
		logger.Warn("session refresh failed", slog.String("error", err.Error()))
		return
	}
	handlers.SetSessionCookie(c, sess.ID, newExpiry)
}
