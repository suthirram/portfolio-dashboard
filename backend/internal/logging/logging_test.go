package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
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
	if line["level"] != "WARN" {
		t.Errorf("level = %v, want WARN", line["level"])
	}
}

func TestNewTextLoggerWritesExpectedFields(t *testing.T) {
	var buf bytes.Buffer
	logger, err := New(&buf, "text", "info")
	if err != nil {
		t.Fatalf("New(): %v", err)
	}

	logger.Info("started")

	got := buf.String()
	if !strings.Contains(got, "msg=started") {
		t.Errorf("log output missing message: %s", got)
	}
	if !strings.Contains(got, "service=portfolio-api") {
		t.Errorf("log output missing service attr: %s", got)
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
		want slog.Level
	}{
		{"debug", slog.LevelDebug},
		{"INFO", slog.LevelInfo},
		{"warn", slog.LevelWarn},
		{"warning", slog.LevelWarn},
		{"error", slog.LevelError},
	}

	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, err := parseLevel(tc.in)
			if err != nil {
				t.Fatalf("parseLevel(%q): %v", tc.in, err)
			}
			if got != tc.want {
				t.Errorf("parseLevel(%q) = %s, want %s", tc.in, got, tc.want)
			}
		})
	}
}

func TestContextStoresAndRetrievesLogger(t *testing.T) {
	base := slog.New(slog.NewJSONHandler(&bytes.Buffer{}, nil))

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
