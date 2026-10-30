# DD-005: Dividend history — technical design

* **Status**: Draft v2 (DD) — owner decisions of 2026-10-30 ([PRD-005 §13](../prds/PRD-005-dividend-history.md#13-owner-decisions-2026-10-30))
* **Owner**: project owner
* **Implements**: [PRD-005](../prds/PRD-005-dividend-history.md)
* **Rollout plan**: [PD-048](../plans/PD-048-dividend-history.md)
* **Visuals**: [PD-048 visual spec](../visuals/PD-048-dividend-history.html) ([published](https://claude.ai/artifact/N1DGvkdmVHjUyVG5gxiUv6))
* **Related**: [DD-001](DD-001-user-auth-and-multi-tenancy.md) (scoping, act-as),
  [DD-002](DD-002-historical-snapshots.md) (History), [DD-003](DD-003-physical-gold-tracking.md)
  (History on-read overlay precedent), [DD-004](DD-004-all-transactions-view.md)
  (`TransactionWithHolding`, `ListByUser`)

## 1. Approach — dividends are ledger events

A dividend is a `transactions` document with `type = dividend`,
`holding_id` = the owning holding, `amount` = cash received, `currency`
denormalised from the holding. **No new collection.**

Debated with the owner (2026-10-30); the separate-collection arguments and
why they lose once every dividend must belong to a holding:

| Argument for a separate collection | Answer |
|---|---|
| Free-text share names need not match a holding | Owner requires a holding for every dividend — gone. |
| Bulk import would recompute + heal per row | Batch import recomputes each affected holding **once**; and dividends never change snapshot buckets, so **no heal** is needed (§2.5). Same cost in either design. |
| Atomic multi-document writes | Needed in either design (dividends change holding totals) — §2.6. |
| Import metadata pollutes `Transaction` | One optional `import` sub-document, same pattern as `ratio` / `realized_seed` / `opening_date`. |
| An import bug corrupts the source of truth | A dividend event only adds to `TotalDividends`; it never moves quantity, average cost or the oversell check. |

What the ledger gives for free, and a second collection would have to
re-implement:

* **No double counting by construction** — `RecomputePosition` already sums
  dividend events into `TotalDividends` (`ledger.go:86`). A second store
  would need a merge rule against dividends entered in the ledger editor.
* **No orphans** — `TransactionStore.DeleteByHolding` cascades.
* **Every existing view** (dashboard data, all-transactions view, per-holding
  ledger editor, admin act-as listing) already reads these events.

## 2. Backend

### 2.1 Domain changes

`internal/domain/transaction.go` — optional import metadata on `Transaction`:

```go
// ImportMeta records where a CSV-imported event came from (PRD-005). Audit
// only: never a key, never authoritative — the sheet's cumulative in
// particular is a running total, not an identity.
type ImportMeta struct {
 BatchId         string   `bson:"batch_id"`                   // one per confirmed import
 Line            int      `bson:"line"`                       // 1-based file line (header = 1)
 SheetName       string   `bson:"sheet_name"`                 // Share Name as written in the sheet
 SheetCumulative *float64 `bson:"sheet_cumulative,omitempty"` // CUMULATIVE cell, if present
}

// on Transaction:
 Import *ImportMeta `bson:"import,omitempty" json:"-"`
```

`internal/domain/holding.go` — confirmed name aliases:

```go
 // Aliases are sheet names (exactKey) the owner confirmed as this holding
 // during a dividend import (PRD-005 §6.3); later imports auto-map them.
 // Not a derived field: written only by the import confirm step.
 Aliases []string `bson:"aliases,omitempty" json:"-"`
```

New `internal/domain/dividend.go` — the duplicate identity, shared by
preview and confirm:

```go
// DividendKey is the PRD-005 §5 identity: holding + calendar day + amount in
// minor units. Integer cents so 300 ≡ 300.00 across two parses.
type DividendKey struct {
 HoldingId primitive.ObjectID
 Day       string // YYYY-MM-DD
 Cents     int64
}

func AmountCents(amount float64) int64 { return int64(math.Round(amount * 100)) }
func CentsToMoney(cents int64) float64  { return float64(cents) / 100 }

func DividendKeyOf(t Transaction) DividendKey {
 return DividendKey{HoldingId: t.HoldingID, Day: UTCDate(t.Date).Format(time.DateOnly), Cents: AmountCents(t.Amount)}
}
```

### 2.2 Persistence

`TransactionStore` gains (owner-scoped via `scopedFilter`, like the rest).
The Find + cursor body of `ListByHolding` / `ListByUser` is extracted into
one private `find(ctx, filter, sort)` that every list method calls.

| Method | Purpose |
|---|---|
| `ListDividends(ctx, userId, currency)` | tab listing, `date:1, created_at:1, _id:1` |
| `ListAllDividends(ctx, userId)` | History overlay input |
| `ListDividendsByHoldings(ctx, userId, holdingIds, from, to)` | duplicate window for an import |
| `InsertMany(ctx, txns)` | ordered batch insert |
| `DeleteDividends(ctx, userId, currency) ([]primitive.ObjectID, int64, error)` | delete-all; returns the affected holding ids |

**One stored currency format.** Every ledger write — hand-entered
(`TransactionsService.Create`), imported, or synced — stores
`ledgerCurrency(holding)`: the canonical INR/EUR from `CurrencyOf` (blank →
INR), never blank. Legacy rows written before that are fixed once by the
idempotent `migrate currencies` command (blank → INR, holdings and events),
run after PR2 and before PR3 deploys. So the dividend queries, delete-all and
the History overlay filter on the stored value with no `""` special case.

Because every tab, delete-all and the History overlay filter on that copy,
the copy must follow the holding: `TransactionStore.SetCurrencyByHolding`
rewrites it on every event of a holding, and `HoldingsService.Update` calls it
(with `ledgerCurrency`) whenever an edit sends a currency. The call is
idempotent, so a failed sync is repaired by saving the same edit again.

`HoldingStore` gains `MoveAliases(ctx, userId, holdingId, keys)`: `$pull`
the keys from the user's other holdings, `$addToSet` on this one, so a
re-pointed name never belongs to two holdings.

New index on `transactions`:

```go
// dividend listing + import window (DD-005 §2.2): equality on user_id, type,
// currency, then the listing's sort keys in order.
{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "type", Value: 1}, {Key: "currency", Value: 1}, {Key: "date", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}},
```

Same-day order: a batch shares one `created_at`; the service assigns
ObjectIDs in sheet order before inserting, so `_id` preserves sheet order.

### 2.3 Name resolution — `internal/services/dividend_match.go`

Pure functions, unit-tested without Mongo. Sheet names are mostly the
holding's **script name** (owner decision 14), so the automatic match and
most suggestion signals (corporate-word equality, token prefix, initials,
trigram similarity) compare against the script; the symbol signals only
help the occasional symbol-style name.

```go
// exactKey is the only normalisation an automatic match allows: lower-case,
// whitespace collapsed. Aliases are stored as exactKey.
func exactKey(s string) string

// nameKey is the looser key for suggestions only: lower-case, exchange
// suffix (.ns/.bo) dropped, punctuation → space, whitespace collapsed.
// Never used to auto-match.
func nameKey(s string) string

// corpKey is nameKey minus corporate filler words (limited, ltd, inc, plc,
// corp, corporation, company, co, the) — used for suggestions only.
func corpKey(s string) string
```

`resolveNames(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution`:

1. Candidates = holdings whose canonical currency equals the tab.
2. **Answer** (the user's popup answer in this import, keyed by sheet name):
   a candidate's id → `confirmed` (saved as an alias unless it is the exact
   match anyway); `null` or a non-candidate id → `unresolved`.
3. **Exact**: `exactKey(sheet)` equals `exactKey(script)` or an alias of
   **exactly one** candidate → `auto` (`matched_by`: `script` | `alias`).
   Equal to several → `ambiguous`. The symbol is **not** an exact-match key:
   owner decision 13 (PRD-005 §13) lists `JIOPLA` — the symbol of
   `Jio Platforms Ltd` / `JIOPLA.NS` — among the names that must be confirmed,
   together with `jio`, `JLP` and `Jio Platforms Limited`. Punctuation
   (`Jio Platforms Ltd.`) and exchange suffixes (`tcs.ns`) likewise go to the
   popup.
4. Otherwise → `needs_confirmation` with up to 3 **suggestions**, scored
   0–1 as the max of:
   * symbol equality after `nameKey` (`JIOPLA` / `JIOPLA.NS` ↔ `JIOPLA.NS`) → 0.98
   * `corpKey` equality (`Jio Platforms Limited` ↔ `Jio Platforms Ltd`) → 0.95
   * token prefix — every sheet token prefixes a candidate token, or the
     reverse (`jio` → `jio platforms`) → 0.8
   * symbol prefix ≥ 4 chars (`JIOP` ↔ `JIOPLA.NS`) → 0.8
   * initials (`JPL` ↔ Jio Platforms Limited) → 0.7
   * trigram Jaccard on `corpKey` (`JLP`, typos) → raw score

   Suggestions below 0.3 are dropped. `preselect` = top suggestion only when
   ≥ 0.8 and ahead of the next by ≥ 0.15. **No suggestion — not even a
   symbol match — is applied without the user's confirmation** (PRD-005 §6.2).
5. A `needs_confirmation` / `ambiguous` / `unresolved` name has no holding,
   so its rows are invalid until the popup answers it.

### 2.4 Duplicate detection — occurrence-based

```go
// partition splits valid rows (sheet order) into new and duplicate by
// occurrence: each existing DB dividend with the same key absorbs one sheet
// row. Sheet repeats beyond the DB count are new (PRD-005 §5 A–D).
func partition(rows []importRow, existing []domain.Transaction) (fresh, dups []importRow) {
 remaining := make(map[domain.DividendKey]int, len(existing))
 for _, t := range existing {
  remaining[domain.DividendKeyOf(t)]++
 }
 for _, r := range rows {
  k := r.key()
  if remaining[k] > 0 {
   remaining[k]--
   dups = append(dups, r)
   continue
  }
  fresh = append(fresh, r)
 }
 return fresh, dups
}
```

`existing` = every dividend event of the resolved holdings in the sheet's
date window — **including hand-entered ones**, which is what stops a
dividend in the ledger editor and the same line in a sheet becoming two
records. Cumulative plays no part.

### 2.5 Service — `internal/services/dividends.go`

`DividendsService{txns, holdings, tx txRunner, logger, today func() time.Time}`
(`today` = shared `istToday`, moved from `gold_prices.go`; `tx` is
`*persistence.Store` in production and a pass-through runner in tests).
Every method opens a tracing span and binds `logger := s.log(ctx)` once.
Analytics, name resolution, duplicate partitioning, the cumulative check and
the History overlay are pure functions in their own files
(`dividend_view.go`, `dividend_match.go`, `dividend_import.go`,
`dividend_history.go`), so they are tested without Mongo.

* **`List(ctx, userId, currency) (api.DividendView, error)`** — one read of
  dividend events + one of holdings (labels). In stored order computes, in
  integer cents: `cumulative` (tab running total), `holding_cumulative`
  (per-holding running total); `summary` {total, count, first/last date,
  holdings}; `by_year`, `by_month` ({period, total, count}); `by_holding`
  ({holding_id, script, symbol, total, count, share}). Sorted biggest first.
  All analytics come from this one pass, so the page cannot disagree with
  itself; and `by_holding[i].total` equals that holding's `total_dividends`
  (same events, same sum) — asserted in tests.
* **`Preview(ctx, userId, in api.DividendImportInput) (api.DividendImportPreview, error)`**
  — read-only: validate rows (shared `validateDividend`, §2.7), resolve
  names (§2.3), load window, `partition` (§2.4), cumulative check (§2.8).
  Returns counts, per-name resolutions, per-row status, warnings.
* **`Import(ctx, userId, in) (api.DividendImportResult, error)`** — runs the
  same pipeline as `Preview` **inside one Mongo transaction** (§2.6), so it
  re-validates against the database as it is at commit time. Any invalid row
  or unresolved name → `ImportInvalidError` carrying the fresh preview →
  422, nothing written. Otherwise, in the transaction: `InsertMany(fresh)`
  (with `ImportMeta`), `MoveAliases` for every **confirmed** name, and
  `recomputeAndPersist` once per affected holding. Returns `{imported,
  duplicates, batch_id}`.
* **`DeleteAll(ctx, userId, currency) (int64, error)`** — in one transaction:
  `DeleteDividends`, then `recomputeAndPersist` for each affected holding. A
  holding that no longer exists (an orphan dividend left by a failed cascade)
  returns `ErrNotFound` from the recompute and is skipped, so one stray row
  can never block Delete all for the tab.
* Single add / edit / delete reuse **`TransactionsService.Create/Update/Delete`**
  — no second write path. One change there: a new `healAfter(events...)`
  **skips the snapshot heal when every event involved is a dividend**
  (an update that changes a buy into a dividend still heals), because snapshot
  buckets and lines carry quantity, cost and close, never dividends; healing
  would rewrite History for nothing.

Why no heal on import either: same reason. History shows dividends through an
on-read overlay (§2.9), so it is current without touching snapshots.

### 2.6 Atomicity — Mongo transactions

No code uses multi-document transactions today. Prod (Atlas) is a replica
set and supports them; the dev `mongo:7` container is standalone and does
not. Decision: run dev (and `docker-compose.yml`) as a **single-node replica
set** (`--replSet rs0` + one-shot `rs.initiate()` healthcheck, URI
`?replicaSet=rs0&directConnection=true`), and add

```go
// InTransaction runs fn in a Mongo multi-document transaction. Store
// methods called with the ctx fn receives join it (the driver carries the
// session on the context); any error aborts and rolls everything back.
func (s *Store) InTransaction(ctx context.Context, fn func(ctx context.Context) error) error
```

Services depend on a one-method `txRunner` interface rather than on
`*persistence.Store`, so the service tests (mtest mock driver, no replica
set) run the transaction body directly. `InTransaction` itself gets no unit
test — that would test the database, which the repo's test policy excludes;
it is verified on the dev stack (PD-048 Task 27).

Rejected: compensating delete-by-batch-id on failure. It leaves a window where
half an import is visible and can itself fail; a transaction is the real
guarantee and costs one compose change.

### 2.7 Validation

`validateDividend(date, amount, today)` (shared by preview, confirm, and the
existing `validateTxnInput` dividend branch so the two paths cannot
diverge): not after `istToday()`; amount finite, > 0, < 1e12. The import
also requires a non-empty share name and a resolved holding; the currency is
the tab's (checked by `checkImportInput`) and only same-currency holdings are
candidates, so a row can never land on another currency's holding. Real
calendar dates are enforced by the browser parser (`normaliseDate`) and by
the `format: date` request type.

### 2.8 Cumulative consistency check

If every row has a cumulative cell and dates are non-decreasing in file order:
`expected[0] = sheetCum[0]` (opening balance allowed),
`expected[i] = sheetCum[i-1] + amount[i]`; `|sheetCum[i] − expected[i]| > 0.01`
→ warning `{line, message}`. Out-of-order dates → one warning, check skipped.
Warnings are returned by `Preview` and `Import` and never change row status.

### 2.9 History overlay (on read, never snapshotted)

`HistoryRow` gains

```go
 Dividends map[string]DividendHistoryPoint `json:"dividends,omitempty"` // per currency, PRD-005 §9
```

with `DividendHistoryPoint{ToDate float64, OnDay float64}`. Computed by
`DividendsService.HistoryOverlay` (pure `DividendOverlay` walk over **one**
`ListAllDividends` read, accumulating cents) and attached by the History
controller's `attachDividendOverlay`, next to `attachGoldOverlay`.
`HistoryHolding` gains `Dividends float64` (to date) for the breakdown
modal, keyed by symbol because snapshot lines carry the symbol. Same
on-read pattern as the gold overlay (DD-003) — nothing is written to
snapshots, so imports and deletes are reflected immediately and no heal is
needed.

### 2.10 API surface

New `api/specs/dividends/dividends.yaml`; admin mirrors in `admin/admin.yaml`;
schemas inline in `portfolio-api.yaml`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/dividends` | `?currency=` | `200 DividendView` |
| POST | `/dividends/import/preview` | `DividendImportInput` | `200 DividendImportPreview` |
| POST | `/dividends/import` | `DividendImportInput` | `200 DividendImportResult` · `400` malformed · `422 DividendImportPreview` (invalid at commit) |
| DELETE | `/dividends` | `?currency=` | `200 {deleted}` |
| GET / POST / DELETE | `/admin/users/{id}/dividends…` | same | same, admin + region scope |
| GET / POST | `/admin/users/{id}/holdings/{holdingId}/transactions` | `TransactionInput` | act-as ledger list / create |
| PUT / DELETE | `/admin/users/{id}/transactions/{transactionId}` | | act-as ledger edit / delete |

The four admin ledger endpoints are new: act-as today can read a
user's transactions but not write them (DD-004 §2.4), and PRD-005 §10 needs
"manage". They delegate to `TransactionsService` with the **target** user id
after `loadTargetUser` — same pattern as act-as holdings CRUD.

Key schemas:

```yaml
DividendImportRow:      { line: int, date: string, share_name: string, amount: number, cumulative?: number }
DividendImportInput:    { currency: INR|EUR, rows: DividendImportRow[] (≤5000), mappings?: { <sheet name>: <holding id> | null } }
DividendNameResolution: { sheet_name, rows: int, status: auto|confirmed|needs_confirmation|ambiguous|unresolved,
                          holding_id?, matched_by?: script|alias, suggestions: [{holding_id, script, symbol, score}], preselect? }
DividendImportRowStatus: { line, status: ready|duplicate|invalid, holding_id?, reason? }
DividendImportPreview:  { counts: {ready, duplicate, invalid, total}, names: DividendNameResolution[],
                          rows: DividendImportRowStatus[], warnings: [{line, message}] }
DividendImportResult:   { imported: int, duplicates: DividendImportRow[], batch_id: string, warnings: [...] }
DividendRow:            { id, holding_id, script, symbol, date (date), amount, currency, notes?, cumulative, holding_cumulative }
DividendView:           { rows: DividendRow[], summary, by_year[], by_month[], by_holding[] }
```

All response fields are `required` so the generated Go structs carry plain
values; response status strings carry a description, not an enum (DD-004
precedent). `mappings` carries the popup answers by sheet name; `null` =
deliberately unresolved. The 422 body is a full preview, so the UI re-renders
it; `ApiError` gains an optional `body` to carry it. The client parses the CSV (fast feedback, line numbers) and sends
rows; the server is the authority on everything (re-validates, resolves,
dedups).

## 3. Frontend

### 3.1 Reuse first

| Need | Existing | Action |
|---|---|---|
| Day-first dates | `normaliseDate` (`historyShared.ts`) | move to `lib/formDates.ts`; add real-calendar check (`31/02` rejected) |
| Amounts in either number style (`1,250.50` / `1.250,50`) with ₹/€ | `parseDecimalInput` (`lib/formNumbers.ts`, used by every amount input) | new `parseMoneyCell` strips currency signs and delegates to it, so CSV cells and typed amounts read the same. Not History's `parseAmount`, which strips every comma and misreads European amounts |
| Display date / money | `formatDate`, `formatMoney`, `currencySymbol` | reuse |
| Tabs | `SUPPORTED_CURRENCIES` (`lib/currency.ts`) | reuse |
| Amount input | `components/DecimalInput.tsx` | reuse |
| Single-row writes | `api.createTransaction/updateTransaction/deleteTransaction` + admin act-as variants | reuse — no dividend CRUD endpoints |
| Type label | `TYPE_LABEL` (exported in PD-047) | reuse |
| Charts | Recharts, as `components/Charts.tsx` / History | reuse library + theme-aware tooltip style |
| Act-as routing | `features/admin/actAsRouting.ts` | add the dividends target |
| Modal shell / table styles | `historyShared.ts` exports | reuse |

New: `lib/csv.ts` — RFC-4180 tokenizer (~40 lines, no dependency).

### 3.2 Files — `features/dividends/`

* `DividendsPage.tsx` — nav, tabs bound to `?currency=`, summary, filter,
  actions, table, analytics; optional `actAsUserId` (same prop shape as
  `DashboardPage`).
* `useDividends.ts` — `GET /dividends` (or admin variant).
* `DividendsTable.tsx`, `DividendsAnalytics.tsx` (yearly table + chart,
  monthly/yearly toggle chart, per-holding ranked table + bar).
* `DividendModal.tsx` — add / edit (holding dropdown limited to the tab's
  currency, date, amount).
* `DividendImportModal.tsx` — steps: pick → (**Confirm share names** popup)
  → preview → result; Confirm import disabled while invalid > 0.
* `NameConfirmDialog.tsx` — the popup (PRD-005 §6.2).
* `DeleteAllDialog.tsx` — count + typed `DELETE`.
* `dividendCsv.ts` — pure header mapping + row parse with line numbers.

Elsewhere:

* `DashboardPage` header: **Dividends** link, target-aware in act-as
  (`/admin/users/:id/dividends`), same rule as Transactions (DD-004 §3.3).
* `HoldingsTable`: **Dividends** column (`total_dividends`); `SummaryCards`:
  per-currency **Dividend income** card. Shown beside P&L, never added to it.
* `HistoryTable`: per-currency **Dividends** column (to date, day-change
  tint); `HoldingsModal`: per-holding dividends to date.
* `App.tsx`: `/dividends` (`RequireAuth`), `/admin/users/:id/dividends`
  (`RequireAdmin`).
* `TransactionsModal` gains an optional `userId` so act-as can write (uses
  the new admin ledger endpoints).

### 3.3 Cumulative under filters

Both running totals arrive from the server over the full tab; the client
filters rows but never recomputes them, so a filtered row still shows its
true place in the totals.

## 4. Testing

Behaviour tests only (repo policy): no DB-availability or DB-error tests,
only `ErrNoDocuments` → 404. Pure functions are tested directly; service and
controller tests use the `mtest` mock driver like the rest of the suite and
assert on the commands issued; the transaction runs through a pass-through
`txRunner`.

* **match**: `exactKey`/`nameKey`/`corpKey`; exact by script/alias → auto; two
  holdings equal → ambiguous; `jio`, `JLP`, `Jio Platforms Limited`,
  `JIOPLA`, `JIOPLA.NS`, `Jio Platforms Ltd.` against `Jio Platforms Ltd` /
  `JIOPLA.NS` → needs_confirmation with that holding first (`JIOPLA`
  pre-selected as a symbol match, never auto); other-currency holding never
  suggested; no pre-selection without a clear best.
* **partition**: scenarios A–D; hand-entered ledger dividend counts as
  existing; different day / amount / holding not a duplicate.
* **Preview**: writes nothing; counts; invalid lines with reasons;
  cumulative warnings (mismatch, out-of-order skip) do not change status.
* **Import**: unresolved name → `ImportInvalidError`, no insert issued;
  confirmed import inserts in-sheet repeats, saves the alias, recomputes each
  holding once; re-import of stored rows → 0 imported, no insert (idempotent).
  Atomic rollback and the stale-preview case are verified end-to-end on the
  dev stack (PD-048 Task 27), not with a DB-failure test.
* **List**: order, both cumulatives, by_year/by_month/by_holding; per-holding
  total == holding `total_dividends`.
* **DeleteAll**: only that currency's dividends; buys/sells/holdings intact;
  totals recomputed.
* **TransactionsService**: dividend create/update/delete skip heal; buy still heals.
* **History**: overlay to-date/on-day per currency; per-holding dividends.
* **Controllers / admin**: 404 out-of-region on every act-as dividend and
  ledger-write route.
* **Frontend (vitest)**: `csv.ts`, `dividendCsv.ts`, moved helpers; name
  popup (preselect, dropdown, leave unresolved); preview counts + disabled
  confirm; result "M duplicates are discarded"; delete-all needs `DELETE`;
  act-as hrefs/endpoints.

## 5. Risks

* **Replica-set requirement** — dev, CI and any self-hosted Mongo must run as
  a replica set or imports fail. Mitigation: compose change + clear startup
  error from `InTransaction` ("transactions need a replica set").
* **Alias mistakes** — a wrong confirmation becomes an auto-match later.
  Mitigation: the preview lists every name with its holding and lets it be
  changed; a changed answer replaces the alias.
* **Delete all includes hand-entered dividends** — they are the same records.
  The dialog says so and shows the count.
* **Day-first ambiguity** — a US-format sheet imports wrong dates when the day
  is ≤ 12. Mitigation: stated on every step; rows with month > 12 rejected.
* **Big diff surface** (dashboard, History, act-as writes) — split across
  PRs per PD-048 so each bisects alone.
