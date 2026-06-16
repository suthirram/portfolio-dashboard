package httpserver

import (
	"time"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"portfolio-dashboard/internal/logging"
)

// RequestLogger emits one structured log line per HTTP request and stashes a
// request-scoped logger (carrying request_id) on the request context so
// downstream handlers can correlate their own log lines.
//
// Must be installed AFTER middleware.RequestID so the response header is
// already populated when this middleware reads it.
func RequestLogger(base *zap.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()

			reqID := c.Response().Header().Get(echo.HeaderXRequestID)
			reqLogger := base.With(zap.String("request_id", reqID))
			ctx := logging.IntoContext(c.Request().Context(), reqLogger)
			c.SetRequest(c.Request().WithContext(ctx))

			err := next(c)
			if err != nil {
				c.Error(err)
			}

			req := c.Request()
			res := c.Response()
			if ce := base.Check(levelForStatus(res.Status), "http_request"); ce != nil {
				ce.Write(
					zap.String("request_id", reqID),
					zap.String("method", req.Method),
					zap.String("path", req.URL.Path),
					zap.String("query", req.URL.RawQuery),
					zap.String("remote", c.RealIP()),
					zap.String("user_agent", req.UserAgent()),
					zap.Int("status", res.Status),
					zap.Int64("bytes", res.Size),
					zap.Duration("duration", time.Since(start)),
				)
			}
			return nil
		}
	}
}

func levelForStatus(status int) zapcore.Level {
	switch {
	case status >= 500:
		return zapcore.ErrorLevel
	case status >= 400:
		return zapcore.WarnLevel
	default:
		return zapcore.InfoLevel
	}
}
