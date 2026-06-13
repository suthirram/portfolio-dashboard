# Portfolio Dashboard

A full-stack, multi-user portfolio tracker for NSE/BSE (Indian) and US
stocks/ETFs. Every account has its own private portfolio.

## Stack

* **Frontend**: React + Vite + Recharts + React Router
* **Backend**: Go (echo router, cobra CLI) with an OpenAPI spec
* **Database**: MongoDB (Docker)
* **Auth**: username/password with server-side sessions (cookie `pd_session`)
* **Prices**: Yahoo Finance v8 API (live, 5-min cache)
* **Currencies**: INR and EUR holdings; live INR↔EUR forex rate

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
| Shares | Quantity held |
| Avg Cost/Share | Average purchase price |
| Cost Price | Total invested (shares × avg cost) |
| Share Price | Live price from Yahoo Finance |
| Current Value | shares × live price |
| Money in Making | Unrealised P&L (current − cost) |
| Money Made | Realised P&L (from shares already sold) |

All INR values shown alongside EUR equivalent at live exchange rate.

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
OpenAPI spec → <http://localhost:8080/api/openapi.yaml>

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
| GET/POST | `/api/holdings` | List / add holdings |
| PUT/DELETE | `/api/holdings/{id}` | Edit / delete a holding |
| GET | `/api/prices` | Holdings with live prices + EUR |
| GET | `/api/summary` | Portfolio totals |
| GET | `/api/market/price?symbol=TCS.NS` | Live price for any symbol |
| GET | `/api/market/forex?from=INR&to=EUR` | Forex rate |

**Admin** (region-scoped; super admin sees all) — `/api/admin/users`,
`/api/admin/users/{id}` (+ `/hide`, `/reactivate`, `/reset-lockout`,
`/promote`, `/demote`, `/region`, and act-as `/holdings`, `/prices`,
`/summary`), and `/api/admin/admins` (super admin only).

Full spec: `/api/openapi.yaml`

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
| `PD_NEW_PASSWORD` | _(unset)_ | Read only by `admin set-password` so the new password stays out of shell history |

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

# Break-glass for a locked-out super admin (no login; needs MONGODB_URI):
go run . admin reset-lockout --username admin
PD_NEW_PASSWORD='a-strong-password' go run . admin set-password --username admin
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
