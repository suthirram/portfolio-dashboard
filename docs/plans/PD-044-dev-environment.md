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
| Mongo | Atlas prod cluster / `portfolio` | same cluster, **separate database** `portfolio_dev` + separate secret `MONGODB_URI_DEV` |
| Postgres (PD-043) | TBD prod instance | **decision pending**: Cloud SQL `db-f1-micro`-class shared instance with `portfolio_dev` database, vs. Neon free tier. Secret `POSTGRES_URI_DEV`. |
| Frontend | prod hosting | dev site (same host, `-dev` project/branch) built with `VITE_API_URL` = dev API URL |
| Snapshot cron | Cloud Run Job `pd-snapshot` | **none** — dev snapshots seeded manually (`go run . snapshot` against dev DBs or run-app skill seed flow) |

Deploy step reuses the prod `gcloud run deploy` block with dev names,
dev secrets, and `CORS_ALLOWED_ORIGINS` pointing at the dev frontend
origin. `COOKIE_SECURE=true` (dev is HTTPS too).

## 4. Data policy

* Dev databases hold **seed/test data only** — never a prod copy with
  real credentials. Seeding: `migrate copy-holdings --to-uri <dev>` for
  holdings; a first-run super admin bootstraps automatically.
* Dev stack is unauthenticated-network like prod (auth lives in the app);
  URL is not linked anywhere public.

## 5. Work items

1. GCP: create dev Cloud Run service, dev secrets (`MONGODB_URI_DEV`,
   later `POSTGRES_URI_DEV`), grant deploy SA. Script it in
   `infra/gcp/dev-stack.sh` (idempotent, like `snapshot-job.sh`).
2. `deploy-dev.yml` workflow (backend deploy + PR comment with URL).
3. Frontend dev deploy step (same workflow) once the hosting choice for
   dev is confirmed (mirror of the prod frontend host).
4. Create the `dev` label in the repo.
5. README note: how to claim the dev stack (label a PR), how to seed it.

## 6. Open questions

1. Dev Postgres flavor: Cloud SQL (same-cloud, ~always-on cost) vs Neon
   free tier (zero cost, external). Owner to pick.
2. Frontend dev hosting target — mirror of prod host (which one is prod
   frontend on: Cloudflare Pages per PD-012, or Cloud Run?). Confirm and
   wire the matching preview/branch deploy.
3. Should removing the `dev` label tear down / scale the dev service to
   zero, or is min-instances=0 idle cost acceptable? (Default: do nothing;
   idle Cloud Run at min 0 costs ~nothing.)
