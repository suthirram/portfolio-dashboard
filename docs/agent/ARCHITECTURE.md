# Architecture

## Backend (`backend/`)

Go + **echo** router + **cobra** CLI. Entry: `main.go` → `cmd.Execute()`.

### cmd/

| File | Purpose |
|------|---------|
| `root.go` | cobra root; registers subcommands |
| `serve.go` | HTTP server: config → logger → MongoDB → indexes → bootstrap superadmin → graceful shutdown |
| `migrate.go` | `migrate users/transactions`; `admin reset-lockout\|set-password` break-glass CLI |
| `copyholdings.go` | `migrate copy-holdings` — copies superadmin holdings to another DB (local→prod seeding) |
| `snapshot.go` | `snapshot [--date] [--user] [--dry-run]` — daily history job; IST 08:00 cut-over; idempotent per (user,date) |

### internal/

| Package / File | Purpose |
|----------------|---------|
| `auth/` | Regions, security questions, bcrypt, session id gen, superadmin bootstrap, ctx helpers |
| `config/config.go` | Typed `Config` (defaults < env < flag) |
| `logging/` | zap factory; `context.go` stashes per-request logger |
| `httpserver/server.go` | Echo setup, routes, error handler, `CSRFCheck`, `AuthGate` |
| `httpserver/middleware.go` | zap request logger — severity tracks status, propagates `request_id` |
| `httpserver/auth.go` | `CSRFCheck`, `AuthGate`, session load + sliding expiry |
| `persistence/` | Data-access layer — one store type per collection. `persistence.New(db)` → `*Store`. All Mongo reads/writes here; callers never touch `bson`. `scopedFilter` pins `user_id` on holdings/transactions. `ErrNotFound`/`ErrDuplicate`/`ErrCronProtected` sentinel errors. `gold.go` → Postgres `GoldDao` (exception to Mongo-per-collection rule) |
| `controllers/controllers.go` | `Controller` struct; `newWithDeps` is test seam |
| `controllers/auth.go` | signup/login/logout/recover/me/change-password/onboarding |
| `controllers/admin.go` | Admin/superadmin endpoints; region scope enforced per request; act-as delegates to services |
| `controllers/holdings.go` | Thin HTTP wrappers → `services.HoldingsService`; enriches with `has_opening`/`opening_date` |
| `controllers/transactions.go` | `/holdings/{id}/transactions` + `/transactions/{id}` CRUD |
| `controllers/history.go` | `/history` list/add/patch-regions/delete/paste; maps `HistoryRow` incl. per-stock breakdown |
| `controllers/market.go` | `/api/prices`, `/api/market/price`, `/api/market/forex` |
| `controllers/summary.go` | `/api/summary` |
| `controllers/gold.go` | `/gold/*` — thin wrappers; 503 when Postgres not configured |
| `services/mapper.go` | DBO↔DTO helpers; `PriceFetcher` interface |
| `services/holdings.go` | `HoldingsService`: owner-scoped CRUD; seeds opening event on create; `setOpeningDate` |
| `services/transactions.go` | `TransactionsService`: ledger CRUD; calls `recomputeAndPersist` + `healSnapshots` on every mutation |
| `services/ledger.go` | `RecomputePosition`: pure average-cost replay; opening sorts first; returns `ErrOversell` |
| `services/position.go` | `recomputeAndPersist`: replay → write derived position back to holding |
| `services/snapshot.go` | `SnapshotService.BuildSnapshot/Run`: live holdings + prices → snapshot; weekend carry-forward |
| `services/snapshot_recompute.go` | `RecomputeFrom`: rewrites snapshots after backdated ledger edit |
| `services/history.go` | `HistoryService`: list/add/patch/delete/paste over `SnapshotStore` |
| `services/portfolio.go` | `PortfolioService`: holdings + prices + INR↔EUR for `/prices` and `/summary` |
| `services/price.go` | `PriceService`: Yahoo Finance v8 API; 5-min in-memory TTL cache (`sync.RWMutex`) |
| `services/gold.go` | `GoldService`: gold CRUD over Postgres; derived columns (GST 3%, nett/g) at read time |
| `services/gold_prices.go` | Daily jeweler price series; IST calendar for missing-day window |
| `services/gold_metrics.go` | Totals, valuation at latest price, GOLDBEES ETF P&L, XIRR |
| `services/gold_history.go` | `HistoryOverlay`: as-of gold position per history-row date |
| `services/xirr.go` | XIRR (ACT/365, Newton-Raphson + bisection fallback) |
| `domain/` | Pure structs: `Holding`, `Transaction` (TxnType enum, nullable OpeningDate), `PortfolioSnapshot` (Buckets + Lines), `User` (Role/Region/lockout), `Session`, gold models |
| `db/mongo.go` | Connection + indexes for holdings/users/sessions/transactions/portfolio_snapshots (TTL on sessions) |
| `db/postgres.go` | Postgres pool + embedded migrations (`internal/db/migrations/*.sql`); nil pool = gold disabled |

### api/

| Path | Purpose |
|------|---------|
| `specs/openapi.yaml` | Root spec; served live at `/api/specs/openapi.yaml` |
| `specs/portfolio-api.yaml` | All components (schemas, responses, params) |
| `specs/{domain}/*.yaml` | Per-domain path files; reference portfolio-api.yaml via `../portfolio-api.yaml#/components/...` |
| `oapi-codegen-models.yaml` | Reads `portfolio-api.yaml`; emits `api/models.gen.go` |
| `oapi-codegen-server.yaml` | Reads `openapi.yaml`; emits `api/server.gen.go` |

Regen backend types: `go generate -tags tools ./...` from `backend/`.  
Regen frontend types: `npm run gen:api` from `frontend/`.

---

## Frontend (`frontend/src/`)

React 18 + Vite + TypeScript + `react-router-dom`. Feature-folder layout.

| Path | Purpose |
|------|---------|
| `App.tsx` | `BrowserRouter` + `AuthProvider`; routes with guards |
| `features/auth/AuthContext.tsx` | `/api/auth/me` on mount; `{user, loading, refresh, setUser, logout}` |
| `features/auth/guards.tsx` | `RequireAuth`, `RequireAdmin`, `RequireSuperAdmin`, `RedirectIfAuthed` |
| `features/dashboard/DashboardPage.tsx` | Main shell; `actAsUserId`/`actAsLabel` for admin act-as; shows blocking opening-date prompt |
| `features/history/HistoryPage.tsx` | `/history`: month picker, per-currency charts, gold chart, modal wiring |
| `features/history/historyShared.ts` | Constants, palettes, pure helpers; no local imports |
| `features/history/HistoryTable.tsx` | Sortable month table; per-currency + gold column groups; day-over-day cell tints |
| `features/history/HistoryModals.tsx` | `AddRowModal`/`EditRowModal`/`PasteModal`/`ConflictDialog`/`HoldingsModal` |
| `features/history/HistoryChartPage.tsx` | `/history/chart/:region`: full-history invested-vs-current chart |
| `features/gold/GoldPage.tsx` | `/gold`: transactions, prices panel, metrics panel, missing-prices modal |
| `features/admin/AdminUserList.tsx` | Region-scoped user management |
| `features/admin/AdminUserView.tsx` | `DashboardPage` in act-as mode |
| `features/admin/AdminManageAdmins.tsx` | Superadmin-only: demote/move-region |
| `features/holdings/useHoldings.ts` | Data hook: holdings/prices/summary; optional `userId` for act-as |
| `features/holdings/HoldingsTable.tsx` | Main table with inline actions |
| `features/holdings/AddEditModal.tsx` | Create/edit holding; symbol Test button; opening position seeds `opening` ledger event |
| `features/holdings/TransactionsModal.tsx` | Per-holding ledger editor over `/api/holdings/:id/transactions` |
| `features/holdings/OpeningDateModal.tsx` | Blocking "set opening dates" prompt; defaults to `2026-06-15` |
| `components/SummaryCards.tsx` | Totals bar (cost, current, P&L) |
| `components/Charts.tsx` | Recharts pie/bar |
| `lib/api/client.ts` | Typed fetch wrapper; `credentials: 'include'`; `X-Requested-With` CSRF header; Vite proxy in dev |
| `lib/api/schema.gen.ts` | **Generated** OpenAPI types — regen via `npm run gen:api` |
| `types.ts` | Public aliases re-exported from `schema.gen.ts` |

---

## Data Flow

```
Frontend → /api/prices                    → live Yahoo Finance prices per holding
         → /api/summary                   → aggregated totals
         → /api/market/price              → ad-hoc symbol lookup
         → /api/market/forex              → INR→EUR rate
         → /api/holdings/:id/transactions → ledger CRUD; position recomputes on every write
         → /api/history?from&to           → snapshot rows (per-currency + per-stock + gold)
         → /api/gold/*                    → gold CRUD (Postgres; 503 when POSTGRES_URI unset)

External cron → `snapshot` subcommand → one PortfolioSnapshot per user per day
```

Prices cached per-symbol in `PriceService.cache` — 5-min TTL.
