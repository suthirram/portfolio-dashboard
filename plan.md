# OTel Tracing: Backend Instrumentation + Dev Stack + Grafana Cloud Prod

## Context

No distributed tracing existed before this feature. Requests were traceable only via
`request_id` in zap logs. This plan integrates OpenTelemetry tracing into the Go
backend: one server span per inbound HTTP request, exported over OTLP/HTTP, with
`trace_id`/`span_id` injected into the per-request zap logger so a log line jumps to
its trace.

**Off by default.** Tracing is enabled only when `OTEL_EXPORTER_OTLP_ENDPOINT` (or
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) is set, so local dev and Cloud Run are unchanged
until configured.

## Scope

Implemented in this feature:

* HTTP server spans (otelecho middleware)
* Zap trace-log correlation (`trace_id`/`span_id` on every request log line)
* Local dev stack: Grafana Tempo + Grafana OSS (docker compose `trace` profile)
* Prod: Grafana Cloud free tier via OTLP/HTTPS + GCP Secret Manager secrets

Extension points (not in this PR — add in future slices):

* Mongo command spans: `otelmongo` monitor in `internal/db/mongo.go`
* Postgres spans: pgx tracer in `internal/db/postgres.go`
* Yahoo Finance outbound spans: `otelhttp` transport in `internal/services/price.go`
* Loki/Prometheus correlation in Grafana Cloud
* `snapshot` subcommand tracing

## Architecture

```
cmd/serve.go
  telemetry.Setup(ctx, cfg, logger)
    → if OTEL_EXPORTER_OTLP_ENDPOINT empty: no-op, tracing disabled
    → else: build otlptracehttp exporter (reads OTEL_EXPORTER_OTLP_* env natively)
          → SDK TracerProvider + W3C propagators set as OTel globals
          → defer tp.Shutdown (flushes batcher on graceful stop)

httpserver middleware chain
  middleware.RequestID()
  → otelecho.Middleware(serviceName)  ← extracts W3C context, opens server span
  → RequestLogger()                   ← reads trace_id/span_id from ctx, binds to reqLogger
  → services via logging.FromContextOr ← inherit trace_id on every log line

Dev:  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 → local Tempo → Grafana :3001
Prod: OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<region>.grafana.net/otlp
      OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:token)>
```

## Dependencies Added

| Module | Version | Why |
|---|---|---|
| `go.opentelemetry.io/otel` | v1.44.0 | OTel API |
| `go.opentelemetry.io/otel/sdk` | v1.44.0 | TracerProvider, resource, batch processor |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp` | v1.44.0 | OTLP/HTTP — works with Cloud Run egress, Tempo, and Grafana Cloud |
| `go.opentelemetry.io/contrib/instrumentation/github.com/labstack/echo/otelecho` | v0.69.0 | Echo v4 server middleware |

Docker images (dev stack, pinned in docker-compose.dev.yml):

| Image | Why |
|---|---|
| `grafana/tempo` | Local OTLP receiver + trace store |
| `grafana/grafana-oss` | Local trace UI (port 3001 to avoid Vite conflict on 3000) |

## Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | `""` (disabled) | Base URL; exporter appends `/v1/traces`. Use `http://localhost:4318` for dev Tempo or Grafana Cloud gateway. |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | no | `""` | Overrides base URL for traces only (wins over base). |
| `OTEL_EXPORTER_OTLP_HEADERS` | no | — | `Authorization=Basic <base64>` for Grafana Cloud auth. |
| `OTEL_SERVICE_NAME` | no | `portfolio-api` | Service name visible in Grafana/Jaeger. |
| `OTEL_TRACES_SAMPLER` | no | `parentbased_always_on` | e.g. `parentbased_traceidratio` |
| `OTEL_TRACES_SAMPLER_ARG` | no | — | e.g. `0.1` for 10% sampling. |

## Files Changed

| File | Change |
|---|---|
| `plan.md` | This file — committed so agents and humans can read it |
| `AGENTS.md` | Pointer: read `plan.md` before touching telemetry code |
| `CLAUDE.md` | `internal/telemetry/` line, env vars, `make dev-trace` command |
| `backend/go.mod` / `go.sum` | 4 otel modules |
| `backend/internal/config/config.go` | `OTelEndpoint`, `OTelServiceName` fields + `ApplyEnv` |
| `backend/internal/config/config_test.go` | Env gate fallback, service name tests |
| `backend/internal/telemetry/telemetry.go` | New — `Setup` / shutdown |
| `backend/internal/telemetry/telemetry_test.go` | New — disabled/enabled tests |
| `backend/cmd/serve.go` | `telemetry.Setup` call + deferred flush |
| `backend/internal/httpserver/server.go` | `otelecho.Middleware` after RequestID |
| `backend/internal/httpserver/middleware.go` | `trace_id`/`span_id` in reqLogger + access line |
| `backend/internal/httpserver/middleware_test.go` | Trace correlation tests |
| `config/otel/tempo.yaml` | Minimal Tempo config for dev |
| `config/otel/grafana-datasources.yaml` | Auto-provisioned Tempo datasource |
| `docker-compose.dev.yml` | `trace` profile: tempo + grafana services |
| `Makefile` | `dev-trace` target |
| `.github/workflows/deploy-cloudrun.yml` | Optional OTel secrets gate (mirrors POSTGRES_URI) |

## Dev Runbook

```bash
# Start local trace stack (Tempo + Grafana)
make dev-trace

# Run backend with tracing enabled
cd backend && OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 go run . serve

# Fire a request
curl -s -X POST localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"username":"admin","password":"<dev password>"}'

# Open Grafana: http://localhost:3001
# Explore → Tempo → service "portfolio-api"
# Backend log line carries matching trace_id
```

## Prod Runbook (Owner Action — Agents Do Not Touch Billing/Accounts)

1. Create a free Grafana Cloud account at grafana.com/auth/sign-up/create-user
2. Create a stack; from the OTLP config page note:
   * Gateway endpoint: `https://otlp-gateway-<region>.grafana.net/otlp`
   * Instance ID (a number)
   * An API token with MetricsPublisher scope
3. Create GCP secrets:

```bash
echo -n "https://otlp-gateway-<region>.grafana.net/otlp" | \
  gcloud secrets create OTEL_EXPORTER_OTLP_ENDPOINT --data-file=-

echo -n "Authorization=Basic $(echo -n '<instanceId>:<token>' | base64)" | \
  gcloud secrets create OTEL_EXPORTER_OTLP_HEADERS --data-file=-
```

1. Re-run the deploy workflow (or push to main). The CI gate picks up the secrets
   automatically — it mirrors the `POSTGRES_URI` optional pattern.
1. After deploy: fire a request, then open Grafana Cloud → Explore → Tempo → service
   `portfolio-api`. Check Cloud Run log for matching `trace_id`.

## Self-Host Alternative (Not Implemented — Documented for Completeness)

A single-binary Tempo + Grafana stack on a GCP e2-micro VM with a persistent disk is
viable for very low traffic (~$7/mo). Ruled out because Cloud Run scale-to-zero kills
stateful collectors, and the Grafana Cloud free tier ($0) covers this project's traffic.

## Grafana Cloud Free Tier Limits

| Metric | Free Tier |
|---|---|
| Traces ingested | ~50 GB/month |
| Retention | ~14 days |
| Cost | $0 |

Sufficient for a personal portfolio tracker at any realistic traffic level.
