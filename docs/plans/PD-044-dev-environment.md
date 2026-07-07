# PD-044: Dev environment — label-triggered deploy to GCP

* **Status**: Draft
* **Owner**: project owner
* **First consumer**: [PD-043 physical gold](PD-043-physical-gold-tracking.md)

## 1. Goal

A persistent **dev stack in GCP**, isolated from prod, where a feature
branch can be tested end-to-end before merging to `main`. Deployment is
**label-driven**: adding the **`dev` label to a PR** deploys that PR's
head branch to the dev stack; subsequent pushes to a labeled PR re-deploy.

Prod flow is unchanged: `main` → `deploy-cloudrun.yml` → prod service.

## 2. Trigger semantics

New workflow `.github/workflows/deploy-dev.yml`:

```yaml
on:
  pull_request:
    types: [labeled, synchronize, reopened]

jobs:
  deploy-dev:
    if: contains(github.event.pull_request.labels.*.name, 'dev')
```

* `labeled` — first deploy the moment the `dev` label is added.
* `synchronize` — re-deploy on every push while the label is present.
* Only one dev stack: `concurrency: group: deploy-dev,
  cancel-in-progress: true` — the newest labeled PR wins; the workflow
  comments the dev URL on the PR after deploy.
* Security: labels can only be applied by collaborators with triage+
  permission, so the label is the approval gate. Fork PRs are excluded
  (`github.event.pull_request.head.repo.full_name == github.repository`)
  because WIF secrets don't flow to forks anyway.

## 3. Dev stack shape

Mirrors prod, suffixed `-dev`, same region (`europe-west1`), same WIF
identity (deploy SA gets rights on the dev resources):

| Piece | Prod | Dev |
|---|---|---|
| Backend | Cloud Run `portfolio-dashboard-api` | Cloud Run `portfolio-dashboard-api-dev` (min 0, max 1, 256–512 Mi) |
| Mongo | Atlas prod cluster / `portfolio` | same cluster, **same `MONGODB_URI` secret**, separate database via `MONGODB_DATABASE=portfolio_dev` (the DB name comes from the env var, not the URI — no new secret) |
| Postgres (PD-043) | **Neon** (owner pick, 2026-07-04) — prod branch/database, secret `POSTGRES_URI` | **Neon** — separate branch/database, secret `POSTGRES_URI_DEV`. **Optional**: the workflow wires it only when the secret exists; until then the backend deploys with gold features disabled (designed degrade path) |
| Frontend | Cloudflare Pages + `/api` same-origin proxy function | second Pages project (or branch env), **`VITE_API_URL` left unset**, Pages env `API_ORIGIN` = dev Cloud Run URL |
| Snapshot cron | Cloud Run Job `pd-snapshot` | **none** — dev snapshots seeded manually (`go run . snapshot` against dev DBs or run-app skill seed flow) |

Deploy step reuses the prod `gcloud run deploy` block with dev names,
dev secrets, and `CORS_ALLOWED_ORIGINS` pointing at the dev frontend
origin. `COOKIE_SECURE=true` (dev is HTTPS too).

**Same-origin rule (do not regress):** the dev frontend keeps the
relative `/api` path through the Pages proxy function
(`frontend/functions/api/[[path]].ts`), exactly like prod. Building the
dev site with a cross-origin `VITE_API_URL` would make the session cookie
third-party — iOS Safari/Chrome block it and login silently breaks. Dev
differs from prod only in the Pages `API_ORIGIN` env var, which points at
the dev Cloud Run service.

## 4. Data policy

* Dev databases hold **seed/test data only** — never a prod copy with
  real credentials. Seeding: `migrate copy-holdings --to-uri <dev>` for
  holdings; a first-run super admin bootstraps automatically.
* Dev stack is unauthenticated-network like prod (auth lives in the app);
  URL is not linked anywhere public.

## 5. Work items

1. ~~GCP provisioning script~~ — not needed: the first labeled deploy
   creates the dev Cloud Run service (`gcloud run deploy` creates on
   first use), the Mongo secret is reused, and the Postgres secret is
   optional. The only manual GCP step left is adding `POSTGRES_URI_DEV`
   to Secret Manager once the Neon dev branch exists (plus
   `CORS_ALLOWED_ORIGINS_DEV` GitHub secret when the dev Pages origin is
   known — the workflow falls back to the prod value until then).
2. ~~`deploy-dev.yml` workflow~~ — done (backend deploy + PR comment
   with URL; label + same-repo gated; `concurrency: deploy-dev` so the
   newest labeled deploy wins).
3. Frontend dev: Cloudflare Pages dev project/branch with `API_ORIGIN`
   set to the dev Cloud Run URL and `VITE_API_URL` unset (same-origin
   rule above). Owner action in the Pages dashboard.
4. ~~Create the `dev` label~~ — done.
5. README note: how to claim the dev stack (label a PR), how to seed it.

## 6. Open questions

1. ~~Dev Postgres flavor~~ — **Neon free tier** (owner, 2026-07-04).
   Serverless, scales to zero, separate Neon branches for dev and prod;
   connection strings in Secret Manager. Owner creates the Neon project
   and provides both URIs.
2. ~~Frontend dev hosting target~~ — prod frontend is Cloudflare Pages
   with the `/api` proxy function (PD-012); dev mirrors it. Remaining
   sub-choice: separate Pages project vs branch deploy of the prod
   project (branch deploys share prod's `API_ORIGIN` unless overridden —
   check Pages env scoping before picking).
3. Should removing the `dev` label tear down / scale the dev service to
   zero, or is min-instances=0 idle cost acceptable? (Default: do nothing;
   idle Cloud Run at min 0 costs ~nothing.)
