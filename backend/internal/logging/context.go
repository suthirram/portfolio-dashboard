package logging

import (
	"context"
	"log/slog"
)

type ctxKey struct{}

// IntoContext returns a derived context carrying logger.
func IntoContext(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, logger)
}

// FromContext returns the logger stored on ctx, or (nil, false) if none.
func FromContext(ctx context.Context) (*slog.Logger, bool) {
	l, ok := ctx.Value(ctxKey{}).(*slog.Logger)
	return l, ok
}
