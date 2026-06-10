# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack portfolio tracker for NSE/BSE (Indian) and US stocks/ETFs. Tracks holdings with live prices from Yahoo Finance (5-min cache), unrealised P&L, realised P&L, and INR/EUR conversion via live forex.

## Commands

### Local Development

```bash
# Start MongoDB (required before running backend)
make dev-db                        # or: docker compose -f docker-compose.dev.yml up -d

# Backend (Go) — runs on :8080
make backend                           # or: cd backend && go run . serve

# Frontend (React/Vite) — runs on :3000
make frontend                      # or: cd frontend && npm run dev

# First-time setup
make tidy                          # cd backend && go mod tidy
make install                       # cd frontend && npm install
```

### Full Docker Stack

```bash
make prod          # docker compose up --build  (MongoDB + backend + frontend)
make down          # stop all containers
```

### Frontend build

```bash
cd frontend && npm run build       # outputs to frontend/dist
cd frontend && npm run preview     # preview production build locally
```

## Architecture

### Backend (`backend/`)

Go service using **echo** router and **cobra** CLI with structured logging via `log/slog`. Entry point: `main.go` calls `cmd.Execute()`.

- `cmd/root.go` — cobra root command; registers subcommands
- `cmd/serve.go` — `serve` subcommand; loads config, builds the logger, connects MongoDB, wires the `Handler` and HTTP server, and runs with graceful shutdown
- `internal/config/config.go` — typed `Config` (defaults < env < explicit flag)
- `internal/logging/logging.go` — slog factory (`json`/`text`); `internal/logging/context.go` stashes a per-request logger on context
- `internal/httpserver/server.go` — builds `*echo.Echo`, registers routes, owns graceful shutdown, and renders errors in the OpenAPI `{"error": "..."}` shape via a custom `HTTPErrorHandler`
- `internal/httpserver/middleware.go` — slog-backed request logger (severity tracks status, propagates `request_id` to context)
- `handlers/handlers.go` — HTTP handlers; `Handler` struct owns `*mongo.Database` + `priceFetcher` interface + `*slog.Logger`
- `handlers/mapper.go` — DBO↔DTO conversion helpers (`holdingFromInput`, `holdingToAPI`, `holdingWithPriceToAPI`)
- `services/price.go` — `PriceService` hits Yahoo Finance v8 API with an in-memory TTL cache (5 min, `sync.RWMutex`)
- `models/holding.go` — `Holding` struct (MongoDB document model)
- `db/mongo.go` — MongoDB connection + index creation
- `api/openapi.yaml` — served live at `/api/openapi.yaml`

### Frontend (`frontend/src/`)

React 18 + Vite SPA written in TypeScript with no routing — single-page layout.

- `App.tsx` — root component, owns all state and orchestrates data fetching
- `api/client.ts` — typed fetch wrapper; in dev, Vite proxies `/api` → `localhost:8080`
- `types.ts` — TypeScript interfaces mirroring `backend/api/openapi.yaml` schemas
- `components/HoldingsTable.tsx` — main table with inline actions
- `components/AddEditModal.tsx` — create/edit holding form; includes symbol **Test** button hitting `/api/market/price`
- `components/SummaryCards.tsx` — totals bar (cost, current value, P&L)
- `components/Charts.tsx` — Recharts pie/bar charts

### Data flow

```
Frontend → /api/prices        → backend fetches live Yahoo Finance price per holding
         → /api/summary       → aggregated portfolio totals
         → /api/market/price  → ad-hoc symbol lookup (modal Test button)
         → /api/market/forex  → INR→EUR rate
```

All prices are cached per-symbol in `PriceService.cache` (5-min TTL).

## Symbol format

| Exchange | Format | Example |
|---|---|---|
| NSE | `TICKER.NS` | `TCS.NS` |
| BSE | `TICKER.BO` | `RELIANCE.BO` |
| US | plain ticker | `AAPL`, `SPY` |

## Environment Variables

**Backend** (defaults work for local dev):
- `MONGODB_URI` — default `mongodb://localhost:27017/portfolio`
- `PORT` — default `8080`

**Frontend** (`frontend/.env.example`):
- `VITE_API_URL` — set for production builds; in dev, Vite proxy handles `/api`
