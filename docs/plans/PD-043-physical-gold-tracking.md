# PD-043: Rollout plan — physical gold tracking

* **Status**: In progress
* **Owner**: project owner
* **Implements**: [PRD-003](../prds/PRD-003-physical-gold-tracking.md)
* **Design**: [DD-003](../designs/DD-003-physical-gold-tracking.md)
* **Dev environment**: [PD-044](../plans/PD-044-dev-environment.md)

## 1. Branching model (owner-specified)

* Long-lived feature branch: **`feat/PD-043-physical-gold`** (cut from
  `main`).
* Every slice below is its own branch off the feature branch and merges
  **into the feature branch** via PR.
* The feature branch merges to `main` in one final PR after end-to-end
  testing on the **dev environment** (PD-044): adding the `dev` label to a
  PR deploys that branch to the GCP dev stack.
* Every slice passes the task-breakdown gates: no regression, adds value,
  ships with tests.

## 2. PR sequence

| # | Branch | Scope | Test anchor |
|---|---|---|---|
| PR1 | `feat/PD-043-gold-docs` | PRD-003, DD-003, PD-043, PD-044 | doc review |
| PR2 | `feat/PD-043-postgres-infra` | pgx dep, `POSTGRES_URI` config, pool + embedded migrations, compose services, `Store.Gold` wiring (nil-safe) | migration runner unit test; `go build` green; app boots with and without Postgres |
| PR3 | `feat/PD-043-gold-domain-store` | `domain/gold.go`, `persistence/gold.go` (owner-scoped CRUD, bulk price upsert) | store tests against local Postgres (compose) |
| PR4 | `feat/PD-043-gold-flag-gate` | `gold_enabled` on user, `RequireGold` auth gate, super-admin toggle endpoint + admin UI toggle | gate tests: disabled→404, non-super-admin→403/404 |
| PR5 | `feat/PD-043-gold-txn-api` | `computeColumns` (formulas locked, PRD §9), GoldService txn CRUD, controllers, OpenAPI + codegen | spreadsheet-pinned unit tests |
| PR6 | `feat/PD-043-gold-prices-api` | price series GET/bulk PUT, `MissingDates` | gap-detection unit tests |
| PR7 | `feat/PD-043-gold-metrics-api` | XIRR, `Metrics` incl. beesPL via `PriceFetcher` | XIRR vs spreadsheet `XIRR()`; metrics service tests |
| PR8 | `feat/PD-043-gold-page-ui` | `/gold` route, guard, nav link, transactions table + modal | vitest render tests |
| PR9 | `feat/PD-043-gold-prices-ui` | daily-price panel + `MissingPricesModal` blocking prompt | vitest: prompt shows/saves/clears |
| PR10 | `feat/PD-043-gold-metrics-ui` | metrics table on Gold page | vitest render test |
| PR11 | `feat/PD-043-history-gold` | `HistoryOverlay` service + `gold` in `/api/history` + History page column group/chart series | overlay unit tests incl. worked example (72 g → 7200/14400/0/100%) |
| Final | `feat/PD-043-physical-gold` → `main` | after dev-env verification | full suite + manual run-app pass |

Order note: PR4 before PR5 so every gold endpoint lands already gated.

## 3. Environment changes

* **Local**: `docker-compose.dev.yml` gains `postgres:16-alpine`
  (port 5432, volume `pgdata-dev`). `make dev-db` starts both DBs.
* **Full stack**: `docker-compose.yml` gains the same + `POSTGRES_URI` on
  the backend service.
* **Dev (GCP)**: PD-044 provisions dev Cloud Run + dev Mongo + dev
  Postgres; this feature is its first consumer.
* **Prod**: new secret `POSTGRES_URI` in Secret Manager;
  `deploy-cloudrun.yml` adds `--set-secrets POSTGRES_URI=POSTGRES_URI:latest`.
  Prod Postgres instance choice tracked in PD-044 §5.

## 4. Blockers / decisions pending

1. ~~PRD-003 §9 formulas~~ — resolved 2026-07-04, see PRD-003 §9.
2. ~~Daily-price day rule~~ — every calendar day (PRD §9.5).
3. ~~GOLDBEES identification~~ — symbol match (PRD §9.6).
4. Dev Postgres flavor (Cloud SQL vs Neon) — before PD-044 lands.

## 5. Follow-ups (out of v1)

* Sell/redemption transactions and realised P/L for physical gold.
* Multiple purity tracks (22k/24k).
* Gold act-as for super admin.
* Automated Chennai-rate scrape as a *suggestion* (never silent write).
