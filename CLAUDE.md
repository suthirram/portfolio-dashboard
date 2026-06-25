# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git workflow

Never commit directly to `main`. Every change goes on its own branch, then to `main` via a PR — even one-line fixes. A `no-commit-to-branch` pre-commit hook blocks direct commits to `main`. Standard flow: branch from `main` → commit → push → `gh pr create` → merge (squash). After "commit"/"push"/"open a PR" requests, follow this flow without asking.

## Project Overview

A full-stack portfolio tracker for NSE/BSE (Indian) and US stocks/ETFs. Tracks holdings with live prices from Yahoo Finance (5-min cache), unrealised P&L, realised P&L, and INR/EUR conversion via live forex.

Multi-tenant: every user owns a private portfolio (PRD-001 / DD-001). Roles: `user` → `admin` (one region) → `superadmin` (single owner). Regions (`india`/`europe`/`us`) are an oversight grouping, not data residency. First-run creates `admin`/`admin` with `must_change_password=true`; the super admin sets a real password + 3 security questions on first login (`/onboarding`).

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

Go service using **echo** router and **cobra** CLI with structured logging via `go.uber.org/zap`. Entry point: `main.go` calls `cmd.Execute()`.

* `cmd/root.go` — cobra root command; registers subcommands
* `cmd/serve.go` — `serve` subcommand; loads config, builds the logger, connects MongoDB, ensures indexes + bootstrap super admin, wires the `Handler` and HTTP server, runs with graceful shutdown
* `cmd/migrate.go` — one-shot subcommands: `migrate users --owner <name>` (stamp legacy holdings with `user_id`) and `admin reset-lockout|set-password --username <name>` break-glass CLI (DD-001 §8/§10)
* `internal/auth/` — catalogues (regions, security questions), password/answer hashing (bcrypt), session id generator, super-admin bootstrap, request-context helpers (`WithUser`, `WithSessionID`)
* `internal/config/config.go` — typed `Config` (defaults < env < explicit flag)
* `internal/logging/logging.go` — zap factory (`json`/`text`); `internal/logging/context.go` stashes a per-request logger on context
* `internal/httpserver/server.go` — builds `*echo.Echo`, registers routes, owns graceful shutdown, and renders errors in the OpenAPI `{"error": "..."}` shape via a custom `HTTPErrorHandler`. Wires `CSRFCheck` (refuses state-changing requests without `X-Requested-With: portfolio-dashboard`) and `AuthGate` (session lookup, role/region/onboarding gates).
* `internal/httpserver/middleware.go` — zap-backed request logger (severity tracks status, propagates `request_id` to context)
* `internal/httpserver/auth.go` — `CSRFCheck`, `AuthGate`, session loading + sliding expiry
* `internal/persistence/` — **data-access layer, one store type per collection** (`holdings.go`, `users.go`, `sessions.go`). `persistence.New(db)` builds a `*Store` bundling `HoldingStore`/`UserStore`/`SessionStore`. All MongoDB reads/writes live here; callers (services, controllers, middleware, CLI) use domain types and never touch `*mongo.Collection`/`bson` directly. Holdings methods are owner-scoped by construction (`scopedFilter`); single reads return `persistence.ErrNotFound`, inserts return `persistence.ErrDuplicate`.
* `internal/controllers/controllers.go` — `Controller` struct (owns `*persistence.Store`, the per-domain services, and `*zap.Logger`). `New(db, logger, cookieSecure)` wires the default services; `newWithDeps` is the test seam.
* `internal/controllers/auth.go` — signup, login, logout, recover (two-step), me, change password, update profile, update security questions, onboarding. Still owns the auth flow end-to-end because it composes credential checks with cookie writes.
* `internal/controllers/admin.go` — admin/super-admin endpoints: list users/admins, get/hide/reactivate/delete user, reset-lockout, promote, demote, set region, act-as holdings CRUD/prices/summary. Region scope enforced server-side on every target; act-as endpoints delegate to `holdings`/`portfolio` services.
* `internal/controllers/holdings.go` — thin HTTP wrappers; every method calls `Controller.holdings` (the `services.HoldingsService`) for the scoped CRUD.
* `internal/controllers/market.go` — `GetPrices` delegates to `Controller.portfolio.Prices`; `GetMarketPrice` / `GetForexRate` thin-wrap `priceService`.
* `internal/controllers/summary.go` — `GetSummary` delegates to `Controller.portfolio.Summary`.
* `internal/services/mapper.go` — DBO↔DTO conversion helpers (`HoldingFromInput`, `HoldingToAPI`, `HoldingWithPriceToAPI`, `UserToAPI`) and the `PriceFetcher` interface every service depends on.
* `internal/services/holdings.go` — `HoldingsService`: owner-scoped CRUD on top of `*persistence.HoldingStore`; returns api DTOs (`(api.Holding, found, err)`) so controllers stay marshaller-free.
* `internal/services/portfolio.go` — `PortfolioService`: composes holdings + live prices + the INR↔EUR rate for `/prices` and `/summary` (own portfolio and admin act-as).
* `internal/services/price.go` — `PriceService` hits Yahoo Finance v8 API with an in-memory TTL cache (5 min, `sync.RWMutex`)
* `internal/domain/holding.go` — `Holding` struct (now carries `user_id`)
* `internal/domain/user.go` — `User` (with `Role`, `Region`, lockout counters, `IsAdmin`/`IsSuperAdmin`/`Oversees` helpers)
* `internal/domain/session.go` — `Session` (opaque id, sliding 30-day expiry); `SessionTTL` constant
* `internal/db/mongo.go` — MongoDB connection + index creation for `holdings`, `users`, `sessions` (incl. TTL on `sessions.expires_at`)
* `api/specs/openapi.yaml` — root spec; served live at `/api/specs/openapi.yaml`. Path surface is split by domain under per-domain folders: `api/specs/holdings/holdings.yaml`, `api/specs/market/market.yaml`, `api/specs/auth/auth.yaml`, `api/specs/admin/admin.yaml`. Every component (schemas, responses, parameters) lives inline in `api/specs/portfolio-api.yaml`; the path files reference it via `../portfolio-api.yaml#/components/...`. Every file under `api/specs/` is served at the matching URL by `httpserver.New`; the auth gate lets the whole `/api/specs/` GET tree through via `isPublicSpecRoute`, so adding a new sibling spec file does not require touching the public-routes table.
* `api/oapi-codegen-models.yaml` + `api/oapi-codegen-server.yaml` — split codegen configs. Models config reads `api/specs/portfolio-api.yaml` (paths-empty, `skip-prune` on) and emits `api/models.gen.go` with the component types and the strict-server response wrappers. Server config reads `api/specs/openapi.yaml`, uses `import-mapping: ../portfolio-api.yaml: "-"` so external refs resolve to the same Go package, and emits `api/server.gen.go` with the operation params, request bodies, and Echo/strict-server scaffolding. Regen both with `go generate -tags tools ./...` from `backend/`; frontend types live at `frontend/src/lib/api/schema.gen.ts` and regen with `npm run gen:api` (openapi-typescript follows external `$ref`s natively).

All app-private packages live under `internal/` per idiomatic Go layout.

### Frontend (`frontend/src/`)

React 18 + Vite SPA written in TypeScript with `react-router-dom`. Feature-folder organization: domain features under `features/`, cross-cutting utilities under `lib/`, shared dumb UI under `components/`.

* `App.tsx` — `BrowserRouter` + `AuthProvider`; wires public / authed / admin / super-admin routes with guards
* `features/auth/AuthContext.tsx` — calls `/api/auth/me` on mount, exposes `{user, loading, refresh, setUser, logout}`
* `features/auth/guards.tsx` — `RequireAuth`, `RequireAdmin`, `RequireSuperAdmin`, `RedirectIfAuthed`
* `features/auth/LoginPage.tsx`, `SignupPage.tsx`, `ForgotPasswordPage.tsx`, `OnboardingPage.tsx`, `ProfilePage.tsx`, `AuthShell.tsx` — auth screens
* `features/dashboard/DashboardPage.tsx` — main app shell; takes optional `actAsUserId`/`actAsLabel` for admin act-as
* `features/admin/AdminUserList.tsx` — region-scoped users with promote/demote/hide/reactivate/move-region/delete actions
* `features/admin/AdminUserView.tsx` — renders `DashboardPage` in act-as mode for a target user
* `features/admin/AdminManageAdmins.tsx` — super-admin only; demote/move-region across all admins
* `features/holdings/useHoldings.ts` — data hook owning holdings/prices/summary fetching state; takes optional `userId` for admin act-as (`/api/admin/users/:id/holdings`)
* `features/holdings/HoldingsTable.tsx` — main table with inline actions
* `features/holdings/AddEditModal.tsx` — create/edit holding form; symbol **Test** button hits `/api/market/price`; accepts `userId` to target an admin act-as portfolio
* `components/SummaryCards.tsx` — totals bar (cost, current value, P&L); shared display component
* `components/Charts.tsx` — Recharts pie/bar charts; shared display component
* `lib/api/client.ts` — typed fetch wrapper with `credentials: 'include'` and `X-Requested-With` CSRF header on state-changing requests; in dev, Vite proxies `/api` → `localhost:8080`
* `lib/api/schema.gen.ts` — **generated** OpenAPI types; regenerate via `npm run gen:api` after editing any file under `backend/api/specs/` (`openapi.yaml`, `portfolio-api.yaml`, or a domain path file)
* `types.ts` — public type aliases re-exported from `schema.gen.ts`

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

* `MONGODB_URI` — default `mongodb://localhost:27017/portfolio`
* `PORT` — default `8080`
* `CORS_ALLOWED_ORIGINS` — comma-separated; **required in production** because credentialed CORS forbids `*`. Dev fallback is `http://localhost:3000,http://localhost:5173`.
* `COOKIE_SECURE` — `true` in production, default `false`. Drives session-cookie `Secure` / `SameSite=None`; do not derive from `c.Scheme()`.
* `PD_NEW_PASSWORD` — read by `admin set-password` to avoid leaking the password into shell history

**Frontend** (`frontend/.env.example`):

* `VITE_API_URL` — set for production builds; in dev, Vite proxy handles `/api`

## Auth conventions (PRD-001 / DD-001)

* Session cookie: `pd_session`, `HttpOnly`, `Secure`, `SameSite=None`, 30-day sliding expiry. Opaque random id (32 random bytes, base64url); revocation by deleting the row.
* CSRF: every state-changing request (POST/PUT/DELETE) must carry `X-Requested-With: portfolio-dashboard`. `lib/api/client.ts` and the strict server handler enforce this.
* Per-user scoping: every Mongo call against `holdings` pins `user_id` via `scopedFilter(uid, extra)`. Mismatched ids return `404` (no enumeration).
* Region scope: admin requests against a user `:id` are accepted only when `target.role == "user" AND target.region == caller.region`. Super admin bypasses; super admin cannot demote/move/delete itself.
* Recovery: three wrong security-question answers lock recovery (`423`); reset via `POST /admin/users/:id/reset-lockout` (for users/admins) or break-glass CLI (for the super admin).
