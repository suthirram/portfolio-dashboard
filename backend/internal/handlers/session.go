package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
)

// SessionCookieName is the cookie carrying the opaque session id.
const SessionCookieName = "pd_session"

// issueSession creates a server-side session for userID and sets the session
// cookie on the response (when an echo.Context is available).
func (h *Handler) issueSession(ctx context.Context, userID primitive.ObjectID) error {
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

	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := h.sessions().InsertOne(dbCtx, sess); err != nil {
		return err
	}

	if hasEcho {
		SetSessionCookie(c, id, sess.ExpiresAt)
	}
	return nil
}

// destroySession deletes the current session document and clears the cookie.
func (h *Handler) destroySession(ctx context.Context) error {
	if sid, ok := auth.SessionIDFromContext(ctx); ok {
		dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		if _, err := h.sessions().DeleteOne(dbCtx, bson.M{"_id": sid}); err != nil {
			return err
		}
	}
	if c, ok := echoFromContext(ctx); ok {
		ClearSessionCookie(c)
	}
	return nil
}

// invalidateOtherSessions deletes every session of userID except the current
// one (PRD-001 §6.3: changing the password signs out other sessions).
func (h *Handler) invalidateOtherSessions(ctx context.Context, userID primitive.ObjectID) error {
	filter := bson.M{"user_id": userID}
	if sid, ok := auth.SessionIDFromContext(ctx); ok {
		filter["_id"] = bson.M{"$ne": sid}
	}
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := h.sessions().DeleteMany(dbCtx, filter)
	return err
}

// invalidateAllSessions deletes every session of userID (used by the
// recover flow, where the caller holds no session).
func (h *Handler) invalidateAllSessions(ctx context.Context, userID primitive.ObjectID) error {
	dbCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := h.sessions().DeleteMany(dbCtx, bson.M{"user_id": userID})
	return err
}

// SetSessionCookie writes the session cookie. Over HTTPS it follows DD-001
// §5: HttpOnly; Secure; SameSite=None (cross-origin Pages → Fly). On plain
// HTTP (local dev behind the same-origin Vite proxy) browsers drop
// Secure/None cookies, so it falls back to SameSite=Lax without Secure.
func SetSessionCookie(c echo.Context, value string, expires time.Time) {
	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
	}
	if c.Scheme() == "https" {
		cookie.Secure = true
		cookie.SameSite = http.SameSiteNoneMode
	} else {
		cookie.SameSite = http.SameSiteLaxMode
	}
	c.SetCookie(cookie)
}

// ClearSessionCookie expires the session cookie immediately.
func ClearSessionCookie(c echo.Context) {
	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	}
	if c.Scheme() == "https" {
		cookie.Secure = true
		cookie.SameSite = http.SameSiteNoneMode
	} else {
		cookie.SameSite = http.SameSiteLaxMode
	}
	c.SetCookie(cookie)
}

func (h *Handler) logSessionError(ctx context.Context, op string, err error) {
	h.reqLog(ctx).ErrorContext(ctx, "session operation failed",
		slog.String("op", op),
		slog.String("error", err.Error()),
	)
}
