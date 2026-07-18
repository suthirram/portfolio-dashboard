// Package telemetry initialises the OpenTelemetry SDK for the server.
//
// Tracing is opt-in: when cfg.OTelEndpoint is empty the function returns a
// no-op shutdown and sets no global provider, so the rest of the codebase
// incurs zero overhead and all otelecho spans are simply dropped.
package telemetry

import (
	"context"
	"fmt"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.41.0"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/config"
)

// Setup initialises the global TracerProvider and propagators.
//
// When cfg.OTelEndpoint is empty it returns (no-op shutdown, false, nil) and
// leaves the global provider untouched. The caller should always defer the
// returned shutdown even when enabled is false.
//
// The OTLP exporter is created with no endpoint option so the full
// OTEL_EXPORTER_OTLP_* env family (endpoint, headers, TLS, timeouts) is
// honoured natively — critical for Grafana Cloud basic-auth and path-prefix
// semantics.
func Setup(ctx context.Context, cfg config.Config, logger *zap.Logger) (shutdown func(context.Context) error, enabled bool, err error) {
	if cfg.OTelEndpoint == "" {
		logger.Info("tracing disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)")
		return func(context.Context) error { return nil }, false, nil
	}

	exp, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("create otlp exporter: %w", err)
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(cfg.OTelServiceName),
		),
	)
	if err != nil {
		return nil, false, fmt.Errorf("build otel resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp, sdktrace.WithBatchTimeout(1*time.Second)),
		sdktrace.WithResource(res),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	logger.Info("tracing enabled",
		zap.String("endpoint", cfg.OTelEndpoint),
		zap.String("service", cfg.OTelServiceName),
	)

	return tp.Shutdown, true, nil
}
