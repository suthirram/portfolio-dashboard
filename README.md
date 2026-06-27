# Portfolio Dashboard

A full-stack, multi-user portfolio tracker for NSE/BSE (Indian) and US
stocks/ETFs. Every account has its own private portfolio. Each position is
**derived from a per-holding trade ledger** (average cost), and the portfolio is
snapshotted daily into a browsable **history** with per-stock detail and charts.

## Stack

* **Frontend**: React + Vite + Recharts + React Router
* **Backend**: Go (echo router, cobra CLI) with an OpenAPI spec
* **Database**: MongoDB (Docker)
* **Auth**: username/password with server-side sessions (cookie `pd_session`)
* **Prices**: Yahoo Finance v8 API (live, 5-min cache)
* **Currencies**: INR and EUR holdings; live INR↔EUR forex rate. History
  snapshots bucket totals per currency (INR / EUR / USD).
* **History**: a daily snapshot job (`snapshot` subcommand, run by cron) records
  per-currency totals **and** per-stock closes; the History page charts them and
  drills into a per-stock breakdown.

## Accounts & roles

Authentication and multi-tenancy are specified in
[PRD-001](docs/prds/PRD-001-user-auth-and-multi-tenancy.md) /
[DD-001](docs/designs/DD-001-user-auth-and-multi-tenancy.md).

* **User** — signs up (username, password, region, three security questions),
  manages their own private portfolio. Password recovery is by security
  questions only; there is **no email**.
* **Admin** — a user the super admin promoted; oversees the users in their own
  **region** (India / Europe / US): can act on their portfolios, hide,
  reactivate, reset lockouts, or delete them.
* **Super admin** — the single owner. On a fresh deployment the system creates
  `admin` / `admin` and **forces onboarding** (real password + security
  questions) on first login. Appoints/demotes admins and assigns regions.

See [First run & operations](#first-run--operations) below.

## Columns tracked

| Column | Description |
|---|---|
| Script | Display name (your label) |
| Shares | Quantity held (derived from the ledger) |
| Avg Cost/Share | Average purchase price (derived, average-cost method) |
| Cost Price | Total invested (shares × avg cost) |
| Share Price | Live price from Yahoo Finance |
| Current Value | shares × live price |
| Money in Making | Unrealised P&L (current − cost) |
| Money Made | Realised P&L (from shares already sold) |

All INR values shown alongside EUR equivalent at live exchange rate.

## Transactions ledger

A holding's position is **not** edited directly — it is a projection of that
holding's trade ledger, recomputed on every write using the **average-cost**
method (PRD/DD: derive-from-ledger). Open the **Transactions** modal on a
holding to add events:

| Type | Effect |
|---|---|
| `opening` | Seeds the starting position (shares + total cost) and an optional realised-P&L carry. One per holding; created from the Add-Holding form's opening fields. |
| `buy` | Adds shares for a total debited amount; raises the running cost basis. |
| `sell` | Removes shares for a total credited amount; realises P&L = proceeds − avg-cost × qty. Overselling is rejected. |
| `dividend` | Records cash income; no quantity change. |
| `split` / `bonus` | Scales quantity by a ratio (basis invariant ⇒ avg cost falls). |
| `merger` | Recorded for audit; the position effect is modelled manually. |

Money is entered as the **total cash amount** (fees folded in), matching a
broker statement. Fractional shares are supported.

### Opening date

The opening event carries an **effective date**. The form doesn't ask for it, so
new/migrated openings start with no date set; the dashboard shows a one-time
**"Set opening dates"** prompt listing those holdings so you can set the real
acquisition date (the date picker defaults to `2026-06-15`). A correct opening
date keeps the historical snapshots valuing that holding from the right day.

## History & snapshots

A daily job (`snapshot`, run by an external cron — see
[PRD-002](docs/prds/PRD-002-historical-snapshots.md) /
[DD-002](docs/designs/DD-002-historical-snapshots.md)) writes one row per user
per day: per-currency **invested/current** totals (INR / EUR / USD) **and** a
per-stock breakdown (each holding's quantity, average cost, and that day's
close). The **History** page (`/history`):

* charts invested-vs-current, P/L %, and daily volatility per currency;
* shows a month table you can sort, and **add / paste / edit** manual rows
  (manual values override the cron value for that currency);
* lets you click a currency cell on a cron row to open a **Holdings** modal —
  the per-stock breakdown for that currency (script, yesterday price, current
  price, change value, daily change), positive positions only.

Backdated ledger edits **heal** the affected stored snapshots so history stays
consistent with the corrected ledger.

> **Known limitation:** the heal replays each holding's ledger *as-of* the
> snapshot date, and an `opening` event dated *after* that date is dropped — so
> a holding seeded with an opening dated "today" (the default) can be zeroed on
> an older row when an unrelated backdated edit re-heals it. Setting the
> holding's real **opening date** (via the prompt) avoids this.

## Symbol format (Yahoo Finance)

| Exchange | Format | Example |
|---|---|---|
| NSE | `TICKER.NS` | `TCS.NS`, `GOLDBEES.NS` |
| BSE | `TICKER.BO` | `RELIANCE.BO` |
| US (NYSE/NASDAQ) | Plain ticker | `AAPL`, `SPY` |

Use the **Test** button in the Add/Edit modal to verify a symbol before saving.

---

## Quick Start (Local Dev)

### Prerequisites

* [Docker](https://docker.com) (for MongoDB)
* [Go 1.25+](https://go.dev/dl/)
* [Node.js 20+](https://nodejs.org)

### 1. Start MongoDB

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Start the backend

```bash
cd backend
go mod tidy          # first time only
go run . serve
# API runs on http://localhost:8080
```

### 3. Start the frontend

```bash
cd frontend
npm install          # first time only
npm run dev
# App runs on http://localhost:3000
```

Open <http://localhost:3000>

---

## Full Stack (Docker)

Builds and runs everything (MongoDB + backend + frontend) in Docker:

```bash
docker compose up --build
```

App → <http://localhost:3000>  
API → <http://localhost:8080>  
OpenAPI spec → <http://localhost:8080/api/specs/openapi.yaml>

---

## API Endpoints

All routes except the public auth/catalogue endpoints require a session
cookie, and every state-changing request must send the
`X-Requested-With: portfolio-dashboard` header (CSRF). Holdings, prices, and
summary are scoped to the logged-in user.

### Auth (public)

| Method | Path | Description |
|---|---|---|
| GET | `/api/regions` | Region catalogue (signup dropdown) |
| GET | `/api/auth/security-questions` | Security-question catalogue |
| POST | `/api/auth/signup` | Create account + log in |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/recover/questions` | Fetch an account's questions (step 1) |
| POST | `/api/auth/recover` | Reset password via answers (step 2) |

### Auth (session)

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/me` | Current account |
| POST | `/api/auth/logout` | End the session |
| PUT | `/api/auth/password` | Change own password |
| PUT | `/api/auth/profile` | Change own name / username |
| PUT | `/api/auth/security-questions/answers` | Replace own questions |
| POST | `/api/auth/onboarding` | Forced first-login setup (super admin) |

### Portfolio (per-user)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/holdings` | List / add holdings (list carries `has_opening` + `opening_date`) |
| PUT/DELETE | `/api/holdings/{id}` | Edit a holding (incl. `opening_date`) / delete it |
| GET | `/api/prices` | Holdings with live prices + EUR |
| GET | `/api/summary` | Portfolio totals |
| GET | `/api/market/price?symbol=TCS.NS` | Live price for any symbol |
| GET | `/api/market/forex?from=INR&to=EUR` | Forex rate |

### Transactions (per-holding ledger)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/holdings/{id}/transactions` | List / append the holding's ledger events |
| PUT/DELETE | `/api/transactions/{id}` | Edit / remove a ledger event (holding is recomputed) |

### History (per-user snapshots)

| Method | Path | Description |
|---|---|---|
| GET | `/api/history?from=YYYY-MM-DD&to=YYYY-MM-DD` | Snapshot rows in range (each row carries per-currency totals + per-stock `holdings`) |
| POST | `/api/history` | Add a manual row |
| PUT | `/api/history/{date}/regions` | Override specific currency buckets (flips them to `manual`) |
| DELETE | `/api/history/{date}` | Delete a row (cron rows protected; super admin can force) |
| POST | `/api/history/paste` | Bulk-paste a month of rows (TSV from a spreadsheet) |

**Admin** (region-scoped; super admin sees all) — `/api/admin/users`,
`/api/admin/users/{id}` (+ `/hide`, `/reactivate`, `/reset-lockout`,
`/promote`, `/demote`, `/region`, and act-as `/holdings`, `/prices`,
`/summary`), and `/api/admin/admins` (super admin only).

Full spec: `/api/specs/openapi.yaml`

---

## Environment variables

### Backend

| Var / Flag | Default | Description |
|---|---|---|
| `MONGODB_URI` / `--mongo-uri` | `mongodb://localhost:27017/portfolio` | MongoDB connection string |
| `MONGODB_DATABASE` / `--mongo-db` | `portfolio` | Database name |
| `PORT` / `--port` | `8080` | Server port |
| `LOG_LEVEL` / `--log-level` | `info` | `debug` \| `info` \| `warn` \| `error` |
| `LOG_FORMAT` / `--log-format` | `json` | `json` \| `text` |
| `CORS_ALLOWED_ORIGINS` | dev: `http://localhost:3000,http://localhost:5173` | Comma-separated allow-list. **Required in production** — credentialed CORS forbids `*`, so set the real origin (e.g. `https://<app>.pages.dev`). |
| `COOKIE_SECURE` | `false` | Set to `true` in production so the session cookie is emitted with `Secure; SameSite=None`. Driven by config, not `c.Scheme()`, so the hardening does not silently degrade if the proxy stops forwarding `X-Forwarded-Proto`. |
| `PD_NEW_PASSWORD` | *(unset)* | Read only by `admin set-password` so the new password stays out of shell history |

Flags take precedence over env vars, which take precedence over defaults.
Example: `PORT=9090 go run . serve` or `go run . serve --port 9090`.

### Frontend

| Var | Default | Description |
|---|---|---|
| `VITE_API_URL` | (proxied via Vite) | Backend URL for production builds |

Cross-origin auth needs HTTPS: the session cookie is `SameSite=None; Secure`
in production. In local dev the Vite proxy keeps `/api` same-origin, so the
cookie falls back to `SameSite=Lax` and plain HTTP works.

---

## First run & operations

On a brand-new database the backend creates a single super admin
`admin` / `admin` with `must_change_password` set. Log in and complete the
forced onboarding (real password + three security questions) before anything
else works.

```bash
cd backend

# Assign any pre-auth holdings to an owner (run once after upgrading):
go run . migrate users --owner admin

# Seed an `opening` ledger event for every existing holding so its position
# becomes a projection of the new transactions ledger (idempotent):
go run . migrate transactions

# Copy the super admin's holdings into another database (e.g. local → prod):
MONGODB_URI='mongodb://localhost:27017/portfolio' \
  go run . migrate copy-holdings --to-uri '<dest-uri>' --to-db portfolio

# Break-glass for a locked-out super admin (no login; needs MONGODB_URI):
go run . admin reset-lockout --username admin
PD_NEW_PASSWORD='a-strong-password' go run . admin set-password --username admin
```

### Daily snapshot job

The history is fed by the `snapshot` subcommand, invoked by an external cron
(Cloud Run Job `pd-snapshot` in production). It runs the **same binary/image**
as the API, so a deploy that updates the API also repoints the job.

```bash
# Snapshot the current IST trading day for every active user:
go run . snapshot

# Re-run a specific day (idempotent; preserves manual overrides):
go run . snapshot --date 2026-06-24
```

---

## Deployment

The app is deployed across Cloudflare Pages (frontend), **Google Cloud Run**
(Go API), and MongoDB Atlas (database). At family scale (~5–10 users) the whole
stack sits inside free tiers — **$0/mo**. See:

* [ADR-0002: Backend on Cloud Run](docs/adrs/ADR-0002-backend-cloud-run.md) — why Cloud Run (supersedes the Fly.io tier of ADR-0001)
* [ADR-0001: Deployment stack](docs/adrs/ADR-0001-deploy-stack.md) — the original Pages + Fly + Atlas split
* [PD-029: Cloud Run runbook](docs/plans/PD-029-cloud-run-deploy.md) — step-by-step deploy + keyless CI setup
* [PD-012: Cloudflare + Fly + Atlas runbook](docs/plans/PD-012-cloudflare-flyio-deploy.md) — the prior (Fly) runbook, kept as fallback

Once configured, both tiers auto-deploy on push to `main`: Cloudflare Pages
(frontend) and the [`deploy-cloudrun`](.github/workflows/deploy-cloudrun.yml)
GitHub Action (backend, on `backend/**` changes). First/manual backend deploy:

```bash
GCP_PROJECT_ID=<proj> CORS_ALLOWED_ORIGINS=https://<app>.pages.dev \
  ./deploy/cloudrun/deploy.sh
```

`backend/fly.toml` is retained as a documented fallback (`cd backend && flyctl deploy`).
