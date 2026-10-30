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
 BatchID         string   `bson:"batch_id"`                   // one per confirmed import
 Line            int      `bson:"line"`                       // 1-based file line (header = 1)
 SheetName       string   `bson:"sheet_name"`                 // Share Name as written in the sheet
 SheetCumulative *float64 `bson:"sheet_cumulative,omitempty"` // CUMULATIVE cell, if present
}

// on Transaction:
 Import *ImportMeta `bson:"import,omitempty" json:"-"`
```

`internal/domain/holding.go` — confirmed name aliases:

```go
 // Aliases are normalised sheet names the owner confirmed as this holding
 // during a dividend import (PRD-005 §6.3); later imports auto-map them.
 // Not a derived field: written only by the import confirm step.
 Aliases []string `bson:"aliases,omitempty" json:"aliases,omitempty"`
```

New `internal/domain/dividend.go` — the duplicate identity, shared by
preview and confirm:

```go
// DividendKey is the PRD-005 §5 identity: holding + calendar day + amount in
// minor units. Integer cents so 300 ≡ 300.00 across two parses.
type DividendKey struct {
 HoldingID primitive.ObjectID
 Day       string // YYYY-MM-DD
 Cents     int64
}

func AmountCents(amount float64) int64 { return int64(math.Round(amount * 100)) }

func DividendKeyOf(t Transaction) DividendKey {
 return DividendKey{HoldingID: t.HoldingID, Day: UTCDate(t.Date).Format(time.DateOnly), Cents: AmountCents(t.Amount)}
}
```

### 2.2 Persistence

`TransactionStore` gains (owner-scoped via `scopedFilter`, like the rest):

| Method | Purpose |
|---|---|
| `ListDividends(ctx, userId, currency)` | tab listing, `date:1, created_at:1, _id:1` |
| `ListDividendsInRange(ctx, userId, holdingIds, from, to)` | duplicate window for an import |
| `InsertMany(ctx, txns)` | ordered batch insert |
| `DeleteDividends(ctx, userId, currency) ([]primitive.ObjectID, int64, error)` | delete-all; returns the affected holding ids |

`HoldingStore` gains `AddAliases(ctx, userId, holdingId, aliases)` (`$addToSet`).

New index on `transactions`:

```go
// dividend listing + import window (DD-005 §2.2): equality on user_id, type,
// currency, then the listing's sort keys in order.
{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "type", Value: 1}, {Key: "currency", Value: 1}, {Key: "date", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}},
```

Same-day order: a batch shares one `created_at`; the service assigns
ObjectIDs in sheet order before inserting, so `_id` preserves sheet order.

### 2.3 Name resolution — `internal/services/dividend_match.go`

Pure functions, unit-tested without Mongo.

```go
// nameKey normalises a share name or symbol: lower-case, exchange suffix
// (.ns/.bo) dropped, punctuation → space, whitespace collapsed.
func nameKey(s string) string

// corpKey is nameKey minus corporate filler words (limited, ltd, inc, plc,
// corp, corporation, company, co, the) — used for suggestions only.
func corpKey(s string) string
```

`Resolve(sheetNames, holdings []domain.Holding, currency, overrides map[string]primitive.ObjectID) []NameResolution`:

1. Candidates = holdings whose canonical currency equals the tab.
2. **Override** (user's answer in this import) → `confirmed`.
3. **Exact**: `nameKey(sheet)` equals `nameKey(script)`, `nameKey(symbol)`
   or an alias of **exactly one** candidate → `auto` (`matched_by`:
   `script` | `symbol` | `alias`). Equal to several → `ambiguous`.
4. Otherwise → `needs_confirmation` with up to 3 **suggestions**, scored
   0–1 as the max of:
   * `corpKey` equality (`Jio Platforms Limited` ↔ `Jio Platforms Ltd`) → 0.95
   * token prefix — every sheet token prefixes a candidate token, or the
     reverse (`jio` → `jio platforms`) → 0.8
   * symbol prefix ≥ 4 chars (`JIOPLA` ↔ `JIOPLA.NS`) → 0.8
   * initials (`JPL` ↔ Jio Platforms Limited) → 0.7
   * trigram Jaccard on `corpKey` (`JLP`, typos) → raw score

   Suggestions below 0.3 are dropped. `preselect` = top suggestion only when
   ≥ 0.8 and ahead of the next by ≥ 0.15. **Fuzzy matches are never applied
   without the user's confirmation** (PRD-005 §6.2).
5. `unresolved` — the user explicitly left it unmapped, or no override given
   for a `needs_confirmation`/`ambiguous` name at confirm time → its rows are
   invalid.

### 2.4 Duplicate detection — occurrence-based

```go
// partition splits valid rows (sheet order) into new and duplicate by
// occurrence: each existing DB dividend with the same key absorbs one sheet
// row. Sheet repeats beyond the DB count are new (PRD-005 §5 A–D).
func partition(rows []resolvedRow, existing []domain.Transaction) (fresh, dups []resolvedRow) {
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

`DividendsService{store *persistence.Store, logger, today func() time.Time}`
(`today` = shared `istToday`, moved from `gold_prices.go`).

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
  — read-only: validate rows (shared `validateDividendRow`, §2.7), resolve
  names (§2.3), load window, `partition` (§2.4), cumulative check (§2.8).
  Returns counts, per-name resolutions, per-row status, warnings.
* **`Import(ctx, userId, in) (api.DividendImportResult, error)`** — runs the
  same pipeline as `Preview` **inside one Mongo transaction** (§2.6), so it
  re-validates against the database as it is at commit time. Any invalid row
  or unresolved name → `ImportInvalidError` carrying the fresh preview →
  400, nothing written. Otherwise, in the transaction: `InsertMany(fresh)`
  (with `ImportMeta`), `AddAliases` for every **confirmed** name, and
  `recomputeAndPersist` once per affected holding. Returns `{imported,
  duplicates, batch_id}`.
* **`DeleteAll(ctx, userId, currency) (int64, error)`** — in one transaction:
  `DeleteDividends`, then `recomputeAndPersist` for each affected holding.
* Single add / edit / delete reuse **`TransactionsService.Create/Update/Delete`**
  — no second write path. One change there: **skip `healSnapshots` when the
  event is a dividend** (before and after an update), because snapshot
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

Rejected: compensating delete-by-batch-id on failure. It leaves a window where
half an import is visible and can itself fail; a transaction is the real
guarantee and costs one compose change.

### 2.7 Validation

`validateDividendRow` (shared by preview, confirm, and the existing
`validateTxnInput` dividend branch so the two paths cannot diverge):
real calendar date, not after `istToday()`; amount finite, > 0, < 1e12;
share name non-empty ≤ 100 chars; currency ∈ {INR, EUR} and equal to the
resolved holding's currency.

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

with `DividendHistoryPoint{ToDate float64, OnDay float64}`. Computed in
`HistoryService.List` from **one** `ListDividends` read per currency: sort
once, walk rows by date accumulating cents. `HistoryHolding` gains
`Dividends float64` (to date, per holding) for the breakdown modal. Same
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
| POST | `/dividends/import` | `DividendImportInput` | `200 DividendImportResult` · `400 DividendImportPreview` (invalid at commit) |
| DELETE | `/dividends` | `?currency=` | `200 {deleted}` |
| GET / POST / DELETE | `/admin/users/{id}/dividends…` | same | same, admin + region scope |
| POST | `/admin/users/{id}/holdings/{hid}/transactions` | `TransactionInput` | act-as ledger create |
| PUT / DELETE | `/admin/users/{id}/transactions/{tid}` | | act-as ledger edit / delete |

The three admin ledger-write endpoints are new: act-as today can read a
user's transactions but not write them (DD-004 §2.4), and PRD-005 §10 needs
"manage". They delegate to `TransactionsService` with the **target** user id
after `loadTargetUser` — same pattern as act-as holdings CRUD.

Key schemas:

```yaml
DividendImportRow:      { line: int, date: string, share_name: string, amount: number, cumulative?: number }
DividendImportInput:    { currency: INR|EUR, rows: DividendImportRow[] (≤5000), mappings?: { <sheet name>: <holding id> | null } }
DividendNameResolution: { sheet_name, rows: int, status: auto|confirmed|needs_confirmation|ambiguous|unresolved,
                          holding_id?, matched_by?: script|symbol|alias, suggestions: [{holding_id, script, symbol, score}], preselect? }
DividendImportRowStatus: { line, status: ready|duplicate|invalid, holding_id?, reason? }
DividendImportPreview:  { counts: {ready, duplicate, invalid, total}, names: DividendNameResolution[],
                          rows: DividendImportRowStatus[], warnings: [{line, message}] }
DividendImportResult:   { imported: int, duplicates: DividendImportRow[], batch_id: string, warnings: [...] }
DividendRow:            allOf TransactionWithHolding + { cumulative, holding_cumulative }
DividendView:           { rows: DividendRow[], summary, by_year[], by_month[], by_holding[] }
```

`mappings` carries the popup answers by sheet name; `null` = deliberately
unresolved. The client parses the CSV (fast feedback, line numbers) and sends
rows; the server is the authority on everything (re-validates, resolves,
dedups).

## 3. Frontend

### 3.1 Reuse first

| Need | Existing | Action |
|---|---|---|
| Day-first dates | `normaliseDate` (`historyShared.ts`) | move to `lib/formDates.ts`; add real-calendar check (`31/02` rejected) |
| Amounts with ₹/€/commas | `parseAmount` (`historyShared.ts`) | move to `lib/formNumbers.ts` |
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

Meaningful tests only; Go-only backend; real Mongo test DB (now a replica set).

* **match**: `nameKey`/`corpKey`; exact by script/symbol/alias → auto; two
  holdings equal → ambiguous; `jio`, `JLP`, `Jio Platforms Limited`,
  `JIOPLA` against `Jio Platforms Ltd`/`JIOPLA.NS` → needs_confirmation with
  that holding first; other-currency holding never suggested.
* **partition**: scenarios A–D; hand-entered ledger dividend counts as
  existing; different day / amount / holding not a duplicate.
* **Preview**: writes nothing; counts; invalid lines with reasons;
  cumulative warnings (mismatch, out-of-order skip) do not change status.
* **Import**: idempotent re-run; aliases saved only for confirmed names;
  holding `total_dividends` updated once per holding; injected failure after
  insert → nothing persisted (transaction rollback); stale preview (row added
  between preview and confirm) → confirm reflects the new duplicate count.
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
