# ADR-0002: Backend on Google Cloud Run (supersedes the Fly.io tier of ADR-0001)

* **Status**: Accepted
* **Date**: 2026-06-13
* **Deciders**: project owner
* **Supersedes**: the "Go API → Fly.io" decision in
  [ADR-0001](ADR-0001-deploy-stack.md). The Cloudflare Pages (frontend) and
  MongoDB Atlas (database) tiers of ADR-0001 are unchanged.

## Context

ADR-0001 put the Go API on Fly.io. Since then two things changed the calculus:

* **Fly removed its free allowance.** A small always-reachable service now
  costs roughly **$2–5/mo** (shared-cpu-1x, 256MB, scale-to-zero). Not much,
  but this is a personal app and cost is the top priority.
* **The real workload is tiny and known.** This is a family deployment:
  **~5–10 users**, a handful of dashboard loads each per day. Estimated
  **~18k requests/month** — three orders of magnitude below most free tiers.

The hosting contract is still just "run this Dockerfile, give me HTTPS and env
vars," which ADR-0001 already noted makes the backend host swappable in ~a day.

## Decision

Move the Go API to **Google Cloud Run** (managed). Frontend stays on Cloudflare
Pages, database stays on MongoDB Atlas (M0).

| Factor | Cloud Run | Fly.io (prior) |
|---|---|---|
| Free tier | 2M req + 360k GiB-s + 180k vCPU-s **per month** | none (removed) |
| Cost at ~18k req/mo | **$0** (fully inside free tier) | ~$2–5/mo |
| Deploy | `gcloud run deploy --source backend` (Cloud Build reads our Dockerfile) | `flyctl deploy` |
| Scale-to-zero | yes, ~1–2s cold start | yes, ~2–4s cold start |
| Secrets | Secret Manager (`--set-secrets`) | `flyctl secrets` |
| CI auth | Workload Identity Federation (keyless) | Fly API token |

At this scale Cloud Run is **$0/mo**, which makes the whole stack (Pages + Cloud
Run + Atlas M0) free. The existing `backend/Dockerfile` is reused as-is — the
app already honours `$PORT` (Cloud Run injects it) and binds `:$PORT` on all
interfaces, and `/api/healthz` already exists for probes.

## Consequences

* **No app code changes.** `$PORT` is already read in `config.go`; the server
  binds `":" + cfg.Port`. Cloud Run "just works" against the current image.
* **CI/CD is now real** (ADR-0001 left this as a follow-up). Push to `main` that
  touches `backend/**` triggers `.github/workflows/deploy-cloudrun.yml`, which
  builds and deploys. A manual `deploy/cloudrun/deploy.sh` mirrors it.
* **Keyless CI auth.** GitHub Actions authenticates via Workload Identity
  Federation — no long-lived service-account JSON key in repo secrets.
* **Secrets split by sensitivity.** `MONGODB_URI` lives in Secret Manager and is
  mounted with `--set-secrets`. `CORS_ALLOWED_ORIGINS` (a public origin) and the
  log/cookie flags are plain `--set-env-vars`.
* **Atlas IP allow-list stays `0.0.0.0/0`.** Cloud Run egress IPs are dynamic
  (same constraint that drove the Fly decision). A strong DB password
  compensates; static egress would need a paid VPC connector + Cloud NAT — not
  justified here.
* **Cold start.** First request after idle is ~1–2s. Acceptable for a family
  app. If it ever annoys, set `--min-instances 1` (leaves the free tier; a few
  $/mo) without any code change.
* **`fly.toml` is kept** as a documented fallback. Swapping back to Fly remains
  a one-command operation; this ADR does not delete that path.
* **Added vendor surface:** a GCP project to maintain alongside Cloudflare and
  Atlas. Net vendor count is unchanged (Cloud Run replaces Fly).

## Alternatives considered

* **Stay on Fly.io** — works and is marginally simpler to reason about, but
  costs ~$2–5/mo for no benefit at this scale. Cost is priority #1.
* **Oracle Cloud Always Free VM** — genuinely $0 forever and always-on (no cold
  start), but it is a raw VM: OS patching, Docker, TLS renewal, and log rotation
  land back on us. ADR-0001 already rejected self-hosting for this reason.
* **Render / Railway** — Render's always-on service is $7/mo; Railway removed its
  permanent free tier (~$5/mo). Both cost more than Cloud Run's $0.
* **Cloudflare Workers / Containers** — still a rewrite or a paid plan, same as
  ADR-0001 found.

## Follow-ups

* Custom domain on Cloud Run (domain mapping or a Cloudflare proxy in front).
* Once stable, delete `fly.toml` and the Fly references if the fallback is never
  exercised.
