package logging

import (
	"context"

	"go.uber.org/zap"
)

type ctxKey struct{}

// IntoContext returns a derived context carrying logger.
func IntoContext(ctx context.Context, logger *zap.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, logger)
}

// FromContext returns the logger stored on ctx, or (nil, false) if none.
func FromContext(ctx context.Context) (*zap.Logger, bool) {
	l, ok := ctx.Value(ctxKey{}).(*zap.Logger)
	return l, ok
}
