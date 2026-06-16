// Package logging builds a structured zap.Logger for the API server.
package logging

import (
	"fmt"
	"io"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// New constructs a *zap.Logger. format is "json" or "text" (console); level is
// "debug", "info", "warn", or "error". Output is written to w.
func New(w io.Writer, format, level string) (*zap.Logger, error) {
	lvl, err := ParseLevel(level)
	if err != nil {
		return nil, err
	}

	encCfg := zap.NewProductionEncoderConfig()
	encCfg.TimeKey = "ts"
	encCfg.MessageKey = "msg"
	encCfg.LevelKey = "level"
	encCfg.CallerKey = "caller"
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encCfg.EncodeLevel = zapcore.LowercaseLevelEncoder

	var enc zapcore.Encoder
	switch strings.ToLower(format) {
	case "json":
		enc = zapcore.NewJSONEncoder(encCfg)
	case "text", "console":
		enc = zapcore.NewConsoleEncoder(encCfg)
	default:
		return nil, fmt.Errorf("invalid log format %q (want 'json' or 'text')", format)
	}

	core := zapcore.NewCore(enc, zapcore.AddSync(w), lvl)

	opts := []zap.Option{zap.ErrorOutput(zapcore.AddSync(w))}
	if lvl == zapcore.DebugLevel {
		opts = append(opts, zap.AddCaller())
	}

	return zap.New(core, opts...).With(zap.String("service", "portfolio-api")), nil
}

// ParseLevel converts the human-friendly level strings the CLI accepts
// into a zapcore.Level.
func ParseLevel(s string) (zapcore.Level, error) {
	switch strings.ToLower(s) {
	case "debug":
		return zapcore.DebugLevel, nil
	case "info":
		return zapcore.InfoLevel, nil
	case "warn", "warning":
		return zapcore.WarnLevel, nil
	case "error":
		return zapcore.ErrorLevel, nil
	default:
		return 0, fmt.Errorf("invalid log level %q (want debug|info|warn|error)", s)
	}
}
