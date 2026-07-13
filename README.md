# Portfolio Dashboard

A full-stack, multi-user portfolio tracker for NSE/BSE (Indian) and US
stocks/ETFs. Every account has its own private portfolio. Each position is
**derived from a per-holding trade ledger** (average cost), and the portfolio is
snapshotted daily into a browsable **history** with per-stock detail and charts.

## Stack

* **Frontend**: React + Vite + Recharts + React Router
* **Backend**: Go (echo router, cobra CLI) with an OpenAPI spec
* **Database**: MongoDB (portfolio) + Postgres (gold tracking, optional; Docker)
* **Auth**: username/password with server-side sessions (cookie `pd_session`)
* **Prices**: Yahoo Finance v8 API (live, 5-min cache)
* **Currencies**: INR and EUR holdings; live INR↔EUR forex rate. History
  snapshots bucket totals per currency (INR / EUR / USD).
* **History**: a daily snapshot job (`snapshot` subcommand, run by cron) records
  per-currency totals **and** per-stock closes; the History page charts them and
  drills into a per-stock breakdown.
* **Gold**: physical gold tracking
  ([PRD-003](docs/prds/PRD-003-physical-gold-tracking.md) /
  [DD-003](docs/designs/DD-003-physical-gold-tracking.md)) — purchases, monthly
  prices, metrics (XIRR), and a gold overlay on the History page. Stored in
  Postgres; the feature is optional — without `POSTGRES_URI` the server runs
  with gold disabled.

## Documentation

| Topic | What's inside |
|---|---|
| [Local setup](docs/local-setup.md) | Prerequisites, local dev quick start, full Docker stack |
| [Accounts & roles](docs/accounts-and-roles.md) | User / admin / super admin, regions, onboarding |
| [Portfolio model](docs/portfolio-model.md) | Columns tracked, transactions ledger, opening date, symbol format |
| [History & snapshots](docs/history-and-snapshots.md) | Daily snapshot job, History page, backdated-edit healing |
| [API endpoints](docs/api.md) | Route tables (auth, portfolio, transactions, history, admin) |
| [Configuration](docs/configuration.md) | Backend + frontend environment variables |
| [First run & operations](docs/operations.md) | Super-admin bootstrap, migration CLIs, snapshot job |
| [Deployment](docs/deployment.md) | Cloudflare Pages + Cloud Run + Atlas, runbooks |

Design records live under [`docs/prds`](docs/prds), [`docs/designs`](docs/designs),
[`docs/adrs`](docs/adrs), and [`docs/plans`](docs/plans).

## Quick start

```bash
docker compose -f docker-compose.dev.yml up -d   # MongoDB + Postgres
(cd backend && go run . serve)                    # API  → :8080
(cd frontend && npm install && npm run dev)       # app  → :3000
```

Open <http://localhost:3000>. Full details in [Local setup](docs/local-setup.md).
