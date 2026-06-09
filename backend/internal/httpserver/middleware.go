package httpserver

import (
	"log/slog"
	"time"

	"github.com/labstack/echo/v4"
)

// RequestLogger emits one structured log line per HTTP request.
// Severity tracks the response status: 5xx → error, 4xx → warn, else info.
func RequestLogger(logger *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)
			if err != nil {
				c.Error(err)
			}

			req := c.Request()
			res := c.Response()
			logger.LogAttrs(req.Context(), levelForStatus(res.Status),
				"http_request",
				slog.String("request_id", res.Header().Get(echo.HeaderXRequestID)),
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
