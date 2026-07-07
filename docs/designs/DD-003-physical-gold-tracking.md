# DD-003: Physical gold tracking — technical design

* **Status**: Draft (DD)
* **Owner**: project owner
* **Implements**: [PRD-003](../prds/PRD-003-physical-gold-tracking.md)
* **Rollout plan**: [PD-043](../plans/PD-043-physical-gold-tracking.md)
* **Dev environment**: [PD-044](../plans/PD-044-dev-environment.md)

## 1. Storage: PostgreSQL (owner decision)

Gold data lives in **PostgreSQL**. Physical gold is a structurally
different holding type — relational purchase rows plus a dense daily price
series, no live feed — and the owner decided it gets its own engine
rather than new Mongo collections. Both options were weighed (a second
database adds operational surface: driver, migrations, backups ×2); the
trade-offs below are accepted knowingly.

* New Go dependency: `github.com/jackc/pgx/v5` (pool: `pgxpool`).
* New container in `docker-compose.dev.yml` and `docker-compose.yml`
  (`postgres:16-alpine`, volume-backed).
* Prod/dev: **Neon** serverless Postgres (owner pick, PD-044) — separate
  branches/databases for prod and dev. Connection string via Secret
  Manager, same pattern as `MONGODB_URI`.
* Backups/restore now cover two engines.

Everything **non-gold stays in Mongo** — including the per-user
`gold_enabled` flag, which belongs to the `users` collection (auth and
role data must not split across engines).

### 1.1 Config

New env vars (defaults < env, as `internal/config`):

* `POSTGRES_URI` — default `postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable`
* Postgres is **optional at boot**: if unreachable, the server logs an
  error and serves everything except gold routes (which return 503). This
  keeps the existing stack alive when the second DB is down.

### 1.2 Schema and migrations

Embedded SQL migrations run at startup (tracked in a `schema_migrations`
table; plain `embed.FS` + sequential files — no heavy framework):

```sql
CREATE TABLE gold_transactions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       TEXT        NOT NULL,          -- Mongo user ObjectID hex
    txn_date      DATE        NOT NULL,
    gm_price      NUMERIC(14,2) NOT NULL CHECK (gm_price > 0),
    weight_grams  NUMERIC(12,3) NOT NULL CHECK (weight_grams > 0),
    quote_price   NUMERIC(14,2),
    bill_amount   NUMERIC(14,2),
    actual_paid   NUMERIC(14,2) NOT NULL CHECK (actual_paid >= 0),
    billed_weight NUMERIC(12,3),
    chennai_rate  NUMERIC(14,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gold_txn_user_date ON gold_transactions (user_id, txn_date);

CREATE TABLE gold_daily_prices (
    user_id        TEXT        NOT NULL,
    price_date     DATE        NOT NULL,
    price_per_gram NUMERIC(14,2) NOT NULL CHECK (price_per_gram > 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, price_date)
);
```

Only **entered** fields are stored. Every computed column (gold cost, the
two 3% figures, total expected, nett per gram, nett reduction, NIMMI loss)
is derived in the service layer at read time — same derive-don't-store
principle as the transactions ledger. Formula changes then never require
backfills.

## 2. Backend layout

Follows the existing layering exactly:

* `internal/db/postgres.go` — pgxpool construction + embedded migration
  runner (mirrors `db/mongo.go`; landed in PR2). `persistence.Store` gains
  an optional `Gold *GoldStore` (nil when Postgres is not
  configured/reachable).
* `internal/persistence/gold.go` — `GoldStore`: owner-scoped CRUD for
  transactions and daily prices. Every query pins `user_id` (the
  `scopedFilter` discipline, SQL edition). `ErrNotFound` on missing rows.
* `internal/domain/gold.go` — `GoldTransaction`, `GoldPrice` structs
  (entered fields only) + `GoldTransactionView` (entered + computed).
* `internal/services/gold.go` — `GoldService`:
  * `List/Create/Update/Delete` transactions → returns views with computed
    columns (`computeColumns(txn)` pure function, unit-tested against the
    owner's spreadsheet rows).
  * `Prices(from,to)`, `PutPrices([]{date,price})` (bulk upsert — the
    missing-day prompt saves all gaps in one call).
  * `MissingDates(today)` — calendar gaps between the **first
    transaction date** and today; every calendar day counts, weekends
    included (PRD §9.5). Days before the first transaction never prompt
    (PRD §7) — price rows earlier than that are allowed but create no
    obligation, so a pre-seeded price history can't block the page.
  * `Metrics(today)` — §3.
  * `HistoryOverlay(dates)` — §4.
* `internal/services/xirr.go` — pure XIRR: Newton–Raphson with bisection
  fallback, day-count ACT/365, guarded for non-convergence (returns
  `ok=false` → UI renders "—"). Unit-tested against spreadsheet `XIRR()`.
* `internal/controllers/gold.go` — thin HTTP wrappers.

### 2.1 Gold access gate

* `users` document gains `gold_enabled bool` (default false, omitted =
  false; no Mongo migration needed).
* `AuthGate` table gains the gold operations with a `RequireGold`
  predicate: authenticated AND `user.GoldEnabled`. Disabled users get
  **404** (consistent with the no-enumeration rule).
* Super admin toggle: `PUT /api/admin/users/{id}/gold` body
  `{"enabled": bool}` — **super admin only** (not region admins; PRD §2.4).
  Toggling off hides data but deletes nothing.

### 2.2 API surface (OpenAPI: `api/specs/gold/gold.yaml`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/gold/transactions` | List (date desc) with computed columns |
| POST | `/api/gold/transactions` | Create |
| PUT | `/api/gold/transactions/{id}` | Update |
| DELETE | `/api/gold/transactions/{id}` | Delete |
| GET | `/api/gold/prices?from&to` | Price series |
| PUT | `/api/gold/prices` | Bulk upsert `[{date, price}]` |
| GET | `/api/gold/missing-dates` | Gap list for the prompt |
| GET | `/api/gold/metrics` | Metrics table incl. XIRR |
| PUT | `/api/admin/users/{id}/gold` | Super admin enable/disable |

Components inline in `api/specs/portfolio-api.yaml` as usual; regen
`go generate -tags tools ./...` + `npm run gen:api`.

## 3. Metrics computation

All live, nothing stored (PRD §3):

```
invested   = Σ actual_paid
grams      = Σ weight_grams            // actual weight (PRD §9.4)
latestGm   = most recent gold_daily_prices row ≤ today
current    = grams × latestGm
beesPL     = Σ over holdings where symbol ∈ {GOLDBEES.NS, GOLDBEES.BO}:   // raw P/L, no tax adj (PRD §9.6/§9.7)
               (qty × livePrice − qty × avgCost) + realized_pnl
nettExBees = current − invested
nettInBees = nettExBees + beesPL
avgPerGram = invested / grams
xirr       = XIRR({−actual_paid @ txn_date}…, {+current @ today})
```

`beesPL` reuses `PortfolioService`'s price path (5-min Yahoo cache) — the
gold service takes the existing `PriceFetcher` + `HoldingStore` as deps.

## 4. History page overlay

`GET /api/history` responses gain an optional `gold` object per row **for
gold-enabled users only**, computed on read (no snapshot writes):

```json
"gold": {"invested": 7200, "current": 14400, "volatility_pct": 0.0, "pnl_pct": 100.0}
```

`HistoryService.List` calls `GoldService.HistoryOverlay(rowDates)`: one
Postgres query for all transactions + one for the price series, then a
linear as-of walk per date (invested = Σ paid ≤ date; grams as-of date;
price = nearest ≤ date). Volatility = % change of `current` vs previous
row present in the response window. GOLDBEES excluded — it is already in
the stock buckets.

## 5. Frontend

* `features/gold/GoldPage.tsx` — route `/gold`; three sections: metrics
  cards/table, transactions table (add/edit/delete modal,
  entered-vs-computed cells visually distinct), daily-price panel.
* `features/gold/MissingPricesModal.tsx` — blocking prompt on page load
  when `/api/gold/missing-dates` is non-empty; inline inputs, one "Save
  all" → bulk `PUT /api/gold/prices` (mirrors `OpeningDateModal`).
* `features/gold/useGold.ts` — data hook (transactions, prices, metrics,
  missing dates).
* Guard: `RequireGold` (redirect to `/` when `!user.gold_enabled`);
  `AuthContext` user object gains `gold_enabled`. Nav link "Gold" rendered
  only when enabled.
* Admin user list gains a gold toggle column, visible to super admin only.
* History page: gold column group + gold series in the chart, rendered
  only when the rows carry `gold`.

## 6. Testing

Per repo policy (meaningful tests only, Go-only backend; no
DB-availability tests):

* `computeColumns` and XIRR: table-driven unit tests pinned to the owner's
  spreadsheet numbers.
* Gold service CRUD/metrics/overlay: service tests with a fake
  `GoldStore` (interface seam), fake `PriceFetcher` for beesPL.
* Controller/auth-gate tests: enabled vs disabled user (404), super-admin
  toggle authorization.
* Frontend: vitest render tests for GoldPage table math display,
  MissingPricesModal save-all, RequireGold redirect.

## 7. Risks

* **Two databases** — accepted (owner decision, §1). Mitigation: gold
  routes degrade to 503 when Postgres is down; rest of app unaffected.
* **Cross-store user delete is not transactional** (dual-write, accepted
  2026-07-06). `AdminDeleteUser` purges Postgres gold rows, then Mongo
  holdings/transactions/sessions, then the user row — there is no
  transaction spanning both stores, so a mid-sequence failure leaves a
  partially deleted account. The ordering bounds the damage: the user row
  goes **last**, so every failure mode leaves the account present, the
  request failing loudly (500), and the delete retryable (all steps
  idempotent); gold data can never be orphaned behind a vanished account.
  Known window: an abandoned half-failed delete leaves a login-able
  account with partial data. Hardening options considered and deferred:
  tombstone-first (hide user + kill sessions before purging) and a
  background reaper for tombstoned users — revisit if deletes ever become
  user-facing or frequent.
* **Formula ambiguity** — resolved: all column formulas confirmed by the
  owner (PRD §9, 2026-07-04). `computeColumns` still isolates any future
  formula change to one function.
* **XIRR non-convergence** on pathological flows — bisection fallback +
  "—" rendering.
