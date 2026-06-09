// Package logging builds a structured slog.Logger for the API server.
package logging

import (
	"fmt"
	"io"
	"log/slog"
	"strings"
)

// New constructs a slog.Logger. format is "json" or "text"; level is
// "debug", "info", "warn", or "error". Output is written to w.
func New(w io.Writer, format, level string) (*slog.Logger, error) {
	lvl, err := parseLevel(level)
	if err != nil {
		return nil, err
	}

	opts := &slog.HandlerOptions{
		Level:     lvl,
		AddSource: lvl == slog.LevelDebug,
	}

	var h slog.Handler
	switch strings.ToLower(format) {
	case "json":
		h = slog.NewJSONHandler(w, opts)
	case "text":
		h = slog.NewTextHandler(w, opts)
	default:
		return nil, fmt.Errorf("invalid log format %q (want 'json' or 'text')", format)
	}

	return slog.New(h).With(slog.String("service", "portfolio-api")), nil
}

func parseLevel(s string) (slog.Level, error) {
	switch strings.ToLower(s) {
	case "debug":
		return slog.LevelDebug, nil
	case "info":
		return slog.LevelInfo, nil
	case "warn", "warning":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("invalid log level %q (want debug|info|warn|error)", s)
	}
}
