# DD-002: Technical design — daily historical portfolio snapshots

* **Status**: Draft (technical design)
* **Owner**: project owner
* **Implements**: [PRD-002](../prds/PRD-002-historical-snapshots.md)
* **Related**: [DD-001 multi-tenancy](DD-001-user-auth-and-multi-tenancy.md),
  [PD-029 Cloud Run deploy](../plans/PD-029-cloud-run-deploy.md)

This is the *how* for PRD-002. Product behaviour, the cumulative-midnight
ledger model, the conflict UX, and the cron-vs-NATS roadmap live in the PRD;
this doc covers the data model, the snapshot job, the API surface, the
frontend wiring, and rollout.

## 1. Current state

The dashboard has no persisted history. Every read goes
`frontend → /api/prices` → `PortfolioService.Prices`
(`backend/internal/services/portfolio.go`) which calls `PriceService` to hit
Yahoo Finance v8 with a 5-minute in-memory TTL cache. Aggregates are computed
on the fly inside `PortfolioService.Summary` and never written back. There is
no scheduler, no NATS, no second binary — only the `serve` subcommand wired
through `cmd/serve.go`.

## 2. Data model

### 2.1 New collection: `portfolio_snapshots`

One document per `(user_id, date)`. `date` is a UTC midnight `time.Time`
(year-month-day, zero clock); we store it as a BSON date so range queries
hit an index.

```go
// internal/domain/snapshot.go

type SnapshotSource string

const (
    SnapshotSourceCron   SnapshotSource = "cron"
    SnapshotSourceManual SnapshotSource = "manual"
)

type RegionSnapshot struct {
    Invested float64 `bson:"invested"`
    Current  float64 `bson:"current"`
    // Source is per-region so a user override on one region does not
    // re-tag the others. See PRD §6 / §7.3.
    Source SnapshotSource `bson:"source"`
}

type PortfolioSnapshot struct {
    ID        primitive.ObjectID         `bson:"_id,omitempty"`
    UserID    primitive.ObjectID         `bson:"user_id"`
    Date      time.Time                  `bson:"date"`     // UTC midnight
    Currency  string                     `bson:"currency"` // "INR" today
    Regions   map[string]RegionSnapshot  `bson:"regions"`  // keys: "india","europe","us"
    CreatedAt time.Time                  `bson:"created_at"`
    UpdatedAt time.Time                  `bson:"updated_at"`
}
```

Totals (`invested_total`, `current_total`, `pnl_pct`) are **derived** at
read time, not stored. Storing them costs nothing in space but invites
drift after a manual override; the chart already needs to recompute totals
client-side per series.

`Regions` is a map keyed by region slug. Holding regions are inferred from
the existing `Holding.Script` field (`NSE`/`BSE` → `india`, EU exchanges →
`europe`, `US` → `us`). The mapping lives in
`internal/services/snapshot.go:regionOf`. Holdings whose region cannot be
inferred fall into an `unknown` bucket which is logged at warn but not
written; this matches how the live dashboard already groups them.

### 2.2 Indexes

* `{user_id: 1, date: -1}` **unique** — enforces "at most one row per
  (user, day)" and powers the month query (`user_id = X AND date BETWEEN
  start AND end`).
* `{date: 1}` — supports the snapshot job's "give me everyone who needs a
  row for date D" scan and any future retention sweep.

No TTL index — historical data is meant to live forever. Retention, if
ever needed, will be a separate sweep job.

### 2.3 Persistence layer

A new store type per the existing convention
(`backend/internal/persistence/snapshots.go`), bundled into `*Store` next to
`HoldingStore`/`UserStore`/`SessionStore`. All reads pin `user_id` via
`scopedFilter` (same pattern as `HoldingStore`). Surface:

```go
type SnapshotStore struct { col *mongo.Collection }

// Idempotent upsert by (user_id, date). Returns whether a row existed.
func (s *SnapshotStore) Upsert(ctx, snap PortfolioSnapshot) (existed bool, err error)

// List rows in [start, end] inclusive, newest first.
func (s *SnapshotStore) List(ctx, userID primitive.ObjectID, start, end time.Time) ([]PortfolioSnapshot, error)

// Get a single (user, date) — returns persistence.ErrNotFound if absent.
func (s *SnapshotStore) Get(ctx, userID primitive.ObjectID, date time.Time) (PortfolioSnapshot, error)

// Replace a single region on an existing row. Used by manual override / paste.
func (s *SnapshotStore) PatchRegion(ctx, userID primitive.ObjectID, date time.Time, region string, rs RegionSnapshot) error

// Delete a manual row. Cron rows are never deleted via API.
func (s *SnapshotStore) Delete(ctx, userID primitive.ObjectID, date time.Time) error
```

`Upsert` uses Mongo `findOneAndUpdate` with `$setOnInsert` for the cron
path and `$set` for the same-date re-run case, so a re-run of the
snapshot job for the same date is safe.

## 3. The snapshot job

### 3.1 New subcommand: `backend snapshot`

A cobra subcommand alongside `serve` and the existing `migrate` /
`admin` ones. Signature:

```
backend snapshot [--date YYYY-MM-DD] [--user <id>] [--dry-run]
```

* Default `--date` is yesterday (UTC) — the cron fires after midnight,
  by which point that day's market sessions have closed, so the job
  records settled close values rather than a mid-session snapshot. The
  flag is mostly for replays and backfills; the cron always invokes with
  no flag.
* `--user` restricts the run to one user — useful for debugging and
  one-shot fixes; default is "every non-disabled user".
* `--dry-run` runs the full Yahoo fetch and prints what *would* be
  written, without persisting.

Process per user:

1. `HoldingStore.ListByOwner(userID)` — every active holding.
2. Group by inferred region.
3. For each holding call `PriceService.Get(symbol)` — reuses the
   existing 5-minute cache, so a single job run shares cache across
   users and is cheap.
4. Compute `RegionSnapshot{Invested, Current}` per region.
5. `SnapshotStore.Upsert` for `(userID, yesterdayUTC)` with all regions
   tagged `source: cron`.

Iteration order is by `_id` so resume-after-crash is deterministic.
There is no persisted cursor in v1: the upsert is idempotent, so on a
mid-run kill the operator just re-runs `backend snapshot` — already-done
users are no-ops, the rest get done. (Open question §10 in the PRD.)

`Disabled` users (the soft-deleted flag from DD-001) are skipped, as
required by PRD §8.

### 3.2 Trigger in v1

External cron only. Two deploy targets exist:

* **Cloud Run** (PD-029): a Cloud Scheduler job hits a Cloud Run *Job*
  (not the web service) that runs `backend snapshot`. Same image, same
  config, separate revision. Scheduler config: cron `0 0 * * *`,
  timezone `Etc/UTC`.
* **Docker Compose / local**: a sidecar `cron` container (busybox) runs
  the same command against the backend container's binary via
  `docker exec`, or a host-cron line on the deploy host. Documented in
  PD-042 (rollout plan).

The web `serve` process does *not* schedule anything. This keeps the
trigger out of the request path and means a backend redeploy never
"loses" a midnight.

### 3.3 Missed days

Skipped. PRD §5 is explicit. v2 will swap this for NATS JetStream so
the redelivery story is handled at the queue layer rather than in
application code (see §7).

### 3.4 Failure handling

* A Yahoo Finance error for one symbol degrades that symbol to
  `current = invested` for the day (no synthetic gain/loss) and logs
  at warn with the symbol. The job continues — one bad symbol does not
  poison a user's whole row.
* A Mongo write error for one user fails that user, the job logs at
  error, and continues to the next user. The job exits non-zero if
  any user failed; the cron platform's alerting takes it from there.

## 4. API surface

All endpoints sit under `/api/history`, authed and CSRF-checked the same
way the rest of the app already does (`CSRFCheck` + `AuthGate` in
`internal/httpserver/auth.go`). All are owner-scoped — the caller's user
id is pinned at the store layer; there is no `:userID` path parameter and
no admin act-as in v1.

### 4.1 `GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns the caller's snapshots in `[from, to]` inclusive, newest first.
`from` and `to` are required; the frontend month picker resolves them to
the first / last day of the chosen month. Response:

```json
{
  "currency": "INR",
  "rows": [
    {
      "date": "2026-06-16",
      "regions": {
        "india":  { "invested": 100.0, "current": 198.0, "source": "cron" },
        "europe": { "invested":   0.0, "current":   0.0, "source": "cron" },
        "us":     { "invested":   0.0, "current":   0.0, "source": "cron" }
      },
      "totals": {
        "invested_total": 100.0,
        "current_total":  198.0,
        "pnl_pct":         98.0
      }
    }
  ]
}
```

`totals` is computed server-side from `regions` so the frontend never has
to and the chart can rely on it.

### 4.2 `GET /api/history/range`

Returns `{earliest_year, latest_year, has_data}` for populating the year
dropdown without loading any rows. Cheap projection.

### 4.3 `POST /api/history`

Body: one row.

```json
{
  "date": "2026-06-16",
  "regions": {
    "india":  { "invested": 100.0, "current": 198.0 },
    "europe": { "invested":   0.0, "current":   0.0 },
    "us":     { "invested":   0.0, "current":   0.0 }
  }
}
```

Three outcomes:

1. **No row exists for that date** → insert with all regions tagged
   `manual`. `201 Created`.
2. **Row exists, no conflict (caller omitted any region that already
   exists)** → reject with `409 Conflict` and a body listing the
   conflicting regions. The frontend opens the conflict modal.
3. **Row exists and the body carries an `overrides` map saying which
   regions the user chose to overwrite** → see §4.4.

Validation: `date` must be a real UTC date, not in the future. `invested`
and `current` must be finite, non-negative `float64`. Region keys must be
one of `india`/`europe`/`us`.

### 4.4 `PUT /api/history/:date/regions`

Body: per-region overrides the user accepted in the conflict modal.

```json
{
  "regions": {
    "india":  { "invested": 100.0, "current": 198.0 },
    "europe": { "invested":   0.0, "current":   0.0 }
  }
}
```

Each region in the body is written via `SnapshotStore.PatchRegion` with
`source: manual`. Regions absent from the body are left alone. Response:
the updated row in the same shape as `GET /api/history` rows.

### 4.5 `DELETE /api/history/:date`

Deletes a row only if every region's `source == manual`. Otherwise
`409 Conflict` — a cron row cannot be deleted, only overridden. (PRD §6:
cron is the source of truth.)

### 4.6 `POST /api/history/paste`

Bulk-paste endpoint used by the "paste per month" flow. Body:

```json
{
  "month":  "2026-06",
  "rows":   [
    { "date": "2026-06-01", "regions": { ... } },
    { "date": "2026-06-02", "regions": { ... } }
  ]
}
```

The server validates every row (same rules as 4.3) and returns:

```json
{
  "applied":   [ "2026-06-01" ],
  "conflicts": [
    {
      "date": "2026-06-02",
      "existing": { "india": { ..., "source": "cron" }, ... },
      "incoming": { "india": { ... }, ... }
    }
  ],
  "rejected":  [
    { "date": "2026-06-31", "reason": "invalid date" }
  ]
}
```

`applied` rows are persisted immediately. `conflicts` are *not* persisted
— they drive the per-date sequential modal in the UI (PRD §7.3). The UI
then calls `PUT /api/history/:date/regions` once per resolved conflict.

### 4.7 OpenAPI

Add a new domain folder `api/specs/history/history.yaml` and reference it
from `api/specs/openapi.yaml`, matching the holdings / market / auth /
admin split documented in CLAUDE.md. Schemas live inline in
`api/specs/portfolio-api.yaml`. Regen via `go generate -tags tools ./...`
(backend) and `npm run gen:api` (frontend).

## 5. Frontend

A new feature folder `frontend/src/features/history/` holding everything
the page needs.

### 5.1 Route + nav

* `App.tsx` adds a `/history` route guarded by `RequireAuth`.
* The dashboard header gets a **History** link (same component as the
  existing top-nav buttons; see PD-038's header layout).

### 5.2 Components

* `HistoryPage.tsx` — owns the year + month state and the data fetch.
  Calls `GET /api/history/range` once on mount to populate the year
  dropdown, then `GET /api/history?from=…&to=…` on every change.
* `useHistory.ts` — data hook (mirrors `useHoldings.ts` shape: returns
  `{rows, loading, error, refresh}`).
* `HistoryChart.tsx` — Recharts `ComposedChart`:
  * Three pairs of `Line` series (invested + current) — one pair per
    region, one colour family each (orange / blue / a third).
  * One `Line` for `pnl_pct` on a right `YAxis`.
  * X axis is `date`; tooltip shows all six values plus total P/L %.
* `HistoryTable.tsx` — table with the columns PRD §7.2 lists, plus an
  edit / delete column. Cron-only rows hide delete.
* `AddRowModal.tsx` — form for §4.3 (POST `/api/history`).
* `PasteModal.tsx` — textarea + parser that turns TSV/CSV into the §4.6
  body shape. Shows a per-row pass / fail summary before submit.
* `ConflictDialog.tsx` — the sequential modal from PRD §7.3. Drives the
  queue of conflicts (single-row from §4.3 or bulk from §4.6). For each
  date, renders three rows (India / Europe / US) with the existing
  value tagged `cron`/`manual` next to the incoming value, and a
  checkbox per region. Confirm fires §4.4; Cancel skips that date.

### 5.3 Generated types

Regenerate `frontend/src/lib/api/schema.gen.ts` via `npm run gen:api`
after the OpenAPI changes land.

## 6. Edge cases

* **Empty portfolio user** — the cron run still writes a row with all
  regions at zero, so the chart starts the day the user signs up.
* **Hidden / disabled user** — skipped by the cron run; manual entry
  is also blocked at the API layer (`AuthGate` already refuses
  `disabled=true` users to call anything).
* **Holding has no inferable region** — logged at warn, excluded from
  totals. The user sees their other regions normally; we will fix the
  region-mapping table rather than papering over it in the snapshot.
* **`invested_total == 0`** — `pnl_pct` is sent as `null` and the UI
  renders "—".
* **Currency switch in the future** — every row carries its `currency`
  field. v1 is INR-only; if a future change adds per-user display
  currency, manual rows stay frozen in the currency they were entered
  in and the chart converts on read. (PRD §10 open question.)
* **Re-run of cron for the same day** — idempotent upsert. Regions
  whose `source` is `manual` keep the user's values; regions whose
  `source` is `cron` get rewritten. This is enforced in
  `SnapshotStore.Upsert`, not in the service.
* **Manual override of a region that the cron job later updates** — the
  region's `source` is `manual`, so the next cron run leaves it alone.
  The override is sticky until the user deletes the row or overrides
  again with cron values.

## 7. v2 sketch (NATS JetStream)

Out of scope for the v1 PRs but called out so v1 does not paint us into a
corner.

* A small `scheduler-svc` binary owns the cron and publishes
  `portfolio.snapshot.tick` with payload `{ "date": "YYYY-MM-DD",
  "trigger": "cron"|"manual" }`.
* The existing backend grows a JetStream durable consumer on that
  subject. The handler is exactly the per-user loop from §3.1.
* The current `backend snapshot` subcommand is kept for ops / replays,
  but its body becomes "publish the event and exit" so cron and ad-hoc
  replays share the same downstream path.
* JetStream gives us redelivery for free, killing the "skipped days"
  bullet from PRD §5 without us having to write catch-up logic.

To make v2 cheap, v1's `Upsert` already keys on `(user_id, date)` and
already tolerates re-runs idempotently. No schema change should be
needed between v1 and v2.

## 8. Rollout

Per PRD-002 and the PR split agreed with the owner:

1. **PR1** — PRD-002 (this PR's parent).
2. **PR2** — DD-002 (this doc).
3. **PR3** — TDD-002 (test plan).
4. **PR4** — `internal/domain/snapshot.go`, `internal/persistence/snapshots.go`,
   indexes, store wiring into `*Store`. No HTTP.
5. **PR5** — `backend snapshot` subcommand, `internal/services/snapshot.go`,
   region inference, Yahoo fetch reuse. No HTTP yet.
6. **PR6** — `/api/history` endpoints as plain Echo handlers
   (`RegisterHistoryRoutes`). **Shipped without** the OpenAPI spec or
   codegen: the routes are hand-wired and the frontend consumes them via
   types inlined in `lib/api/client.ts`. The OpenAPI/codegen work is split
   out to PR6b to keep PRs small (see below).
6b. **PR6b** (follow-up) — `api/specs/history/history.yaml` + inline
   schemas in `portfolio-api.yaml`, regen `api/*.gen.go` and
   `schema.gen.ts`, then replace the inlined `lib/api/client.ts` history
   types with the generated `Schemas[...]`. No behaviour change.
7. **PR7** — frontend: `/history` route, table, chart, add-row,
   paste, conflict dialog, plus the `features/history` Vitest suite
   (TDD-002 §7).
8. **PR8** — Cloud Scheduler / cron wiring in the deploy (PD-042
   rollout plan).

Each implementation PR keeps the docs honest: if reality diverges, the
PR updates DD-002 in the same diff.

## 9. Test plan summary

Full test plan is TDD-002. The shape:

* Unit: region inference; totals derivation; `Upsert` idempotency;
  region-level `Source` preservation across cron re-runs.
* Service: snapshot job over a fixture user set with a stubbed
  `PriceFetcher`; partial Yahoo failure; paste parser.
* HTTP: scoping (a user cannot read another user's rows even by
  guessing the date); conflict response shape; CSRF check.
* Frontend: month navigator state; conflict dialog queue ordering;
  paste-from-TSV parser.

No DB-availability / DB-error tests (per project policy).

## 10. Open questions

* **Audit trail on override** — keep original cron values in an
  `original_cron` sub-document for reversibility, or destructive?
  Leaning destructive in v1.
* **Paste schema** — exact column order, header row required y/n, date
  format. Will be fixed during PR7 with a copy-paste test against real
  Google Sheets / Excel output.
* **Mid-job restart semantics** — confirm "re-run, rely on idempotent
  upsert" is sufficient; if Yahoo rate-limits become a concern, add
  a persisted cursor in a later PR.
* **Currency on manual rows** — frozen vs converted on display-currency
  change. Defer until display currency itself becomes a per-user
  setting.
