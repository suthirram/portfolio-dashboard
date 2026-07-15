package telemetry

import (
	"context"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
)

func TestSetup_DisabledWhenEndpointEmpty(t *testing.T) {
	cfg := config.Default() // OTelEndpoint == ""

	before := otel.GetTracerProvider()
	shutdown, enabled, err := Setup(context.Background(), cfg, zap.NewNop())
	after := otel.GetTracerProvider()

	if err != nil {
		t.Fatalf("Setup error = %v", err)
	}
	if enabled {
		t.Error("enabled = true, want false")
	}
	if before != after {
		t.Error("global TracerProvider changed; should stay untouched when disabled")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Errorf("no-op shutdown error = %v", err)
	}
}

func TestSetup_EnabledWhenEndpointSet(t *testing.T) {
	// otlptracehttp.New reads env vars at creation; it does not dial eagerly.
	// Pointing at an unreachable address is fine — no network call until the
	// first export, so the test completes without a collector running.
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")

	cfg := config.Default()
	cfg.ApplyEnv()

	shutdown, enabled, err := Setup(context.Background(), cfg, zap.NewNop())
	if err != nil {
		t.Fatalf("Setup error = %v", err)
	}
	if !enabled {
		t.Error("enabled = false, want true")
	}

	// Shutdown flushes the batcher. No spans buffered, no collector running
	// — the exporter closes immediately without a network dial.
	shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := shutdown(shutCtx); err != nil {
		t.Errorf("shutdown error = %v", err)
	}
}
