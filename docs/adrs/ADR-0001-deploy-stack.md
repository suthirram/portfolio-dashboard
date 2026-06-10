# ADR-0001: Deployment stack — Cloudflare Pages + Fly.io + MongoDB Atlas

* **Status**: Accepted
* **Date**: 2026-06-10
* **Deciders**: project owner

## Context

The portfolio dashboard has only ever run locally (via `make backend` /
`make frontend` or `docker compose up`). We want a hosted deploy so the app
is reachable from a phone/laptop without spinning up Docker. Requirements:

* Frontend (React/Vite SPA), backend (Go API), and MongoDB all need to be
  hosted.
* Low/no fixed monthly cost — this is a personal portfolio, not a business.
* No re-platforming of the Go service. The existing `backend/Dockerfile`
  should be reusable.
* Custom-domain ready (not v1, but shouldn't paint us into a corner).

A single Cloudflare-only deploy was attractive (one vendor, generous free
tier, global anycast). But Cloudflare Pages only serves static assets, and
the alternatives for the Go API + MongoDB on Cloudflare are either a
rewrite (Workers) or paid beta (Containers).

## Decision

Split the deploy across three providers:

| Tier | Provider | Why |
|---|---|---|
| Static frontend | Cloudflare Pages | Free static hosting, global CDN, git-push deploy, Vite preset built in |
| Go API | Fly.io | Runs our existing Dockerfile as-is, scale-to-zero keeps cost near zero, simple secret management via `flyctl secrets`, anycast routing |
| MongoDB | MongoDB Atlas (M0) | Free 512MB cluster, managed backups, no ops |

## Consequences

* Three vendor accounts to maintain (Cloudflare, Fly.io, Atlas).
* CORS becomes a real concern — the API is now a different origin from the
  frontend. We're adding a `CORS_ALLOWED_ORIGINS` env var and explicitly
  allow-listing the Pages origin in production. Dev keeps the `"*"` fallback.
* Secrets (`MONGODB_URI`, `CORS_ALLOWED_ORIGINS`) live in `flyctl secrets`,
  not in git.
* Fly's scale-to-zero behaviour adds a ~2–4s cold-start on the first request
  after idle. Acceptable for a personal app.
* Atlas free tier is auth-only with `0.0.0.0/0` IP allow-list because Fly's
  egress IPs are dynamic. Strong DB password compensates. Tightening the
  IP list would require a paid Fly dedicated egress IP — not justified
  for this app.
* The existing `backend/Dockerfile` had a latent bug (`CMD ["./portfolio-api"]`
  missing the `serve` subcommand). Fixing this as part of the deploy work
  also fixes `docker compose up`.

## Alternatives considered

### Cloudflare Workers rewrite — rejected

Rewrite the Go API as TypeScript Workers + Cloudflare D1 / external Mongo.
Big port for a personal app, throws away the existing Go code, and the
Yahoo Finance fetch + 5-min cache logic would need to be reimplemented
against Workers' execution model.

### Cloudflare Containers — rejected

Currently in beta and requires the Workers Paid plan ($5/mo). Once GA it
might be worth revisiting for a one-vendor setup.

### Render or Railway for the backend — viable alternative, deferred

Both can run our Dockerfile. Fly was preferred for:

* Global anycast (lower latency from EU and India)
* `flyctl` CLI feels closer to the Docker workflow we already use
* Mature scale-to-zero story

If Fly proves painful, swapping to Render is a one-day migration — the
contract is just "run this Dockerfile, give me env vars and HTTPS".

### Self-hosted VPS (Hetzner / Oracle Free Tier) — rejected

Cheaper at steady state but adds OS patching, TLS renewal, log rotation,
and Mongo admin to my plate. Not worth it for the savings.

## Follow-ups

* Custom domain (both Pages and Fly support it cleanly)
* CI/CD via GitHub Actions (v1 is manual `flyctl deploy` + Pages git auto-deploy)
* API authentication — the API is currently public; this predates the deploy
  but is more visible now that it's on the internet
