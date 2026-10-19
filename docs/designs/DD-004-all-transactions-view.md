# DD-004: All-transactions view — technical design

* **Status**: Draft (DD)
* **Owner**: project owner
* **Implements**: [PRD-004](../prds/PRD-004-all-transactions-view.md)
* **Rollout plan**: [PD-047](../plans/PD-047-all-transactions-view.md)
* **Visuals**: [PD-047 visual spec](../visuals/PD-047-all-transactions-view.html)
  ([published](https://claude.ai/code/artifact/f9a60fc0-e8c3-4ae9-9549-02af56e6f52c)) —
  frame 02 is the column contract for §2.1, frame 04 the reuse boundary for §1
* **Related**: [DD-001](DD-001-user-auth-and-multi-tenancy.md) (per-user
  scoping), [DD-002](DD-002-historical-snapshots.md) (ledger ↔ snapshot heal)

## 1. Approach

Read-only aggregate over data that already exists. No new collection, no new
derived store, **no second write path**:

* The listing is one new `GET /api/transactions` endpoint backed by
  `TransactionStore.ListByUser` — which **already exists** in
  `internal/persistence/transactions.go:42` and is currently unused for
  stocks (only the holdings twin is called). No new persistence method.
* The holding labels the view needs (script, symbol) come from a **single**
  `HoldingStore.ListByUser` read joined in memory by `holding_id`. Two queries
  total per page load, independent of row count.
* Mutations keep going through `POST /holdings/{id}/transactions`,
  `PUT /transactions/{id}`, `DELETE /transactions/{id}` and the existing
  `TransactionsModal`, so `recomputeAndPersist` + `healSnapshots` stay the
  only path that can change a position (CLAUDE.md ledger convention).

Rejected alternative: joining labels **client-side** against the holdings the
dashboard already fetched. It makes `/transactions` useless on its own, forces
the route to depend on a holdings fetch before it can render a single row, and
duplicates the "which holding is this" mapping in TS. The server-side join is
one map build in Go.

## 2. Backend

### 2.1 DTO: `TransactionWithHolding`

`api.Transaction` carries `holding_id` but no human label, and today's
`TransactionToAPI` (`internal/services/mapper.go:201`) drops two fields this
view needs. Changes:

1. **New schema** `TransactionWithHolding` in `api/specs/portfolio-api.yaml`:
   `allOf` [`Transaction`] plus `script`, `symbol` (both from the owning
   holding). Everything else is already on `Transaction`.
2. **`TransactionToAPI` gains `opening_date`** — `domain.Transaction` has had
   `OpeningDate` since the opening-date prompt landed, but the mapper never
   emitted it, so PRD-004 §5 column 9 is unreachable today. Add
   `opening_date` (`format: date`, nullable) to the `Transaction` schema and
   map it. This also makes the per-holding modal able to show it later; it is
   additive and no existing consumer breaks.
3. **The `currency` enum comes off the `Transaction` response schema** —
   replaced by `description: INR | EUR; legacy rows may carry another code`.
   Not widened to include USD.

   The app supports exactly two currencies. `CurrencyOf`
   (`internal/services/snapshot.go:68-80`) is explicit: INR or EUR → that
   bucket, blank → INR, **anything else (including legacy USD) → excluded and
   logged**; `domain` defines only `CurrencyINR`/`CurrencyEUR`, and the
   holdings form offers only those two. USD is legacy data, not a supported
   currency, so adding it to an enum would advertise support that does not
   exist — the tech debt, not the fix.

   But `domain.Holding.Currency` is a free string and `Transaction.Currency` is
   denormalised from it, so a legacy row *can* carry `USD`. Under a strict
   enum that row fails response validation and the user cannot see their own
   ledger event. A plain string with a documented meaning is how
   `portfolio-api.yaml` already models currency on the history schemas
   (`:782`, `:831`, `:860` — description, no enum); this follows that
   precedent rather than inventing a third convention.

   `Holding`/`HoldingInput` keep their `[INR, EUR]` enums: those are *input*
   contracts, and INR/EUR genuinely is the supported set. Nothing is left out
   of step.

### 2.2 Service: `TransactionsService.ListAll`

New method next to the existing `List`, same file, same owner-scoping
discipline:

```go
// ListAll returns every transaction owned by userId, newest first, each
// enriched with its holding's script/symbol. Two reads (ledger + holdings) joined in
// memory; the view filters client-side (DD-004 §4).
func (s *TransactionsService) ListAll(ctx context.Context, userId primitive.ObjectID) (_ []api.TransactionWithHolding, retErr error)
```

* Reads `s.txns.ListByUser(ctx, userId)` and `s.holdings.ListByUser(ctx, userId)`.
* Builds `map[primitive.ObjectID]domain.Holding` once, then per transaction
  emits `TransactionToAPI(t)` + the label pair. Reuses the existing mapper —
  no second marshalling path.
* A transaction whose holding is missing (should not happen; transactions
  cascade-delete with their holding) is **emitted with empty labels**, not
  dropped — silently hiding a user's own ledger row would be worse than an
  unlabelled row, and it makes orphan state visible instead of invisible.
* Sort: `ListByUser` sorts `date ASC, created_at ASC` (both keys — ties on a
  shared date break on insertion time). The view wants newest first; reversing
  in the service keeps the store method shared with `SnapshotRecomputer`
  (which needs replay order) unchanged, and the §2.3 index covers the store's
  ascending order by reverse scan.

### 2.3 Index

`transactions` currently has `{user_id, holding_id, date}` and
`{holding_id}` (`internal/db/mongo.go:52`). A user-wide date-ordered scan
can use the `user_id` prefix but not the sort — `holding_id` sits between the
two keys, so Mongo does an in-memory sort. Add:

```go
// portfolio-wide ledger listing (DD-004 §2.3). Keys mirror ListByUser's
// full sort — date THEN created_at — so Mongo can walk the index instead of
// blocking-sorting; same-day events are common (a buy and a dividend on one
// date), and a {user_id, date} index alone would leave the sort in memory
// exactly then. Both sort keys descend so the index is reverse-scannable for
// the store's ascending {date:1, created_at:1} order.
{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "date", Value: -1}, {Key: "created_at", Value: -1}}},
```

A compound index only serves a sort when its keys match the sort's keys in
order and are either all in the same direction or all inverted; mixing (`date`
indexed, `created_at` not) disqualifies it entirely, which is why the second
key is not optional.

Index creation is idempotent at boot; no migration.

### 2.4 API surface

| Method | Path | Purpose | Gate |
|---|---|---|---|
| GET | `/api/transactions` | Caller's full ledger, newest first, with holding labels | authenticated |
| GET | `/api/admin/users/{id}/transactions` | Same for an act-as target | admin + region scope |

* Spec: a new `transactions` path item in `api/specs/transactions/transactions.yaml`
  (`operationId: listAllTransactions`) and `users_id_transactions` in
  `api/specs/admin/admin.yaml` (`operationId: adminListUserTransactions`),
  both wired from `api/specs/openapi.yaml`. Components stay inline in
  `portfolio-api.yaml` per repo convention.
* Controllers are thin, mirroring the existing pair exactly:
  `Controller.ListAllTransactions` → `currentUserID(ctx)` → `h.transactions.ListAll`;
  `Controller.AdminListUserTransactions` → `adminCaller(ctx)` +
  `h.loadTargetUser(...)` → 404 on scope miss → `h.transactions.ListAll(target.ID)`.
* **No query params.** Filtering/sorting is client-side (§4); adding
  `from`/`to`/`type` params now would be an unused second filter implementation.
* Auth: both routes fall out of the existing `AuthGate` rules — `/api/transactions`
  is an ordinary authenticated route, the admin one an ordinary admin route.
  Nothing new in `isGoldRoute`-style special casing.
* The act-as endpoint is **read-only by design**: act-as has no ledger write
  path today (`TransactionsModal` takes no `userId`), and PRD-004 §3 adds none.

## 3. Frontend

Route `/transactions`, guarded by `RequireAuth`, under a new
`features/transactions/` folder — the view spans all holdings, so it is not a
`features/holdings/` concern:

* `features/transactions/TransactionsPage.tsx` — page shell: header (reusing
  the dashboard nav button styling), filter bar, subtotal strip, table. Takes
  optional `actAsUserId`/`actAsLabel`, same prop shape as `DashboardPage`, so
  `AdminUserView` can render it in act-as mode.
* `features/transactions/useAllTransactions.ts` — data hook (`api.listAllTransactions()`
  or the admin variant when `userId` is set), mirroring `useHoldings.ts`.
* `features/transactions/transactionFilters.ts` — **pure** filter/sort/subtotal
  helpers (holding, type, currency, date range, search; sort key + direction;
  per-currency sums). Pure so it is unit-testable without rendering, matching
  `historyShared.ts` and `currencyTotals.ts`.
* `features/transactions/TransactionsAllTable.tsx` — the table (PRD-004 §5
  columns). Edit action calls back to the page, which opens the **existing**
  `features/holdings/TransactionsModal` for the row's holding.

### 3.1 Reuse, not re-implementation

| Need | Existing thing to call |
|---|---|
| Type labels (`Buy`/`Sell`/…) | `TYPE_LABEL` in `TransactionsModal.tsx` — extract to `features/transactions/` (or `lib/`) and import from both; do not copy |
| Date rendering | `formatDate` (`lib/formDates.ts`) |
| Currency facet / ordering | **not** `normaliseCurrency` — see §3.2 |
| Money symbol | **new** `currencySymbol(code)` in `lib/currency.ts` — §3.2 |
| Modal for editing | `features/holdings/TransactionsModal.tsx` as-is; it needs a `HoldingWithPrice`, which the page gets from the holdings it already loads for the filter facet |

### 3.2 Currency: one module, raw codes, no silent merging

`normaliseCurrency` / `CURRENCY_ORDER` (`features/holdings/groupByCurrency.ts:10-12`)
collapse every code that is not INR or EUR into a single `OTHER` key. That is
correct for what it was built for — the dashboard renders exactly three column
groups — but it is **wrong for this view** in two ways:

* a facet built on it cannot offer a specific currency filter for a legacy
  code, because the code is gone by the time the facet is built; and
* two different unrecognised codes land in one bucket, so a subtotal card
  would sum across currencies — the one thing PRD-004 §7 forbids.

So the facet and the subtotals bucket on the **raw `currency` string**,
upper-cased, with blank → `INR` (the same rule `CurrencyOf` applies
server-side, `snapshot.go:72`). One legacy code gets one bucket; two get two.

To avoid a second currency model drifting from the first, all of it lives in
one new `frontend/src/lib/currency.ts`:

```ts
// Supported set. Mirrors domain.CurrencyINR/CurrencyEUR and the Holding
// input enum — the app has exactly two currencies.
export const SUPPORTED_CURRENCIES = ['INR', 'EUR'] as const

// canonicalCurrency upper-cases a stored code and applies the blank → INR
// default (Holding.Currency's documented default, and what CurrencyOf does
// server-side). Unrecognised codes are returned as-is, never folded together.
export function canonicalCurrency(raw: string | null | undefined): string

// currencySymbol returns the display symbol for a supported currency, and the
// code itself for anything else — so a legacy USD row reads "USD 5,310.00"
// rather than "₹5,310.00". Falling back to ₹ would mislabel real money.
export function currencySymbol(raw: string | null | undefined): string

// compareCurrencies orders supported currencies first (INR, EUR), then any
// other code alphabetically, so bucket order is stable and legacy codes sort
// last instead of interleaving.
export function compareCurrencies(a: string, b: string): number
```

`groupByCurrency.ts` keeps its three-way display enum (the dashboard's layout
depends on it) but imports `SUPPORTED_CURRENCIES` instead of re-listing
`'INR' | 'EUR'` inline, so the supported set is stated once.

**No USD affordance is built.** USD is unsupported (§2.1), so there is no USD
chip, no `$`, and no USD column — a legacy row simply appears under its own
code, which is honest about the state of the data and adds nothing to remove
later if USD is never supported. If USD becomes supported, the change is one
entry in `SUPPORTED_CURRENCIES` plus its symbol.

### 3.3 Nav and the act-as route

`DashboardPage` header gains a `<Link className="btn dash-nav-btn">` with a
receipt/list icon, placed next to History and before Gold — one more entry in
the same row, no layout change. Its target is **computed, not hard-coded**:

```tsx
to={actAsUserId ? `/admin/users/${actAsUserId}/transactions` : '/transactions'}
```

`DashboardPage` is also what `AdminUserView` renders in act-as mode, so a
hard-coded `to="/transactions"` would drop `actAsUserId` on navigation: the
page would call the ordinary endpoint and show the **admin's own** ledger under
the target user's heading — wrong data, and wrong in the direction that looks
plausible. Two routes therefore exist, matching how act-as is already addressed
for the dashboard (`/admin/users/:id`):

| Route | Guard | Renders |
|---|---|---|
| `/transactions` | `RequireAuth` | `TransactionsPage`, own ledger |
| `/admin/users/:id/transactions` | `RequireAdmin` | `TransactionsPage` with `actAsUserId` from the route param |

`TransactionsPage` picks its endpoint from that prop
(`listAllTransactions` vs `adminListUserTransactions`), so the data source
cannot disagree with the heading. Taking the id from the URL rather than only a
prop also makes the act-as view linkable and refresh-safe, like the act-as
dashboard. Region scope stays server-side: an admin hand-editing the id gets
404, not another region's data.

> **Pre-existing, not introduced here**: the `History` link in the same header
> is hard-coded to `/history` and has exactly this flaw in act-as today. Out of
> scope for PD-047 — there is no act-as history endpoint to point at — but it is
> the reason this link does not simply copy that one. Worth its own issue.

## 4. Filtering and scale

Client-side, over the full fetched array:

* Target scale (PRD-004 §8): ≤ ~2,000 rows. One payload of ~2,000 small
  objects is well under the size at which this matters, and filtering 2,000
  array entries on keystroke is below a frame.
* Table rendering is plain rows (no virtualisation); at 2,000 rows the DOM is
  comparable to the History month table × ~60. If a real portfolio makes this
  sluggish, the escalation order is: (1) cap rendered rows with a "show more",
  (2) virtualise, (3) move paging server-side — in that order, and only on
  evidence.

## 5. Testing

Per repo policy (meaningful tests only, Go-only backend, no DB-availability
tests):

* **Service**: `ListAll` — label join (right script per transaction), newest-first
  order, orphan transaction keeps its row with blank labels, empty ledger → empty
  slice (not nil).
* **Controller**: own-ledger 200; admin act-as 200 for an in-region user and 404
  for an out-of-region one (the existing act-as table tests' shape).
* **Frontend (vitest)**: `transactionFilters` unit tests (each filter, combined
  filters, sort toggle, per-currency subtotals); page render test asserting the
  §5 columns appear and that the edit action opens the holding modal;
  `currencySymbol` (INR, blank → ₹; EUR → €; an unsupported code → the code
  itself, never ₹), `canonicalCurrency` (blank → INR, case-folding, two
  distinct unknown codes stay distinct) and `compareCurrencies` ordering.

## 6. Risks

* **Mapper change is cross-cutting.** Adding `opening_date` to
  `TransactionToAPI` changes the per-holding ledger response too. Additive and
  optional, so existing consumers ignore it — but it does mean regenerating
  both `api/*.gen.go` and `frontend/src/lib/api/schema.gen.ts`.
* **Dropping the `currency` enum from the `Transaction` response** loosens that
  field's contract. Deliberate: the field is denormalised from a free-string
  `Holding.Currency`, so a legacy code (USD) is representable in the data and a
  strict enum would hide a user's own ledger row behind a validation error. The
  *input* enums stay strict, so nothing gets easier to write. Trade-off
  recorded so a future reviewer does not "tighten" it back and reintroduce the
  failure (§2.1).
* **Symbol-helper extraction touches four existing files.** Mechanical, but it
  lands in its own PR (PD-047 PR3) so a regression there bisects cleanly. It is
  required because the existing ternary returns ₹ for *any* non-EUR code, which
  this view would turn from an invisible inaccuracy into a visibly mislabelled
  row.
* **Two currency groupings now exist** — this view's raw-code buckets and the
  dashboard's three-way display enum (§3.2). They are not duplicates: the
  former preserves codes, the latter drives a fixed three-column layout. Both
  read `SUPPORTED_CURRENCIES` from one module, so the supported set cannot
  drift; if the dashboard ever needs per-code groups too, the display enum goes
  away rather than being extended.
* **Scale assumption** — see §4; the escalation path is written down rather
  than pre-built.
