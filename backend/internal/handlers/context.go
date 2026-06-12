package handlers

import (
	"context"

	"github.com/labstack/echo/v4"
)

type echoCtxKey struct{}

// WithEchoContext stashes the echo.Context on a request context. The strict
// handler wrapper passes only context.Context to handlers; cookie-issuing
// endpoints (signup/login/logout) need the echo.Context back to write
// Set-Cookie headers. Wired in httpserver via a strict middleware.
func WithEchoContext(ctx context.Context, c echo.Context) context.Context {
	return context.WithValue(ctx, echoCtxKey{}, c)
}

func echoFromContext(ctx context.Context) (echo.Context, bool) {
	c, ok := ctx.Value(echoCtxKey{}).(echo.Context)
	return c, ok && c != nil
}
