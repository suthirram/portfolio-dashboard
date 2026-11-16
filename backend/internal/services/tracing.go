package services

import (
	"go.opentelemetry.io/otel/trace"

	"portfolio-dashboard/internal/telemetry"
)

var tracer = telemetry.Tracer

func endSpan(span trace.Span, err *error) {
	telemetry.EndSpan(span, err)
}
