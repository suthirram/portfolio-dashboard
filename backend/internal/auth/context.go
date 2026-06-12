package auth

import "context"

type contextKey struct{}

type Principal struct {
	User      User
	SessionID string
}

func IntoContext(ctx context.Context, user User, sessionID string) context.Context {
	return context.WithValue(ctx, contextKey{}, Principal{User: user, SessionID: sessionID})
}

func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(contextKey{}).(Principal)
	return p, ok
}

func UserFromContext(ctx context.Context) (User, bool) {
	p, ok := FromContext(ctx)
	return p.User, ok
}

func SessionIDFromContext(ctx context.Context) (string, bool) {
	p, ok := FromContext(ctx)
	return p.SessionID, ok
}
