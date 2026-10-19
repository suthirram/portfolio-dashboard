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
3. **Currency enum widened** to `[INR, EUR, USD]` on `Transaction` only.
   `domain.Holding.Currency` is a free string and USD holdings exist in the
   data (the dashboard buckets them as `OTHER`, `groupByCurrency.ts:12`), so a
   USD holding's transactions would fail strict-server enum validation on the
   way out. The `Holding`/`HoldingInput` enums are left alone — widening those
   changes the create/edit contract and belongs to its own change.

### 2.2 Service: `TransactionsService.ListAll`

New method next to the existing `List`, same file, same owner-scoping
discipline:

```go
// ListAll returns every transaction owned by uid, newest first, each enriched
// with its holding's script/symbol. Two reads (ledger + holdings) joined in
// memory; the view filters client-side (DD-004 §4).
func (s *TransactionsService) ListAll(ctx context.Context, uid primitive.ObjectID) (_ []api.TransactionWithHolding, retErr error)
```

* Reads `s.txns.ListByUser(ctx, uid)` and `s.holdings.ListByUser(ctx, uid)`.
* Builds `map[primitive.ObjectID]domain.Holding` once, then per transaction
  emits `TransactionToAPI(t)` + the label pair. Reuses the existing mapper —
  no second marshalling path.
* A transaction whose holding is missing (should not happen; transactions
  cascade-delete with their holding) is **emitted with empty labels**, not
  dropped — silently hiding a user's own ledger row would be worse than an
  unlabelled row, and it makes orphan state visible instead of invisible.
* Sort: `ListByUser` sorts `date ASC, created_at ASC`. The view wants newest
  first; reversing in the service keeps the store method shared with
  `SnapshotRecomputer` (which needs replay order) unchanged.

### 2.3 Index

`transactions` currently has `{user_id, holding_id, date}` and
`{holding_id}` (`internal/db/mongo.go:52`). A user-wide date-ordered scan
can use the `user_id` prefix but not the sort — `holding_id` sits between the
two keys, so Mongo does an in-memory sort. Add:

```go
// portfolio-wide ledger listing, newest first (DD-004 §2.3).
{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "date", Value: -1}}},
```

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
| Currency facet / ordering | `normaliseCurrency`, `CURRENCY_ORDER` (`features/holdings/groupByCurrency.ts`) |
| Money symbol | **new** `currencySymbol(code)` in `lib/` — the `currency === 'EUR' ? '€' : '₹'` ternary is currently duplicated in `TransactionsModal.tsx:50`, `AddEditModal.tsx:228/234`, `HoldingsTable.tsx:27` and `currencyTotals.ts:56`. Extract once, add `USD → '$'`, and replace those call sites (reuse rule, CLAUDE.md) |
| Modal for editing | `features/holdings/TransactionsModal.tsx` as-is; it needs a `HoldingWithPrice`, which the page gets from the holdings it already loads for the filter facet |

### 3.2 Nav

`DashboardPage` header gains a `<Link to="/transactions" className="btn dash-nav-btn">`
with a receipt/list icon, placed next to History and before Gold — one more
entry in the same row, no layout change.

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
  `currencySymbol` for INR/EUR/USD/unknown.

## 6. Risks

* **Mapper change is cross-cutting.** Adding `opening_date` to
  `TransactionToAPI` changes the per-holding ledger response too. Additive and
  optional, so existing consumers ignore it — but it does mean regenerating
  both `api/*.gen.go` and `frontend/src/lib/api/schema.gen.ts`.
* **Currency enum.** Widening `Transaction.currency` to include USD fixes a
  latent strict-server validation failure for USD holdings; it does not make
  `Holding` accept USD, so the two enums are deliberately out of step until
  that is addressed separately. Called out so it is not read as an oversight.
* **Symbol-helper extraction touches four existing files.** Mechanical, but it
  lands in the UI PR and is the kind of change a reviewer should see as reuse
  cleanup, not scope creep — it is required because this view is the first
  place that must render a USD amount.
* **Scale assumption** — see §4; the escalation path is written down rather
  than pre-built.
