package controllers

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
)

// SessionCookieName is the cookie carrying the opaque session id.
const SessionCookieName = "pd_session"

// issueSession creates a server-side session for userID and sets the session
// cookie on the response (when an echo.Context is available).
func (h *Controller) issueSession(ctx context.Context, userID primitive.ObjectID) error {
	id, err := auth.NewSessionID()
	if err != nil {
		return err
	}

	now := time.Now()
	sess := domain.Session{
		ID:        id,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(domain.SessionTTL),
	}
	c, hasEcho := echoFromContext(ctx)
	if hasEcho {
		sess.UserAgent = c.Request().UserAgent()
	}

	if err := h.store.Sessions.Insert(ctx, sess); err != nil {
		return err
	}

	if hasEcho {
		SetSessionCookie(c, id, sess.ExpiresAt, h.cookieSecure)
	}
	return nil
}

// destroySession deletes the current session document and clears the cookie.
func (h *Controller) destroySession(ctx context.Context) error {
	if sid, ok := auth.SessionIDFromContext(ctx); ok {
		if err := h.store.Sessions.Delete(ctx, sid); err != nil {
			return err
		}
	}
	if c, ok := echoFromContext(ctx); ok {
		ClearSessionCookie(c, h.cookieSecure)
	}
	return nil
}

// invalidateOtherSessions deletes every session of userID except the current
// one (PRD-001 §6.3: changing the password signs out other sessions).
func (h *Controller) invalidateOtherSessions(ctx context.Context, userID primitive.ObjectID) error {
	keep, _ := auth.SessionIDFromContext(ctx)
	return h.store.Sessions.DeleteOthers(ctx, userID, keep)
}

// invalidateAllSessions deletes every session of userID (used by the
// recover flow, where the caller holds no session).
func (h *Controller) invalidateAllSessions(ctx context.Context, userID primitive.ObjectID) error {
	return h.store.Sessions.DeleteByUser(ctx, userID)
}

// SetSessionCookie writes the session cookie. secure follows DD-001 §5:
// when true the cookie is Secure + SameSite=None (cross-origin Pages → Fly);
// when false it falls back to SameSite=Lax without Secure, the only mode
// browsers accept over plain-HTTP local dev. Sourced from
// Config.CookieSecure — never from the request scheme, so a misconfigured
// proxy cannot silently downgrade hardening.
func SetSessionCookie(c echo.Context, value string, expires time.Time, secure bool) {
	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
	}
	if secure {
		cookie.Secure = true
		cookie.SameSite = http.SameSiteNoneMode
	} else {
		cookie.SameSite = http.SameSiteLaxMode
	}
	c.SetCookie(cookie)
}

// ClearSessionCookie expires the session cookie immediately. secure must
// match what SetSessionCookie used, or some browsers will refuse to
// overwrite the existing cookie.
func ClearSessionCookie(c echo.Context, secure bool) {
	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	}
	if secure {
		cookie.Secure = true
		cookie.SameSite = http.SameSiteNoneMode
	} else {
		cookie.SameSite = http.SameSiteLaxMode
	}
	c.SetCookie(cookie)
}

func (h *Controller) logSessionError(ctx context.Context, op string, err error) {
	h.reqLog(ctx).ErrorContext(ctx, "session operation failed",
		slog.String("op", op),
		slog.String("error", err.Error()),
	)
}
