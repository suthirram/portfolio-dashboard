# Project Intent — for AI agents

Read this before building any feature. It exists so you neither over-build nor under-build.

## What this product is

Personal portfolio tracker for NSE/BSE (Indian) and US stocks/ETFs.
**Go IS the backend** — echo router, cobra CLI, zap logging, MongoDB for all portfolio data. Postgres optional, exists only for gold tracking (DD-003). Frontend is React 18 + Vite SPA.

One React SPA (`frontend/`) over one Go backend (`backend/`):

* `frontend/` — the portfolio dashboard: holdings, P&L, history charts, gold tracking, admin panel.
* `backend/` — REST API + `snapshot` cron subcommand + `migrate` + `admin` break-glass CLI.

## The three roles (`users.role`)

| Role | Where they work | Can do |
|------|-----------------|--------|
| `user` | frontend dashboard | Own portfolio only: view holdings, add/edit/delete, transactions ledger, history, gold. |
| `admin` | frontend admin panel | All `user` actions on own portfolio + act-as any user in their **region**: view their holdings and summary. Cannot access users in other regions. |
| `superadmin` | frontend admin panel | Everything across all regions: manage admins, promote/demote, move regions, delete users. Single owner. Cannot demote or delete itself. |

Multi-tenancy is non-negotiable: every `holdings`/`transactions` Mongo query pins `user_id` via `scopedFilter`. Mismatched id returns `404` — no enumeration. Region scope is enforced on every admin request: `target.role == "user" AND target.region == caller.region`. Superadmin bypasses region checks but not the self-protection rules.

## In scope (what to build)

Holdings CRUD with live prices (Yahoo Finance, 5-min cache), unrealised P&L, realised P&L, INR↔EUR forex conversion, transactions ledger (average-cost method), daily portfolio snapshots, history page with per-currency charts and per-stock breakdown, physical gold tracking (Postgres), admin act-as view, multi-tenant auth with session cookies and security questions.

These features already exist — **extend the existing module, don't reinvent it.** Check `internal/services/`, `internal/controllers/`, and `internal/persistence/` first before creating anything new.

## Out of scope (do NOT build unless asked)

* No new backend language or framework (Go + echo only).
* No new database engine (MongoDB for portfolio data; Postgres for gold only — those two, nothing else).
* No brokerage API integration (prices come from Yahoo Finance only).
* No payment processing (P&L is tracked, not settled).
* No mobile app (React + Vite web only).
* No new auth system — the existing session-cookie + security-question flow is intentional.
* No analytics dashboards beyond the existing summary and history pages.

## How NOT to over/under-do

* **Under-doing:** a feature isn't done until the full path works: frontend UI → `lib/api/client.ts` → Go controller → service → `internal/persistence/` → MongoDB. Missing owner-scoping on a new persistence method = not done. Missing CSRF header on a new state-changing endpoint = not done. Missing OpenAPI spec update when adding an endpoint = not done. Regen `schema.gen.ts` after any spec change — forgetting it means the frontend is working against stale types.
* **Over-doing:** don't add config flags, middleware, helper abstractions, or tests nobody asked for. Match the density and idiom of the sibling file. New service methods follow the `(result, found, err)` return pattern already established. New controller methods are thin wrappers — business logic belongs in services, not controllers.

## Ledger & money conventions

Ledger is source of truth — holding position fields are derived, never written directly. Money is total cash per event, not per-share. Backdated edits rewrite snapshots forward. Full detail: [CONVENTIONS.md § Transactions Ledger](./CONVENTIONS.md#transactions-ledger).

## Snapshot & pricing conventions

Snapshot job is idempotent per (user, IST day). Prices from Yahoo Finance v8, 5-min cache. Weekend/holiday → carry-forward. INR primary, EUR secondary. Full detail: [CONVENTIONS.md § Snapshots / History](./CONVENTIONS.md#snapshots--history-prd-002--dd-002).

## Symbol format

| Exchange | Format | Example |
|----------|--------|---------|
| NSE | `TICKER.NS` | `TCS.NS` |
| BSE | `TICKER.BO` | `RELIANCE.BO` |
| US | plain ticker | `AAPL`, `SPY` |

See also: [ARCHITECTURE.md](./ARCHITECTURE.md), [CONVENTIONS.md](./CONVENTIONS.md), root `CLAUDE.md`, `docs/plans/`.
