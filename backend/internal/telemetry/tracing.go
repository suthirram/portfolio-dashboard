package telemetry

import (
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// Tracer is the application tracer every package opens spans on. It
// delegates to the global provider, so spans are dropped until Setup
// installs one.
var Tracer = otel.Tracer("portfolio-dashboard")

// EndSpan records *err on span, when set, and ends it. Call it deferred with
// the method's named error return: defer telemetry.EndSpan(span, &retErr).
func EndSpan(span trace.Span, err *error) {
	if err != nil && *err != nil {
		span.RecordError(*err)
		span.SetStatus(codes.Error, (*err).Error())
	}
	span.End()
}
