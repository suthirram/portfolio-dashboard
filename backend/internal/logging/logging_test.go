package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func TestNewJSONLoggerAddsServiceAndFiltersByLevel(t *testing.T) {
	var buf bytes.Buffer
	logger, err := New(&buf, "json", "warn")
	if err != nil {
		t.Fatalf("New(): %v", err)
	}

	logger.Info("ignored")
	logger.Warn("kept")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("log lines = %d, want 1; raw:\n%s", len(lines), buf.String())
	}
	var line map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &line); err != nil {
		t.Fatalf("decode log line: %v", err)
	}
	if line["msg"] != "kept" {
		t.Errorf("msg = %v, want kept", line["msg"])
	}
	if line["service"] != "portfolio-api" {
		t.Errorf("service = %v, want portfolio-api", line["service"])
	}
	if line["level"] != "warn" {
		t.Errorf("level = %v, want warn", line["level"])
	}
}

func TestNewConsoleLoggerWritesExpectedFields(t *testing.T) {
	var buf bytes.Buffer
	logger, err := New(&buf, "text", "info")
	if err != nil {
		t.Fatalf("New(): %v", err)
	}

	logger.Info("started")

	got := buf.String()
	if !strings.Contains(got, "started") {
		t.Errorf("log output missing message: %s", got)
	}
	if !strings.Contains(got, "portfolio-api") {
		t.Errorf("log output missing service value: %s", got)
	}
}

func TestNewRejectsInvalidFormatAndLevel(t *testing.T) {
	cases := []struct {
		name   string
		format string
		level  string
	}{
		{"format", "xml", "info"},
		{"level", "json", "trace"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := New(&bytes.Buffer{}, tc.format, tc.level); err == nil {
				t.Fatal("New() error = nil")
			}
		})
	}
}

func TestParseLevelAcceptsSupportedValues(t *testing.T) {
	cases := []struct {
		in   string
		want zapcore.Level
	}{
		{"debug", zapcore.DebugLevel},
		{"INFO", zapcore.InfoLevel},
		{"warn", zapcore.WarnLevel},
		{"warning", zapcore.WarnLevel},
		{"error", zapcore.ErrorLevel},
	}

	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := ParseLevel(tc.in)
			if err != nil {
				t.Fatalf("ParseLevel(%q): %v", tc.in, err)
			}
			if got != tc.want {
				t.Errorf("ParseLevel(%q) = %s, want %s", tc.in, got, tc.want)
			}
		})
	}
}

func TestContextStoresAndRetrievesLogger(t *testing.T) {
	base := zap.NewNop()

	if _, ok := FromContext(context.Background()); ok {
		t.Fatal("FromContext on empty context ok = true")
	}

	ctx := IntoContext(context.Background(), base)
	got, ok := FromContext(ctx)
	if !ok {
		t.Fatal("FromContext ok = false")
	}
	if got != base {
		t.Error("FromContext returned a different logger")
	}
}
