---
name: portfolio-dashboard
description: >
  Scaffolds a complete full-stack portfolio tracker/dashboard for stocks and ETFs.
  Use this skill whenever a user wants to: build a portfolio dashboard, create a stock
  tracker or investment tracker, set up a holdings management app, track stocks with
  live prices, monitor unrealised/realised P&L across NSE/BSE/US markets, or build
  any financial portfolio management tool — even if they don't say "dashboard" explicitly.
  Trigger for phrases like "build me a portfolio app", "track my stocks", "investment
  tracker", "stock dashboard", "portfolio with live prices", "P&L tracker", or any
  request to manage/display a collection of stock or ETF holdings.
---

# Portfolio Dashboard Skill

This skill guides you through building a production-ready, full-stack, **multi-user** portfolio tracker from scratch. The stack is intentionally opinionated so you can move fast — React + Vite + TypeScript frontend (with `react-router-dom` and auth-aware route guards), Go backend (echo router + cobra CLI + oapi-codegen strict server), MongoDB, live Yahoo Finance prices, server-side session auth with regional admin tiers, Docker Compose for infra.

## When to use this skill

Reach for this skill when the user wants to:

* Track stock or ETF holdings (quantity, average cost, current value)
* See live prices and P&L (unrealised and/or realised)
* Support multiple markets (NSE/BSE Indian stocks and/or US stocks)
* Build CRUD for managing a holdings list
* See currency conversions (e.g. INR → EUR)

## Clarify before building

Ask **one round** of clarifying questions before starting. The three that matter:

1. **Which markets?** NSE/BSE (Indian stocks), US (NYSE/NASDAQ), or both?
2. **Currency display?** INR only, or also show EUR/USD equivalents via live forex?
3. **Single-tenant or multi-user?** Default is multi-user with the auth + regional-admin model described below. If the user explicitly wants a single-tenant tracker, skip the `auth`, `admin`, `httpserver/auth.go`, `cmd/migrate.go`, and frontend `features/auth`/`features/admin` modules and serve `/api/holdings` unscoped.

Everything else (design style, charts, columns) you can decide sensibly — don't ask about it.

## Project structure

Scaffold this exact layout. App-private packages live under `internal/` per
idiomatic Go layout; the entry point is a cobra CLI in `cmd/`, not a flat
`main.go`. Frontend is TypeScript with feature folders.

```
<project>/
├── docker-compose.yml              # MongoDB + full stack (prod)
├── docker-compose.dev.yml          # MongoDB only (for local dev)
├── Makefile                        # dev / prod / tidy / install shortcuts
├── .pre-commit-config.yaml         # yamllint + markdownlint + gofmt + golangci-lint
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── go.mod                      # module: portfolio-dashboard
│   ├── main.go                     # one-liner: cmd.Execute()
│   ├── tools.go                    # //go:build tools — pins oapi-codegen
│   ├── api/
│   │   ├── specs/                  # OpenAPI 3.0 contract, split
│   │   │   ├── openapi.yaml        # root spec (paths $ref domain files)
│   │   │   ├── portfolio-api.yaml  # components (schemas/responses/parameters) inline
│   │   │   ├── holdings/holdings.yaml
│   │   │   ├── market/market.yaml
│   │   │   ├── auth/auth.yaml
│   │   │   └── admin/admin.yaml
│   │   ├── oapi-codegen-models.yaml  # codegen config: models + strict-server wrappers
│   │   ├── oapi-codegen-server.yaml  # codegen config: echo + strict server, import-mapping
│   │   ├── models.gen.go           # generated component types (DO NOT EDIT)
│   │   └── server.gen.go           # generated echo/strict server (DO NOT EDIT)
│   ├── cmd/                        # cobra commands
│   │   ├── root.go
│   │   ├── serve.go                # boot, wire handler + server
│   │   └── migrate.go              # `migrate users --owner …`, `admin reset-lockout`, `admin set-password`
│   └── internal/                   # app-private packages
│       ├── auth/                   # catalogues, password/answer hashing, session ids, bootstrap, ctx helpers
│       ├── config/                 # typed Config (defaults < env < flag)
│       ├── db/mongo.go             # connect + EnsureIndexes for holdings/users/sessions
│       ├── domain/                 # Holding, User, Session structs (BSON models)
│       ├── controllers/            # thin HTTP wrappers (strict OpenAPI server interface)
│       │   ├── controllers.go      # Controller struct (owns *persistence.Store + services + zap); New / newWithDeps wire defaults / test deps
│       │   ├── auth.go             # signup/login/logout/me/recover/profile/password/onboarding (composes credential checks + cookie writes)
│       │   ├── admin.go            # region-scoped admin + super-admin; act-as endpoints delegate to holdings/portfolio services
│       │   ├── holdings.go         # thin: delegates to services.HoldingsService
│       │   ├── market.go summary.go session.go context.go
│       ├── services/               # business-logic layer
│       │   ├── mapper.go           # PriceFetcher interface + Holding/User DBO↔DTO converters
│       │   ├── holdings.go         # HoldingsService — owner-scoped CRUD returning api DTOs
│       │   ├── portfolio.go        # PortfolioService — composes holdings + prices + EUR rate for /prices and /summary
│       │   └── price.go            # PriceService — Yahoo Finance fetcher + 5-min TTL cache
│       ├── persistence/            # data-access layer (one store type per collection)
│       │   ├── persistence.go      # New(db) → *Store{Holdings, Users, Sessions}
│       │   ├── holdings.go         # HoldingStore — owner-scoped by construction
│       │   ├── users.go            # UserStore — sentinels ErrNotFound, ErrDuplicate
│       │   └── sessions.go         # SessionStore
│       ├── httpserver/             # echo wiring
│       │   ├── server.go           # router, CORS, error renderer
│       │   ├── middleware.go       # zap request logger
│       │   └── auth.go             # CSRFCheck + AuthGate (session load, role/region/onboarding gates)
│       └── logging/                # zap factory + per-request logger on context
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json                # scripts: dev, build, typecheck, gen:api
    ├── tsconfig.json
    ├── vite.config.ts              # proxies /api → :8080 in dev
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                 # BrowserRouter + AuthProvider; wires public / authed / admin / super-admin routes
        ├── index.css               # dark theme CSS variables
        ├── types.ts                # public type aliases re-exported from schema.gen.ts
        ├── components/             # shared dumb UI (SummaryCards.tsx, Charts.tsx)
        ├── features/
        │   ├── auth/               # AuthContext, guards, LoginPage, SignupPage, ForgotPasswordPage, OnboardingPage, ProfilePage, AuthShell, SecurityQuestionsFields
        │   ├── dashboard/          # DashboardPage (takes optional actAsUserId/actAsLabel for admin act-as)
        │   ├── admin/              # AdminShell, AdminUserList, AdminUserView (renders DashboardPage in act-as mode), AdminManageAdmins
        │   └── holdings/           # useHoldings(userId?), HoldingsTable, AddEditModal
        └── lib/api/
            ├── client.ts           # fetch wrapper (credentials: include, X-Requested-With CSRF header)
            └── schema.gen.ts       # generated from api/specs/openapi.yaml via `npm run gen:api` (DO NOT EDIT)
```

## Backend — Go

**Go**: 1.25+. **Module name**: `portfolio-dashboard`.

**Router**: `github.com/labstack/echo/v4` (echo's built-in CORS + RequestID +
Recover middleware).

**CLI**: `github.com/spf13/cobra` — `main.go` is one line (`cmd.Execute()`); each
subcommand lives in `cmd/`.

**OpenAPI**: `github.com/oapi-codegen/oapi-codegen/v2` strict-server mode.
Contract is split under `api/specs/` (root `openapi.yaml` + `portfolio-api.yaml`
for components + per-domain path files under `holdings/`, `market/`, `auth/`,
`admin/`). Two codegen passes: `oapi-codegen-models.yaml` → `api/models.gen.go`
(types + shared response wrappers); `oapi-codegen-server.yaml` → `api/server.gen.go`
(echo + strict server, `import-mapping ../portfolio-api.yaml: "-"` to keep refs
in the same Go package). The `Handler` struct implements every interface method.
The contract is the source of truth — edit a file under `api/specs/`, run
`go generate -tags tools ./...`, then implement the new methods.

**Logging**: `go.uber.org/zap` (JSON by default); per-request logger is stashed on
`context.Context` so handlers log with the right `request_id`.

**MongoDB driver**: `go.mongodb.org/mongo-driver v1.17+`.

### Data model (`internal/domain/`)

```go
// internal/domain/holding.go
type Holding struct {
    ID           primitive.ObjectID `bson:"_id,omitempty"`
    UserID       primitive.ObjectID `bson:"user_id"`        // every holding has an owner
    Script       string             `bson:"script"`
    Symbol       string             `bson:"symbol"`
    Exchange     string             `bson:"exchange"`       // NSE | BSE | NYSE | NASDAQ | OTHER
    Type         string             `bson:"type"`           // stock | etf
    StocksOwned  float64            `bson:"stocks_owned"`
    AvgCostPrice float64            `bson:"avg_cost_price"`
    RealizedPnL  float64            `bson:"realized_pnl"`
    Currency     string             `bson:"currency,omitempty"` // INR | EUR | USD
    Notes        string             `bson:"notes,omitempty"`
    CreatedAt    time.Time          `bson:"created_at"`
    UpdatedAt    time.Time          `bson:"updated_at"`
}

// internal/domain/user.go     — Username (normalised) + UsernameDisplay, Role (user|admin|superadmin),
//                                Region (india|europe|us), Disabled, Locked, LoginFailures,
//                                SecurityQuestionFailures, []SecurityAnswer, MustChangePassword,
//                                LastLoginAt; IsAdmin / IsSuperAdmin / Oversees helpers.
// internal/domain/session.go  — opaque id, UserID, CreatedAt, ExpiresAt; SessionTTL = 30 days.
```

DBO↔DTO conversion lives in `internal/services/mapper.go` (holdings + user
converters, plus the `PriceFetcher` interface). Generated API types
(`api.Holding`, `api.User`) stay
JSON-shaped; domain types stay BSON-shaped. They never mix.

### API routes

Defined in `api/specs/openapi.yaml` (+ per-domain path files); echo routes are wired by oapi-codegen's
`RegisterHandlersWithBaseURL`. All non-public routes require a session cookie
and CSRF header.

```
# Public auth + catalogues
GET    /api/regions                              # signup dropdown
GET    /api/auth/security-questions              # catalogue
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/recover/questions               # username in BODY, not URL
POST   /api/auth/recover

# Session auth
GET    /api/auth/me
POST   /api/auth/logout
PUT    /api/auth/password
PUT    /api/auth/profile
PUT    /api/auth/security-questions/answers
POST   /api/auth/onboarding                      # forced super-admin first-login

# Portfolio (per-user; scopedFilter pins user_id on every query)
GET    /api/holdings
POST   /api/holdings
GET    /api/holdings/{id}
PUT    /api/holdings/{id}
DELETE /api/holdings/{id}
GET    /api/prices
GET    /api/summary
GET    /api/market/price?symbol=TCS.NS
GET    /api/market/forex?from=INR&to=EUR

# Admin (region-scoped; super admin sees all)
GET    /api/admin/users
GET    /api/admin/users/{id}
POST   /api/admin/users/{id}/hide
POST   /api/admin/users/{id}/reactivate
POST   /api/admin/users/{id}/reset-lockout
POST   /api/admin/users/{id}/promote              # super admin
POST   /api/admin/users/{id}/demote               # super admin
PUT    /api/admin/users/{id}/region               # super admin
DELETE /api/admin/users/{id}
# Act-as: same per-user portfolio surface, but for an admin's target user
GET    /api/admin/users/{id}/holdings
POST   /api/admin/users/{id}/holdings   # …+ /{id}, /prices, /summary
GET    /api/admin/admins                          # super admin only

# Spec
GET    /api/specs/openapi.yaml          (+ portfolio-api.yaml & per-domain files)
GET    /api/healthz
```

### Price service (`services/price.go`)

* Fetch from `https://query1.finance.yahoo.com/v7/finance/quote?symbols=<sym>&fields=regularMarketPrice,currency`
* Set `User-Agent: Mozilla/5.0` header — Yahoo requires a realistic UA
* Cache results in memory with `sync.RWMutex`, TTL 5 minutes
* Fetch multiple symbols concurrently (goroutines, semaphore of 5)
* Forex: use Yahoo symbol `INREUR=X`, `INRUSD=X` etc.
* Fallback EUR rate (~0.011) if fetch fails

### Symbol format

| Exchange | Format     | Example        |
|----------|-----------|----------------|
| NSE      | TICKER.NS  | TCS.NS         |
| BSE      | TICKER.BO  | RELIANCE.BO    |
| US       | Plain      | AAPL, SPY      |

### `go.mod` — key deps

```
github.com/labstack/echo/v4 v4.13+
github.com/spf13/cobra v1.9+
github.com/oapi-codegen/oapi-codegen/v2 v2.4+         // tools.go
github.com/oapi-codegen/runtime v1.1+
github.com/samber/lo v1.53+                          // lo.ToPtr for nullable API fields
go.mongodb.org/mongo-driver v1.17+
go.uber.org/zap v1.28+                               // structured logging
golang.org/x/crypto                                  // bcrypt
```

Remind the user to run `go mod tidy` before `go run . serve`.

### Auth + multi-tenancy

The default scaffold is multi-user. Treat these as non-negotiable, even though
the rules are long — they are what makes per-user isolation correct.

* **Session cookie**: `pd_session`, `HttpOnly`, `Secure` (prod) / `Lax` on plain
  HTTP dev, `SameSite=None` (prod) / `Lax` (dev). 32 random bytes base64url'd.
  30-day sliding expiry; revoke by deleting the row. TTL index on
  `sessions.expires_at` cleans expired rows.
* **CSRF**: every state-changing request (POST/PUT/DELETE) must carry
  `X-Requested-With: portfolio-dashboard`. Enforced by `CSRFCheck` middleware
  and by `lib/api/client.ts`.
* **Per-user scoping**: every Mongo call against `holdings` pins `user_id` via
  `scopedFilter(uid, extra)` — owner-scoping by construction in
  `internal/persistence/holdings.go`. Mismatched ids return `404` (no
  enumeration). Wire-level tests must inspect the issued Mongo command's filter
  to prove `user_id` is present.
* **Roles**: `user` < `admin` (one region) < `superadmin` (single owner).
  Region scope: an admin can act on a target `:id` only when
  `target.role == "user" AND target.region == caller.region`. Super admin
  bypasses; super admin cannot demote / move-region / delete itself.
* **Recovery**: three wrong security-question answers lock recovery (`423`);
  reset via `POST /api/admin/users/:id/reset-lockout` (users/admins) or the
  break-glass CLI for the super admin.
* **Bootstrap**: on a fresh database, `auth.EnsureSuperAdmin` creates
  `admin` / `admin` with `MustChangePassword=true` and random placeholder
  security answers, so recovery is closed until onboarding picks real ones.
  `AuthGate` blocks the API until onboarding completes — the gate is
  server-side, not just a frontend redirect.
* **Fail-closed gate**: `AuthGate` protects everything **except** an explicit
  public allowlist (catalogues + signup/login/recover). Do not invert this to
  an opt-in list of operations that require auth — new endpoints would ship
  public by default.
* **Bootstrap exception**: `auth/bootstrap.go` writes the first super admin via
  the raw collection to break the import cycle between `auth` and
  `persistence`. The unique-username index prevents a double super admin under
  a boot race. Every other write goes through `persistence`.

Break-glass CLI (no login required; only needs `MONGODB_URI`):

```
portfolio-dashboard migrate users --owner <username>        # stamp legacy holdings with user_id
portfolio-dashboard admin reset-lockout --username admin
PD_NEW_PASSWORD='…' portfolio-dashboard admin set-password --username admin
```

`PD_NEW_PASSWORD` is read from the env so the password stays out of shell
history. The migrate CLI reuses one Mongo connection for the backfill and the
index rebuild — do not open a second client.

### Persistence layer (`internal/persistence/`)

* `persistence.New(db)` returns a `*Store{Holdings, Users, Sessions}`. Callers
  (handlers, middleware, CLI) get domain types and never touch
  `*mongo.Collection`, `*mongo.Cursor`, or raw `bson` documents.
* One store type per collection (`HoldingStore`, `UserStore`, `SessionStore`)
  in its own file. The one Mongo detail allowed to cross the boundary is a
  documented `bson` field patch passed to update / partial-list methods.
* Sentinels: `ErrNotFound` (translate `mongo.ErrNoDocuments`),
  `ErrDuplicate` (translate `mongo.IsDuplicateKeyError`). Callers branch with
  `errors.Is`; they never import the driver's errors.
* `HoldingStore.scopedFilter(uid, extra)` is the single source of truth for
  pinning `user_id` on every read and write.

### Go code conventions (strictly enforced)

All backend code — including tests and comments — must pass `gofmt` and
`golangci-lint run ./...` with **zero** issues before any commit. These are not
style preferences; the pre-commit hook rejects violations (see *Quality gate*).

#### Strict typing

* No `interface{}`/`any` in domain, API, or store types. Model enums as named
  string types with typed constants (e.g. `type Role string`; `RoleAdmin Role = "admin"`),
  not bare strings compared by literal.
* Persistence returns **domain types**, never `*mongo.Collection`, `*mongo.Cursor`,
  or raw `bson` documents. Keep query construction inside one store type per
  collection; the only Mongo detail allowed to cross that boundary is a
  documented `bson` field patch for partial updates — say so in the doc comment.
* Define sentinel errors at the boundary (`var ErrNotFound = errors.New("store: …")`)
  and translate driver sentinels (`mongo.ErrNoDocuments`, `mongo.IsDuplicateKeyError`)
  into them, so callers never import the driver's errors.

#### Idiomatic Go

* `context.Context` is the first parameter of every method that does I/O.
* Test wrapped errors with `errors.Is`/`errors.As` — never `==` on a translated
  or wrapped error.
* Prefer `for range n` over `for i := 0; i < n; i++` when the index is unused;
  prefer `maps.Copy(dst, src)` over a manual `for k, v := range` copy loop
  (the `modernize` linter enforces both).
* No needless pass-through wrappers (a func that only forwards to
  `context.WithTimeout` adds nothing — inline it).
* No unused parameters or helpers (`unparam`/`unused`): if a test helper's
  argument is always the same value, drop the parameter and hard-code it.
* Suppress a linter only with a reasoned directive
  (`//nolint:gosec // request-side cookie carries only the id`), never a bare
  `//nolint`.
* Short, consistent receiver names (`s *UserStore`, not `store *UserStore`);
  no name stutter (`store.Store`, not `store.StoreStruct`).

#### Naming and comments

* Method names reveal intent (`RegisterRecoveryFailure`, `AssignUnownedTo`),
  not the mechanism (`DoUpdate`).
* Every exported identifier has a doc comment that **starts with its name**
  (`// UserStore owns the users collection.`).
* Comments must stay true to the code — a comment claiming "callers never touch
  bson" while a method takes a `bson.M` is a bug. Explain *why*, not *what*.
* Error strings are lowercase and end without punctuation.

#### Quality gate

* `.pre-commit-config.yaml` runs `yamllint`, `markdownlint`, `gofmt`, and
  `golangci-lint`. Run `pre-commit install` once so it fires on every commit.
* Before handing off, run `pre-commit run --all-files` **and** `go test ./...`;
  both must pass. Mention which you ran.

## Frontend — React + Vite + TypeScript

**Dependencies**: `react`, `react-dom`, `react-router-dom`, `recharts`, plain
`fetch` (no axios).

**Dev dependencies**: `@vitejs/plugin-react`, `vite`, `typescript`,
`openapi-typescript`.

OpenAPI types are generated into `src/lib/api/schema.gen.ts` via
`npm run gen:api` (`openapi-typescript ../backend/api/specs/openapi.yaml -o
src/lib/api/schema.gen.ts`). Re-run after any change under `backend/api/specs/`. Do not
hand-edit the generated file. `src/types.ts` re-exports the names handlers
consume.

### Routing + auth shell (`App.tsx`)

`BrowserRouter` wraps an `<AuthProvider>` that calls `/api/auth/me` on mount
and exposes `{user, loading, refresh, setUser, logout}`. Route guards live in
`features/auth/guards.tsx`:

* `RequireAuth` — must be logged in; redirects to `/login` otherwise.
* `RequireAdmin` / `RequireSuperAdmin` — also enforce role.
* `RedirectIfAuthed` — keeps logged-in users out of `/login`, `/signup`,
  `/forgot`.
* Onboarding-forced redirect — if `user.must_change_password`, redirect to
  `/onboarding` from every other route.

Pages:

* Public: `LoginPage`, `SignupPage`, `ForgotPasswordPage`, `AuthShell` (the
  outer card/layout reused by all auth screens).
* Authed: `DashboardPage` (default), `ProfilePage`, `OnboardingPage`.
* Admin: `AdminShell` with nested `AdminUserList` and `AdminUserView`
  (renders `DashboardPage` in act-as mode for a target user).
* Super admin: `AdminManageAdmins`.

`useHoldings(userId?)` and `AddEditModal` accept an optional `userId`; when
set, every call targets `/api/admin/users/:id/holdings…` instead of
`/api/holdings…`.

### Design — dark theme

Use CSS custom properties (`var(--bg-primary)` etc.) in `index.css`. Key colours:

* Background: `#0d0f1a` / `#141627` / `#1a1d30`
* Text: `#e8ecf4` (primary), `#8892b0` (secondary), `#4a5278` (muted)
* Green P&L: `#00c896`, Red P&L: `#ff4d6d`, Blue accent: `#4f8ef7`

### Holdings table columns

Match this exact column order (mirrors the user's spreadsheet):

| Column | Value |
|--------|-------|
| Script | display name + symbol/exchange sub-row |
| Shares | quantity |
| Avg Cost/Share | avg_cost_price in ₹ |
| Cost Price | stocks_owned × avg_cost_price |
| Share Price | live current_price |
| Current Value | stocks_owned × current_price |
| Unrealised Gain | unrealised P&L (current − cost) |
| Realised Gain | realised_pnl from DB |
| Actions | Edit / Delete |

**Totals row** in `<tfoot>` — sum all numeric columns. Colour P&L green/red.

Show a loading spinner in the Share Price cell while prices are fetching. Show `⚠ price unavail.` on error.

### Add/Edit modal

Fields: Script name, Yahoo symbol, Exchange (select), Type (select), Shares owned, Avg cost price (₹), Realised P&L (₹), Notes.

Include a **Test** button next to the symbol field — calls `GET /api/market/price?symbol=<sym>` and shows the live price inline so the user can verify before saving.

### Summary cards

Five metric cards across the top:

1. Total Invested (₹ + €)
2. Current Value (₹ + €)
3. Unrealised P&L (₹ + €, green/red)
4. Realised P&L (₹ + €, green/red)
5. Total P&L (₹ + €, green/red)

Show live EUR rate as a chip in the header area.

### Charts (Recharts)

Three views toggled by tabs:

* **Allocation** — donut pie by current value, with a legend list showing %
* **P&L** — grouped bar chart (unrealised + realised per holding), top 15
* **By Exchange** — pie + progress bars by exchange (NSE / BSE / NYSE / NASDAQ)

### `DashboardPage` / `useHoldings` state

* `holdings` — raw list from `/api/holdings` (fast, no prices)
* `enriched` — from `/api/prices` (with live prices, EUR, P&L)
* Fetch both on mount; re-fetch after every save/delete
* Filter input to search by script name or symbol
* Sticky header with Refresh button and "Add Holding" CTA
* Two tabs: **Holdings** (table) and **Charts**
* In admin act-as mode (when `actAsUserId` is set), every endpoint is the
  `/api/admin/users/:id/…` variant and a banner names the target user.

### `vite.config.ts`

```ts
server: {
  proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
}
```

The proxy keeps `/api` same-origin in dev, so the session cookie works without
`SameSite=None; Secure`.

### `lib/api/client.ts`

Thin wrapper around `fetch`:

* Reads `VITE_API_URL` env var for production builds; falls back to `/api`
  (proxied by Vite in dev).
* Always sets `credentials: 'include'` so the session cookie is sent.
* On state-changing methods (POST/PUT/DELETE/PATCH), sets
  `X-Requested-With: portfolio-dashboard` — the server's `CSRFCheck` rejects
  the request otherwise.
* Centralises error parsing into the OpenAPI `{ "error": "..." }` shape.

## Docker setup

### `docker-compose.yml` (production)

Three services: `mongodb` (mongo:7 with healthcheck), `backend` (build from `./backend`), `frontend` (build from `./frontend`, nginx, port 3000→80).

### `docker-compose.dev.yml`

MongoDB only — for running backend and frontend locally.

### `backend/Dockerfile`

Multi-stage: `golang:1.25-alpine` builder → `alpine:3.20` runtime. Copy the
compiled binary and the full `api/specs/` tree (served live by the backend).
Entry point is `portfolio-dashboard serve`.

### `frontend/Dockerfile`

Multi-stage: `node:20-alpine` builder → `nginx:alpine`. Include `nginx.conf` that:

* Falls back to `index.html` for SPA routing
* Proxies `/api/` to `portfolio_backend:8080`
* Enables gzip

## OpenAPI spec (`api/specs/`)

OpenAPI 3.0 spec split across `api/specs/`:

* `openapi.yaml` — root; paths reference per-domain files.
* `portfolio-api.yaml` — every component (`schemas`, `responses`,
  `parameters`) inline; covers `Holding`, `HoldingInput`, `HoldingWithPrice`,
  `PricesResponse`, `Summary`, `User`, `Region`, `SecurityQuestion`,
  `SecurityAnswerInput`, `Error`, and the 401/403/404/409/423 response
  shapes.
* `holdings/holdings.yaml`, `market/market.yaml`, `auth/auth.yaml`,
  `admin/admin.yaml` — path items; ref components via
  `../portfolio-api.yaml#/components/...`.

`cookieAuth` (apiKey on `pd_session`) is declared inline in `openapi.yaml`
and applied to every non-public operation. The root file plus every sibling
is served at `GET /api/specs/<path>` so a browser can resolve the relative
`$ref`s.

`api/models.gen.go` and `api/server.gen.go` are generated by oapi-codegen
(`tools.go` pins the version); `schema.gen.ts` is generated by
`openapi-typescript`. **All three files are regenerated, never hand-edited** —
edit a file under `api/specs/`, run
`go generate -tags tools ./... && (cd ../frontend && npm run gen:api)`, then
implement the new interface methods.

## Makefile

```makefile
dev-db:    # docker compose -f docker-compose.dev.yml up -d
prod:      # docker compose up --build
down:      # stop all
backend:   # cd backend && go run . serve
frontend:  # cd frontend && npm run dev
install:   # cd frontend && npm install
tidy:      # cd backend && go mod tidy
generate:  # cd backend && go generate ./... (runs oapi-codegen)
```

## Environment variables

| Var / Flag | Default | Notes |
|---|---|---|
| `MONGODB_URI` / `--mongo-uri` | `mongodb://localhost:27017/portfolio` | |
| `MONGODB_DATABASE` / `--mongo-db` | `portfolio` | |
| `PORT` / `--port` | `8080` | |
| `LOG_LEVEL` / `--log-level` | `info` | `debug`\|`info`\|`warn`\|`error` |
| `LOG_FORMAT` / `--log-format` | `json` | `json`\|`text` |
| `CORS_ALLOWED_ORIGINS` | dev: `http://localhost:3000,http://localhost:5173` | **Required in production** — credentialed CORS forbids `*` |
| `PD_NEW_PASSWORD` | *(unset)* | Read only by `admin set-password`, to keep the password out of shell history |
| `VITE_API_URL` (frontend) | proxied via Vite | Backend URL for production builds |

Flag > env > default.

## README

Include:

* Stack summary (mention echo + cobra + oapi-codegen)
* Accounts & roles overview (user / admin / regional / super admin)
* First-run + operations section: bootstrap `admin/admin`, `migrate users
  --owner`, break-glass `admin reset-lockout` / `admin set-password`
* Column definitions table
* Yahoo symbol format table
* Quick-start commands (local dev + full Docker)
* API endpoint table (auth public, auth session, portfolio, admin)
* Environment variables table (the one above)
* Note: run `go mod tidy` before first `go run . serve`

## Delivery checklist

Before finishing, verify:

* [ ] Module name is `portfolio-dashboard`; every `internal/…` import path
      resolves under it
* [ ] Generated files (`api/models.gen.go`, `api/server.gen.go`,
      `frontend/src/lib/api/schema.gen.ts`) are in sync with `api/specs/`;
      the generators ran without diffs
* [ ] `vite.config.ts` has the `/api` proxy configured
* [ ] `docker-compose.yml` service names match what `nginx.conf` proxies to
* [ ] README documents `go mod tidy` and the first-run super-admin onboarding
* [ ] `gofmt` and `golangci-lint run ./...` pass with zero issues (see *Go
      code conventions*)
* [ ] `pre-commit run --all-files`, `go test ./...`, `npm run typecheck`, and
      `npm run build` all pass; mention which you ran
* [ ] If multi-user: per-user scoping has a wire-level test that inspects the
      issued Mongo command's filter to prove `user_id` is pinned; admin
      region-scope checks return `404` (not `403`) for out-of-region targets
