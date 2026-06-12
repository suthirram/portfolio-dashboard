package auth

import (
	"context"

	"portfolio-dashboard/internal/domain"
)

type ctxKey int

const (
	userKey ctxKey = iota
	sessionIDKey
)

// WithUser stashes the authenticated user on the context. Set by the
// session middleware; read by handlers via UserFromContext.
func WithUser(ctx context.Context, u *domain.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// UserFromContext returns the authenticated user, if any.
func UserFromContext(ctx context.Context) (*domain.User, bool) {
	u, ok := ctx.Value(userKey).(*domain.User)
	return u, ok && u != nil
}

// WithSessionID stashes the current opaque session id on the context so
// logout / "sign out other sessions" can reference it.
func WithSessionID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, sessionIDKey, id)
}

// SessionIDFromContext returns the current session id, if any.
func SessionIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(sessionIDKey).(string)
	return id, ok && id != ""
}
