package services

import "go.opentelemetry.io/otel"

var tracer = otel.Tracer("portfolio-dashboard")
