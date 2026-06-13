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

This skill guides you through building a production-ready, full-stack portfolio tracker from scratch. The stack is intentionally opinionated so you can move fast — React + Vite frontend, Go backend, MongoDB, live Yahoo Finance prices, Docker Compose for infra.

## When to use this skill

Reach for this skill when the user wants to:

* Track stock or ETF holdings (quantity, average cost, current value)
* See live prices and P&L (unrealised and/or realised)
* Support multiple markets (NSE/BSE Indian stocks and/or US stocks)
* Build CRUD for managing a holdings list
* See currency conversions (e.g. INR → EUR)

## Clarify before building

Ask **one round** of clarifying questions before starting. The two that matter most:

1. **Which markets?** NSE/BSE (Indian stocks), US (NYSE/NASDAQ), or both?
2. **Currency display?** INR only, or also show EUR/USD equivalents via live forex?

Everything else (design style, charts, columns) you can decide sensibly — don't ask about it.

## Project structure

Scaffold this exact layout:

```
<project>/
├── docker-compose.yml          # MongoDB + full stack (prod)
├── docker-compose.dev.yml      # MongoDB only (for local dev)
├── Makefile                    # dev / prod / tidy shortcuts
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── go.mod
│   ├── main.go
│   ├── api/
│   │   └── openapi.yaml        # OpenAPI 3.0 spec
│   ├── db/
│   │   └── mongo.go
│   ├── handlers/
│   │   └── handlers.go         # all HTTP handlers
│   ├── models/
│   │   └── holding.go
│   └── services/
│       └── price.go            # Yahoo Finance fetching + cache
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js          # proxies /api → :8080 in dev
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx             # root state + orchestration
        ├── index.css           # dark theme CSS variables
        ├── api/
        │   └── client.js       # thin fetch wrapper for all endpoints
        └── components/
            ├── SummaryCards.jsx
            ├── HoldingsTable.jsx
            ├── AddEditModal.jsx
            └── Charts.jsx
```

## Backend — Go

**Go module name**: `portfolio-dashboard`

**Router**: `github.com/go-chi/chi/v5` with `github.com/go-chi/cors`

**MongoDB driver**: `go.mongodb.org/mongo-driver v1.13+`

### Data model (`models/holding.go`)

```go
type Holding struct {
    ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
    Script       string             `bson:"script" json:"script"`           // user's display name
    Symbol       string             `bson:"symbol" json:"symbol"`           // Yahoo ticker e.g. TCS.NS
    Exchange     string             `bson:"exchange" json:"exchange"`       // NSE | BSE | NYSE | NASDAQ | OTHER
    Type         string             `bson:"type" json:"type"`               // stock | etf
    StocksOwned  float64            `bson:"stocks_owned" json:"stocks_owned"`
    AvgCostPrice float64            `bson:"avg_cost_price" json:"avg_cost_price"`
    RealizedPnL  float64            `bson:"realized_pnl" json:"realized_pnl"` // profit from already-sold shares
    Notes        string             `bson:"notes,omitempty" json:"notes,omitempty"`
    CreatedAt    time.Time          `bson:"created_at" json:"created_at"`
    UpdatedAt    time.Time          `bson:"updated_at" json:"updated_at"`
}
```

Also define `HoldingWithPrice` (adds live price fields), `PricesResponse`, and `Summary`.

### API routes (`main.go`)

```
GET    /api/holdings        list all (sorted by script)
POST   /api/holdings        create
GET    /api/holdings/{id}   get one
PUT    /api/holdings/{id}   update
DELETE /api/holdings/{id}   delete
GET    /api/prices          all holdings + live prices + EUR rate
GET    /api/summary         portfolio totals
GET    /api/market/price    ?symbol=TCS.NS  → live price lookup
GET    /api/market/forex    ?from=INR&to=EUR
GET    /api/openapi.yaml    serve the spec
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
github.com/go-chi/chi/v5 v5.0.11
github.com/go-chi/cors v1.2.1
go.mongodb.org/mongo-driver v1.13.1
```

Remind the user to run `go mod tidy` before `go run .`.

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

## Frontend — React + Vite

**Dependencies**: `react`, `react-dom`, `recharts`, `axios` (or plain fetch)

**Dev dependency**: `@vitejs/plugin-react`, `vite`

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
| in € | cost in EUR |
| Share Price | live current_price |
| Current Value | stocks_owned × current_price |
| in € | current value in EUR |
| Money in Making | unrealised P&L (current − cost) |
| in € | |
| Money Made | realised_pnl from DB |
| in € | |
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

### App.jsx state

* `holdings` — raw list from `/api/holdings` (fast, no prices)
* `enriched` — from `/api/prices` (with live prices, EUR, P&L)
* Fetch both on mount; re-fetch after every save/delete
* Filter input to search by script name or symbol
* Sticky header with Refresh button and "Add Holding" CTA
* Two tabs: **Holdings** (table) and **Charts**

### `vite.config.js`

```js
proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } }
```

### `api/client.js`

Thin wrapper around `fetch`. Reads `VITE_API_URL` env var for production builds, falls back to `/api` (proxied by Vite in dev).

## Docker setup

### `docker-compose.yml` (production)

Three services: `mongodb` (mongo:7 with healthcheck), `backend` (build from `./backend`), `frontend` (build from `./frontend`, nginx, port 3000→80).

### `docker-compose.dev.yml`

MongoDB only — for running backend and frontend locally.

### `backend/Dockerfile`

Multi-stage: `golang:1.21-alpine` builder → `alpine:3.19` runtime. Copy binary + `api/` directory (for `openapi.yaml`).

### `frontend/Dockerfile`

Multi-stage: `node:20-alpine` builder → `nginx:alpine`. Include `nginx.conf` that:

* Falls back to `index.html` for SPA routing
* Proxies `/api/` to `portfolio_backend:8080`
* Enables gzip

## OpenAPI spec (`api/openapi.yaml`)

Write a proper OpenAPI 3.0 spec covering all routes. Include `components/schemas` for `Holding`, `HoldingInput`, `HoldingWithPrice`, `PricesResponse`, `Summary`, `Error`. Serve it at `GET /api/openapi.yaml`.

## Makefile

```makefile
dev-db:   # docker compose -f docker-compose.dev.yml up -d
prod:     # docker compose up --build
down:     # stop all
backend:  # cd backend && go run .
frontend: # cd frontend && npm run dev
install:  # cd frontend && npm install
tidy:     # cd backend && go mod tidy
```

## README

Include:

* Stack summary
* Column definitions table
* Yahoo symbol format table
* Quick-start commands (local dev + full Docker)
* API endpoint table
* Environment variables table
* Note: run `go mod tidy` before first `go run .`

## Delivery checklist

Before finishing, verify:

* [ ] All Go files import the module correctly (`portfolio-dashboard/models` etc.)
* [ ] All React component names match their imports in `App.jsx`
* [ ] `vite.config.js` has the proxy configured
* [ ] `docker-compose.yml` references correct service names in `nginx.conf`
* [ ] `go.mod` module name matches all internal imports
* [ ] README has the `go mod tidy` step clearly documented
* [ ] `gofmt` and `golangci-lint run ./...` pass with zero issues (see *Go code conventions*)
* [ ] `pre-commit run --all-files` and `go test ./...` both pass
