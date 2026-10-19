# PD-047: Rollout plan — all-transactions view

* **Status**: Not started
* **Owner**: project owner
* **Implements**: [PRD-004](../prds/PRD-004-all-transactions-view.md)
* **Design**: [DD-004](../designs/DD-004-all-transactions-view.md)
* **Visuals**: [PD-047 visual spec](../visuals/PD-047-all-transactions-view.html)
  ([published](https://claude.ai/code/artifact/f9a60fc0-e8c3-4ae9-9549-02af56e6f52c)) —
  five annotated frames; its closing table maps each frame to the tasks below

## 1. Goal

Ship a dashboard button → `/transactions` view listing every past transaction
across all holdings with every add-modal field visible, filterable, sortable.
Read-only: edits route back into the existing per-holding ledger modal.

## 2. File map

| File | Change |
|---|---|
| `backend/api/specs/portfolio-api.yaml` | `Transaction`: add `opening_date`, drop the response-side `currency` enum; new `TransactionWithHolding` schema |
| `backend/api/specs/transactions/transactions.yaml` | new `transactions` path item (`listAllTransactions`) |
| `backend/api/specs/admin/admin.yaml` | new `users_id_transactions` path item (`adminListUserTransactions`) |
| `backend/api/specs/openapi.yaml` | wire `/transactions` and `/admin/users/{id}/transactions` |
| `backend/api/models.gen.go`, `backend/api/server.gen.go` | regenerated |
| `backend/internal/services/mapper.go` | `TransactionToAPI` emits `opening_date` |
| `backend/internal/services/transactions.go` | new `ListAll` |
| `backend/internal/controllers/transactions.go` | new `ListAllTransactions` |
| `backend/internal/controllers/admin.go` | new `AdminListUserTransactions` |
| `backend/internal/db/mongo.go` | add `{user_id:1, date:-1, created_at:-1}` index on `transactions` |
| `frontend/src/lib/api/schema.gen.ts` | regenerated |
| `frontend/src/lib/api/client.ts` | `listAllTransactions`, `adminListUserTransactions` |
| `frontend/src/lib/currency.ts` | **new** `SUPPORTED_CURRENCIES`, `canonicalCurrency`, `currencySymbol`, `compareCurrencies` |
| `frontend/src/features/holdings/{TransactionsModal,AddEditModal,HoldingsTable}.tsx`, `currencyTotals.ts`, `groupByCurrency.ts` | use `currencySymbol` / `SUPPORTED_CURRENCIES`; export `TYPE_LABEL` |
| `frontend/src/features/transactions/*` | **new** page, hook, pure filters, table |
| `frontend/src/features/dashboard/DashboardPage.tsx` | nav button, target-aware in act-as |
| `frontend/src/features/admin/AdminUserView.tsx` | act-as entry to the view |
| `frontend/src/App.tsx` | `/transactions` under `RequireAuth`; `/admin/users/:id/transactions` under `RequireAdmin` |
| `docs/api.md` | document the two new endpoints |
| `docs/visuals/PD-047-all-transactions-view.html` | **new** visual spec — the frames tasks 7–9 build against |

## 3. PR sequence (FE/BE split — backend first)

| # | Branch | Scope | Test anchor |
|---|---|---|---|
| PR1 | `docs/PRD-004-all-transactions-view` | PRD-004 + DD-004 + this plan | — |
| PR2 | `feat/PD-047-transactions-api` | Tasks 1–4: spec + codegen, mapper, `ListAll`, controllers, index, `docs/api.md` | Go service + controller tests (§5) |
| PR3 | `feat/PD-047-currency` | Task 5: one currency module; replaces the ternary at four duplicate sites | vitest currency module; existing holdings tests stay green |
| PR4 | `feat/PD-047-transactions-ui` | Tasks 6–9: regen types, client methods, `features/transactions/`, target-aware nav button, both routes | vitest filters + page render + edit-opens-modal + act-as href/endpoint |

PR3 is split out deliberately: it is a pure reuse cleanup touching existing
holdings files, and keeping it out of PR4 means a regression there bisects to
one small diff rather than to the new feature.

## 4. Tasks

### Task 1 — spec + codegen

* [ ] `Transaction` schema: add

  ```yaml
        opening_date:
          type: string
          format: date
          nullable: true
          description: Opening only — user-set effective date; null until set
  ```

* [ ] `Transaction` schema: **remove** the `currency` `enum: [INR, EUR]`,
      replacing it with
      `description: INR | EUR; legacy rows may carry another code`. Not
      widened to USD — the app supports two currencies (`CurrencyOf` excludes
      legacy USD outright, `snapshot.go:68-80`), but the field is denormalised
      from the free-string `Holding.Currency`, so a strict enum fails response
      validation on a legacy row and hides it from its owner. Matches how the
      history schemas already model currency (description, no enum).
      `Holding`/`HoldingInput` enums stay `[INR, EUR]` — input contracts, and
      that genuinely is the supported set (DD-004 §2.1).
* [ ] New schema:

  ```yaml
      TransactionWithHolding:
        allOf:
          - $ref: "#/components/schemas/Transaction"
          - type: object
            properties:
              script:
                type: string
                description: Owning holding's display name
              symbol:
                type: string
                description: Owning holding's ticker (e.g. TCS.NS)
  ```

* [ ] `transactions/transactions.yaml` — `transactions:` path item, `get`,
      `operationId: listAllTransactions`, 200 → array of `TransactionWithHolding`.
* [ ] `admin/admin.yaml` — `users_id_transactions:` with the `id` path param,
      `operationId: adminListUserTransactions`, 200 → same array, 404 → `NotFound`.
* [ ] `openapi.yaml` — two `$ref` entries.
* [ ] `cd backend && go generate -tags tools ./...`

**Why**: the view's row needs a holding label and `opening_date`, neither of
which the current DTO carries (DD-004 §2.1). Dropping the response enum fixes a
latent serialisation failure on legacy-currency rows without claiming USD
support the rest of the stack does not have.

**Verify**: `go build ./...` and `/usr/bin/grep -n "TransactionWithHolding" api/models.gen.go`
→ generated type present.

### Task 2 — mapper emits `opening_date`

* [ ] In `TransactionToAPI`, map `t.OpeningDate` → `*openapi_types.Date` when
      non-nil (the same conversion `openingStatus` in `mapper.go` already does
      for the holdings list — reuse that helper rather than writing a second
      conversion).

**Why**: `domain.Transaction.OpeningDate` exists but was never exposed, so
PRD-004 §5 column 9 is unreachable.

**Verify**: covered by Task 3's service test asserting the field round-trips.

### Task 3 — `TransactionsService.ListAll`

* [ ] Add `ListAll(ctx, uid)` per DD-004 §2.2: `txns.ListByUser` +
      `holdings.ListByUser`, map join, `TransactionToAPI` reuse, newest-first,
      orphan rows kept with blank labels.
* [ ] Tests in `internal/services/transactions_test.go`: label join, order,
      orphan, empty → `[]` not nil.

**Why**: one new service method, zero new persistence code —
`TransactionStore.ListByUser` already exists and is unused for stocks.

**Verify**: `cd backend && go test ./internal/services/...`
→ expected: all pass, including the four new cases.

### Task 4 — controllers, index, docs

* [ ] `ListAllTransactions` in `controllers/transactions.go` (pattern:
      `currentUserID` → service → 200).
* [ ] `AdminListUserTransactions` in `controllers/admin.go` (pattern:
      `adminCaller` → `loadTargetUser` → 404 on miss → service with `target.ID`).
* [ ] `internal/db/mongo.go`, `transactions` block:

  ```go
  {Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "date", Value: -1}, {Key: "created_at", Value: -1}}},
  ```

  `created_at` is required, not cosmetic: `ListByUser` sorts
  `{date:1, created_at:1}`, and an index missing the second sort key cannot
  serve the sort at all — Mongo falls back to a blocking in-memory sort on
  every same-date pair (a buy and a dividend booked on one day). Both keys
  descend so the index reverse-scans for the store's ascending order.
* [ ] Controller tests: own 200; act-as in-region 200, out-of-region 404.
* [ ] `docs/api.md`: both endpoints.

**Why**: the admin route gives PRD-004 §2.5 act-as parity; the index removes an
in-memory sort on a user-wide scan (DD-004 §2.3).

**Verify** (backend running, `make dev-db` + `make backend`, session cookie in
`/tmp/pd.cookies`):

```bash
# login (super admin after onboarding)
curl -s -c /tmp/pd.cookies -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: portfolio-dashboard' \
  -d '{"username":"admin","password":"<password>"}'

# own full ledger, newest first, with labels
curl -s -b /tmp/pd.cookies http://localhost:8080/api/transactions | jq '.[0]'

# act-as: in-region user → 200
curl -s -b /tmp/pd.cookies -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/api/admin/users/<userId>/transactions

# act-as: out-of-region / unknown id → 404
curl -s -b /tmp/pd.cookies -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/api/admin/users/000000000000000000000000/transactions
```

Expected: first call returns an array whose `[0].date` is the most recent
event and which carries `script`, `symbol`, `currency`; third prints `200`;
fourth prints `404`.

### Task 5 — one currency module (PR3)

* [ ] `frontend/src/lib/currency.ts`:

  ```ts
  // The app's supported currencies. Mirrors domain.CurrencyINR/CurrencyEUR
  // and the Holding input enum; CurrencyOf (snapshot.go) excludes anything
  // else, so this list is the whole supported set — not a display subset.
  export const SUPPORTED_CURRENCIES = ['INR', 'EUR'] as const

  const SYMBOLS: Record<string, string> = { INR: '\u20b9', EUR: '\u20ac' }

  // canonicalCurrency upper-cases a stored code and applies the blank -> INR
  // default (Holding.Currency's documented default, matching CurrencyOf).
  // Unrecognised codes are returned as-is: two different legacy codes must
  // stay two buckets, or a subtotal would sum across currencies.
  export function canonicalCurrency(raw: string | null | undefined): string {
    const code = (raw || '').trim().toUpperCase()
    return code === '' ? 'INR' : code
  }

  // currencySymbol returns the symbol for a supported currency and the code
  // itself for anything else, so a legacy row reads "USD 5,310.00" instead of
  // "\u20b95,310.00". Falling back to \u20b9 would mislabel real money -- which is
  // what the ternary this replaces does today for every non-EUR code.
  export function currencySymbol(raw: string | null | undefined): string {
    const code = canonicalCurrency(raw)
    return SYMBOLS[code] ?? code
  }

  // compareCurrencies orders supported currencies first (INR, EUR), then any
  // other code alphabetically, so bucket order is stable and legacy codes
  // sort last rather than interleaving.
  export function compareCurrencies(a: string, b: string): number {
    const ia = SUPPORTED_CURRENCIES.indexOf(a as never)
    const ib = SUPPORTED_CURRENCIES.indexOf(b as never)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return a.localeCompare(b)
  }
  ```

* [ ] Replace the duplicated ternary in `TransactionsModal.tsx:50`,
      `AddEditModal.tsx:228/234`, `HoldingsTable.tsx:27` and
      `currencyTotals.ts:56` (`nativeSymbols` keeps its pair shape, built from
      `currencySymbol`).
* [ ] `features/holdings/groupByCurrency.ts`: import `SUPPORTED_CURRENCIES`
      instead of re-listing `'INR'`/`'EUR'` inline. Its three-way display enum
      stays — the dashboard's fixed three-column layout depends on it — but the
      supported set is then stated in exactly one place.
* [ ] Export `TYPE_LABEL` from `TransactionsModal.tsx` (or move it beside the
      new page and import it back) so the new table does not copy it.
* [ ] vitest: `currencySymbol` (INR, blank, lower-case `eur`, unsupported code
      -> code itself and never a rupee sign), `canonicalCurrency` (blank -> INR,
      two distinct unknown codes stay distinct), `compareCurrencies` ordering.

**Why**: reuse rule — four copies of one mapping, and every copy returns
rupees for any non-EUR code. Harmless while nothing renders a third code;
actively wrong in a view that lists a legacy-currency row. Defining the
supported set once keeps this module and the dashboard's display enum from
drifting (DD-004 §3.2).

**Verify**: `cd frontend && npm test` → expected: existing holdings/currency
tests pass unchanged plus the new currency-module tests.

### Task 6 — client + hook (PR4)

* [ ] `npm run gen:api`.
* [ ] `client.ts`: `listAllTransactions: () => request<TransactionWithHolding[]>('GET', '/transactions')`
      and `adminListUserTransactions: (userId) => request<...>('GET', \`/admin/users/${userId}/transactions\`)`.
* [ ] `features/transactions/useAllTransactions.ts` — mirrors `useHoldings.ts`
      (loading/error/data, optional `userId`); also returns the holdings list it
      needs for the filter facet and for handing a `HoldingWithPrice` to the
      edit modal.

**Verify**: `npx tsc --noEmit` clean.

### Task 7 — pure filters

* [ ] `features/transactions/transactionFilters.ts`: `applyFilters`,
      `sortRows`, `currencySubtotals` — pure, no React.
* [ ] Build the currency facet and the subtotal buckets from
      `canonicalCurrency(t.currency)` (task 5), ordered by
      `compareCurrencies` — **not** `normaliseCurrency`, which folds every
      non-INR/EUR code into one `OTHER` key and would both drop the specific
      code from the facet and sum two unlike currencies into one card
      (DD-004 §3.2).
* [ ] vitest: each filter alone, filters combined, sort toggle per key,
      subtotals per currency, and specifically: a legacy-code row gets its own
      bucket, two distinct legacy codes get two buckets, and no bucket ever
      contains two codes.

**Why**: subtotals that silently mix currencies are worse than no subtotals —
the number looks authoritative and means nothing. The bucket key is therefore
the raw code, and the test asserts that rather than trusting it.

**Verify**: `npm test -- transactionFilters` → expected: all pass.

### Task 8 — page + table

* [ ] `TransactionsAllTable.tsx` — PRD-004 §5 columns, `formatDate`,
      `currencySymbol`, shared `TYPE_LABEL`; implied cost/share shown for
      buy/sell/opening only; ratio for split/bonus; realised seed and opening
      date for opening.
* [ ] `TransactionsPage.tsx` — filter bar, match count, per-currency subtotal
      strip, table; edit action opens the existing `TransactionsModal` for that
      row's holding and refetches `onChanged`.
* [ ] `App.tsx` route `/transactions` under `RequireAuth`.
* [ ] vitest: renders the §5 columns; clicking edit opens the holding modal.

**Verify**: `npm test` + `/transactions` loads with the dev stack
(`make dev-db`, `make backend`, `make frontend`).

### Task 9 — nav + act-as route

* [ ] `DashboardPage` header: Transactions button next to History, with a
      **computed** target:

  ```tsx
  to={actAsUserId ? `/admin/users/${actAsUserId}/transactions` : '/transactions'}
  ```

* [ ] `App.tsx`: `/admin/users/:id/transactions` under `RequireAdmin`,
      rendering `TransactionsPage` with `actAsUserId` from `useParams()`.
* [ ] `AdminUserView`: link into that route for the user being viewed.
* [ ] vitest: in act-as, the nav link's `href` carries the target id; the
      act-as route's page calls `adminListUserTransactions` with that id and
      renders without the Edit column; the own-portfolio route calls
      `listAllTransactions`.

**Why**: `AdminUserView` renders `DashboardPage`, so a hard-coded
`to="/transactions"` drops `actAsUserId` — the page would then hit the ordinary
endpoint and show the **admin's own** transactions under the target user's
heading. That failure looks plausible on screen, which is exactly why the test
asserts the href and the endpoint rather than just that the page renders. The
id lives in the URL so the act-as view is linkable and refresh-safe
(DD-004 §3.3).

Note: the `History` link in the same header has this flaw today and is **not**
fixed here (no act-as history endpoint exists) — it is why this link is not
modelled on it.

**Verify**: with the stack running — the dashboard button navigates; an admin
viewing an in-region user lands on `/admin/users/<id>/transactions`, sees that
user's events and no edit path; editing the id to an out-of-region user yields
the 404 state, not data.

## 5. Rollback

Every PR reverts independently. PR2 is purely additive (new endpoints, one new
index, two optional DTO fields) — reverting it leaves no orphaned data because
nothing is written. Reverting PR4 removes the route and button; the endpoints
go unused but harmless. PR3 is mechanical and reverts to the inline ternaries.

## 6. Follow-ups (not in this plan)

* CSV export of the filtered set (PRD-004 §9.3).
* Inline edit in the view, if the modal round-trip proves annoying
  (PRD-004 §9.2) — would add the second write path this design avoids.
* Server-side paging / virtualisation, only on evidence (DD-004 §4).
* **Supporting USD as a real currency** (forex leg, `CurrencyOf` bucket,
  snapshot column, input enums) — out of scope and not half-started here: this
  plan adds no USD affordance, only correct handling of legacy codes already in
  the data. If it ever happens, the change is one entry in
  `SUPPORTED_CURRENCIES` plus its symbol, plus the backend work above.
