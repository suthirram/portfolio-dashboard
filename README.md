# Portfolio Dashboard

A full-stack portfolio tracker for NSE/BSE (Indian) and US stocks/ETFs.

## Stack

* **Frontend**: React + Vite + Recharts
* **Backend**: Go (chi router, cobra CLI) with OpenAPI spec
* **Database**: MongoDB (Docker)
* **Prices**: Yahoo Finance v8 API (live, 5-min cache)
* **Currencies**: INR and EUR holdings; live INR↔EUR forex rate

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
* [Go 1.21+](https://go.dev/dl/)
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

| Method | Path | Description |
|---|---|---|
| GET | `/api/holdings` | List all holdings |
| POST | `/api/holdings` | Add a holding |
| PUT | `/api/holdings/{id}` | Edit a holding |
| DELETE | `/api/holdings/{id}` | Delete a holding |
| GET | `/api/prices` | All holdings with live prices + EUR |
| GET | `/api/summary` | Portfolio totals |
| GET | `/api/market/price?symbol=TCS.NS` | Live price for any symbol |
| GET | `/api/market/forex?from=INR&to=EUR` | Forex rate |

Full spec: `/api/openapi.yaml`

---

## Environment variables

### Backend

| Var / Flag | Default | Description |
|---|---|---|
| `MONGODB_URI` / `--mongo-uri` | `mongodb://localhost:27017/portfolio` | MongoDB connection string |
| `PORT` / `--port` | `8080` | Server port |

Env vars take precedence over flags. Example: `PORT=9090 go run . serve` or `go run . serve --port 9090`.

### Frontend

| Var | Default | Description |
|---|---|---|
| `VITE_API_URL` | (proxied via Vite) | Backend URL for production builds |

---

## Deployment

The app is deployed across Cloudflare Pages (frontend), Fly.io (Go API), and
MongoDB Atlas (database). See:

* [ADR-0001: Deployment stack](docs/adrs/ADR-0001-deploy-stack.md) — why this split
* [PD-012: Cloudflare + Fly + Atlas runbook](docs/plans/PD-012-cloudflare-flyio-deploy.md) — step-by-step deploy

Once configured, frontend deploys auto-trigger on push to `main` (Cloudflare
Pages); backend is deployed with `cd backend && flyctl deploy`.
