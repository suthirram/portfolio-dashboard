# PD-042 — Dependency manifest

* **Feature**: Daily historical portfolio snapshots
* **Plan**: [PD-042](../plans/PD-042-historical-snapshots.md)
* **Design**: [DD-002](../designs/DD-002-historical-snapshots.md)

Every library, npm package, Go module, container image, or external
service that PD-042 introduces (or whose use widens) — and the
vulnerability check that was run before adopting it.

## 1. Go backend

**No new Go modules added.** The feature reuses everything already in
`backend/go.mod`:

| Package | Used by | Existing dependency? |
|---|---|---|
| `github.com/spf13/cobra` | new `snapshot` subcommand in `cmd/snapshot.go` | yes (used by `serve`, `migrate`) |
| `github.com/labstack/echo/v4` | new `/api/history*` routes in `controllers/history.go` | yes |
| `go.mongodb.org/mongo-driver` | new `SnapshotStore` in `persistence/snapshots.go` | yes |
| `go.mongodb.org/mongo-driver/mongo/integration/mtest` | new `*_test.go` files | yes |
| `go.uber.org/zap` | warn logs in `services/snapshot.go` | yes |

**Vulnerability check:** `go list -m -u all | grep -i 'vuln\|advisory'`
returns nothing. `govulncheck ./...` clean as of HEAD.

## 2. Frontend (npm)

**No new npm packages added.** Everything in PR7 is built from existing
dependencies in `frontend/package.json`:

| Package | Used by | Existing? |
|---|---|---|
| `react` | `features/history/HistoryPage.tsx` and friends | yes |
| `react-router-dom` | `/history` route in `App.tsx` | yes |
| `recharts` | `CurrencyChartPanel` (three per-currency line charts) | yes |
| `@testing-library/react`, `vitest` | new test files | yes |

**Vulnerability check:** `npm audit --omit=dev` reports 0
vulnerabilities at the time of this PR. Re-run the command in CI before
merging the feature → main PR.

## 3. Infrastructure additions

| Resource | Owner | Purpose | Cost |
|---|---|---|---|
| Mongo collection `portfolio_snapshots` | application | snapshot rows (PRD-002) | inside existing Atlas tier (free M0 fits comfortably; ~365 docs/user/year) |
| Cloud Scheduler job `pd-snapshot-daily` | GCP | invokes the `backend snapshot` Cloud Run Job at 00:00 UTC | Cloud Scheduler free tier covers ≤3 jobs/month/account |
| Cloud Run Job `pd-snapshot` | GCP | runs `backend snapshot` once per invocation; same container image as the web service | inside Cloud Run free tier for one daily invocation |

No new external SaaS, no new third-party APIs (Yahoo Finance access
was already used by the live `/api/prices` path).

## 4. v2 deps preview (not in this PR)

For the planned NATS JetStream migration:

* `github.com/nats-io/nats.go` — Go client for NATS / JetStream.
* `nats:2-alpine` — Docker image for the scheduler-svc and local dev.

To be added in the v2 PR; called out here so the next person evaluating
deps sees the trail.

## 5. Auditing this file

If you change any dep version, library, or external service for this
feature, edit this file in the same PR. Reviewers should reject deps
churn without a matching diff here.
