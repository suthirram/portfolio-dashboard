# TDD-002: Test design — daily historical portfolio snapshots

* **Status**: Draft (test design)
* **Owner**: project owner
* **Implements**: [PRD-002](../prds/PRD-002-historical-snapshots.md)
* **Designs**: [DD-002](DD-002-historical-snapshots.md)

This is the test plan for the historical snapshots feature. It enumerates the
units we will test, the seams we will use to test them, and the coverage
targets each implementation PR must hit before it can merge into the
feature branch `feat/PD-042-historical-snapshots`.

## 1. Test policy reminder

Per the project's test policy (saved in user memory):

* No tests that exist only to confirm the database is reachable.
* No tests that exist only to confirm a database error propagates, except
  the single `ErrNotFound` (a.k.a. `mongo.ErrNoDocuments`) translation in
  `persistence` — that one is a real branch.
* Backend tests are Go only. No bash/curl integration scripts.

A test must exercise a meaningful branch of our code: a region grouping
rule, a conflict decision, a date-range edge, an idempotency property.
"Mongo can write a document" is not a meaningful branch.

## 2. Backend — `internal/domain`

### 2.1 `snapshot.go`

| # | Case | What it pins |
|---|---|---|
| 1 | `RegionSnapshot` JSON round-trip preserves `source`. | Tag wiring; protects against a future rename of the enum constants. |
| 2 | `SnapshotSource` only accepts `"cron"` and `"manual"` from JSON. | Stops accidental "auto"/"system" sources leaking in. |

Trivial — one file, ~30 lines of test. No mocks.

## 3. Backend — `internal/persistence/snapshots.go`

These tests use `mtest` (the official mongo-go-driver in-memory mock) — same
pattern the holdings store uses today — so they exercise our query and
update shapes without booting a real Mongo.

### 3.1 `Upsert`

| # | Case | What it pins |
|---|---|---|
| 1 | New `(user, date)` → insert with `source: cron`. | Cron path writes all regions tagged cron. |
| 2 | Same `(user, date)` re-run → cron regions overwritten, manual regions preserved. | The idempotency property DD-002 §6 relies on. |
| 3 | Filter pins `user_id`. | Per-tenant scoping; mirrors the holdings test. |
| 4 | `date` is stored at UTC midnight regardless of input clock. | Normalisation. |

### 3.2 `List`

| # | Case | What it pins |
|---|---|---|
| 1 | `[from, to]` inclusive; newest-first ordering. | Sort + range. |
| 2 | Empty range → empty slice, no error. | Default for empty months. |
| 3 | Other user's row in the same range is not returned. | Cross-tenant isolation. |

### 3.3 `Get`

| # | Case | What it pins |
|---|---|---|
| 1 | Existing row returns the doc. | Happy path. |
| 2 | Missing row returns `persistence.ErrNotFound`. | The one error-translation branch our policy keeps. |

### 3.4 `PatchRegion`

| # | Case | What it pins |
|---|---|---|
| 1 | Patch one region → only that region's `Invested`/`Current`/`Source` change. | DD-002 §6: per-region `source`. |
| 2 | Patching a region on a missing row returns `ErrNotFound`. | API layer maps this to 404. |

### 3.5 `Delete`

| # | Case | What it pins |
|---|---|---|
| 1 | Row with all-manual regions deletes. | Manual rows are removable. |
| 2 | Row with any `cron` region returns `ErrCronProtected`. | DD-002 §4.5 — cron is the source of truth. |

Coverage target for this package: **≥85%** of statements. The package is
small and pure; nothing below this is acceptable.

## 4. Backend — `internal/services/snapshot.go`

The snapshot service consumes a `PriceFetcher` interface (same seam as the
existing portfolio service). All tests inject a fake fetcher that returns
fixed prices per symbol, so no Yahoo call happens.

### 4.1 `regionOf(holding)`

Table-driven test for every known exchange/script combination:

| Input `Script` / symbol | Expected region |
|---|---|
| `NSE` | `india` |
| `BSE` | `india` |
| `LSE` / `XETRA` / known EU exchanges | `europe` |
| `US` / plain ticker | `us` |
| Unknown | `unknown`, logged warn, excluded from sums |

### 4.2 `BuildSnapshot(userID, date)`

| # | Case | What it pins |
|---|---|---|
| 1 | One holding per region → row carries three regions with correct invested/current. | Happy path. |
| 2 | Two holdings in the same region → invested and current sum. | Grouping. |
| 3 | A Yahoo fetch error for one symbol → that symbol's `current` defaults to its invested (no synthetic gain), and the job continues. | DD-002 §3.4. |
| 4 | User with zero holdings → row with all regions at zero. | PRD-002 §6 "starts the day they signed up". |
| 5 | Holding in `unknown` region → emitted log, totals exclude it, no panic. | Region-mapping safety. |

### 4.3 `RunForAllUsers`

| # | Case | What it pins |
|---|---|---|
| 1 | Iterates only non-disabled users. | PRD-002 §8: disabled users paused. |
| 2 | One user's Mongo error does not abort the run; the job's exit code is non-zero. | DD-002 §3.4. |
| 3 | `--user` flag restricts the loop to one id. | CLI seam for replays. |
| 4 | `--dry-run` makes zero `Upsert` calls. | CLI safety. |

### 4.4 Idempotency property test

Run `BuildSnapshot` for the same `(user, date)` twice. Assert the second
write is a no-op for already-cron regions and leaves manual regions alone.
This is the property v2's NATS redelivery will rely on.

Coverage target: **≥80%** of statements.

## 5. Backend — `cmd/snapshot.go`

Cobra command tests use `cobra.Command.SetArgs` and a stubbed service. No
direct snapshot-service code is duplicated.

| # | Case | What it pins |
|---|---|---|
| 1 | `snapshot` with no flags → calls service with `yesterday UTC` and no user filter. | Defaults. |
| 2 | `snapshot --date 2026-06-15` → date parsed at UTC midnight. | Flag wiring. |
| 3 | `snapshot --date 2026-13-99` → exits 1 with parse error. | Validation. |
| 4 | `snapshot --user <id>` → service receives that user filter. | Replay path. |
| 5 | `snapshot --dry-run` → service called with dry-run flag set. | CLI seam. |

## 6. Backend — `internal/controllers/history.go`

Controller tests use the existing `httptest` + `controllers.newWithDeps`
seam, with the snapshot store replaced by a fake.

### 6.1 Auth and scoping

| # | Case | What it pins |
|---|---|---|
| 1 | `GET /api/history` without session → 401. | `AuthGate`. |
| 2 | `POST /api/history` without `X-Requested-With` → 403. | `CSRFCheck`. |
| 3 | A row belonging to another user cannot be read even if its date is guessed. | Per-tenant filter at the store layer. |

### 6.2 `GET /api/history`

| # | Case | What it pins |
|---|---|---|
| 1 | Valid `from`/`to` → returns rows with derived totals. | Happy path + totals derivation. |
| 2 | Missing `from` or `to` → 400. | Required params. |
| 3 | `from > to` → 400. | Sane bounds. |
| 4 | Empty result → `{rows: []}` with `currency`. | Default shape for empty months. |
| 5 | `invested_total == 0` → `pnl_pct` serialises to `null`. | Avoid divide-by-zero. |

### 6.3 `POST /api/history`

| # | Case | What it pins |
|---|---|---|
| 1 | New date → 201 with the inserted row. | Insert path. |
| 2 | Existing date → 409 with `conflicts` listing the conflicting regions. | The conflict-modal trigger. |
| 3 | Negative `invested` → 400. | Validation. |
| 4 | Future `date` → 400. | Validation. |

### 6.4 `PUT /api/history/:date/regions`

| # | Case | What it pins |
|---|---|---|
| 1 | Patch India → only India changes, source becomes `manual`. | Per-region source. |
| 2 | Patch on a missing date → 404. | ErrNotFound mapping. |
| 3 | Body has unknown region key → 400. | Schema strictness. |

### 6.5 `DELETE /api/history/:date`

| # | Case | What it pins |
|---|---|---|
| 1 | All-manual row → 204. | Manual delete. |
| 2 | Any cron region → 409. | DD-002 §4.5. |

### 6.6 `POST /api/history/paste`

| # | Case | What it pins |
|---|---|---|
| 1 | Mixed batch: some rows new, some conflict, some invalid → 200 with the three-bucket response (`applied`, `conflicts`, `rejected`). | The full DD-002 §4.6 shape. |
| 2 | All rows valid and new → all in `applied`, nothing in `conflicts`. | Fast path. |
| 3 | All rows conflict → all in `conflicts`, nothing applied. | UI drives sequential modals. |
| 4 | `month` does not match any row's month → 400. | Catches paste into wrong month. |

Coverage target for the controllers and services packages combined:
**≥80%** of new lines.

## 7. Frontend

Vitest + `@testing-library/react`. The existing harness already runs in
the repo (`npm run test:run`, `npm run test:coverage`).

All API calls go through `lib/api/client.ts`; tests mock `fetch` via
`vi.fn()` at module level.

### 7.1 `useHistory`

| # | Case | What it pins |
|---|---|---|
| 1 | Mount with `{year, month}` → calls `GET /api/history` with the correct date range. | Range derivation. |
| 2 | Changing year/month re-fetches. | Reactivity. |
| 3 | API error → `error` populated, `rows` empty. | Error UX. |

### 7.2 `HistoryPage`

| # | Case | What it pins |
|---|---|---|
| 1 | Year dropdown populated from `/api/history/range` response. | Bootstrap. |
| 2 | Empty month → renders the friendly empty state with "Add row" CTA. | PRD-002 §7.4. |
| 3 | Rows present → renders table + chart. | Wiring. |

### 7.3 `HistoryTable`

| # | Case | What it pins |
|---|---|---|
| 1 | Renders all columns with `—` for absent regions. | Per-region nulls. |
| 2 | Cron rows hide the delete control but show edit. | DD-002 §4.5 (server enforces; UI is consistent). |
| 3 | Manual rows show both edit and delete. | UI for manual rows. |

### 7.4 `HistoryChart`

| # | Case | What it pins |
|---|---|---|
| 1 | Renders six line series (three regions × invested/current) plus one P/L % line. | Series wiring. |
| 2 | Single-day data renders without throwing. | One-row edge. |
| 3 | Tooltip shows all six values + total P/L %. | Tooltip contract. |

(Recharts is rendered into a `jsdom` container; tests assert series count
via the `recharts`-emitted DOM, not pixel output.)

### 7.5 `AddRowModal`

| # | Case | What it pins |
|---|---|---|
| 1 | Valid form → POST body matches DD-002 §4.3 shape. | Submission. |
| 2 | Server returns 409 → conflict dialog opens with the returned conflicts. | Conflict handoff. |
| 3 | Negative value → form-level validation blocks submit. | Defense in depth. |

### 7.6 `PasteModal`

| # | Case | What it pins |
|---|---|---|
| 1 | TSV from Google Sheets parses into the §4.6 request body. | Parser. |
| 2 | CSV (Excel default) parses too. | Two clipboard formats. |
| 3 | A pasted row whose date is outside the selected month is rejected client-side and shown in the per-row summary. | UX clarity. |

### 7.7 `ConflictDialog`

| # | Case | What it pins |
|---|---|---|
| 1 | Three regions render, each with existing tag (`cron`/`manual`) and incoming value. | Render contract. |
| 2 | Confirm with only India checked → emits PATCH for India only. | Per-region override. |
| 3 | Multi-date queue → dialogs open in date order; cancel skips that date. | Queue order from PRD-002 §7.3. |

### 7.8 `App.tsx` route guard

| # | Case | What it pins |
|---|---|---|
| 1 | Visiting `/history` while logged out → redirects to `/login`. | `RequireAuth` wiring. |

Coverage target for the new `features/history/` folder: **≥70%** of
statements / branches.

## 8. Property and fuzz checks

A couple of properties worth pinning as Go fuzz tests:

* `Upsert` is idempotent: any number of cron re-runs over the same
  `(user, date)` with the same holding fixture converge to the same
  document.
* `regionOf` is total: every string we throw at it returns a value (never
  panics); only the known set returns a real region, everything else
  returns `unknown`.

## 9. What we are explicitly not testing

* Yahoo Finance availability or HTTP-level behaviour. The fake fetcher
  covers our integration surface.
* Mongo connection lifecycle, retries, or driver internals.
* Recharts internal rendering correctness.
* Browser visual regressions (no Playwright story for `/history` in v1
  beyond the existing smoke test).
* The NATS path (v2 only).

## 10. Coverage roll-up and CI

Each implementation PR is expected to add tests in the same diff. The
acceptance bar before a PR can merge into `feat/PD-042-historical-snapshots`:

* Backend `go test ./...` passes.
* Frontend `npm run test:run` passes.
* Coverage targets above are met for new packages / folders.
* No new flaky tests (each test must pass three times in a row in CI).

The final feature → main PR re-runs all of the above against the
integrated branch.
