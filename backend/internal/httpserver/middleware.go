package httpserver

import (
	"log/slog"
	"time"

	"github.com/labstack/echo/v4"

	"portfolio-dashboard/internal/logging"
)

// RequestLogger emits one structured log line per HTTP request and stashes a
// request-scoped logger (carrying request_id) on the request context so
// downstream handlers can correlate their own log lines.
//
// Must be installed AFTER middleware.RequestID so the response header is
// already populated when this middleware reads it.
func RequestLogger(base *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()

			reqID := c.Response().Header().Get(echo.HeaderXRequestID)
			reqLogger := base.With(slog.String("request_id", reqID))
			ctx := logging.IntoContext(c.Request().Context(), reqLogger)
			c.SetRequest(c.Request().WithContext(ctx))

			err := next(c)
			if err != nil {
				c.Error(err)
			}

			req := c.Request()
			res := c.Response()
			base.LogAttrs(ctx, levelForStatus(res.Status),
				"http_request",
				slog.String("request_id", reqID),
				slog.String("method", req.Method),
				slog.String("path", req.URL.Path),
				slog.String("query", req.URL.RawQuery),
				slog.String("remote", c.RealIP()),
				slog.String("user_agent", req.UserAgent()),
				slog.Int("status", res.Status),
				slog.Int64("bytes", res.Size),
				slog.Duration("duration", time.Since(start)),
			)
			return nil
		}
	}
}

func levelForStatus(status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}
