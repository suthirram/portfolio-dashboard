# PD-048: Rollout plan — dividend history (CSV import + Dividends page)

* **Status**: Draft v3 — owner decisions of 2026-10-30 applied; v1 scope agreed
* **Owner**: project owner
* **Goal**: The owner uploads their dividend sheet on the INR or EUR tab,
  confirms any share name that does not exactly match a holding in a popup,
  reviews a preview (ready / already exists / invalid) and commits it
  atomically. Dividends then show on a new Dividends page (table, running
  totals, yearly / monthly / per-holding analytics), on the dashboard, in
  History and in every ledger view — one record each, never counted twice.
  Single-row add / edit / delete, delete-all per tab and admin act-as are
  included.
* **Architecture**: a dividend is a `transactions` document with
  `type = dividend` (no new collection). `DividendsService` adds the tab view
  and analytics (pure, computed on read in integer cents), the import
  pipeline (validate → resolve names → occurrence-based dedup → cumulative
  warnings) behind a read-only `preview` and an atomic `import`, delete-all,
  and the History overlay. Writes that span documents run in a MongoDB
  multi-document transaction through a `txRunner` seam. Single-row writes
  reuse `TransactionsService` — one write path.
* **Tech stack**: Go 1.26, echo v4 + oapi-codegen strict server,
  mongo-driver v1 (sessions / transactions), zap, OpenTelemetry spans;
  MongoDB 7 (single-node replica set in dev); React 18, TypeScript 5.4,
  Vite, Recharts 2, vitest 4 + Testing Library, openapi-typescript.
  No new dependencies.
* **Spec**: [PRD-005](../prds/PRD-005-dividend-history.md) ·
  [DD-005](../designs/DD-005-dividend-history.md) ·
  [visual spec](../visuals/PD-048-dividend-history.html)
  ([published](https://claude.ai/artifact/N1DGvkdmVHjUyVG5gxiUv6))

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md, memory | parsers moved, not copied; `istToday` shared; ledger write path reused; `find` extracted from two list methods |
| Branch → PR, never `main` | CLAUDE.md | one branch per PR, created from `main` in the task that opens it |
| Frontend and backend never in one PR | memory | PR2–PR8 backend, PR9–PR12 frontend |
| Every slice passes the three gates | `task-breakdown` skill | §PR sequence: each PR adds value, regresses nothing, and ships a test that fails without it; no scaffolding-only PR |
| PR body < 200 words: What / How to test / No regression | `task-breakdown` skill | template in §PR bodies |
| Curl in endpoint PRs | memory | every endpoint task has a curl step the PR body copies |
| Behaviour tests only | memory | no DB-availability or DB-error tests (only `ErrNoDocuments` → 404); mtest mock driver like the rest of the suite |
| `Id` casing, never `uid` | memory | new identifiers `userId`, `holdingId`, `BatchId`; `uid` renamed in every function this plan edits |
| Logging | CLAUDE.md | `logger := s.log(ctx)` bound once; `zap.Error(err)`; never `s.log(ctx).Error(...)` inline |
| Tracing | codebase | every service method opens `tracer.Start` + `defer endSpan(span, &retErr)` |
| Gitmoji, subject ≤ 50 chars, no attribution | memory | every commit and PR below |
| Edit tool for source | memory | every Modify step is an Edit (current → replacement), never sed/perl |
| Commit per task | plan-doc format | every task ends in a commit, except spec / builder tasks whose code only compiles with the next task's handlers (5, 6, 9, 10): those stage, and the handler task commits them — the pre-commit `golangci-lint` hook rejects a non-compiling tree |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `backend/internal/services/clock.go` | `istZone`, `istToday` (moved from `gold_prices.go`) |
| Modify | `backend/internal/services/gold_prices.go`, `gold_metrics.go`, `gold_prices_test.go` | call `istToday` |
| Modify | `backend/internal/services/transactions.go`, `transactions_test.go` | `validateDividend`; `healAfter` skips dividend-only writes |
| Modify | `backend/internal/services/holdings.go`, `holdings_test.go` | a holding's currency change rewrites its ledger events' currency |
| Modify | `backend/internal/persistence/transactions.go` | `find` helper; dividend queries; `InsertMany`; `DeleteDividends`; `currencyMatch` |
| Modify | `backend/internal/persistence/holdings.go` | `MoveAliases` |
| Modify | `backend/internal/persistence/persistence.go` | `client` field; `InTransaction` |
| Modify | `backend/internal/db/mongo.go`, `mongo_test.go` | dividend listing index |
| Create | `backend/internal/domain/dividend.go`, `dividend_test.go` | `AmountCents`, `CentsToMoney`, `DividendKey` |
| Modify | `backend/internal/domain/transaction.go` | `ImportMeta`, `Transaction.Import` |
| Modify | `backend/internal/domain/holding.go` | `Holding.Aliases` |
| Create | `backend/internal/services/dividends.go`, `dividends_test.go` | `DividendsService` (List, Preview, Import, DeleteAll, HistoryOverlay) |
| Create | `backend/internal/services/dividend_view.go`, `_test.go` | pure tab view + analytics |
| Create | `backend/internal/services/dividend_match.go`, `_test.go` | pure name resolution |
| Create | `backend/internal/services/dividend_import.go`, `_test.go` | pure partition, cumulative warnings, preview builder |
| Create | `backend/internal/services/dividend_history.go`, `_test.go` | pure History overlay |
| Modify | `backend/internal/services/mapper.go` | `DividendRowToAPI` |
| Modify | `backend/internal/services/history.go` | `HistoryRow.Dividends`, `HistoryHolding.Dividends` |
| Create | `backend/api/specs/dividends/dividends.yaml` | own dividend paths |
| Modify | `backend/api/specs/openapi.yaml`, `portfolio-api.yaml`, `admin/admin.yaml` | wiring, schemas, admin paths |
| Modify | `backend/api/models.gen.go`, `server.gen.go` | regenerated |
| Create | `backend/internal/controllers/dividends.go`, `dividends_test.go` | own + admin dividend handlers |
| Modify | `backend/internal/controllers/controllers.go` | wire `DividendsService` |
| Modify | `backend/internal/controllers/admin.go`, `transactions_all_test.go` | act-as ledger writes |
| Modify | `backend/internal/controllers/history.go` | `attachDividendOverlay` |
| Modify | `backend/internal/config/config.go`, `config_test.go` | default URI with `replicaSet` |
| Modify | `docker-compose.dev.yml`, `docker-compose.yml` | single-node replica set |
| Modify | `docs/local-setup.md`, `docs/configuration.md`, `docs/api.md`, `docs/history-and-snapshots.md` | runbook + endpoints |
| Modify | `frontend/src/lib/formDates.ts`, `formDates.test.ts`, `formNumbers.ts`, `formNumbers.test.ts` | receive `normaliseDate` (+ calendar check); new `parseMoneyCell` over the existing `parseDecimalInput` |
| Modify | `frontend/src/features/history/historyShared.ts` | import + re-export the moved parsers |
| Create | `frontend/src/lib/csv.ts`, `csv.test.ts` | RFC-4180 tokenizer |
| Modify | `frontend/src/lib/api/schema.gen.ts`, `client.ts`, `frontend/src/types.ts` | types, methods, `ApiError.body` |
| Modify | `frontend/src/features/admin/actAsRouting.ts`, `actAsRouting.test.ts` | dividend + ledger-write paths |
| Create | `frontend/src/features/dividends/useDividends.ts` | data hook |
| Create | `frontend/src/features/dividends/DividendsPage.tsx`, `DividendsPage.test.tsx` | page |
| Create | `frontend/src/features/dividends/DividendsTable.tsx`, `DividendsAnalytics.tsx` | table, analytics |
| Create | `frontend/src/features/dividends/DividendModal.tsx`, `DeleteAllDialog.tsx`, `DividendCrud.test.tsx` | single-row CRUD, delete-all |
| Create | `frontend/src/features/dividends/dividendCsv.ts`, `dividendCsv.test.ts` | pure CSV → rows |
| Create | `frontend/src/features/dividends/DividendImportModal.tsx`, `NameConfirmDialog.tsx`, `DividendImport.test.tsx` | import flow |
| Create | `frontend/src/features/admin/AdminUserDividends.tsx` | act-as route |
| Modify | `frontend/src/App.tsx` | routes |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | nav link; dividend income props |
| Modify | `frontend/src/features/holdings/HoldingsTable.tsx` | Dividends column + total |
| Modify | `frontend/src/components/SummaryCards.tsx`, `SummaryCards.test.tsx` | Dividend income card |
| Modify | `frontend/src/features/history/HistoryTable.tsx`, `HistoryModals.tsx`, `HistoryPage.test.tsx` | Dividends column + breakdown |
| Modify | `frontend/src/features/holdings/TransactionsModal.tsx`, `TransactionsModal.test.tsx`, `features/transactions/TransactionsPage.tsx` | optional `userId` (act-as writes) |

## PR sequence (backend first; each slice passes the three gates)

| # | Branch | Tasks | Value (gate 2) | Test that fails without it (gate 3) | No regression (gate 1) |
|---|---|---|---|---|---|
| PR1 | `docs/PRD-005-dividend-history` | 0 | agreed design on record | — (docs) | docs only |
| PR2 | `feat/PD-048-dividend-rules` | 1–3A | future-dated dividends rejected; dividend writes stop rewriting History; a holding's currency change carries over to its ledger events | `TestValidateDividend`, `TestTransactionsService_DividendSkipsHeal`, `TestHoldingsService_Update_SyncsLedgerCurrency` | gold tests green after the `istToday` move; buy/sell still heal; edits without a currency leave the ledger alone |
| PR3 | `feat/PD-048-dividends-view-api` | 4–7 | `GET /dividends` (+ act-as): rows, both running totals, yearly / monthly / per-holding | `TestBuildDividendView_*`, `TestListDividends_*` | additive routes + index |
| PR4 | `feat/PD-048-dividends-preview-api` | 8–11 | `POST /dividends/import/preview`: name resolution, duplicates, invalid rows, warnings — no writes | `TestResolveNames_*`, `TestPartition_OccurrenceBased`, `TestCumulativeWarnings` | read-only endpoint; `Holding.Aliases` omitempty |
| PR5 | `feat/PD-048-dividends-import-api` | 12–14 | `POST /dividends/import`: atomic commit, aliases remembered, totals recomputed | `TestImport` | a replica set behaves as a superset of standalone; existing code ignores sessions |
| PR6 | `feat/PD-048-dividends-delete-all-api` | 15 | `DELETE /dividends?currency=` atomic, totals recomputed | `TestDeleteAll_ScopedAndRecomputes` | scoped to `type=dividend` + currency |
| PR7 | `feat/PD-048-actas-ledger-api` | 16 | admins add / edit / delete a user's ledger events in act-as | `TestAdminUserTransactionWrites` | new admin routes only |
| PR8 | `feat/PD-048-history-dividends-api` | 17 | History rows carry dividends to date per currency and per stock | `TestDividendOverlay` | optional fields; snapshots untouched |
| PR9 | `feat/PD-048-dividends-page` | 18–19 | Dividends page: tabs, table, analytics, nav link | `DividendsPage.test.tsx` | new route; one nav pill |
| PR10 | `feat/PD-048-dividends-crud-ui` | 20 | add / edit / delete / delete-all on the page | `DividendCrud.test.tsx` | reuses the ledger endpoints |
| PR11 | `feat/PD-048-dividends-import-ui` | 21–23 | CSV upload: name popup, preview, confirm, result | `csv.test.ts`, `dividendCsv.test.ts`, `DividendImport.test.tsx` | History tests green after the parser move |
| PR12 | `feat/PD-048-dividends-integration-ui` | 24–26 | dashboard dividend column + card, History column, act-as dividends + ledger writes | `SummaryCards.test.tsx`, `HistoryPage.test.tsx`, `TransactionsModal.test.tsx`, `actAsRouting.test.ts` | figures are additive; P&L untouched |
| — | — | 27 | end-to-end on the dev stack | scenarios 1–9 | — |

Each PR branches from `main` after the previous one merges.

## PR bodies

Every PR description uses this shape and stays under 200 words (the curl
block counts as substance; trim prose first):

````markdown
## What
<value this slice adds, 1–2 sentences>

## How to test
1. <step>
2. <expected result>
```bash
<curl block from the task's curl step — backend PRs only>
```
- Automated: `<command>` (<N> tests pass)

## No regression
<why existing flows are untouched>
````

---

## Task 0: Land the docs (PR1)

**Files:**

* Create: `docs/prds/PRD-005-dividend-history.md`, `docs/designs/DD-005-dividend-history.md`, `docs/plans/PD-048-dividend-history.md`, `docs/visuals/PD-048-dividend-history.html`
* Modify: `docs/visuals/README.md`

* [ ] **Step 1: Commit on the docs branch**

WHY: the design must be reviewable and durable before any code lands
(memory: plan doc before big task).

```bash
git checkout -b docs/PRD-005-dividend-history main
git add docs/prds/PRD-005-dividend-history.md docs/designs/DD-005-dividend-history.md docs/plans/PD-048-dividend-history.md docs/visuals/PD-048-dividend-history.html docs/visuals/README.md
git commit -m "📝 PRD-005 / DD-005 / PD-048: dividend history"
```

* [ ] **Step 2: Verify**

```bash
git log --oneline -1 && git show --stat HEAD | tail -6
```

Expected: one commit, five files; pre-commit `markdownlint-fix` Passed.

* [ ] **Step 3: Push and open the PR**

```bash
git push -u origin docs/PRD-005-dividend-history
gh pr create --title "📝 Add the PRD, design doc, plan and visual spec for dividend history" --body-file pr1.md
```

Expected: PR URL printed; body follows §PR bodies.

---

## Task 1: Share `istToday` (PR2)

**Files:**

* Create: `backend/internal/services/clock.go`
* Modify: `backend/internal/services/gold_prices.go`, `backend/internal/services/gold_metrics.go`, `backend/internal/services/gold_prices_test.go`

* [ ] **Step 1: Create `clock.go`**

WHY: the dividend "not in the future" rule needs today's IST calendar day.
`goldToday` already computes exactly that; the reuse rule says move it and
call it from both, not copy it.

```go
package services

import "time"

// istZone is Indian Standard Time. The owner's ledgers (gold prices,
// dividends) and the snapshot job roll their calendar on Indian time, not UTC.
var istZone = time.FixedZone("IST", 5*60*60+30*60)

// istToday returns the current IST calendar day as a bare UTC-midnight date,
// so it compares cleanly with stored dates.
func istToday() time.Time {
 now := time.Now().In(istZone)
 return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
```

* [ ] **Step 2: Remove the originals from `gold_prices.go` (Edit)**

Current:

```go
// istZone matters because "today" bounds the missing-day window (PRD-003
// §7): the owner enters the local jeweler rate, so the calendar rolls on
// Indian time, not UTC — same zone the snapshot job keys on.
var istZone = time.FixedZone("IST", 5*60*60+30*60)

// goldToday returns the current IST calendar day, normalized to a bare
// UTC-midnight date so it compares cleanly with stored DATE values.
func goldToday() time.Time {
 now := time.Now().In(istZone)
 return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
```

Replacement:

```go
// "Today" bounds the missing-day window (PRD-003 §7): the owner enters the
// local jeweler rate, so the calendar rolls on Indian time — see istToday.
```

* [ ] **Step 3: Replace the four call sites (Edit)**

WHY: `gold_prices_test.go` also calls `goldToday()`; leaving it would stop
the whole services test package compiling.

| File:line | Current | Replacement |
|---|---|---|
| `gold_prices.go:64` | `today := goldToday()` | `today := istToday()` |
| `gold_prices.go:97` | `today := goldToday()` | `today := istToday()` |
| `gold_metrics.go:29` | `today := goldToday()` | `today := istToday()` |
| `gold_prices_test.go:111` | `{"future date", []api.GoldPrice{{Date: openapi_types.Date{Time: goldToday().AddDate(0, 0, 1)}, PricePerGram: 7000}}},` | `{"future date", []api.GoldPrice{{Date: openapi_types.Date{Time: istToday().AddDate(0, 0, 1)}, PricePerGram: 7000}}},` |

* [ ] **Step 4: Verify**

```bash
cd backend && go build ./... && /usr/bin/grep -rn "goldToday" internal; go test ./internal/services/ -run Gold
```

Expected: build ok; grep prints nothing; `ok  portfolio-dashboard/internal/services`.

* [ ] **Step 5: Commit**

```bash
git checkout -b feat/PD-048-dividend-rules main
git add backend/internal/services/clock.go backend/internal/services/gold_prices.go backend/internal/services/gold_metrics.go backend/internal/services/gold_prices_test.go
git commit -m "♻️ Share istToday between gold and dividends"
```

---

## Task 2: One dividend rule for every write path (PR2)

**Files:**

* Modify: `backend/internal/services/transactions.go`, `backend/internal/services/transactions_test.go`

* [ ] **Step 1: Add `validateDividend`; use it from `validateTxnInput` (Edit)**

WHY: the ledger form and the CSV import must accept exactly the same
dividends (PRD-005 §4). Today the ledger only checks `amount > 0`, so a
future-dated or absurd amount is stored. One function, two callers.

Current:

```go
// validateTxnInput enforces the shape required by each transaction type.
func validateTxnInput(input api.TransactionInput) error {
```

Replacement:

```go
// maxDividendAmount bounds one dividend so a mistyped cell (an account number
// pasted into the amount) is rejected instead of stored.
const maxDividendAmount = 1e12

// validateDividend is the dividend rule shared by the ledger form and the CSV
// import (PRD-005 §4): a positive finite amount below the bound, dated no
// later than today (IST).
func validateDividend(date time.Time, amount float64, today time.Time) error {
 if math.IsNaN(amount) || math.IsInf(amount, 0) || amount <= 0 || amount >= maxDividendAmount {
  return fmt.Errorf("%w: dividend must be a positive amount", ErrValidation)
 }
 if domain.UTCDate(date).After(today) {
  return fmt.Errorf("%w: dividend date is in the future", ErrValidation)
 }
 return nil
}

// validateTxnInput enforces the shape required by each transaction type.
// today is the IST calendar day (istToday), a parameter so tests pin it.
func validateTxnInput(input api.TransactionInput, today time.Time) error {
```

Current:

```go
 case domain.TxnDividend:
  if input.Amount == nil || *input.Amount <= 0 {
   return fmt.Errorf("%w: dividend requires a positive amount", ErrValidation)
  }
```

Replacement:

```go
 case domain.TxnDividend:
  if input.Amount == nil {
   return fmt.Errorf("%w: dividend must be a positive amount", ErrValidation)
  }
  return validateDividend(input.Date, *input.Amount, today)
```

Both callers — current `if err := validateTxnInput(input); err != nil {`
(in `Create` and `Update`), replacement
`if err := validateTxnInput(input, istToday()); err != nil {`. Add `"math"`
to the imports.

* [ ] **Step 2: Tests (append to `transactions_test.go`)**

```go
// The ledger and the CSV import share one dividend rule (PRD-005 §4).
func TestValidateDividend(t *testing.T) {
 today := time.Date(2026, time.October, 30, 0, 0, 0, 0, time.UTC)
 cases := []struct {
  name   string
  date   time.Time
  amount float64
  ok     bool
 }{
  {"today, positive", today, 300, true},
  {"past, positive", today.AddDate(-6, 0, 0), 1250.5, true},
  {"tomorrow", today.AddDate(0, 0, 1), 300, false},
  {"zero", today, 0, false},
  {"negative", today, -5, false},
  {"absurd", today, 1e12, false},
 }
 for _, c := range cases {
  err := validateDividend(c.date, c.amount, today)
  if c.ok && err != nil {
   t.Errorf("%s: err = %v, want nil", c.name, err)
  }
  if !c.ok && !errors.Is(err, ErrValidation) {
   t.Errorf("%s: err = %v, want ErrValidation", c.name, err)
  }
 }
}

// A future-dated dividend through the ledger API is a 400, not a stored row.
func TestValidateTxnInput_FutureDividendRejected(t *testing.T) {
 today := time.Date(2026, time.October, 30, 0, 0, 0, 0, time.UTC)
 amt := 300.0
 err := validateTxnInput(api.TransactionInput{Type: "dividend", Date: today.AddDate(0, 0, 2), Amount: &amt}, today)
 if !errors.Is(err, ErrValidation) {
  t.Fatalf("err = %v, want ErrValidation", err)
 }
}
```

* [ ] **Step 3: Verify**

```bash
cd backend && go test ./internal/services/ -run 'ValidateDividend|ValidateTxnInput|TransactionsService' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestValidateDividend`, `--- PASS: TestValidateTxnInput_FutureDividendRejected`; every existing `TestTransactionsService_*` PASS.

* [ ] **Step 4: Commit**

```bash
git add backend/internal/services/transactions.go backend/internal/services/transactions_test.go
git commit -m "✨ Reject future-dated dividends in the ledger"
```

---

## Task 3: Dividend writes stop rewriting History (PR2)

**Files:**

* Modify: `backend/internal/services/transactions.go`, `backend/internal/services/transactions_test.go`

* [ ] **Step 1: Add `healAfter`; call it from Create / Update / Delete (Edit)**

WHY: snapshot buckets and lines store quantity, cost and close — never
dividends — so healing after a dividend-only write rewrites History rows to
identical values (DD-005 §2.5). An update that turns a buy into a dividend
(or back) still heals, because one side is not a dividend. These three
methods are edited, so their `uid` parameter is renamed `userId` (memory: no
`uid` in touched code); the rename covers every `uid` inside the three
bodies and nothing else.

New helper, placed directly after `healSnapshots`:

```go
// healAfter heals stored snapshots after a ledger write unless every event
// involved is a dividend: snapshots carry quantity, cost and close, never
// dividends, so a dividend-only change would rewrite History to the same
// values (DD-005 §2.5). Dividends reach History via the on-read overlay.
func (s *TransactionsService) healAfter(ctx context.Context, userId primitive.ObjectID, events ...domain.Transaction) {
 dates := make([]time.Time, 0, len(events))
 for _, e := range events {
  if e.Type != domain.TxnDividend {
   dates = append(dates, e.Date)
  }
 }
 if len(dates) == 0 {
  return
 }
 s.healSnapshots(ctx, userId, dates...)
}
```

| Method | Current | Replacement |
|---|---|---|
| `Create` signature | `func (s *TransactionsService) Create(ctx context.Context, uid primitive.ObjectID, holdingHex string, input api.TransactionInput) (_ api.Transaction, _ bool, retErr error) {` | `func (s *TransactionsService) Create(ctx context.Context, userId primitive.ObjectID, holdingHex string, input api.TransactionInput) (_ api.Transaction, _ bool, retErr error) {` |
| `Create` heal | `s.healSnapshots(ctx, uid, t.Date)` | `s.healAfter(ctx, userId, t)` |
| `Update` signature | `func (s *TransactionsService) Update(ctx context.Context, uid primitive.ObjectID, idHex string, input api.TransactionInput) (_ api.Transaction, _ bool, retErr error) {` | `func (s *TransactionsService) Update(ctx context.Context, userId primitive.ObjectID, idHex string, input api.TransactionInput) (_ api.Transaction, _ bool, retErr error) {` |
| `Update` heal | `s.healSnapshots(ctx, uid, prev.Date, updated.Date)` | `s.healAfter(ctx, userId, prev, updated)` |
| `Delete` signature | `func (s *TransactionsService) Delete(ctx context.Context, uid primitive.ObjectID, idHex string) (_ bool, retErr error) {` | `func (s *TransactionsService) Delete(ctx context.Context, userId primitive.ObjectID, idHex string) (_ bool, retErr error) {` |
| `Delete` heal | `s.healSnapshots(ctx, uid, prev.Date)` | `s.healAfter(ctx, userId, prev)` |

* [ ] **Step 2: Test (append to `transactions_test.go`)**

```go
// countingRecomputer records RecomputeFrom calls (the snapshot heal).
type countingRecomputer struct{ calls int }

func (c *countingRecomputer) RecomputeFrom(context.Context, primitive.ObjectID, time.Time) error {
 c.calls++
 return nil
}

// A back-dated dividend must not heal snapshots; a back-dated buy still must.
func TestTransactionsService_DividendSkipsHeal(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 past := time.Date(2024, time.March, 15, 0, 0, 0, 0, time.UTC)

 create := func(mt *mtest.T, typ string, qty float64) int {
  userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
  holdingsNS, txnsNS := mt.DB.Name()+".holdings", mt.DB.Name()+".transactions"
  event := bson.D{
   {Key: "_id", Value: primitive.NewObjectID()}, {Key: "type", Value: typ},
   {Key: "date", Value: past}, {Key: "quantity", Value: qty}, {Key: "amount", Value: 300.0},
  }
  mt.AddMockResponses(
   // GetScoped(holdings).
   mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch, bson.D{
    {Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "currency", Value: "INR"},
   }),
   // Insert(transactions).
   mtest.CreateSuccessResponse(),
   // recompute ListByHolding.
   mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, event),
   // recompute holdings findAndModify.
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: holdingId}}}),
  )
  rec := &countingRecomputer{}
  st := persistence.New(mt.DB)
  svc := NewTransactionsService(st.Transactions, st.Holdings, rec, nil)
  svc.now = func() time.Time { return time.Date(2026, time.October, 30, 0, 0, 0, 0, time.UTC) }
  amt := 300.0
  in := api.TransactionInput{Type: api.TransactionInputType(typ), Date: past, Amount: &amt}
  if qty > 0 {
   in.Quantity = &qty
  }
  if _, found, err := svc.Create(context.Background(), userId, holdingId.Hex(), in); err != nil || !found {
   t.Fatalf("Create %s: found=%v err=%v", typ, found, err)
  }
  return rec.calls
 }

 mt.Run("dividend", func(mt *mtest.T) {
  if calls := create(mt, "dividend", 0); calls != 0 {
   t.Errorf("heal calls = %d, want 0 for a dividend", calls)
  }
 })
 mt.Run("buy", func(mt *mtest.T) {
  if calls := create(mt, "buy", 10); calls != 1 {
   t.Errorf("heal calls = %d, want 1 for a buy", calls)
  }
 })
}
```

* [ ] **Step 3: Verify**

```bash
cd backend && go vet ./internal/services/ && go test ./internal/services/ -run 'TransactionsService' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestTransactionsService_DividendSkipsHeal/dividend` and `/buy`; existing Create/Update/Delete tests PASS.

* [ ] **Step 4: Commit**

```bash
git add backend/internal/services/transactions.go backend/internal/services/transactions_test.go
git commit -m "⚡️ Skip the snapshot heal for dividend writes"
```

* [ ] **Step 5: curl (PR2 "How to test")**

```bash
B=http://localhost:8080/api; H='X-Requested-With: portfolio-dashboard'; J='Content-Type: application/json'
curl -s -c c.txt -H "$H" -H "$J" -d '{"username":"admin","password":"<dev password>"}' $B/auth/login >/dev/null
curl -s -o /dev/null -w '%{http_code}\n' -b c.txt -H "$H" -H "$J" -d '{"type":"dividend","date":"2099-01-01T00:00:00Z","amount":300}' $B/holdings/<holding id>/transactions   # 400
curl -s -o /dev/null -w '%{http_code}\n' -b c.txt -H "$H" -H "$J" -d '{"type":"dividend","date":"2024-03-15T00:00:00Z","amount":300}' $B/holdings/<holding id>/transactions   # 201; backend log has no "snapshot heal" line
```

PR2 is opened at the end of Task 3A.

---

## Task 3A: Keep ledger currency in step with the holding (PR2)

**Files:**

* Modify: `backend/internal/persistence/transactions.go`, `backend/internal/services/holdings.go`, `backend/internal/services/holdings_test.go`

* [ ] **Step 1: `SetCurrencyByHolding` (append to `persistence/transactions.go`)**

WHY: every ledger event copies its holding's currency, and the dividend tab,
delete-all and the History overlay all filter on that copy. Today
`HoldingsService.Update` can change a holding's currency without touching its
events, so an INR → EUR edit would leave the old dividends on the INR tab and
in the INR History column while the dashboard shows the holding as EUR —
breaking PRD-005 §9 (every view agrees). The all-transactions view (PD-047)
already shows this mismatch today, so the fix stands on its own.

```go
// SetCurrencyByHolding rewrites the denormalised currency on every event of
// one holding, so the ledger follows a holding's currency change.
func (s *TransactionStore) SetCurrencyByHolding(ctx context.Context, userId, holdingId primitive.ObjectID, currency string) error {
 ctx, cancel := context.WithTimeout(ctx, writeTimeout)
 defer cancel()
 _, err := s.col.UpdateMany(ctx,
  scopedFilter(userId, bson.M{"holding_id": holdingId}),
  bson.M{"$set": bson.M{"currency": currency}})
 return err
}
```

* [ ] **Step 2: Call it from `HoldingsService.Update` (Edit)**

WHY: runs after the holding write succeeds, with the holding's canonical
currency. The call is idempotent, so if it fails the edit returns an error and
saving the same edit again repairs the ledger. `Update` is edited, so its
`uid` parameter is renamed `userId` throughout the function (CLAUDE.md naming
rule).

Current:

```go
 // Setting the opening date stamps the holding's opening event with the
 // user-chosen effective date (and syncs the ordering Date to it), then
 // re-derives the position. No-op when the holding has no opening event.
 if input.OpeningDate != nil {
```

Replacement:

```go
 // The ledger copies the holding's currency onto every event; keep those
 // copies in step so the dividend tab, History and the all-transactions
 // view never disagree with the dashboard (PRD-005 §9).
 if input.Currency != nil && ValidCurrency(*input.Currency) {
  currency, _ := CurrencyOf(updated)
  if err := s.txns.SetCurrencyByHolding(ctx, userId, id, currency); err != nil {
   logger.Error("sync ledger currency failed", zap.String("id", idHex), zap.Error(err))
   return api.Holding{}, false, err
  }
 }

 // Setting the opening date stamps the holding's opening event with the
 // user-chosen effective date (and syncs the ordering Date to it), then
 // re-derives the position. No-op when the holding has no opening event.
 if input.OpeningDate != nil {
```

Signature — current
`func (s *HoldingsService) Update(ctx context.Context, uid primitive.ObjectID, idHex string, input api.HoldingInput) (_ api.Holding, _ bool, retErr error) {`,
replacement
`func (s *HoldingsService) Update(ctx context.Context, userId primitive.ObjectID, idHex string, input api.HoldingInput) (_ api.Holding, _ bool, retErr error) {`;
the two remaining `uid` uses in the body (`UpdateScopedAndReturn(ctx, uid, …)`
and `setOpeningDate(ctx, uid, …)`) become `userId`.

* [ ] **Step 3: Test (append to `holdings_test.go`)**

```go
// A currency change rewrites the currency on the holding's ledger events; an
// edit that leaves the currency alone does not touch the ledger.
func TestHoldingsService_Update_SyncsLedgerCurrency(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 run := func(mt *mtest.T, currency *api.HoldingInputCurrency) int {
  userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
  mt.AddMockResponses(
   // UpdateScopedAndReturn — findAndModify on holdings.
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
    {Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "currency", Value: "EUR"},
   }}),
   // SetCurrencyByHolding — updateMany on transactions.
   mtest.CreateSuccessResponse(bson.E{Key: "n", Value: int32(3)}, bson.E{Key: "nModified", Value: int32(3)}),
  )
  st := persistence.New(mt.DB)
  svc := NewHoldingsService(st.Holdings, st.Transactions, nil)
  if _, found, err := svc.Update(context.Background(), userId, holdingId.Hex(), api.HoldingInput{
   Script: "SAP", Exchange: "XETRA", Type: "stock", Currency: currency,
  }); err != nil || !found {
   t.Fatalf("Update: found=%v err=%v", found, err)
  }
  n := 0
  for _, e := range mt.GetAllStartedEvents() {
   if e.CommandName != "update" || e.Command.Lookup("update").StringValue() != "transactions" {
    continue
   }
   n++
   set := e.Command.Lookup("updates").Array().Index(0).Document().Lookup("u", "$set").Document()
   if got := set.Lookup("currency").StringValue(); got != "EUR" {
    t.Errorf("ledger currency = %q, want EUR", got)
   }
  }
  return n
 }
 mt.Run("currency changed", func(mt *mtest.T) {
  eur := api.HoldingInputCurrency("EUR")
  if n := run(mt, &eur); n != 1 {
   t.Errorf("ledger updates = %d, want 1", n)
  }
 })
 mt.Run("currency not sent", func(mt *mtest.T) {
  if n := run(mt, nil); n != 0 {
   t.Errorf("ledger updates = %d, want 0", n)
  }
 })
}
```

(Field names follow the generated `api.HoldingInput`; `Exchange` / `Type`
take whichever enum values `holdings_test.go` already uses.)

* [ ] **Step 4: Verify**

```bash
cd backend && go build ./... && go test ./internal/services/ -run 'HoldingsService' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestHoldingsService_Update_SyncsLedgerCurrency/currency_changed`, `/currency_not_sent`; existing holdings tests PASS.

* [ ] **Step 5: Commit**

```bash
git add backend/internal/persistence/transactions.go backend/internal/services/holdings.go backend/internal/services/holdings_test.go
git commit -m "🐛 Sync ledger currency when a holding's changes"
```

* [ ] **Step 6: curl (PR2 "How to test", appended to Task 3's block)**

```bash
curl -s -b c.txt -X PUT -H "$H" -H "$J" -d '{"script":"SAP","exchange":"XETRA","type":"stock","currency":"EUR"}' $B/holdings/<holding id> >/dev/null
curl -s -b c.txt "$B/holdings/<holding id>/transactions" | jq '[.[].currency] | unique'   # ["EUR"]
```

* [ ] **Step 7: Push and open PR2**

```bash
git push -u origin feat/PD-048-dividend-rules
gh pr create --title "✨ Tighten ledger dividend rules and keep event currency in step with the holding" --body-file pr2.md
```

Expected: PR URL.

---

## Task 4: Dividend queries + index (PR3)

**Files:**

* Modify: `backend/internal/persistence/transactions.go`, `backend/internal/db/mongo.go`, `backend/internal/db/mongo_test.go`

* [ ] **Step 1: Extract `find`; add dividend queries (Edit)**

WHY: `ListByHolding` and `ListByUser` repeat one Find + cursor body; the
dividend queries would make it five copies, so it is extracted once (reuse
rule). The dividend order ends on `_id` because one import batch shares one
`created_at`; the service assigns ObjectIDs in sheet order, so `_id` keeps
it. A blank holding currency means INR (`CurrencyOf`) and its ledger events
carry `currency: ""`, so the INR filter must include `""` or those dividends
disappear from the INR tab.

Current:

```go
// ListByHolding returns uid's transactions for one holding, ordered by trade
// date then insertion time — the order the ledger replays in.
func (s *TransactionStore) ListByHolding(ctx context.Context, uid, holdingID primitive.ObjectID) ([]domain.Transaction, error) {
 ctx, cancel := context.WithTimeout(ctx, readTimeout)
 defer cancel()

 opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}})
 cur, err := s.col.Find(ctx, scopedFilter(uid, bson.M{"holding_id": holdingID}), opts)
 if err != nil {
  return nil, err
 }
 defer func() { _ = cur.Close(ctx) }()

 var txns []domain.Transaction
 if err := cur.All(ctx, &txns); err != nil {
  return nil, err
 }
 return txns, nil
}

// ListByUser returns every transaction owned by uid (date-ordered).
func (s *TransactionStore) ListByUser(ctx context.Context, uid primitive.ObjectID) ([]domain.Transaction, error) {
 ctx, cancel := context.WithTimeout(ctx, readTimeout)
 defer cancel()

 opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}})
 cur, err := s.col.Find(ctx, scopedFilter(uid, nil), opts)
 if err != nil {
  return nil, err
 }
 defer func() { _ = cur.Close(ctx) }()

 var txns []domain.Transaction
 if err := cur.All(ctx, &txns); err != nil {
  return nil, err
 }
 return txns, nil
}
```

Replacement:

```go
// replayOrder is the ledger's replay order: trade date, then insertion time.
var replayOrder = bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}}

// dividendOrder extends replayOrder with _id: one import batch shares one
// created_at, and _id (assigned in sheet order) keeps the sheet's order.
var dividendOrder = bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}

// find runs a query and decodes every match in the given order.
func (s *TransactionStore) find(ctx context.Context, filter bson.M, sort bson.D) ([]domain.Transaction, error) {
 ctx, cancel := context.WithTimeout(ctx, readTimeout)
 defer cancel()

 cur, err := s.col.Find(ctx, filter, options.Find().SetSort(sort))
 if err != nil {
  return nil, err
 }
 defer func() { _ = cur.Close(ctx) }()

 var txns []domain.Transaction
 if err := cur.All(ctx, &txns); err != nil {
  return nil, err
 }
 return txns, nil
}

// ListByHolding returns userId's transactions for one holding in replay order.
func (s *TransactionStore) ListByHolding(ctx context.Context, userId, holdingId primitive.ObjectID) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, bson.M{"holding_id": holdingId}), replayOrder)
}

// ListByUser returns every transaction owned by userId in replay order.
func (s *TransactionStore) ListByUser(ctx context.Context, userId primitive.ObjectID) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, nil), replayOrder)
}

// currencyMatch is the stored-currency filter for a tab. Ledger events copy
// the holding's currency, and a blank holding currency means INR
// (CurrencyOf), so the INR tab also matches "".
func currencyMatch(currency string) any {
 if currency == domain.CurrencyINR {
  return bson.M{"$in": bson.A{domain.CurrencyINR, ""}}
 }
 return currency
}

// ListDividends returns userId's dividend events in one currency, in tab order.
func (s *TransactionStore) ListDividends(ctx context.Context, userId primitive.ObjectID, currency string) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, bson.M{
  "type": string(domain.TxnDividend), "currency": currencyMatch(currency),
 }), dividendOrder)
}

// ListAllDividends returns every dividend event of userId in tab order — the
// History overlay's input.
func (s *TransactionStore) ListAllDividends(ctx context.Context, userId primitive.ObjectID) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, bson.M{"type": string(domain.TxnDividend)}), dividendOrder)
}

// ListDividendsByHoldings returns the dividend events of the given holdings
// with from ≤ date ≤ to — the duplicate window of an import.
func (s *TransactionStore) ListDividendsByHoldings(ctx context.Context, userId primitive.ObjectID, holdingIds []primitive.ObjectID, from, to time.Time) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, bson.M{
  "type":       string(domain.TxnDividend),
  "holding_id": bson.M{"$in": holdingIds},
  "date":       bson.M{"$gte": from, "$lte": to},
 }), dividendOrder)
}
```

Add `"time"` to the imports.

* [ ] **Step 2: Index (Edit `internal/db/mongo.go`)**

WHY: the tab query is equality on `user_id`, `type`, `currency`, then the
listing sort; with the keys in this order Mongo walks the index instead of
sorting in memory.

Current:

```go
   {Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "date", Value: -1}, {Key: "created_at", Value: -1}}},
  },
```

Replacement:

```go
   {Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "date", Value: -1}, {Key: "created_at", Value: -1}}},
   // dividend tab + import window (DD-005 §2.2): equality on
   // user_id, type, currency, then dividendOrder's keys in order.
   {Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "type", Value: 1}, {Key: "currency", Value: 1}, {Key: "date", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}},
  },
```

`internal/db/mongo_test.go` asserts the index commands per collection; its
expected `transactions` index count goes from 3 to 4.

* [ ] **Step 3: Verify**

```bash
cd backend && go build ./... && go test ./internal/persistence/ ./internal/db/ ./internal/services/ 2>&1 | grep -E '^(ok|FAIL)'
```

Expected: three `ok` lines (the `find` extraction keeps every ledger test green).

* [ ] **Step 4: Commit**

```bash
git checkout -b feat/PD-048-dividends-view-api main
git add backend/internal/persistence/transactions.go backend/internal/db/mongo.go backend/internal/db/mongo_test.go
git commit -m "✨ Add dividend ledger queries and index"
```

---

## Task 5: Spec — dividend tab (PR3)

**Files:**

* Create: `backend/api/specs/dividends/dividends.yaml`
* Modify: `backend/api/specs/portfolio-api.yaml`, `backend/api/specs/openapi.yaml`, `backend/api/specs/admin/admin.yaml`, `backend/api/models.gen.go`, `backend/api/server.gen.go`

* [ ] **Step 1: Schemas (append under `components.schemas` in `portfolio-api.yaml`)**

WHY: every field is `required` so the generated Go structs carry plain
values, not pointers. Response strings carry a description, not an enum
(DD-004 precedent), so their generated types stay `string`.

```yaml
    DividendRow:
      type: object
      description: One dividend ledger event in a currency tab (PRD-005 §8).
      required: [id, holding_id, script, symbol, date, amount, currency, cumulative, holding_cumulative]
      properties:
        id: { type: string }
        holding_id: { type: string }
        script: { type: string, description: Owning holding's display name }
        symbol: { type: string, description: Owning holding's ticker }
        date: { type: string, format: date }
        amount: { type: number, format: double, description: Cash received, in currency }
        currency: { type: string, description: INR | EUR }
        notes: { type: string }
        cumulative: { type: number, format: double, description: Running total across all holdings in the tab, chronological }
        holding_cumulative: { type: number, format: double, description: Running total for this holding, chronological }
    DividendSummary:
      type: object
      required: [total, count, holdings]
      properties:
        total: { type: number, format: double }
        count: { type: integer }
        holdings: { type: integer, description: Holdings with at least one dividend }
        first_date: { type: string, format: date, nullable: true }
        last_date: { type: string, format: date, nullable: true }
    DividendPeriodTotal:
      type: object
      required: [period, total, count]
      properties:
        period: { type: string, description: YYYY (by_year) or YYYY-MM (by_month) }
        total: { type: number, format: double }
        count: { type: integer }
    DividendHoldingTotal:
      type: object
      required: [holding_id, script, symbol, total, count, share]
      properties:
        holding_id: { type: string }
        script: { type: string }
        symbol: { type: string }
        total: { type: number, format: double }
        count: { type: integer }
        share: { type: number, format: double, description: total ÷ tab total (0–1) }
    DividendView:
      type: object
      required: [rows, summary, by_year, by_month, by_holding]
      properties:
        rows: { type: array, items: { $ref: "#/components/schemas/DividendRow" } }
        summary: { $ref: "#/components/schemas/DividendSummary" }
        by_year: { type: array, items: { $ref: "#/components/schemas/DividendPeriodTotal" } }
        by_month: { type: array, items: { $ref: "#/components/schemas/DividendPeriodTotal" } }
        by_holding: { type: array, description: Biggest total first, items: { $ref: "#/components/schemas/DividendHoldingTotal" } }
```

Under `components.parameters`:

```yaml
    DividendCurrency:
      name: currency
      in: query
      required: true
      schema:
        type: string
        enum: [INR, EUR]
      description: The currency tab
```

* [ ] **Step 2: Paths**

Create `dividends/dividends.yaml`:

```yaml
dividends:
  get:
    tags: [Dividends]
    summary: One currency tab of the caller's dividends
    description: |
      Dividend ledger events of one currency, oldest first, with running
      totals and analytics computed on read (PRD-005 §8).
    operationId: listDividends
    parameters:
      - $ref: "../portfolio-api.yaml#/components/parameters/DividendCurrency"
    responses:
      "200":
        description: The tab
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendView"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
```

`openapi.yaml` — current:

```yaml
  /transactions/{id}:
    $ref: "./transactions/transactions.yaml#/transactions_id"
```

replacement:

```yaml
  /transactions/{id}:
    $ref: "./transactions/transactions.yaml#/transactions_id"
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
```

`admin/admin.yaml` — append:

```yaml
users_id_dividends:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
  get:
    tags: [Admin]
    summary: One currency tab of a user's dividends (act-as)
    operationId: adminListUserDividends
    parameters:
      - $ref: "../portfolio-api.yaml#/components/parameters/DividendCurrency"
    responses:
      "200":
        description: The tab
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendView"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"
```

`openapi.yaml` — current:

```yaml
  /admin/users/{id}/transactions:
    $ref: "./admin/admin.yaml#/users_id_transactions"
```

replacement:

```yaml
  /admin/users/{id}/transactions:
    $ref: "./admin/admin.yaml#/users_id_transactions"
  /admin/users/{id}/dividends:
    $ref: "./admin/admin.yaml#/users_id_dividends"
```

* [ ] **Step 3: Regenerate + verify**

```bash
cd backend && go generate -tags tools ./... && go build ./... 2>&1 | head -3
/usr/bin/grep -n "type DividendView struct\|type ListDividendsParams struct" api/*.gen.go
```

Expected: build fails only with `*Controller does not implement api.StrictServerInterface (missing method AdminListUserDividends)` (handlers land in Task 7); grep prints both types.

* [ ] **Step 4: Stage (no commit yet)**

WHY: the pre-commit `golangci-lint` hook needs a compiling tree, and the
controllers do not compile until Task 7 adds the handlers. The spec is
committed with Task 7.

```bash
git add backend/api/specs/dividends/dividends.yaml backend/api/specs/portfolio-api.yaml backend/api/specs/openapi.yaml backend/api/specs/admin/admin.yaml backend/api/models.gen.go backend/api/server.gen.go
```

Expected: `git status` shows the six files staged.

---

## Task 6: Tab view + analytics (PR3)

**Files:**

* Create: `backend/internal/domain/dividend.go`, `backend/internal/domain/dividend_test.go`, `backend/internal/services/dividend_view.go`, `backend/internal/services/dividend_view_test.go`, `backend/internal/services/dividends.go`
* Modify: `backend/internal/services/mapper.go`

* [ ] **Step 1: `domain/dividend.go`**

WHY: money is summed in integer minor units so 5,000 rows of `0.1` cannot
drift, and `300` vs `300.00` from two parses compare equal (Task 8).

```go
package domain

import "math"

// AmountCents converts a money amount to integer minor units (2 dp). Running
// totals and duplicate keys use it so float noise never changes a result.
func AmountCents(amount float64) int64 { return int64(math.Round(amount * 100)) }

// CentsToMoney converts integer minor units back to a money amount.
func CentsToMoney(cents int64) float64 { return float64(cents) / 100 }
```

* [ ] **Step 2: `domain/dividend_test.go`**

```go
package domain

import "testing"

func TestAmountCents(t *testing.T) {
 if AmountCents(300) != AmountCents(300.004) {
  t.Error("300 and 300.004 must round to the same cents")
 }
 var sum int64
 for range 3 {
  sum += AmountCents(0.1)
 }
 if CentsToMoney(sum) != 0.3 {
  t.Errorf("3 × 0.1 = %v, want 0.3", CentsToMoney(sum))
 }
}
```

* [ ] **Step 3: Mapper — `DividendRowToAPI` (append to `mapper.go`)**

WHY: an orphan event (holding gone) keeps its row with blank labels rather
than being hidden — the DD-004 rule for ledger views.

```go
// DividendRowToAPI maps one dividend event with its holding labels and the two
// running totals computed by buildDividendView. h may be nil (orphan).
func DividendRowToAPI(t domain.Transaction, h *domain.Holding, cumulative, holdingCumulative float64) api.DividendRow {
 var script, symbol string
 if h != nil {
  script, symbol = h.Script, h.Symbol
 }
 return api.DividendRow{
  Id:                t.ID.Hex(),
  HoldingId:         t.HoldingID.Hex(),
  Script:            script,
  Symbol:            symbol,
  Date:              openapi_types.Date{Time: domain.UTCDate(t.Date)},
  Amount:            t.Amount,
  Currency:          t.Currency,
  Notes:             &t.Notes,
  Cumulative:        cumulative,
  HoldingCumulative: holdingCumulative,
 }
}
```

* [ ] **Step 4: `services/dividend_view.go`**

WHY: every number on the page comes out of one pass over the same events, so
the table, the yearly / monthly sums and the per-holding totals cannot
disagree; per-holding totals equal the holding's `total_dividends` because
`RecomputePosition` sums the same events. Pure, so it is tested without
Mongo.

```go
package services

import (
 "cmp"
 "slices"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)

// periodTotals accumulates dividend cents per period (YYYY or YYYY-MM).
// Events arrive chronologically, so first-seen order is ascending.
type periodTotals struct {
 order []string
 cents map[string]int64
 count map[string]int
}

func newPeriodTotals() *periodTotals {
 return &periodTotals{cents: map[string]int64{}, count: map[string]int{}}
}

func (p *periodTotals) add(period string, cents int64) {
 if _, seen := p.cents[period]; !seen {
  p.order = append(p.order, period)
 }
 p.cents[period] += cents
 p.count[period]++
}

func (p *periodTotals) toAPI() []api.DividendPeriodTotal {
 out := make([]api.DividendPeriodTotal, 0, len(p.order))
 for _, period := range p.order {
  out = append(out, api.DividendPeriodTotal{Period: period, Total: domain.CentsToMoney(p.cents[period]), Count: p.count[period]})
 }
 return out
}

// buildDividendView turns one currency's dividend events (tab order) into the
// tab: rows with both running totals, summary, by-year, by-month and
// by-holding totals (PRD-005 §8). Always non-nil slices.
func buildDividendView(txns []domain.Transaction, holdings []domain.Holding) api.DividendView {
 holdingsById := make(map[primitive.ObjectID]*domain.Holding, len(holdings))
 for i := range holdings {
  holdingsById[holdings[i].ID] = &holdings[i]
 }

 view := api.DividendView{Rows: make([]api.DividendRow, 0, len(txns))}
 var totalCents int64
 holdingCents := map[primitive.ObjectID]int64{}
 holdingCount := map[primitive.ObjectID]int{}
 var holdingOrder []primitive.ObjectID
 years, months := newPeriodTotals(), newPeriodTotals()

 for _, t := range txns {
  cents := domain.AmountCents(t.Amount)
  totalCents += cents
  if _, seen := holdingCents[t.HoldingID]; !seen {
   holdingOrder = append(holdingOrder, t.HoldingID)
  }
  holdingCents[t.HoldingID] += cents
  holdingCount[t.HoldingID]++
  day := domain.UTCDate(t.Date)
  years.add(day.Format("2006"), cents)
  months.add(day.Format("2006-01"), cents)
  view.Rows = append(view.Rows, DividendRowToAPI(t, holdingsById[t.HoldingID],
   domain.CentsToMoney(totalCents), domain.CentsToMoney(holdingCents[t.HoldingID])))
 }

 view.ByYear, view.ByMonth = years.toAPI(), months.toAPI()
 view.ByHolding = make([]api.DividendHoldingTotal, 0, len(holdingOrder))
 for _, holdingId := range holdingOrder {
  var script, symbol string
  if h := holdingsById[holdingId]; h != nil {
   script, symbol = h.Script, h.Symbol
  }
  share := 0.0
  if totalCents > 0 {
   share = float64(holdingCents[holdingId]) / float64(totalCents)
  }
  view.ByHolding = append(view.ByHolding, api.DividendHoldingTotal{
   HoldingId: holdingId.Hex(), Script: script, Symbol: symbol,
   Total: domain.CentsToMoney(holdingCents[holdingId]), Count: holdingCount[holdingId], Share: share,
  })
 }
 slices.SortStableFunc(view.ByHolding, func(a, b api.DividendHoldingTotal) int { return cmp.Compare(b.Total, a.Total) })

 view.Summary = api.DividendSummary{Total: domain.CentsToMoney(totalCents), Count: len(txns), Holdings: len(holdingOrder)}
 if len(txns) > 0 {
  first, last := domain.UTCDate(txns[0].Date), domain.UTCDate(txns[len(txns)-1].Date)
  view.Summary.FirstDate, view.Summary.LastDate = apiDate(&first), apiDate(&last)
 }
 return view
}
```

* [ ] **Step 5: `services/dividends.go`**

WHY: the service owns the reads; analytics stay in the pure builder. Two
reads per request (events + holding labels), independent of row count.

```go
package services

import (
 "context"

 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.uber.org/zap"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/logging"
 "portfolio-dashboard/internal/persistence"
)

// DividendsService owns the dividend views over the ledger (PRD-005).
// Dividends are ledger events (type=dividend); single-row writes stay on
// TransactionsService so there is one write path.
type DividendsService struct {
 txns     *persistence.TransactionStore
 holdings *persistence.HoldingStore
 logger   *zap.Logger
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, logger *zap.Logger) *DividendsService {
 return &DividendsService{txns: txns, holdings: holdings, logger: logger}
}

func (s *DividendsService) log(ctx context.Context) *zap.Logger {
 return logging.FromContextOr(ctx, s.logger)
}

// List returns one currency tab of userId's dividends (PRD-005 §8).
func (s *DividendsService) List(ctx context.Context, userId primitive.ObjectID, currency string) (_ api.DividendView, retErr error) {
 ctx, span := tracer.Start(ctx, "DividendsService.List")
 defer endSpan(span, &retErr)
 logger := s.log(ctx)
 txns, err := s.txns.ListDividends(ctx, userId, currency)
 if err != nil {
  logger.Error("list dividends failed", zap.Error(err))
  return api.DividendView{}, err
 }
 holdings, err := s.holdings.ListByUser(ctx, userId)
 if err != nil {
  logger.Error("list holdings for dividends failed", zap.Error(err))
  return api.DividendView{}, err
 }
 return buildDividendView(txns, holdings), nil
}
```

* [ ] **Step 6: `services/dividend_view_test.go`**

```go
package services

import (
 "testing"
 "time"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/internal/domain"
)

func dividendEvent(holdingId primitive.ObjectID, day string, amount float64) domain.Transaction {
 d, _ := time.Parse(time.DateOnly, day)
 return domain.Transaction{ID: primitive.NewObjectID(), HoldingID: holdingId, Type: domain.TxnDividend, Date: d, Amount: amount, Currency: "INR"}
}

func TestBuildDividendView_RunningTotalsAndAnalytics(t *testing.T) {
 tcs, jio := primitive.NewObjectID(), primitive.NewObjectID()
 holdings := []domain.Holding{{ID: tcs, Script: "TCS", Symbol: "TCS.NS"}, {ID: jio, Script: "Jio Platforms Ltd", Symbol: "JIOPLA.NS"}}
 txns := []domain.Transaction{
  dividendEvent(tcs, "2020-01-01", 300),
  dividendEvent(tcs, "2020-01-01", 300),
  dividendEvent(jio, "2020-03-15", 1250.5),
  dividendEvent(tcs, "2021-08-20", 1200),
 }
 view := buildDividendView(txns, holdings)

 wantCum := []float64{300, 600, 1850.5, 3050.5}
 wantHoldingCum := []float64{300, 600, 1250.5, 1800}
 for i, r := range view.Rows {
  if r.Cumulative != wantCum[i] || r.HoldingCumulative != wantHoldingCum[i] {
   t.Errorf("row %d: cumulative %v / holding %v, want %v / %v", i, r.Cumulative, r.HoldingCumulative, wantCum[i], wantHoldingCum[i])
  }
 }
 if view.Rows[2].Script != "Jio Platforms Ltd" {
  t.Errorf("row 2 script = %q, want the holding label", view.Rows[2].Script)
 }
 if len(view.ByYear) != 2 || view.ByYear[0].Period != "2020" || view.ByYear[0].Total != 1850.5 || view.ByYear[1].Total != 1200 {
  t.Errorf("by_year = %+v", view.ByYear)
 }
 if len(view.ByMonth) != 3 || view.ByMonth[0].Period != "2020-01" || view.ByMonth[0].Count != 2 {
  t.Errorf("by_month = %+v", view.ByMonth)
 }
 if view.ByHolding[0].Script != "TCS" || view.ByHolding[0].Total != 1800 || view.ByHolding[1].Total != 1250.5 {
  t.Errorf("by_holding not biggest-first: %+v", view.ByHolding)
 }
 if got := view.ByHolding[0].Share + view.ByHolding[1].Share; got < 0.9999 || got > 1.0001 {
  t.Errorf("shares sum to %v, want 1", got)
 }
 if view.Summary.Total != 3050.5 || view.Summary.Count != 4 || view.Summary.Holdings != 2 {
  t.Errorf("summary = %+v", view.Summary)
 }
 if view.Summary.FirstDate.Format(time.DateOnly) != "2020-01-01" || view.Summary.LastDate.Format(time.DateOnly) != "2021-08-20" {
  t.Errorf("summary dates = %v → %v", view.Summary.FirstDate, view.Summary.LastDate)
 }
}

// The per-holding total must equal what RecomputePosition stores as the
// holding's total_dividends — the no-double-counting guarantee (PRD-005 §9).
func TestBuildDividendView_HoldingTotalMatchesPosition(t *testing.T) {
 tcs := primitive.NewObjectID()
 txns := []domain.Transaction{dividendEvent(tcs, "2020-01-01", 0.1), dividendEvent(tcs, "2020-02-01", 0.1), dividendEvent(tcs, "2020-03-01", 0.1)}
 pos, err := RecomputePosition(txns)
 if err != nil {
  t.Fatal(err)
 }
 view := buildDividendView(txns, []domain.Holding{{ID: tcs, Script: "TCS"}})
 if domain.AmountCents(view.ByHolding[0].Total) != domain.AmountCents(pos.TotalDividends) {
  t.Errorf("by_holding %v ≠ total_dividends %v", view.ByHolding[0].Total, pos.TotalDividends)
 }
}

func TestBuildDividendView_Empty(t *testing.T) {
 view := buildDividendView(nil, nil)
 if view.Rows == nil || view.ByYear == nil || view.ByMonth == nil || view.ByHolding == nil {
  t.Error("an empty tab must serialise as [] not null")
 }
 if view.Summary.FirstDate != nil {
  t.Error("an empty tab has no first date")
 }
}
```

* [ ] **Step 7: Verify**

```bash
cd backend && go test ./internal/domain/ ./internal/services/ -run 'AmountCents|BuildDividendView' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestAmountCents`, `TestBuildDividendView_RunningTotalsAndAnalytics`, `_HoldingTotalMatchesPosition`, `_Empty`.

* [ ] **Step 8: Stage (no commit yet)**

WHY: the tree compiles only once Task 7 adds the handlers (Task 5 Step 4).

```bash
git add backend/internal/domain/dividend.go backend/internal/domain/dividend_test.go backend/internal/services/dividend_view.go backend/internal/services/dividend_view_test.go backend/internal/services/dividends.go backend/internal/services/mapper.go
```

Expected: `git status` shows the six files staged.

---

## Task 7: Controllers — own + act-as tab (PR3)

**Files:**

* Create: `backend/internal/controllers/dividends.go`, `backend/internal/controllers/dividends_test.go`
* Modify: `backend/internal/controllers/controllers.go`, `docs/api.md`

* [ ] **Step 1: Wire the service (Edit `controllers.go`)**

Current:

```go
 history      *services.HistoryService
 gold         *services.GoldService // nil when Postgres is not configured (DD-003 §1) — gold routes answer 503
```

Replacement:

```go
 history      *services.HistoryService
 dividends    *services.DividendsService
 gold         *services.GoldService // nil when Postgres is not configured (DD-003 §1) — gold routes answer 503
```

Current:

```go
  history:      services.NewHistoryService(store.Snapshots, logger),
```

Replacement:

```go
  history:      services.NewHistoryService(store.Snapshots, logger),
  dividends:    services.NewDividendsService(store.Transactions, store.Holdings, logger),
```

* [ ] **Step 2: `controllers/dividends.go`**

WHY: thin handlers, same shape as `transactions.go` / `admin.go`; region
scope comes from `loadTargetUser`, so an out-of-region id reads as 404.

```go
package controllers

import (
 "context"

 "portfolio-dashboard/api"
)

func (h *Controller) ListDividends(ctx context.Context, request api.ListDividendsRequestObject) (api.ListDividendsResponseObject, error) {
 currentUserId, err := currentUserID(ctx)
 if err != nil {
  return nil, err
 }
 view, err := h.dividends.List(ctx, currentUserId, string(request.Params.Currency))
 if err != nil {
  return nil, err
 }
 return api.ListDividends200JSONResponse(view), nil
}

// AdminListUserDividends is the act-as view of a target user's dividend tab.
func (h *Controller) AdminListUserDividends(ctx context.Context, request api.AdminListUserDividendsRequestObject) (api.AdminListUserDividendsResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminListUserDividends404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 view, err := h.dividends.List(ctx, target.ID, string(request.Params.Currency))
 if err != nil {
  return nil, err
 }
 return api.AdminListUserDividends200JSONResponse(view), nil
}
```

* [ ] **Step 3: `controllers/dividends_test.go`**

```go
package controllers

import (
 "testing"

 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.mongodb.org/mongo-driver/mongo/integration/mtest"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)

// The tab query pins the caller, type=dividend and the requested currency.
func TestListDividends_ScopedToCallerAndCurrency(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("EUR tab", func(mt *mtest.T) {
  caller := regionalAdmin("india")
  mt.AddMockResponses(
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch),
  )
  h := newIntegrationHandler(mt, &mockPriceFetcher{})
  resp, err := h.ListDividends(userCtx(caller), api.ListDividendsRequestObject{Params: api.ListDividendsParams{Currency: "EUR"}})
  if err != nil {
   t.Fatalf("ListDividends: %v", err)
  }
  if _, ok := resp.(api.ListDividends200JSONResponse); !ok {
   t.Fatalf("response = %T, want 200", resp)
  }
  filter := findFilter(t, mt) // first find = the transactions query
  if got := filter.Lookup("type").StringValue(); got != "dividend" {
   t.Errorf("type filter = %q, want dividend", got)
  }
  if got := filter.Lookup("currency").StringValue(); got != "EUR" {
   t.Errorf("currency filter = %q, want EUR", got)
  }
  if got := filter.Lookup("user_id").ObjectID(); got != caller.ID {
   t.Errorf("user_id = %s, want caller %s", got.Hex(), caller.ID.Hex())
  }
 })
}

// Act-as is region-scoped: out-of-region reads as 404.
func TestAdminListUserDividends_OutOfRegion404(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("europe target, india admin", func(mt *mtest.T) {
  target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
  mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
  h := newIntegrationHandler(mt, &mockPriceFetcher{})
  resp, err := h.AdminListUserDividends(userCtx(regionalAdmin("india")), api.AdminListUserDividendsRequestObject{
   Id: primitive.NewObjectID().Hex(), Params: api.AdminListUserDividendsParams{Currency: "INR"},
  })
  if err != nil {
   t.Fatalf("AdminListUserDividends: %v", err)
  }
  if _, ok := resp.(api.AdminListUserDividends404JSONResponse); !ok {
   t.Fatalf("response = %T, want 404", resp)
  }
 })
}
```

* [ ] **Step 4: `docs/api.md`** — new "Dividends" section listing
  `GET /api/dividends?currency=INR|EUR` and
  `GET /api/admin/users/{id}/dividends?currency=` with the `DividendView`
  shape and one example row.

* [ ] **Step 5: Verify**

```bash
cd backend && go build ./... && go test ./internal/controllers/ -run 'Dividends' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestListDividends_ScopedToCallerAndCurrency/EUR_tab`, `--- PASS: TestAdminListUserDividends_OutOfRegion404/...`.

* [ ] **Step 6: curl (PR3 "How to test")**

```bash
B=http://localhost:8080/api; H='X-Requested-With: portfolio-dashboard'; J='Content-Type: application/json'
curl -s -c c.txt -H "$H" -H "$J" -d '{"username":"admin","password":"<dev password>"}' $B/auth/login >/dev/null
curl -s -b c.txt -H "$H" -H "$J" -d '{"type":"dividend","date":"2020-01-01T00:00:00Z","amount":300}' $B/holdings/<TCS holding id>/transactions >/dev/null
curl -s -b c.txt "$B/dividends?currency=INR" | jq '.rows[0].cumulative, .summary.total, .by_year[0].period'   # 300, 300, "2020"
curl -s -b c.txt "$B/dividends?currency=EUR" | jq '.rows | length'                                           # 0
```

* [ ] **Step 7: Commit, push, PR3**

```bash
git add backend/internal/controllers/dividends.go backend/internal/controllers/dividends_test.go backend/internal/controllers/controllers.go docs/api.md
git commit -m "✨ Serve the dividend tab with running totals"   # includes the files staged in Tasks 5–6
git push -u origin feat/PD-048-dividends-view-api
gh pr create --title "✨ Serve each currency's dividends with running totals and analytics" --body-file pr3.md
```

Expected: PR URL.

---

## Task 8: Duplicate key + holding aliases (PR4)

**Files:**

* Modify: `backend/internal/domain/dividend.go`, `backend/internal/domain/dividend_test.go`, `backend/internal/domain/holding.go`

* [ ] **Step 1: `DividendKey` (Edit `domain/dividend.go`)**

WHY: the PRD-005 §5 identity lives in `domain` so preview and confirm cannot
disagree on it. The sheet's cumulative is deliberately absent.

Current:

```go
package domain

import "math"
```

Replacement:

```go
package domain

import (
 "math"
 "time"

 "go.mongodb.org/mongo-driver/bson/primitive"
)

// DividendKey is the PRD-005 §5 duplicate identity: holding, calendar day and
// amount in minor units. The sheet's cumulative is never part of it.
type DividendKey struct {
 HoldingId primitive.ObjectID
 Day       string // YYYY-MM-DD
 Cents     int64
}

// DividendKeyOf returns the duplicate identity of a stored dividend event.
func DividendKeyOf(t Transaction) DividendKey {
 return DividendKey{HoldingId: t.HoldingID, Day: UTCDate(t.Date).Format(time.DateOnly), Cents: AmountCents(t.Amount)}
}
```

* [ ] **Step 2: `Holding.Aliases` (Edit `domain/holding.go`)**

Current:

```go
 Currency       string             `bson:"currency" json:"currency"`               // "INR" or "EUR"; defaults to "INR"
```

Replacement:

```go
 Currency       string             `bson:"currency" json:"currency"`               // "INR" or "EUR"; defaults to "INR"
 // Aliases are sheet names (exactKey: lower-case, spaces collapsed) the owner confirmed as this
 // holding during a dividend import (PRD-005 §6.3); later imports map them
 // automatically. Written only by the import commit, never derived.
 Aliases []string `bson:"aliases,omitempty" json:"-"`
```

* [ ] **Step 3: Test (Edit `domain/dividend_test.go`)**

Current:

```go
import "testing"
```

Replacement:

```go
import (
 "testing"
 "time"

 "go.mongodb.org/mongo-driver/bson/primitive"
)
```

Append:

```go
func TestDividendKeyOf(t *testing.T) {
 h := primitive.NewObjectID()
 day := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
 a := Transaction{HoldingID: h, Date: day, Amount: 300}
 b := Transaction{HoldingID: h, Date: day.Add(13 * time.Hour), Amount: 300.004}
 if DividendKeyOf(a) != DividendKeyOf(b) {
  t.Error("same holding, day and amount at 2 dp must share a key")
 }
 if DividendKeyOf(a) == DividendKeyOf(Transaction{HoldingID: h, Date: day.AddDate(0, 0, 1), Amount: 300}) {
  t.Error("a different day is a different dividend")
 }
 if DividendKeyOf(a) == DividendKeyOf(Transaction{HoldingID: primitive.NewObjectID(), Date: day, Amount: 300}) {
  t.Error("a different holding is a different dividend")
 }
}
```

* [ ] **Step 4: Verify**

```bash
cd backend && go test ./internal/domain/ -run 'DividendKey|AmountCents' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestDividendKeyOf`, `--- PASS: TestAmountCents`.

* [ ] **Step 5: Commit**

```bash
git checkout -b feat/PD-048-dividends-preview-api main
git add backend/internal/domain/dividend.go backend/internal/domain/dividend_test.go backend/internal/domain/holding.go
git commit -m "✨ Add the dividend duplicate key and aliases"
```

---

## Task 9: Spec — preview (PR4)

**Files:**

* Modify: `backend/api/specs/portfolio-api.yaml`, `backend/api/specs/dividends/dividends.yaml`, `backend/api/specs/openapi.yaml`, `backend/api/specs/admin/admin.yaml`, generated files

* [ ] **Step 1: Schemas (append to `portfolio-api.yaml`)**

WHY: `mappings` carries the popup answers keyed by sheet name (`null` =
leave unresolved). The client sends only the rows it could parse — its own
parse errors are added to the counts client-side — so `date` is a real date.

```yaml
    DividendImportRow:
      type: object
      required: [line, date, share_name, amount]
      properties:
        line: { type: integer, description: 1-based file line (header = 1) }
        date: { type: string, format: date }
        share_name: { type: string }
        amount: { type: number, format: double }
        cumulative: { type: number, format: double, nullable: true, description: The sheet's CUMULATIVE cell — warnings only }
    DividendImportInput:
      type: object
      required: [currency, rows]
      properties:
        currency: { type: string, enum: [INR, EUR] }
        rows: { type: array, maxItems: 5000, items: { $ref: "#/components/schemas/DividendImportRow" } }
        mappings:
          type: object
          description: Popup answers by sheet name — a holding id, or null to leave unresolved
          additionalProperties: { type: string, nullable: true }
    DividendSuggestion:
      type: object
      required: [holding_id, script, symbol, score]
      properties:
        holding_id: { type: string }
        script: { type: string }
        symbol: { type: string }
        score: { type: number, format: double }
    DividendNameResolution:
      type: object
      required: [sheet_name, rows, status, suggestions]
      properties:
        sheet_name: { type: string }
        rows: { type: integer }
        status: { type: string, description: auto | confirmed | needs_confirmation | ambiguous | unresolved }
        holding_id: { type: string }
        matched_by: { type: string, description: script | alias (auto only; a symbol never auto-matches) }
        suggestions: { type: array, items: { $ref: "#/components/schemas/DividendSuggestion" } }
        preselect: { type: string, description: Suggested holding id when it is a clear best }
    DividendImportRowStatus:
      type: object
      required: [line, status]
      properties:
        line: { type: integer }
        status: { type: string, description: ready | duplicate | invalid }
        holding_id: { type: string }
        reason: { type: string }
    DividendImportWarning:
      type: object
      required: [line, message]
      properties:
        line: { type: integer }
        message: { type: string }
    DividendImportCounts:
      type: object
      required: [ready, duplicate, invalid, total]
      properties:
        ready: { type: integer }
        duplicate: { type: integer }
        invalid: { type: integer }
        total: { type: integer }
    DividendImportPreview:
      type: object
      required: [counts, names, rows, warnings]
      properties:
        counts: { $ref: "#/components/schemas/DividendImportCounts" }
        names: { type: array, items: { $ref: "#/components/schemas/DividendNameResolution" } }
        rows: { type: array, items: { $ref: "#/components/schemas/DividendImportRowStatus" } }
        warnings: { type: array, items: { $ref: "#/components/schemas/DividendImportWarning" } }
```

* [ ] **Step 2: Paths**

Append to `dividends/dividends.yaml`:

```yaml
dividends_import_preview:
  post:
    tags: [Dividends]
    summary: Evaluate a dividend CSV import without writing anything
    operationId: previewDividendImport
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/DividendImportInput"
    responses:
      "200":
        description: What an import would do now
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendImportPreview"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
```

Append to `admin/admin.yaml`:

```yaml
users_id_dividends_import_preview:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
  post:
    tags: [Admin]
    summary: Evaluate a dividend import for a user (act-as)
    operationId: adminPreviewUserDividendImport
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/DividendImportInput"
    responses:
      "200":
        description: What an import would do now
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendImportPreview"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"
```

`openapi.yaml` — current:

```yaml
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
```

replacement:

```yaml
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
  /dividends/import/preview:
    $ref: "./dividends/dividends.yaml#/dividends_import_preview"
```

current:

```yaml
  /admin/users/{id}/dividends:
    $ref: "./admin/admin.yaml#/users_id_dividends"
```

replacement:

```yaml
  /admin/users/{id}/dividends:
    $ref: "./admin/admin.yaml#/users_id_dividends"
  /admin/users/{id}/dividends/import/preview:
    $ref: "./admin/admin.yaml#/users_id_dividends_import_preview"
```

* [ ] **Step 3: Regenerate + verify**

```bash
cd backend && go generate -tags tools ./... && /usr/bin/grep -n "type DividendImportPreview struct\|type DividendNameResolution struct" api/models.gen.go
```

Expected: both types printed. (`go build` fails only on the two missing
preview handlers until Task 11.)

* [ ] **Step 4: Stage (no commit yet)**

WHY: same as Task 5 Step 4 — the tree compiles only once Task 11 adds the
preview handlers, so the spec is committed with Task 11.

```bash
git add backend/api/specs/portfolio-api.yaml backend/api/specs/dividends/dividends.yaml backend/api/specs/openapi.yaml backend/api/specs/admin/admin.yaml backend/api/models.gen.go backend/api/server.gen.go
```

Expected: `git status` shows the six files staged.

---

## Task 10: Name resolution (PR4)

**Files:**

* Create: `backend/internal/services/dividend_match.go`, `backend/internal/services/dividend_match_test.go`

* [ ] **Step 1: `dividend_match.go`**

WHY: owner decision 13 (PRD-005 §13) — with the holding Jio Platforms Ltd /
JIOPLA.NS, the sheet names `jio`, `JLP`, `Jio Platforms Limited` and
`JIOPLA` must all be confirmed in a popup. So the only silent matches are the
holding's display name (ignoring case and extra spaces) and a name the owner
confirmed before (alias). Everything else — symbols, punctuation, legal and
exchange suffixes, fuzzy names — is a suggestion; a symbol match is the
strongest suggestion and is pre-selected, but still waits for the owner
(PRD-005 §6.2). Only holdings in the
tab's currency are candidates, so an INR dividend can never land on an EUR
holding. Mappings are keyed by the sheet name as displayed (`sheetName`).

```go
package services

import (
 "cmp"
 "regexp"
 "slices"
 "strings"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)

// Share-name → holding resolution for dividend imports (PRD-005 §6, DD-005
// §2.3). Pure: no store access.

var (
 exchangeSuffix = regexp.MustCompile(`\.(ns|bo)$`)
 nonAlnum       = regexp.MustCompile(`[^a-z0-9]+`)
 corpWords      = map[string]bool{"limited": true, "ltd": true, "inc": true, "plc": true, "corp": true, "corporation": true, "company": true, "co": true, "the": true}
)

const (
 minSuggestionScore = 0.3
 preselectScore     = 0.8
 preselectLead      = 0.15
 maxSuggestions     = 3
)

// Resolution statuses (DividendNameResolution.status).
const (
 nameAuto              = "auto"
 nameConfirmed         = "confirmed"
 nameNeedsConfirmation = "needs_confirmation"
 nameAmbiguous         = "ambiguous"
 nameUnresolved        = "unresolved"
)

// sheetName is a Share Name as displayed and as the mappings key: trimmed,
// inner whitespace collapsed.
func sheetName(s string) string { return strings.Join(strings.Fields(s), " ") }

// exactKey is the only normalisation an automatic match allows: letter case
// and extra spaces. Punctuation, legal suffixes (Ltd/Limited) and exchange
// suffixes (.NS/.BO) are differences the owner confirms in the popup
// (PRD-005 §6, owner decision 13). Aliases are stored as exactKey.
func exactKey(s string) string { return strings.ToLower(strings.Join(strings.Fields(s), " ")) }

// nameKey is the looser key for suggestions only: lower-case, exchange suffix
// dropped, punctuation → space, whitespace collapsed. Never used to auto-match.
func nameKey(s string) string {
 k := exchangeSuffix.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
 return strings.Join(strings.Fields(nonAlnum.ReplaceAllString(k, " ")), " ")
}

// corpKey is nameKey without corporate filler words; suggestions only.
func corpKey(s string) string {
 var kept []string
 for _, w := range strings.Fields(nameKey(s)) {
  if !corpWords[w] {
   kept = append(kept, w)
  }
 }
 return strings.Join(kept, " ")
}

func compact(s string) string { return strings.ReplaceAll(s, " ", "") }

// tokenPrefix reports whether every token of the shorter phrase prefixes the
// token at the same position in the longer ("jio" ↔ "jio platforms").
func tokenPrefix(a, b string) bool {
 ta, tb := strings.Fields(a), strings.Fields(b)
 if len(ta) == 0 || len(tb) == 0 {
  return false
 }
 short, long := ta, tb
 if len(ta) > len(tb) {
  short, long = tb, ta
 }
 for i, t := range short {
  if !strings.HasPrefix(long[i], t) {
   return false
  }
 }
 return true
}

// initials is the first letter of each token ("jio platforms ltd" → "jpl").
func initials(s string) string {
 var b strings.Builder
 for _, w := range strings.Fields(s) {
  b.WriteByte(w[0])
 }
 return b.String()
}

// trigramJaccard is |A∩B| / |A∪B| over padded character trigrams.
func trigramJaccard(a, b string) float64 {
 grams := func(s string) map[string]bool {
  p := "  " + compact(s) + " "
  out := map[string]bool{}
  for i := 0; i+3 <= len(p); i++ {
   out[p[i:i+3]] = true
  }
  return out
 }
 ga, gb := grams(a), grams(b)
 inter := 0
 for g := range ga {
  if gb[g] {
   inter++
  }
 }
 union := len(ga) + len(gb) - inter
 if union == 0 {
  return 0
 }
 return float64(inter) / float64(union)
}

// suggestionScore rates how likely a sheet name means holding h (0–1). A
// score is only ever a suggestion; it is never applied without the user —
// not even a sheet name equal to the symbol ("JIOPLA" ↔ "JIOPLA.NS"), which
// scores highest and is pre-selected but still waits for confirmation.
func suggestionScore(name string, h domain.Holding) float64 {
 s, script, symbol := corpKey(name), corpKey(h.Script), compact(nameKey(h.Symbol))
 best := trigramJaccard(s, script)
 if sym := compact(nameKey(name)); sym != "" && sym == symbol {
  best = max(best, 0.98)
 }
 if s != "" && s == script {
  best = max(best, 0.95)
 }
 if tokenPrefix(s, script) || (len(compact(s)) >= 4 && strings.HasPrefix(symbol, compact(s))) {
  best = max(best, 0.8)
 }
 if len(compact(s)) >= 2 && compact(s) == initials(nameKey(h.Script)) {
  best = max(best, 0.7)
 }
 return best
}

// nameCount is one distinct sheet name and how many rows use it.
type nameCount struct {
 name string
 rows int
}

// countNames lists distinct sheet names in first-appearance order.
func countNames(rows []api.DividendImportRow) []nameCount {
 index := map[string]int{}
 var out []nameCount
 for _, r := range rows {
  n := sheetName(r.ShareName)
  if n == "" {
   continue
  }
  if i, ok := index[n]; ok {
   out[i].rows++
   continue
  }
  index[n] = len(out)
  out = append(out, nameCount{name: n, rows: 1})
 }
 return out
}

// nameResolution is one sheet name's outcome. holding is set for auto and
// confirmed; a confirmed answer becomes an alias when the import commits.
type nameResolution struct {
 view      api.DividendNameResolution
 holding   *domain.Holding
 saveAlias bool
}

type exactMatch struct {
 holding *domain.Holding
 by      string
}

// resolveNames resolves each sheet name against candidates (the tab's
// currency only), honouring the user's popup answers in mappings: a holding
// id confirms, nil leaves the name unresolved.
func resolveNames(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
 exact := map[string][]exactMatch{}
 holdingsById := map[string]*domain.Holding{}
 for i := range candidates {
  h := &candidates[i]
  holdingsById[h.ID.Hex()] = h
  add := func(key, by string) {
   if key == "" {
    return
   }
   for _, m := range exact[key] {
    if m.holding.ID == h.ID {
     return
    }
   }
   exact[key] = append(exact[key], exactMatch{holding: h, by: by})
  }
  // Automatic matches: the display name (case/space-insensitive) or a name
  // the owner confirmed before. The symbol is deliberately absent — a
  // symbol-shaped sheet name is a suggestion (suggestionScore), not a match.
  add(exactKey(h.Script), "script")
  for _, alias := range h.Aliases {
   add(alias, "alias")
  }
 }

 out := make([]nameResolution, 0, len(names))
 for _, n := range names {
  res := nameResolution{view: api.DividendNameResolution{SheetName: n.name, Rows: n.rows, Suggestions: []api.DividendSuggestion{}}}
  matches := exact[exactKey(n.name)]

  if answer, answered := mappings[n.name]; answered {
   if h := lookupAnswer(answer, holdingsById); h == nil {
    res.view.Status = nameUnresolved
   } else {
    id := h.ID.Hex()
    res.view.Status, res.view.HoldingId, res.holding = nameConfirmed, &id, h
    res.saveAlias = !(len(matches) == 1 && matches[0].holding.ID == h.ID)
   }
   out = append(out, res)
   continue
  }

  switch {
  case len(matches) == 1:
   id, by := matches[0].holding.ID.Hex(), matches[0].by
   res.view.Status, res.holding = nameAuto, matches[0].holding
   res.view.HoldingId, res.view.MatchedBy = &id, &by
  case len(matches) > 1:
   res.view.Status = nameAmbiguous
   for _, m := range matches {
    res.view.Suggestions = append(res.view.Suggestions, suggestionOf(m.holding, 1))
   }
  default:
   res.view.Status = nameNeedsConfirmation
   res.view.Suggestions, res.view.Preselect = suggest(n.name, candidates)
  }
  out = append(out, res)
 }
 return out
}

func lookupAnswer(answer *string, holdingsById map[string]*domain.Holding) *domain.Holding {
 if answer == nil {
  return nil
 }
 return holdingsById[*answer]
}

func suggestionOf(h *domain.Holding, score float64) api.DividendSuggestion {
 return api.DividendSuggestion{HoldingId: h.ID.Hex(), Script: h.Script, Symbol: h.Symbol, Score: score}
}

// suggest ranks candidates for a non-exact name and pre-selects the top one
// only when it is a clear best (≥ preselectScore and ahead by preselectLead).
func suggest(name string, candidates []domain.Holding) ([]api.DividendSuggestion, *string) {
 out := []api.DividendSuggestion{}
 for i := range candidates {
  if score := suggestionScore(name, candidates[i]); score >= minSuggestionScore {
   out = append(out, suggestionOf(&candidates[i], score))
  }
 }
 slices.SortStableFunc(out, func(a, b api.DividendSuggestion) int { return cmp.Compare(b.Score, a.Score) })
 if len(out) > maxSuggestions {
  out = out[:maxSuggestions]
 }
 if len(out) == 0 || out[0].Score < preselectScore || (len(out) > 1 && out[0].Score-out[1].Score < preselectLead) {
  return out, nil
 }
 id := out[0].HoldingId
 return out, &id
}

// confirmedAliases groups the names to save as aliases by holding.
func confirmedAliases(names []nameResolution) map[primitive.ObjectID][]string {
 out := map[primitive.ObjectID][]string{}
 for _, n := range names {
  if n.saveAlias && n.holding != nil {
   out[n.holding.ID] = append(out[n.holding.ID], exactKey(n.view.SheetName))
  }
 }
 return out
}
```

* [ ] **Step 2: `dividend_match_test.go`**

```go
package services

import (
 "testing"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/internal/domain"
)

func matchHoldings() []domain.Holding {
 return []domain.Holding{
  {ID: primitive.NewObjectID(), Script: "Jio Platforms Ltd", Symbol: "JIOPLA.NS", Currency: "INR"},
  {ID: primitive.NewObjectID(), Script: "TCS", Symbol: "TCS.NS", Currency: "INR"},
 }
}

func resolveOne(name string, candidates []domain.Holding, mappings map[string]*string) nameResolution {
 return resolveNames([]nameCount{{name: name, rows: 1}}, candidates, mappings)[0]
}

// Only the display name (case/space-insensitive) or a confirmed alias maps
// without the popup.
func TestResolveNames_ExactIsAuto(t *testing.T) {
 hs := matchHoldings()
 for _, name := range []string{"TCS", " tcs ", "Jio Platforms Ltd", "jio  platforms ltd"} {
  r := resolveOne(sheetName(name), hs, nil)
  if r.view.Status != nameAuto || r.view.MatchedBy == nil || *r.view.MatchedBy != "script" {
   t.Errorf("%q: status %s, want auto by script", name, r.view.Status)
  }
 }
 hs[0].Aliases = []string{exactKey("JIOPLA")}
 if r := resolveOne("JIOPLA", hs, nil); r.view.Status != nameAuto || *r.view.MatchedBy != "alias" {
  t.Errorf("confirmed alias: status %s, want auto by alias", r.view.Status)
 }
}

// The owner's own example (decision 13): with the holding Jio Platforms Ltd /
// JIOPLA.NS, the sheet names jio, JLP, Jio Platforms Limited and JIOPLA all go
// to the popup — including the symbol-shaped JIOPLA. Punctuation and exchange
// suffix differences do too.
func TestResolveNames_InconsistentNamesNeedConfirmation(t *testing.T) {
 hs := matchHoldings()
 jio, tcs := hs[0].ID.Hex(), hs[1].ID.Hex()
 for _, name := range []string{"jio", "Jio Platforms Limited", "JLP", "JIOPLA", "JIOPLA.NS", "Jio Platforms Ltd.", "tcs.ns"} {
  r := resolveOne(name, hs, nil)
  if r.view.Status != nameNeedsConfirmation || r.holding != nil {
   t.Errorf("%q: status %s holding %v, want needs_confirmation and no holding", name, r.view.Status, r.holding)
  }
 }
 if r := resolveOne("tcs.ns", hs, nil); r.view.Preselect == nil || *r.view.Preselect != tcs {
  t.Error(`"tcs.ns": want TCS pre-selected (symbol match), still awaiting confirmation`)
 }
 for _, name := range []string{"jio", "Jio Platforms Limited", "JIOPLA", "Jio Platforms Ltd."} {
  r := resolveOne(name, hs, nil)
  if len(r.view.Suggestions) == 0 || r.view.Suggestions[0].HoldingId != jio {
   t.Errorf("%q: suggestions %+v, want Jio Platforms first", name, r.view.Suggestions)
  }
  if r.view.Preselect == nil || *r.view.Preselect != jio {
   t.Errorf("%q: want Jio Platforms preselected (clear best)", name)
  }
 }
}

func TestResolveNames_NoPreselectWithoutClearBest(t *testing.T) {
 hs := append(matchHoldings(), domain.Holding{ID: primitive.NewObjectID(), Script: "Jio Financial", Symbol: "JIOFIN.NS", Currency: "INR"})
 if r := resolveOne("jio", hs, nil); r.view.Preselect != nil {
  t.Error("two equal suggestions must not pre-select one")
 }
}

func TestResolveNames_Ambiguous(t *testing.T) {
 hs := []domain.Holding{
  {ID: primitive.NewObjectID(), Script: "Reliance", Symbol: "RELIANCE.NS"},
  {ID: primitive.NewObjectID(), Script: "Reliance", Symbol: "RELIANCE.BO"},
 }
 r := resolveOne("Reliance", hs, nil)
 if r.view.Status != nameAmbiguous || r.view.Preselect != nil || len(r.view.Suggestions) != 2 {
  t.Errorf("got %s preselect=%v suggestions=%d, want ambiguous, none, 2", r.view.Status, r.view.Preselect, len(r.view.Suggestions))
 }
}

func TestResolveNames_Answers(t *testing.T) {
 hs := matchHoldings()
 jio := hs[0].ID.Hex()
 r := resolveOne("JLP", hs, map[string]*string{"JLP": &jio})
 if r.view.Status != nameConfirmed || r.holding == nil || !r.saveAlias {
  t.Errorf("confirmed answer: %+v saveAlias=%v", r.view, r.saveAlias)
 }
 if got := confirmedAliases([]nameResolution{r}); len(got[hs[0].ID]) != 1 || got[hs[0].ID][0] != "jlp" {
  t.Errorf("aliases = %v, want jlp on Jio", got)
 }
 if r := resolveOne("JLP", hs, map[string]*string{"JLP": nil}); r.view.Status != nameUnresolved {
  t.Errorf("nil answer: status %s, want unresolved", r.view.Status)
 }
 foreign := primitive.NewObjectID().Hex()
 if r := resolveOne("JLP", hs, map[string]*string{"JLP": &foreign}); r.view.Status != nameUnresolved {
  t.Error("an answer outside the tab's holdings must not resolve")
 }
 tcs := hs[1].ID.Hex()
 if r := resolveOne("TCS", hs, map[string]*string{"TCS": &tcs}); r.saveAlias {
  t.Error("confirming the exact match must not save a redundant alias")
 }
}
```

* [ ] **Step 3: Verify**

```bash
cd backend && go vet ./internal/services/ && go test ./internal/services/ -run ResolveNames -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: five `--- PASS: TestResolveNames_*`. (`go vet` of the package
passes; the controllers package still misses the preview handlers until
Task 11.)

* [ ] **Step 4: Stage (no commit yet)**

WHY: the tree compiles only once Task 11 adds the preview handlers.

```bash
git add backend/internal/services/dividend_match.go backend/internal/services/dividend_match_test.go
```

Expected: `git status` shows both files staged.

---

## Task 11: Preview (PR4)

**Files:**

* Create: `backend/internal/services/dividend_import.go`, `backend/internal/services/dividend_import_test.go`
* Modify: `backend/internal/services/dividends.go`, `backend/internal/controllers/dividends.go`, `backend/internal/controllers/dividends_test.go`, `docs/api.md`

* [ ] **Step 1: `dividend_import.go` — pure pieces**

WHY: occurrence counting (each stored dividend absorbs one sheet row) gives
PRD-005 §5 scenarios A–D exactly, and stored dividends entered by hand count
too — so a ledger-editor dividend and the same sheet line never become two
records. Cumulative only feeds warnings.

```go
package services

import (
 "cmp"
 "fmt"
 "slices"
 "strings"
 "time"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)

const maxImportRows = 5000

// importRow is a valid sheet row resolved to a holding.
type importRow struct {
 in      api.DividendImportRow
 day     time.Time
 holding *domain.Holding
}

func (r importRow) key() domain.DividendKey {
 return domain.DividendKey{HoldingId: r.holding.ID, Day: r.day.Format(time.DateOnly), Cents: domain.AmountCents(r.in.Amount)}
}

// partition splits valid rows (sheet order) into new and duplicate by
// occurrence: each stored dividend with the same key absorbs one sheet row;
// sheet repeats beyond the stored count are new (PRD-005 §5 A–D).
func partition(rows []importRow, existing []domain.Transaction) (fresh, dups []importRow) {
 remaining := make(map[domain.DividendKey]int, len(existing))
 for _, t := range existing {
  remaining[domain.DividendKeyOf(t)]++
 }
 for _, r := range rows {
  if k := r.key(); remaining[k] > 0 {
   remaining[k]--
   dups = append(dups, r)
   continue
  }
  fresh = append(fresh, r)
 }
 return fresh, dups
}

// window returns the date range and holdings the duplicate lookup must cover.
func window(rows []importRow) (from, to time.Time, holdingIds []primitive.ObjectID) {
 seen := map[primitive.ObjectID]bool{}
 from, to = rows[0].day, rows[0].day
 for _, r := range rows {
  if r.day.Before(from) {
   from = r.day
  }
  if r.day.After(to) {
   to = r.day
  }
  if !seen[r.holding.ID] {
   seen[r.holding.ID] = true
   holdingIds = append(holdingIds, r.holding.ID)
  }
 }
 return from, to.Add(24*time.Hour - time.Nanosecond), holdingIds
}

// cumulativeWarnings checks the sheet's running total (PRD-005 §7.2): with
// every row carrying a cumulative and dates in order, each cumulative should
// equal the previous one plus this row's dividend. Mismatches are warnings;
// they never change a row's status.
func cumulativeWarnings(rows []api.DividendImportRow) []api.DividendImportWarning {
 warnings := []api.DividendImportWarning{}
 if len(rows) < 2 {
  return warnings
 }
 for _, r := range rows {
  if r.Cumulative == nil {
   return warnings
  }
 }
 for i := 1; i < len(rows); i++ {
  if rows[i].Date.Before(rows[i-1].Date.Time) {
   return []api.DividendImportWarning{{Line: rows[i].Line, Message: "rows are not in date order, so the CUMULATIVE check was skipped"}}
  }
 }
 for i := 1; i < len(rows); i++ {
  expected := domain.AmountCents(*rows[i-1].Cumulative) + domain.AmountCents(rows[i].Amount)
  got := domain.AmountCents(*rows[i].Cumulative)
  if diff := got - expected; diff > 1 || diff < -1 {
   warnings = append(warnings, api.DividendImportWarning{Line: rows[i].Line,
    Message: fmt.Sprintf("CUMULATIVE is %.2f, expected %.2f", domain.CentsToMoney(got), domain.CentsToMoney(expected))})
  }
 }
 return warnings
}

// reasonOf strips the ErrValidation prefix for display.
func reasonOf(err error) string {
 return strings.TrimPrefix(err.Error(), ErrValidation.Error()+": ")
}

// buildPreview assembles the response: counts, names, per-line statuses.
func buildPreview(names []nameResolution, fresh, dups []importRow, invalid []api.DividendImportRowStatus, warnings []api.DividendImportWarning) api.DividendImportPreview {
 rows := make([]api.DividendImportRowStatus, 0, len(fresh)+len(dups)+len(invalid))
 add := func(rs []importRow, status string) {
  for _, r := range rs {
   id := r.holding.ID.Hex()
   rows = append(rows, api.DividendImportRowStatus{Line: r.in.Line, Status: status, HoldingId: &id})
  }
 }
 add(fresh, "ready")
 add(dups, "duplicate")
 rows = append(rows, invalid...)
 slices.SortFunc(rows, func(a, b api.DividendImportRowStatus) int { return cmp.Compare(a.Line, b.Line) })

 views := make([]api.DividendNameResolution, 0, len(names))
 for _, n := range names {
  views = append(views, n.view)
 }
 return api.DividendImportPreview{
  Counts:   api.DividendImportCounts{Ready: len(fresh), Duplicate: len(dups), Invalid: len(invalid), Total: len(rows)},
  Names:    views,
  Rows:     rows,
  Warnings: warnings,
 }
}
```

* [ ] **Step 2: `evaluate` + `Preview` (Edit `dividends.go`)**

WHY: `evaluate` is the one pipeline behind preview and (Task 14) the
confirm, so the two can never disagree. `today` is a field so tests pin it.

Current:

```go
import (
 "context"

 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.uber.org/zap"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/logging"
 "portfolio-dashboard/internal/persistence"
)
```

Replacement:

```go
import (
 "context"
 "fmt"
 "time"

 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.uber.org/zap"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
 "portfolio-dashboard/internal/logging"
 "portfolio-dashboard/internal/persistence"
)
```

Current:

```go
type DividendsService struct {
 txns     *persistence.TransactionStore
 holdings *persistence.HoldingStore
 logger   *zap.Logger
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, logger *zap.Logger) *DividendsService {
 return &DividendsService{txns: txns, holdings: holdings, logger: logger}
}
```

Replacement:

```go
type DividendsService struct {
 txns     *persistence.TransactionStore
 holdings *persistence.HoldingStore
 logger   *zap.Logger
 today    func() time.Time // IST calendar day; tests pin it
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, logger *zap.Logger) *DividendsService {
 return &DividendsService{txns: txns, holdings: holdings, logger: logger, today: istToday}
}
```

Append:

```go
// importPlan is an evaluated import: what preview shows, what confirm writes.
type importPlan struct {
 preview api.DividendImportPreview
 fresh   []importRow
 dups    []importRow
 aliases map[primitive.ObjectID][]string
}

// checkImportInput rejects malformed requests (400) before any read.
func checkImportInput(in api.DividendImportInput) error {
 if !ValidCurrency(in.Currency) {
  return fmt.Errorf("%w: currency must be INR or EUR", ErrValidation)
 }
 if len(in.Rows) > maxImportRows {
  return fmt.Errorf("%w: more than %d rows — split the file", ErrValidation, maxImportRows)
 }
 return nil
}

// evaluate runs validation, name resolution, the duplicate lookup and the
// cumulative check. Reads only.
func (s *DividendsService) evaluate(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (importPlan, error) {
 currency := string(in.Currency)
 holdings, err := s.holdings.ListByUser(ctx, userId)
 if err != nil {
  return importPlan{}, err
 }
 candidates := make([]domain.Holding, 0, len(holdings))
 for _, h := range holdings {
  if c, ok := CurrencyOf(h); ok && c == currency {
   candidates = append(candidates, h)
  }
 }
 var mappings map[string]*string
 if in.Mappings != nil {
  mappings = *in.Mappings
 }
 names := resolveNames(countNames(in.Rows), candidates, mappings)
 byName := make(map[string]nameResolution, len(names))
 for _, n := range names {
  byName[n.view.SheetName] = n
 }

 today := s.today()
 var valid []importRow
 invalid := []api.DividendImportRowStatus{}
 for _, r := range in.Rows {
  name := sheetName(r.ShareName)
  reason := ""
  if name == "" {
   reason = "Share Name is empty"
  } else if err := validateDividend(r.Date.Time, r.Amount, today); err != nil {
   reason = reasonOf(err)
  } else if byName[name].holding == nil {
   reason = fmt.Sprintf("no holding chosen for %q", name)
  }
  if reason != "" {
   invalid = append(invalid, api.DividendImportRowStatus{Line: r.Line, Status: "invalid", Reason: &reason})
   continue
  }
  valid = append(valid, importRow{in: r, day: domain.UTCDate(r.Date.Time), holding: byName[name].holding})
 }

 plan := importPlan{aliases: confirmedAliases(names)}
 if len(valid) > 0 {
  from, to, holdingIds := window(valid)
  existing, err := s.txns.ListDividendsByHoldings(ctx, userId, holdingIds, from, to)
  if err != nil {
   return importPlan{}, err
  }
  plan.fresh, plan.dups = partition(valid, existing)
 }
 plan.preview = buildPreview(names, plan.fresh, plan.dups, invalid, cumulativeWarnings(in.Rows))
 return plan, nil
}

// Preview evaluates an import without writing anything (PRD-005 §7).
func (s *DividendsService) Preview(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (_ api.DividendImportPreview, retErr error) {
 ctx, span := tracer.Start(ctx, "DividendsService.Preview")
 defer endSpan(span, &retErr)
 logger := s.log(ctx)
 if err := checkImportInput(in); err != nil {
  return api.DividendImportPreview{}, err
 }
 plan, err := s.evaluate(ctx, userId, in)
 if err != nil {
  logger.Error("dividend import preview failed", zap.Error(err))
  return api.DividendImportPreview{}, err
 }
 return plan.preview, nil
}
```

* [ ] **Step 3: Controller (Edit `controllers/dividends.go`)**

Current:

```go
import (
 "context"

 "portfolio-dashboard/api"
)
```

Replacement:

```go
import (
 "context"
 "errors"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/services"
)
```

Append:

```go
func (h *Controller) PreviewDividendImport(ctx context.Context, request api.PreviewDividendImportRequestObject) (api.PreviewDividendImportResponseObject, error) {
 currentUserId, err := currentUserID(ctx)
 if err != nil {
  return nil, err
 }
 preview, err := h.dividends.Preview(ctx, currentUserId, *request.Body)
 if err != nil {
  if errors.Is(err, services.ErrValidation) {
   return api.PreviewDividendImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
  }
  return nil, err
 }
 return api.PreviewDividendImport200JSONResponse(preview), nil
}

func (h *Controller) AdminPreviewUserDividendImport(ctx context.Context, request api.AdminPreviewUserDividendImportRequestObject) (api.AdminPreviewUserDividendImportResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminPreviewUserDividendImport404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 preview, err := h.dividends.Preview(ctx, target.ID, *request.Body)
 if err != nil {
  if errors.Is(err, services.ErrValidation) {
   return api.AdminPreviewUserDividendImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
  }
  return nil, err
 }
 return api.AdminPreviewUserDividendImport200JSONResponse(preview), nil
}
```

* [ ] **Step 4: `dividend_import_test.go`**

```go
package services

import (
 "testing"
 "time"

 openapi_types "github.com/oapi-codegen/runtime/types"
 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)

func sheetRow(line int, day string, amount float64, cumulative *float64) api.DividendImportRow {
 d, _ := time.Parse(time.DateOnly, day)
 return api.DividendImportRow{Line: line, Date: openapi_types.Date{Time: d}, ShareName: "TCS", Amount: amount, Cumulative: cumulative}
}

func resolved(h *domain.Holding, r api.DividendImportRow) importRow {
 return importRow{in: r, day: domain.UTCDate(r.Date.Time), holding: h}
}

// PRD-005 §5 scenarios A–D; a hand-entered ledger dividend counts as stored.
func TestPartition_OccurrenceBased(t *testing.T) {
 tcs := &domain.Holding{ID: primitive.NewObjectID(), Script: "TCS"}
 two := []importRow{resolved(tcs, sheetRow(2, "2020-01-01", 300, nil)), resolved(tcs, sheetRow(3, "2020-01-01", 300, nil))}
 stored := func(n int) []domain.Transaction {
  out := []domain.Transaction{}
  for range n {
   out = append(out, dividendEvent(tcs.ID, "2020-01-01", 300))
  }
  return out
 }
 cases := []struct {
  name          string
  existing      []domain.Transaction
  fresh, dupes  int
  firstDupeLine int
 }{
  {"A: DB 1, sheet 2", stored(1), 1, 1, 2},
  {"B: DB 2, sheet 2", stored(2), 0, 2, 2},
  {"C: DB 0, sheet 2", stored(0), 2, 0, 0},
  {"D: same file again", stored(2), 0, 2, 2},
 }
 for _, c := range cases {
  fresh, dups := partition(two, c.existing)
  if len(fresh) != c.fresh || len(dups) != c.dupes {
   t.Errorf("%s: fresh %d dups %d, want %d / %d", c.name, len(fresh), len(dups), c.fresh, c.dupes)
  }
  if c.dupes > 0 && dups[0].in.Line != c.firstDupeLine {
   t.Errorf("%s: first duplicate line %d, want %d (sheet order)", c.name, dups[0].in.Line, c.firstDupeLine)
  }
 }
 other := []domain.Transaction{dividendEvent(tcs.ID, "2020-01-02", 300), dividendEvent(tcs.ID, "2020-01-01", 300.5), dividendEvent(primitive.NewObjectID(), "2020-01-01", 300)}
 if fresh, _ := partition(two, other); len(fresh) != 2 {
  t.Error("a different day, amount or holding must not count as a duplicate")
 }
}

func TestCumulativeWarnings(t *testing.T) {
 c := func(v float64) *float64 { return &v }
 ok := []api.DividendImportRow{sheetRow(2, "2020-01-01", 300, c(300)), sheetRow(3, "2020-01-01", 300, c(600)), sheetRow(4, "2020-03-15", 1250.5, c(1850.5))}
 if w := cumulativeWarnings(ok); len(w) != 0 {
  t.Errorf("consistent sheet: %v, want none", w)
 }
 bad := []api.DividendImportRow{sheetRow(2, "2020-01-01", 300, c(300)), sheetRow(3, "2020-03-15", 1250.5, c(1900))}
 if w := cumulativeWarnings(bad); len(w) != 1 || w[0].Line != 3 {
  t.Errorf("mismatch: %v, want one warning on line 3", w)
 }
 unordered := []api.DividendImportRow{sheetRow(2, "2020-03-15", 300, c(300)), sheetRow(3, "2020-01-01", 300, c(999))}
 if w := cumulativeWarnings(unordered); len(w) != 1 || w[0].Line != 3 {
  t.Errorf("out of order: %v, want one skip warning", w)
 }
 if w := cumulativeWarnings([]api.DividendImportRow{sheetRow(2, "2020-01-01", 300, nil), sheetRow(3, "2020-01-02", 300, nil)}); len(w) != 0 {
  t.Error("no CUMULATIVE column: no warnings")
 }
}

func TestBuildPreview_Counts(t *testing.T) {
 tcs := &domain.Holding{ID: primitive.NewObjectID()}
 reason := "dividend must be a positive amount"
 p := buildPreview(nil,
  []importRow{resolved(tcs, sheetRow(3, "2020-01-01", 300, nil))},
  []importRow{resolved(tcs, sheetRow(2, "2020-01-01", 300, nil))},
  []api.DividendImportRowStatus{{Line: 4, Status: "invalid", Reason: &reason}},
  []api.DividendImportWarning{})
 if p.Counts != (api.DividendImportCounts{Ready: 1, Duplicate: 1, Invalid: 1, Total: 3}) {
  t.Errorf("counts = %+v", p.Counts)
 }
 if p.Rows[0].Line != 2 || p.Rows[0].Status != "duplicate" || p.Rows[2].Status != "invalid" {
  t.Errorf("rows not in line order: %+v", p.Rows)
 }
}
```

* [ ] **Step 5: Controller test (Edit `controllers/dividends_test.go`)**

Current:

```go
import (
 "testing"

 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.mongodb.org/mongo-driver/mongo/integration/mtest"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)
```

Replacement:

```go
import (
 "testing"
 "time"

 openapi_types "github.com/oapi-codegen/runtime/types"
 "go.mongodb.org/mongo-driver/bson"
 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.mongodb.org/mongo-driver/mongo/integration/mtest"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/domain"
)
```

Append:

```go
// Preview never writes: every command it issues is a read.
func TestPreviewDividendImport_ReadOnly(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("one row", func(mt *mtest.T) {
  caller := regionalAdmin("india")
  holdingId := primitive.NewObjectID()
  mt.AddMockResponses(
   mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
    {Key: "_id", Value: holdingId}, {Key: "user_id", Value: caller.ID}, {Key: "script", Value: "TCS"},
    {Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"},
   }),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
  )
  h := newIntegrationHandler(mt, &mockPriceFetcher{})
  day := openapi_types.Date{Time: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)}
  resp, err := h.PreviewDividendImport(userCtx(caller), api.PreviewDividendImportRequestObject{Body: &api.DividendImportInput{
   Currency: "INR", Rows: []api.DividendImportRow{{Line: 2, Date: day, ShareName: "TCS", Amount: 300}},
  }})
  if err != nil {
   t.Fatalf("Preview: %v", err)
  }
  ok, isOK := resp.(api.PreviewDividendImport200JSONResponse)
  if !isOK || ok.Counts.Ready != 1 {
   t.Fatalf("response = %#v, want 200 with 1 ready", resp)
  }
  for _, e := range mt.GetAllStartedEvents() {
   if e.CommandName != "find" {
    t.Errorf("preview issued %s; want reads only", e.CommandName)
   }
  }
 })
}
```

* [ ] **Step 6: `docs/api.md`** — add `POST /api/dividends/import/preview` and
  its admin mirror to the Dividends section, with the request and the
  preview shape.

* [ ] **Step 7: Verify**

```bash
cd backend && go build ./... && go test ./internal/services/ ./internal/controllers/ -run 'ResolveNames|Partition|CumulativeWarnings|BuildPreview|PreviewDividendImport' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: every line `--- PASS`; build ok.

* [ ] **Step 8: curl (PR4 "How to test")**

```bash
cat > imp.json <<'JSON'
{"currency":"INR","rows":[
 {"line":2,"date":"2020-01-01","share_name":"TCS","amount":300,"cumulative":300},
 {"line":3,"date":"2020-01-01","share_name":"TCS","amount":300,"cumulative":600},
 {"line":4,"date":"2020-03-15","share_name":"jio","amount":1250.5,"cumulative":1850.5}]}
JSON
curl -s -b c.txt -H "$H" -H "$J" -d @imp.json $B/dividends/import/preview | jq '.counts, [.names[] | {sheet_name, status, preselect}]'
# counts.invalid 1 (line 4: "jio" needs_confirmation); ready+duplicate = 2
curl -s -b c.txt "$B/dividends?currency=INR" | jq '.summary.count'   # unchanged — preview wrote nothing
```

* [ ] **Step 9: Commit, push, PR4**

```bash
git add backend/internal/services/dividend_import.go backend/internal/services/dividend_import_test.go backend/internal/services/dividends.go backend/internal/controllers/dividends.go backend/internal/controllers/dividends_test.go docs/api.md
git commit -m "✨ Preview a dividend CSV import"   # includes the files staged in Tasks 9–10
git push -u origin feat/PD-048-dividends-preview-api
gh pr create --title "✨ Preview a dividend CSV import with name matching and duplicate detection" --body-file pr4.md
```

Expected: PR URL.

---

## Task 12: Mongo transactions (PR5)

**Files:**

* Modify: `docker-compose.dev.yml`, `docker-compose.yml`, `backend/internal/config/config.go`, `backend/internal/config/config_test.go`, `backend/internal/persistence/persistence.go`, `docs/local-setup.md`, `docs/configuration.md`

* [ ] **Step 1: Single-node replica set (Edit `docker-compose.dev.yml`)**

WHY: an import writes many ledger events, aliases and holding totals that
must commit together (PRD-005 §7.7). MongoDB multi-document transactions need
a replica set; Atlas is one, the dev container is not. A one-node set is the
standard local setup.

Current:

```yaml
  mongodb:
    image: mongo:7
    container_name: portfolio_mongo_dev
    ports:
      - "27017:27017"
    volumes:
      - mongo_data_dev:/data/db
    environment:
      MONGO_INITDB_DATABASE: portfolio
```

Replacement:

```yaml
  mongodb:
    image: mongo:7
    container_name: portfolio_mongo_dev
    # Single-node replica set: dividend imports use multi-document
    # transactions (DD-005 §2.6), which need one.
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "27017:27017"
    volumes:
      - mongo_data_dev:/data/db
    environment:
      MONGO_INITDB_DATABASE: portfolio
    healthcheck:
      # Initiates the set on first boot; healthy once this node is PRIMARY.
      test: ["CMD", "mongosh", "--quiet", "--eval", "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok }"]
      interval: 5s
      timeout: 10s
      retries: 20
```

`docker-compose.yml`: the same `command` and `healthcheck` on its `mongodb`
service with `host:'mongodb:27017'`; the backend service's `MONGODB_URI`
becomes `mongodb://mongodb:27017/portfolio?replicaSet=rs0` and its
`depends_on` becomes `mongodb: { condition: service_healthy }`.

* [ ] **Step 2: Default URI (Edit `config.go`)**

Current:

```go
  MongoURI:        "mongodb://localhost:27017/portfolio",
```

Replacement:

```go
  // directConnection: the one-node set advertises "localhost", which is
  // right from the host machine (DD-005 §2.6).
  MongoURI:        "mongodb://localhost:27017/portfolio?replicaSet=rs0&directConnection=true",
```

`config_test.go`: the default-URI assertion changes to the same string.
`docs/local-setup.md` and `docs/configuration.md`: new default URI, and
"existing dev volume: run `docker compose -f docker-compose.dev.yml up -d --force-recreate mongodb` once; data is kept".

* [ ] **Step 3: `Store.InTransaction` (Edit `persistence.go`)**

WHY: one helper so services never touch sessions. The driver carries the
session on the context it hands `fn`, so existing store methods join the
transaction unchanged — their `context.WithTimeout(ctx, …)` keeps it.

Current:

```go
 Snapshots    *SnapshotStore
 Branding     *BrandingStore
```

Replacement:

```go
 Snapshots    *SnapshotStore
 Branding     *BrandingStore

 client *mongo.Client // for InTransaction
```

Current:

```go
  Branding:     &BrandingStore{col: db.Collection("app_branding")},
 }
}
```

Replacement:

```go
  Branding:     &BrandingStore{col: db.Collection("app_branding")},
  client:       db.Client(),
 }
}

// InTransaction runs fn in a MongoDB multi-document transaction (DD-005
// §2.6). Store methods called with the ctx fn receives join it; any error
// from fn aborts and rolls back every write. Requires a replica set.
func (s *Store) InTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
 session, err := s.client.StartSession()
 if err != nil {
  return fmt.Errorf("start session (transactions need a replica set): %w", err)
 }
 defer session.EndSession(ctx)
 _, err = session.WithTransaction(ctx, func(sc mongo.SessionContext) (any, error) {
  return nil, fn(sc)
 })
 return err
}
```

Imports gain `"context"` and `"fmt"`.

* [ ] **Step 4: Verify**

```bash
docker compose -f docker-compose.dev.yml up -d --force-recreate mongodb && sleep 15
docker exec portfolio_mongo_dev mongosh --quiet --eval 'rs.status().members[0].stateStr'
cd backend && go build ./... && go test ./internal/config/ ./internal/persistence/
```

Expected: `PRIMARY`; build ok; two `ok` lines. `InTransaction` itself gets no
test — that would test the database, which the test policy excludes; its
behaviour is covered through `Import` (Task 14) and end-to-end (Task 26).

* [ ] **Step 5: Commit**

```bash
git checkout -b feat/PD-048-dividends-import-api main
git add docker-compose.dev.yml docker-compose.yml backend/internal/config/config.go backend/internal/config/config_test.go backend/internal/persistence/persistence.go docs/local-setup.md docs/configuration.md
git commit -m "🔧 Run Mongo as a replica set for transactions"
```

---

## Task 13: Import metadata, batch insert, aliases (PR5)

**Files:**

* Modify: `backend/internal/domain/transaction.go`, `backend/internal/persistence/transactions.go`, `backend/internal/persistence/holdings.go`

* [ ] **Step 1: `ImportMeta` (Edit `domain/transaction.go`)**

WHY: audit only — where an imported event came from. Never a key and never
authoritative (the sheet's cumulative is a running total, not an identity).

Current:

```go
 Currency  string    `bson:"currency" json:"currency"` // denormalised from the holding
```

Replacement:

```go
 Currency  string    `bson:"currency" json:"currency"` // denormalised from the holding
 // Import records where a CSV-imported dividend came from (PRD-005);
 // nil for events entered by hand.
 Import *ImportMeta `bson:"import,omitempty" json:"-"`
```

Append:

```go
// ImportMeta is audit metadata on a CSV-imported event (PRD-005). Never part
// of the duplicate key; the sheet's cumulative is kept only for reference.
type ImportMeta struct {
 BatchId         string   `bson:"batch_id"`                   // one per committed import
 Line            int      `bson:"line"`                       // 1-based file line (header = 1)
 SheetName       string   `bson:"sheet_name"`                 // Share Name as written in the sheet
 SheetCumulative *float64 `bson:"sheet_cumulative,omitempty"` // CUMULATIVE cell, when present
}
```

* [ ] **Step 2: `InsertMany` (append to `persistence/transactions.go`)**

```go
// InsertMany inserts txns in order; ordered so a failure stops at that row
// (inside the import transaction the whole batch then rolls back).
func (s *TransactionStore) InsertMany(ctx context.Context, txns []domain.Transaction) error {
 if len(txns) == 0 {
  return nil
 }
 ctx, cancel := context.WithTimeout(ctx, writeTimeout)
 defer cancel()
 docs := make([]any, len(txns))
 for i := range txns {
  docs[i] = txns[i]
 }
 _, err := s.col.InsertMany(ctx, docs, options.InsertMany().SetOrdered(true))
 return err
}
```

* [ ] **Step 3: `MoveAliases` (append to `persistence/holdings.go`)**

WHY: a re-pointed name must belong to exactly one holding, or the next
import reads it as ambiguous. Pull from the user's other holdings, add to
this one — both inside the import transaction.

```go
// MoveAliases makes keys aliases of holdingId only: pulled from userId's
// other holdings, added to this one (DD-005 §2.3).
func (s *HoldingStore) MoveAliases(ctx context.Context, userId, holdingId primitive.ObjectID, keys []string) error {
 if len(keys) == 0 {
  return nil
 }
 ctx, cancel := context.WithTimeout(ctx, writeTimeout)
 defer cancel()
 if _, err := s.col.UpdateMany(ctx,
  scopedFilter(userId, bson.M{"_id": bson.M{"$ne": holdingId}}),
  bson.M{"$pull": bson.M{"aliases": bson.M{"$in": keys}}}); err != nil {
  return err
 }
 _, err := s.col.UpdateOne(ctx,
  scopedFilter(userId, bson.M{"_id": holdingId}),
  bson.M{"$addToSet": bson.M{"aliases": bson.M{"$each": keys}}})
 return err
}
```

* [ ] **Step 4: Verify**

```bash
cd backend && go build ./... && go vet ./internal/persistence/ ./internal/domain/
```

Expected: no output, exit 0 (behaviour tested through `Import` in Task 14).

* [ ] **Step 5: Commit**

```bash
git add backend/internal/domain/transaction.go backend/internal/persistence/transactions.go backend/internal/persistence/holdings.go
git commit -m "✨ Store dividend import metadata and aliases"
```

---

## Task 14: Atomic import (PR5)

**Files:**

* Create: `backend/internal/services/dividends_test.go`
* Modify: `backend/internal/services/dividends.go`, `backend/internal/controllers/controllers.go`, `backend/internal/controllers/dividends.go`, `backend/api/specs/portfolio-api.yaml`, `dividends/dividends.yaml`, `admin/admin.yaml`, `openapi.yaml`, generated files, `docs/api.md`

* [ ] **Step 1: Spec**

Append to `portfolio-api.yaml` schemas:

```yaml
    DividendImportResult:
      type: object
      required: [imported, duplicates, batch_id, warnings]
      properties:
        imported: { type: integer }
        duplicates: { type: array, items: { $ref: "#/components/schemas/DividendImportRow" } }
        batch_id: { type: string }
        warnings: { type: array, items: { $ref: "#/components/schemas/DividendImportWarning" } }
```

Append to `dividends/dividends.yaml`:

```yaml
dividends_import:
  post:
    tags: [Dividends]
    summary: Commit a dividend CSV import atomically
    description: |
      Re-runs the preview against the database as it is now and, when no row
      is invalid, inserts every new dividend, saves confirmed name aliases
      and recomputes the affected holdings in one transaction. Duplicates are
      skipped and listed. 422 returns the fresh preview when rows are invalid.
    operationId: importDividends
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/DividendImportInput"
    responses:
      "200":
        description: Imported
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendImportResult"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "422":
        description: Invalid rows — nothing written
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendImportPreview"
```

Append to `admin/admin.yaml`:

```yaml
users_id_dividends_import:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
  post:
    tags: [Admin]
    summary: Commit a dividend import for a user (act-as)
    operationId: adminImportUserDividends
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/DividendImportInput"
    responses:
      "200":
        description: Imported
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendImportResult"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"
      "422":
        description: Invalid rows — nothing written
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/DividendImportPreview"
```

`openapi.yaml` — current:

```yaml
  /dividends/import/preview:
    $ref: "./dividends/dividends.yaml#/dividends_import_preview"
```

replacement:

```yaml
  /dividends/import/preview:
    $ref: "./dividends/dividends.yaml#/dividends_import_preview"
  /dividends/import:
    $ref: "./dividends/dividends.yaml#/dividends_import"
```

current:

```yaml
  /admin/users/{id}/dividends/import/preview:
    $ref: "./admin/admin.yaml#/users_id_dividends_import_preview"
```

replacement:

```yaml
  /admin/users/{id}/dividends/import/preview:
    $ref: "./admin/admin.yaml#/users_id_dividends_import_preview"
  /admin/users/{id}/dividends/import:
    $ref: "./admin/admin.yaml#/users_id_dividends_import"
```

Regenerate: `cd backend && go generate -tags tools ./...`.

* [ ] **Step 2: `txRunner` seam + `Import` (Edit `dividends.go`)**

WHY: `Import` re-runs `evaluate` inside the transaction, so it re-validates
against the database at commit time — a dividend added between preview and
confirm becomes a duplicate, not a double. `txRunner` lets tests run the
body without a replica set; production passes `*persistence.Store`. No
snapshot heal: dividends never change snapshots (Task 3).

Current:

```go
type DividendsService struct {
 txns     *persistence.TransactionStore
 holdings *persistence.HoldingStore
 logger   *zap.Logger
 today    func() time.Time // IST calendar day; tests pin it
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, logger *zap.Logger) *DividendsService {
 return &DividendsService{txns: txns, holdings: holdings, logger: logger, today: istToday}
}
```

Replacement:

```go
type DividendsService struct {
 txns     *persistence.TransactionStore
 holdings *persistence.HoldingStore
 tx       txRunner
 logger   *zap.Logger
 today    func() time.Time // IST calendar day; tests pin it
}

// txRunner runs fn atomically. *persistence.Store implements it; tests pass
// a runner that calls fn directly.
type txRunner interface {
 InTransaction(ctx context.Context, fn func(ctx context.Context) error) error
}

// NewDividendsService wires a DividendsService.
func NewDividendsService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, tx txRunner, logger *zap.Logger) *DividendsService {
 return &DividendsService{txns: txns, holdings: holdings, tx: tx, logger: logger, today: istToday}
}
```

Append:

```go
// ImportInvalidError carries the fresh preview when a confirm finds invalid
// rows; nothing was written. Controllers map it to 422.
type ImportInvalidError struct{ Preview api.DividendImportPreview }

func (e *ImportInvalidError) Error() string {
 return fmt.Sprintf("dividend import: %d invalid rows", e.Preview.Counts.Invalid)
}

// toTransaction builds the ledger event for a new imported dividend. The
// ObjectID is assigned here, in sheet order (DD-005 §2.2).
func (r importRow) toTransaction(userId primitive.ObjectID, batchId string, now time.Time) domain.Transaction {
 currency, _ := CurrencyOf(*r.holding)
 return domain.Transaction{
  ID: primitive.NewObjectID(), UserID: userId, HoldingID: r.holding.ID,
  Type: domain.TxnDividend, Date: r.day, Amount: r.in.Amount, Currency: currency,
  Import:    &domain.ImportMeta{BatchId: batchId, Line: r.in.Line, SheetName: r.in.ShareName, SheetCumulative: r.in.Cumulative},
  CreatedAt: now, UpdatedAt: now,
 }
}

func importRowsOf(rows []importRow) []api.DividendImportRow {
 out := make([]api.DividendImportRow, 0, len(rows))
 for _, r := range rows {
  out = append(out, r.in)
 }
 return out
}

// Import commits every eligible row, the confirmed aliases and the
// recomputed holding totals together, or nothing (PRD-005 §7.7).
func (s *DividendsService) Import(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (_ api.DividendImportResult, retErr error) {
 ctx, span := tracer.Start(ctx, "DividendsService.Import")
 defer endSpan(span, &retErr)
 logger := s.log(ctx)
 if err := checkImportInput(in); err != nil {
  return api.DividendImportResult{}, err
 }
 var result api.DividendImportResult
 err := s.tx.InTransaction(ctx, func(ctx context.Context) error {
  plan, err := s.evaluate(ctx, userId, in)
  if err != nil {
   return err
  }
  if plan.preview.Counts.Invalid > 0 {
   return &ImportInvalidError{Preview: plan.preview}
  }
  batchId := primitive.NewObjectID().Hex()
  now := time.Now().UTC()
  txns := make([]domain.Transaction, 0, len(plan.fresh))
  var affected []primitive.ObjectID
  seen := map[primitive.ObjectID]bool{}
  for _, r := range plan.fresh {
   txns = append(txns, r.toTransaction(userId, batchId, now))
   if !seen[r.holding.ID] {
    seen[r.holding.ID] = true
    affected = append(affected, r.holding.ID)
   }
  }
  if err := s.txns.InsertMany(ctx, txns); err != nil {
   return err
  }
  for holdingId, keys := range plan.aliases {
   if err := s.holdings.MoveAliases(ctx, userId, holdingId, keys); err != nil {
    return err
   }
  }
  for _, holdingId := range affected {
   if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, userId, holdingId); err != nil {
    return err
   }
  }
  result = api.DividendImportResult{Imported: len(txns), Duplicates: importRowsOf(plan.dups), BatchId: batchId, Warnings: plan.preview.Warnings}
  return nil
 })
 if err != nil {
  var invalid *ImportInvalidError
  if !errors.As(err, &invalid) {
   logger.Error("dividend import failed", zap.Error(err))
  }
  return api.DividendImportResult{}, err
 }
 logger.Info("dividends imported", zap.Int("imported", result.Imported),
  zap.Int("duplicates", len(result.Duplicates)), zap.String("batch_id", result.BatchId))
 return result, nil
}
```

Imports gain `"errors"`.

Wiring (Edit `controllers.go`) — current:

```go
  dividends:    services.NewDividendsService(store.Transactions, store.Holdings, logger),
```

replacement:

```go
  dividends:    services.NewDividendsService(store.Transactions, store.Holdings, store, logger),
```

* [ ] **Step 3: Controller (append to `controllers/dividends.go`)**

```go
func (h *Controller) ImportDividends(ctx context.Context, request api.ImportDividendsRequestObject) (api.ImportDividendsResponseObject, error) {
 currentUserId, err := currentUserID(ctx)
 if err != nil {
  return nil, err
 }
 result, err := h.dividends.Import(ctx, currentUserId, *request.Body)
 var invalid *services.ImportInvalidError
 switch {
 case errors.As(err, &invalid):
  return api.ImportDividends422JSONResponse(invalid.Preview), nil
 case errors.Is(err, services.ErrValidation):
  return api.ImportDividends400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
 case err != nil:
  return nil, err
 }
 return api.ImportDividends200JSONResponse(result), nil
}

func (h *Controller) AdminImportUserDividends(ctx context.Context, request api.AdminImportUserDividendsRequestObject) (api.AdminImportUserDividendsResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminImportUserDividends404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 result, err := h.dividends.Import(ctx, target.ID, *request.Body)
 var invalid *services.ImportInvalidError
 switch {
 case errors.As(err, &invalid):
  return api.AdminImportUserDividends422JSONResponse(invalid.Preview), nil
 case errors.Is(err, services.ErrValidation):
  return api.AdminImportUserDividends400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
 case err != nil:
  return nil, err
 }
 return api.AdminImportUserDividends200JSONResponse(result), nil
}
```

* [ ] **Step 4: `services/dividends_test.go`**

```go
package services

import (
 "context"
 "errors"
 "testing"
 "time"

 openapi_types "github.com/oapi-codegen/runtime/types"
 "go.mongodb.org/mongo-driver/bson"
 "go.mongodb.org/mongo-driver/bson/primitive"
 "go.mongodb.org/mongo-driver/mongo/integration/mtest"

 "portfolio-dashboard/api"
 "portfolio-dashboard/internal/persistence"
)

// directRunner runs the transaction body without a replica set.
type directRunner struct{}

func (directRunner) InTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
 return fn(ctx)
}

func commandCount(mt *mtest.T, name, collection string) int {
 n := 0
 for _, e := range mt.GetAllStartedEvents() {
  if e.CommandName == name && e.Command.Lookup(name).StringValue() == collection {
   n++
  }
 }
 return n
}

func importInput(mappings map[string]*string) api.DividendImportInput {
 day := openapi_types.Date{Time: time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)}
 in := api.DividendImportInput{Currency: "INR", Rows: []api.DividendImportRow{
  {Line: 2, Date: day, ShareName: "TCS", Amount: 300},
  {Line: 3, Date: day, ShareName: "TCS", Amount: 300},
  {Line: 4, Date: day, ShareName: "JLP", Amount: 500},
 }}
 if mappings != nil {
  in.Mappings = &mappings
 }
 return in
}

func TestImport(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 userId, tcs, jio := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
 holdingDocs := func(mt *mtest.T) bson.D {
  return mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
   bson.D{{Key: "_id", Value: tcs}, {Key: "user_id", Value: userId}, {Key: "script", Value: "TCS"}, {Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"}},
   bson.D{{Key: "_id", Value: jio}, {Key: "user_id", Value: userId}, {Key: "script", Value: "Jio Platforms Ltd"}, {Key: "symbol", Value: "JIOPLA.NS"}, {Key: "currency", Value: "INR"}},
  )
 }
 service := func(mt *mtest.T) *DividendsService {
  st := persistence.New(mt.DB)
  svc := NewDividendsService(st.Transactions, st.Holdings, directRunner{}, nil)
  svc.today = func() time.Time { return time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC) }
  return svc
 }

 mt.Run("unresolved name blocks the import, nothing written", func(mt *mtest.T) {
  mt.AddMockResponses(holdingDocs(mt), mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch))
  _, err := service(mt).Import(context.Background(), userId, importInput(nil))
  var invalid *ImportInvalidError
  if !errors.As(err, &invalid) || invalid.Preview.Counts.Invalid != 1 {
   t.Fatalf("err = %v, want ImportInvalidError with 1 invalid row (JLP)", err)
  }
  if n := commandCount(mt, "insert", "transactions"); n != 0 {
   t.Errorf("%d inserts issued; want none", n)
  }
 })

 mt.Run("confirmed import inserts, saves the alias, recomputes each holding once", func(mt *mtest.T) {
  jioHex := jio.Hex()
  mt.AddMockResponses(
   holdingDocs(mt),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // no stored dividends
   mtest.CreateSuccessResponse(), // insertMany
   mtest.CreateSuccessResponse(), // aliases $pull
   mtest.CreateSuccessResponse(), // aliases $addToSet
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // recompute TCS
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: tcs}}}),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch), // recompute Jio
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: jio}}}),
  )
  result, err := service(mt).Import(context.Background(), userId, importInput(map[string]*string{"JLP": &jioHex}))
  if err != nil {
   t.Fatalf("Import: %v", err)
  }
  if result.Imported != 3 || len(result.Duplicates) != 0 {
   t.Errorf("imported %d dups %d, want 3 / 0 (in-sheet repeats kept)", result.Imported, len(result.Duplicates))
  }
  if n := commandCount(mt, "findAndModify", "holdings"); n != 2 {
   t.Errorf("holding recomputes = %d, want 2 (once per holding)", n)
  }
  if n := commandCount(mt, "update", "holdings"); n != 2 {
   t.Errorf("alias writes = %d, want 2 (pull + addToSet for JLP)", n)
  }
 })

 mt.Run("re-import of stored rows imports nothing", func(mt *mtest.T) {
  jioHex := jio.Hex()
  day := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
  stored := func(holdingId primitive.ObjectID, amount float64) bson.D {
   return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "holding_id", Value: holdingId}, {Key: "type", Value: "dividend"}, {Key: "date", Value: day}, {Key: "amount", Value: amount}}
  }
  mt.AddMockResponses(
   holdingDocs(mt),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, stored(tcs, 300), stored(tcs, 300), stored(jio, 500)),
   mtest.CreateSuccessResponse(), mtest.CreateSuccessResponse(), // alias pull + addToSet (answer re-sent)
  )
  result, err := service(mt).Import(context.Background(), userId, importInput(map[string]*string{"JLP": &jioHex}))
  if err != nil {
   t.Fatalf("Import: %v", err)
  }
  if result.Imported != 0 || len(result.Duplicates) != 3 {
   t.Errorf("imported %d dups %d, want 0 / 3 (idempotent)", result.Imported, len(result.Duplicates))
  }
  if n := commandCount(mt, "insert", "transactions"); n != 0 {
   t.Errorf("%d inserts issued; want none", n)
  }
 })
}
```

* [ ] **Step 5: `docs/api.md`** — add `POST /api/dividends/import` (+ admin
  mirror): 200 result, 400 malformed, 422 preview.

* [ ] **Step 6: Verify**

```bash
cd backend && go build ./... && go test ./internal/services/ ./internal/controllers/ -run 'TestImport|Dividend' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestImport/...` ×3 and every earlier dividend test PASS.

* [ ] **Step 7: curl (PR5 "How to test")**

```bash
JIO=<Jio holding id>
jq --arg jio "$JIO" '. + {mappings: {"jio": $jio}}' imp.json > imp2.json
curl -s -b c.txt -H "$H" -H "$J" -d @imp2.json $B/dividends/import | jq '{imported, dups: (.duplicates|length)}'   # {imported: 3, dups: 0}
curl -s -b c.txt -H "$H" -H "$J" -d @imp2.json $B/dividends/import | jq '{imported, dups: (.duplicates|length)}'   # {imported: 0, dups: 3}
curl -s -o /dev/null -w '%{http_code}\n' -b c.txt -H "$H" -H "$J" -d @imp.json $B/dividends/import                  # 422 (jio unresolved)
jq -n '{currency:"INR",rows:[{line:2,date:"2020-05-01",share_name:"jio",amount:10}]}' > imp3.json
curl -s -b c.txt -H "$H" -H "$J" -d @imp3.json $B/dividends/import/preview | jq '.names[0].status'                  # "auto" (alias remembered)
```

* [ ] **Step 8: Commit, push, PR5**

```bash
git add backend/api/specs/portfolio-api.yaml backend/api/specs/dividends/dividends.yaml backend/api/specs/admin/admin.yaml backend/api/specs/openapi.yaml backend/api/models.gen.go backend/api/server.gen.go backend/internal/services/dividends.go backend/internal/services/dividends_test.go backend/internal/controllers/controllers.go backend/internal/controllers/dividends.go docs/api.md
git commit -m "✨ Import dividend CSV rows atomically"
git push -u origin feat/PD-048-dividends-import-api
gh pr create --title "✨ Import a dividend CSV atomically, remembering confirmed share names" --body-file pr5.md
```

Expected: PR URL; How to test notes the one-time `--force-recreate`.

---

## Task 15: Delete all dividends of a tab (PR6)

**Files:**

* Modify: `backend/internal/persistence/transactions.go`, `backend/internal/services/dividends.go`, `backend/internal/services/dividends_test.go`, `backend/internal/controllers/dividends.go`, `dividends/dividends.yaml`, `admin/admin.yaml`, generated files, `docs/api.md`

* [ ] **Step 1: Store (append to `persistence/transactions.go`)**

WHY: the affected holdings are read first so their totals are recomputed in
the same transaction; the filter is `type=dividend` + currency, so holdings,
buys, sells and the other tab are untouched.

```go
// DeleteDividends removes userId's dividend events in one currency and
// returns the holdings they belonged to, for recompute.
func (s *TransactionStore) DeleteDividends(ctx context.Context, userId primitive.ObjectID, currency string) ([]primitive.ObjectID, int64, error) {
 ctx, cancel := context.WithTimeout(ctx, writeTimeout)
 defer cancel()
 filter := scopedFilter(userId, bson.M{"type": string(domain.TxnDividend), "currency": currencyMatch(currency)})
 raw, err := s.col.Distinct(ctx, "holding_id", filter)
 if err != nil {
  return nil, 0, err
 }
 holdingIds := make([]primitive.ObjectID, 0, len(raw))
 for _, v := range raw {
  if id, ok := v.(primitive.ObjectID); ok {
   holdingIds = append(holdingIds, id)
  }
 }
 res, err := s.col.DeleteMany(ctx, filter)
 if err != nil {
  return nil, 0, err
 }
 return holdingIds, res.DeletedCount, nil
}
```

* [ ] **Step 2: Service (append to `dividends.go`)**

```go
// DeleteAll removes every dividend of one currency and recomputes the
// affected holdings, atomically (PRD-005 §8).
func (s *DividendsService) DeleteAll(ctx context.Context, userId primitive.ObjectID, currency string) (_ int64, retErr error) {
 ctx, span := tracer.Start(ctx, "DividendsService.DeleteAll")
 defer endSpan(span, &retErr)
 logger := s.log(ctx)
 if !ValidCurrency(currency) {
  return 0, fmt.Errorf("%w: currency must be INR or EUR", ErrValidation)
 }
 var deleted int64
 err := s.tx.InTransaction(ctx, func(ctx context.Context) error {
  holdingIds, n, err := s.txns.DeleteDividends(ctx, userId, currency)
  if err != nil {
   return err
  }
  for _, holdingId := range holdingIds {
   // An orphan dividend (its holding was deleted and the cascade missed it)
   // has no holding to recompute; skipping it keeps one stray row from
   // blocking Delete all for the whole tab.
   if _, err := recomputeAndPersist(ctx, s.holdings, s.txns, userId, holdingId); err != nil && !errors.Is(err, persistence.ErrNotFound) {
    return err
   }
  }
  deleted = n
  return nil
 })
 if err != nil {
  logger.Error("delete all dividends failed", zap.Error(err))
  return 0, err
 }
 logger.Info("dividends deleted", zap.String("currency", currency), zap.Int64("deleted", deleted))
 return deleted, nil
}
```

* [ ] **Step 3: Spec**

`dividends/dividends.yaml` — under the existing `dividends:` path item,
after its `get`, add:

```yaml
  delete:
    tags: [Dividends]
    summary: Delete every dividend of one currency tab
    description: Removes imported and hand-entered dividends of the currency and recomputes the affected holdings, atomically. Holdings and other transaction types are untouched.
    operationId: deleteDividends
    parameters:
      - $ref: "../portfolio-api.yaml#/components/parameters/DividendCurrency"
    responses:
      "200":
        description: Deleted count
        content:
          application/json:
            schema:
              type: object
              required: [deleted]
              properties:
                deleted: { type: integer }
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
```

`admin/admin.yaml` — under `users_id_dividends:`, after its `get`, add:

```yaml
  delete:
    tags: [Admin]
    summary: Delete every dividend of one currency tab for a user (act-as)
    operationId: adminDeleteUserDividends
    parameters:
      - $ref: "../portfolio-api.yaml#/components/parameters/DividendCurrency"
    responses:
      "200":
        description: Deleted count
        content:
          application/json:
            schema:
              type: object
              required: [deleted]
              properties:
                deleted: { type: integer }
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"
```

Regenerate.

* [ ] **Step 4: Controller (append to `controllers/dividends.go`)**

```go
func (h *Controller) DeleteDividends(ctx context.Context, request api.DeleteDividendsRequestObject) (api.DeleteDividendsResponseObject, error) {
 currentUserId, err := currentUserID(ctx)
 if err != nil {
  return nil, err
 }
 deleted, err := h.dividends.DeleteAll(ctx, currentUserId, string(request.Params.Currency))
 if err != nil {
  if errors.Is(err, services.ErrValidation) {
   return api.DeleteDividends400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
  }
  return nil, err
 }
 return api.DeleteDividends200JSONResponse{Deleted: int(deleted)}, nil
}

func (h *Controller) AdminDeleteUserDividends(ctx context.Context, request api.AdminDeleteUserDividendsRequestObject) (api.AdminDeleteUserDividendsResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminDeleteUserDividends404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 deleted, err := h.dividends.DeleteAll(ctx, target.ID, string(request.Params.Currency))
 if err != nil {
  return nil, err
 }
 return api.AdminDeleteUserDividends200JSONResponse{Deleted: int(deleted)}, nil
}
```

* [ ] **Step 5: Test (append to `services/dividends_test.go`)**

```go
// Delete-all is scoped to dividends of one currency and recomputes each
// affected holding.
func TestDeleteAll_ScopedAndRecomputes(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 mt.Run("INR", func(mt *mtest.T) {
  userId, tcs := primitive.NewObjectID(), primitive.NewObjectID()
  mt.AddMockResponses(
   mtest.CreateSuccessResponse(bson.E{Key: "values", Value: bson.A{tcs}}), // distinct
   mtest.CreateSuccessResponse(bson.E{Key: "n", Value: int32(4)}),         // deleteMany
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: tcs}}}),
  )
  st := persistence.New(mt.DB)
  deleted, err := NewDividendsService(st.Transactions, st.Holdings, directRunner{}, nil).DeleteAll(context.Background(), userId, "INR")
  if err != nil || deleted != 4 {
   t.Fatalf("DeleteAll = %d, %v; want 4, nil", deleted, err)
  }
  for _, e := range mt.GetAllStartedEvents() {
   if e.CommandName != "delete" {
    continue
   }
   q := e.Command.Lookup("deletes").Array().Index(0).Document().Lookup("q").Document()
   if q.Lookup("type").StringValue() != "dividend" || q.Lookup("user_id").ObjectID() != userId {
    t.Errorf("delete filter = %s; want type=dividend for the user", q)
   }
  }
  if n := commandCount(mt, "findAndModify", "holdings"); n != 1 {
   t.Errorf("recomputes = %d, want 1", n)
  }
 })

 // A dividend whose holding no longer exists (ErrNoDocuments on recompute)
 // must not block Delete all.
 mt.Run("orphan dividend", func(mt *mtest.T) {
  userId, gone := primitive.NewObjectID(), primitive.NewObjectID()
  mt.AddMockResponses(
   mtest.CreateSuccessResponse(bson.E{Key: "values", Value: bson.A{gone}}), // distinct
   mtest.CreateSuccessResponse(bson.E{Key: "n", Value: int32(1)}),          // deleteMany
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}), // holding not found
  )
  st := persistence.New(mt.DB)
  deleted, err := NewDividendsService(st.Transactions, st.Holdings, directRunner{}, nil).DeleteAll(context.Background(), userId, "INR")
  if err != nil || deleted != 1 {
   t.Fatalf("DeleteAll = %d, %v; want 1, nil (orphan skipped)", deleted, err)
  }
 })
}
```

* [ ] **Step 6: Verify**

```bash
cd backend && go build ./... && go test ./internal/services/ -run DeleteAll -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestDeleteAll_ScopedAndRecomputes/INR` and `/orphan_dividend`.

* [ ] **Step 7: curl (PR6)**

```bash
curl -s -b c.txt -X DELETE -H "$H" "$B/dividends?currency=INR" | jq    # {"deleted": N}
curl -s -b c.txt "$B/dividends?currency=INR" | jq '.summary.count'     # 0
curl -s -b c.txt "$B/holdings" | jq '[.[] | select(.currency != "EUR") | .total_dividends] | add'   # 0; buys/sells intact
```

* [ ] **Step 8: Commit, push, PR6**

```bash
git checkout -b feat/PD-048-dividends-delete-all-api main
git add backend/api/specs/dividends/dividends.yaml backend/api/specs/admin/admin.yaml backend/api/models.gen.go backend/api/server.gen.go backend/internal/persistence/transactions.go backend/internal/services/dividends.go backend/internal/services/dividends_test.go backend/internal/controllers/dividends.go docs/api.md
git commit -m "✨ Delete all dividends of a currency atomically"
git push -u origin feat/PD-048-dividends-delete-all-api
gh pr create --title "✨ Delete all dividends of a currency tab in one atomic step" --body-file pr6.md
```

---

## Task 16: Act-as ledger writes (PR7)

**Files:**

* Modify: `backend/api/specs/admin/admin.yaml`, `openapi.yaml`, generated files, `backend/internal/controllers/admin.go`, `backend/internal/controllers/transactions_all_test.go`, `docs/api.md`

* [ ] **Step 1: Spec (append to `admin/admin.yaml`)**

WHY: act-as can read a user's ledger but not write it (DD-004 §2.4).
PRD-005 §10 needs "manage dividends"; generic ledger writes also serve the
per-holding editor in act-as, instead of adding dividend-only endpoints.

```yaml
users_id_holdings_holdingid_transactions:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
    - name: holdingId
      in: path
      required: true
      schema: { type: string }
      description: MongoDB ObjectID of the holding
  get:
    tags: [Admin]
    summary: A user's ledger for one holding (act-as)
    operationId: adminListUserHoldingTransactions
    responses:
      "200":
        description: Transactions in replay order
        content:
          application/json:
            schema: { type: array, items: { $ref: "../portfolio-api.yaml#/components/schemas/Transaction" } }
      "404": { $ref: "../portfolio-api.yaml#/components/responses/NotFound" }
  post:
    tags: [Admin]
    summary: Add a ledger event to a user's holding (act-as)
    operationId: adminCreateUserTransaction
    requestBody:
      required: true
      content: { application/json: { schema: { $ref: "../portfolio-api.yaml#/components/schemas/TransactionInput" } } }
    responses:
      "201":
        description: Created
        content: { application/json: { schema: { $ref: "../portfolio-api.yaml#/components/schemas/Transaction" } } }
      "400": { $ref: "../portfolio-api.yaml#/components/responses/BadRequest" }
      "404": { $ref: "../portfolio-api.yaml#/components/responses/NotFound" }
users_id_transactions_transactionid:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
    - name: transactionId
      in: path
      required: true
      schema: { type: string }
      description: MongoDB ObjectID of the transaction
  put:
    tags: [Admin]
    summary: Edit a user's ledger event (act-as)
    operationId: adminUpdateUserTransaction
    requestBody:
      required: true
      content: { application/json: { schema: { $ref: "../portfolio-api.yaml#/components/schemas/TransactionInput" } } }
    responses:
      "200":
        description: Updated
        content: { application/json: { schema: { $ref: "../portfolio-api.yaml#/components/schemas/Transaction" } } }
      "400": { $ref: "../portfolio-api.yaml#/components/responses/BadRequest" }
      "404": { $ref: "../portfolio-api.yaml#/components/responses/NotFound" }
  delete:
    tags: [Admin]
    summary: Delete a user's ledger event (act-as)
    operationId: adminDeleteUserTransaction
    responses:
      "200":
        description: Deleted
        content: { application/json: { schema: { type: object, properties: { message: { type: string } } } } }
      "400": { $ref: "../portfolio-api.yaml#/components/responses/BadRequest" }
      "404": { $ref: "../portfolio-api.yaml#/components/responses/NotFound" }
```

`openapi.yaml` — current:

```yaml
  /admin/users/{id}/holdings/{holdingId}:
    $ref: "./admin/admin.yaml#/users_id_holdings_holdingid"
```

replacement:

```yaml
  /admin/users/{id}/holdings/{holdingId}:
    $ref: "./admin/admin.yaml#/users_id_holdings_holdingid"
  /admin/users/{id}/holdings/{holdingId}/transactions:
    $ref: "./admin/admin.yaml#/users_id_holdings_holdingid_transactions"
  /admin/users/{id}/transactions/{transactionId}:
    $ref: "./admin/admin.yaml#/users_id_transactions_transactionid"
```

Regenerate.

* [ ] **Step 2: Handlers (append to `admin.go`)**

```go
// Act-as ledger editing (PRD-005 §10). Each handler resolves the target under
// region scope, then calls the same TransactionsService method the user's own
// route uses — one write path, recompute and validation included.

func (h *Controller) AdminListUserHoldingTransactions(ctx context.Context, request api.AdminListUserHoldingTransactionsRequestObject) (api.AdminListUserHoldingTransactionsResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminListUserHoldingTransactions404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 txns, found, err := h.transactions.List(ctx, target.ID, request.HoldingId)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminListUserHoldingTransactions404JSONResponse{}, nil
 }
 return api.AdminListUserHoldingTransactions200JSONResponse(txns), nil
}

func (h *Controller) AdminCreateUserTransaction(ctx context.Context, request api.AdminCreateUserTransactionRequestObject) (api.AdminCreateUserTransactionResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminCreateUserTransaction404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 created, found, err := h.transactions.Create(ctx, target.ID, request.HoldingId, *request.Body)
 if err != nil {
  if badTransaction(err) {
   return api.AdminCreateUserTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
  }
  return nil, err
 }
 if !found {
  return api.AdminCreateUserTransaction404JSONResponse{}, nil
 }
 return api.AdminCreateUserTransaction201JSONResponse(created), nil
}

func (h *Controller) AdminUpdateUserTransaction(ctx context.Context, request api.AdminUpdateUserTransactionRequestObject) (api.AdminUpdateUserTransactionResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminUpdateUserTransaction404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 updated, found, err := h.transactions.Update(ctx, target.ID, request.TransactionId, *request.Body)
 if err != nil {
  if badTransaction(err) {
   return api.AdminUpdateUserTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
  }
  return nil, err
 }
 if !found {
  return api.AdminUpdateUserTransaction404JSONResponse{}, nil
 }
 return api.AdminUpdateUserTransaction200JSONResponse(updated), nil
}

func (h *Controller) AdminDeleteUserTransaction(ctx context.Context, request api.AdminDeleteUserTransactionRequestObject) (api.AdminDeleteUserTransactionResponseObject, error) {
 caller, err := adminCaller(ctx)
 if err != nil {
  return nil, err
 }
 target, found, err := h.loadTargetUser(ctx, caller, request.Id)
 if err != nil {
  return nil, err
 }
 if !found {
  return api.AdminDeleteUserTransaction404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
 }
 deleted, err := h.transactions.Delete(ctx, target.ID, request.TransactionId)
 if err != nil {
  if badTransaction(err) {
   return api.AdminDeleteUserTransaction400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
  }
  return nil, err
 }
 if !deleted {
  return api.AdminDeleteUserTransaction404JSONResponse{}, nil
 }
 msg := "deleted"
 return api.AdminDeleteUserTransaction200JSONResponse{Message: &msg}, nil
}
```

* [ ] **Step 3: Test (append to `transactions_all_test.go`)**

```go
// Act-as ledger writes are region-scoped: out-of-region targets read as 404
// and nothing is written; in-region writes land on the target's ledger.
func TestAdminUserTransactionWrites(t *testing.T) {
 mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
 date := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)

 mt.Run("out-of-region create is 404, no insert", func(mt *mtest.T) {
  target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
  mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
  h := newIntegrationHandler(mt, &mockPriceFetcher{})
  amt := 300.0
  resp, err := h.AdminCreateUserTransaction(userCtx(regionalAdmin("india")), api.AdminCreateUserTransactionRequestObject{
   Id: primitive.NewObjectID().Hex(), HoldingId: primitive.NewObjectID().Hex(),
   Body: &api.TransactionInput{Type: "dividend", Date: date, Amount: &amt},
  })
  if err != nil {
   t.Fatalf("AdminCreateUserTransaction: %v", err)
  }
  if _, ok := resp.(api.AdminCreateUserTransaction404JSONResponse); !ok {
   t.Fatalf("response = %T, want 404", resp)
  }
  for _, e := range mt.GetAllStartedEvents() {
   if e.CommandName == "insert" {
    t.Error("insert issued for an out-of-region target")
   }
  }
 })

 mt.Run("in-region create writes the target's ledger", func(mt *mtest.T) {
  targetId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
  target := userDocument(t, targetId, "bob", "irrelevant1", domain.RoleUser, "india", nil)
  dividend := bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "type", Value: "dividend"}, {Key: "amount", Value: 300.0}}
  mt.AddMockResponses(
   mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
    {Key: "_id", Value: holdingId}, {Key: "user_id", Value: targetId}, {Key: "currency", Value: "INR"},
   }),
   mtest.CreateSuccessResponse(),
   mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, dividend),
   mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: holdingId}}}),
  )
  h := newIntegrationHandler(mt, &mockPriceFetcher{})
  amt := 300.0
  resp, err := h.AdminCreateUserTransaction(userCtx(regionalAdmin("india")), api.AdminCreateUserTransactionRequestObject{
   Id: targetId.Hex(), HoldingId: holdingId.Hex(),
   Body: &api.TransactionInput{Type: "dividend", Date: date, Amount: &amt},
  })
  if err != nil {
   t.Fatalf("AdminCreateUserTransaction: %v", err)
  }
  if _, ok := resp.(api.AdminCreateUserTransaction201JSONResponse); !ok {
   t.Fatalf("response = %T, want 201", resp)
  }
  for _, e := range mt.GetAllStartedEvents() {
   if e.CommandName != "insert" {
    continue
   }
   doc := e.Command.Lookup("documents").Array().Index(0).Document()
   if doc.Lookup("user_id").ObjectID() != targetId {
    t.Errorf("inserted user_id = %s, want the target", doc.Lookup("user_id").ObjectID().Hex())
   }
  }
 })
}
```

Test imports gain `"time"` and `"go.mongodb.org/mongo-driver/bson"` where absent.

* [ ] **Step 4: Verify**

```bash
cd backend && go build ./... && go test ./internal/controllers/ -run 'AdminUserTransactionWrites|AdminListUserTransactions' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: every line `--- PASS`.

* [ ] **Step 5: curl (PR7)**

```bash
U=<in-region user id>; HD=<their holding id>
curl -s -o /dev/null -w '%{http_code}\n' -b c.txt -H "$H" -H "$J" -d '{"type":"dividend","date":"2024-03-15T00:00:00Z","amount":300}' $B/admin/users/$U/holdings/$HD/transactions   # 201
curl -s -b c.txt $B/admin/users/$U/holdings/$HD/transactions | jq 'map(select(.type=="dividend")) | length'                                                # ≥ 1
curl -s -o /dev/null -w '%{http_code}\n' -b c.txt -X DELETE -H "$H" $B/admin/users/<other-region user id>/transactions/<any id>                               # 404
```

* [ ] **Step 6: Commit, push, PR7**

```bash
git checkout -b feat/PD-048-actas-ledger-api main
git add backend/api/specs/admin/admin.yaml backend/api/specs/openapi.yaml backend/api/models.gen.go backend/api/server.gen.go backend/internal/controllers/admin.go backend/internal/controllers/transactions_all_test.go docs/api.md
git commit -m "✨ Let admins edit a user's ledger in act-as"
git push -u origin feat/PD-048-actas-ledger-api
gh pr create --title "✨ Let admins add, edit and delete a user's ledger events in act-as" --body-file pr7.md
```

---

## Task 17: History dividends overlay (PR8)

**Files:**

* Create: `backend/internal/services/dividend_history.go`, `backend/internal/services/dividend_history_test.go`
* Modify: `backend/internal/services/history.go`, `backend/internal/services/dividends.go`, `backend/internal/controllers/history.go`, `backend/api/specs/portfolio-api.yaml`, generated files, `docs/history-and-snapshots.md`

* [ ] **Step 1: Pure overlay — `dividend_history.go`**

WHY: computed on read, like the gold overlay (DD-003) — imports and deletes
show up at once and snapshots are never rewritten. One read of every
dividend, one walk against the sorted row dates. Per-stock values are keyed
by symbol because snapshot lines carry the symbol, not the holding id.

```go
package services

import (
 "slices"
 "strings"
 "time"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/internal/domain"
)

// DividendHistoryPoint is one currency's dividends as of a History row.
type DividendHistoryPoint struct {
 ToDate float64 `json:"to_date"` // received on or before the row date
 OnDay  float64 `json:"on_day"`  // received on the row date
}

// DividendDay is the overlay for one row date: per currency, and per symbol
// (to date) for the per-stock breakdown.
type DividendDay struct {
 ByCurrency map[string]DividendHistoryPoint
 BySymbol   map[string]float64
}

// canonicalCurrency applies CurrencyOf's blank → INR rule to a stored event
// currency.
func canonicalCurrency(c string) string {
 if c == "" {
  return domain.CurrencyINR
 }
 return strings.ToUpper(c)
}

// DividendOverlay computes dividends to date per currency and per symbol for
// each row date (YYYY-MM-DD). txns are in tab order.
func DividendOverlay(txns []domain.Transaction, holdings []domain.Holding, dates []string) map[string]DividendDay {
 symbolOf := make(map[primitive.ObjectID]string, len(holdings))
 for _, h := range holdings {
  symbolOf[h.ID] = h.Symbol
 }
 sorted := slices.Clone(dates)
 slices.Sort(sorted)

 out := make(map[string]DividendDay, len(sorted))
 toDate := map[string]int64{}
 bySymbol := map[string]int64{}
 i := 0
 for _, date := range sorted {
  cutoff, err := time.Parse(time.DateOnly, date)
  if err != nil {
   continue
  }
  onDay := map[string]int64{}
  for ; i < len(txns) && !domain.UTCDate(txns[i].Date).After(cutoff); i++ {
   t := txns[i]
   c, cents := canonicalCurrency(t.Currency), domain.AmountCents(t.Amount)
   toDate[c] += cents
   bySymbol[symbolOf[t.HoldingID]] += cents
   if domain.UTCDate(t.Date).Equal(cutoff) {
    onDay[c] += cents
   }
  }
  day := DividendDay{ByCurrency: map[string]DividendHistoryPoint{}, BySymbol: map[string]float64{}}
  for c, cents := range toDate {
   day.ByCurrency[c] = DividendHistoryPoint{ToDate: domain.CentsToMoney(cents), OnDay: domain.CentsToMoney(onDay[c])}
  }
  for s, cents := range bySymbol {
   day.BySymbol[s] = domain.CentsToMoney(cents)
  }
  out[date] = day
 }
 return out
}
```

* [ ] **Step 2: Service method (append to `dividends.go`)**

```go
// HistoryOverlay returns the dividends overlay for the given History dates.
func (s *DividendsService) HistoryOverlay(ctx context.Context, userId primitive.ObjectID, dates []string) (_ map[string]DividendDay, retErr error) {
 ctx, span := tracer.Start(ctx, "DividendsService.HistoryOverlay")
 defer endSpan(span, &retErr)
 txns, err := s.txns.ListAllDividends(ctx, userId)
 if err != nil {
  return nil, err
 }
 holdings, err := s.holdings.ListByUser(ctx, userId)
 if err != nil {
  return nil, err
 }
 return DividendOverlay(txns, holdings, dates), nil
}
```

* [ ] **Step 3: History types (Edit `history.go`)**

Current:

```go
 Gold     *domain.GoldHistoryPoint         `json:"gold,omitempty"`     // physical-gold overlay (gold-enabled users, PRD-003 §8)
}
```

Replacement:

```go
 Gold     *domain.GoldHistoryPoint         `json:"gold,omitempty"`     // physical-gold overlay (gold-enabled users, PRD-003 §8)
 // Dividends is the on-read dividend overlay per currency (PRD-005 §9).
 Dividends map[string]DividendHistoryPoint `json:"dividends,omitempty"`
}
```

Current:

```go
 PriceDate  string  `json:"price_date,omitempty"`
 Current    float64 `json:"current"`
}
```

Replacement:

```go
 PriceDate  string  `json:"price_date,omitempty"`
 Current    float64 `json:"current"`
 Dividends  float64 `json:"dividends"` // received on or before the row date (PRD-005 §9)
}
```

* [ ] **Step 4: Spec (Edit `portfolio-api.yaml`)**

In `HistoryHolding.properties`, after `current`, add:

```yaml
        dividends:
          type: number
          format: double
          description: Dividends received from this stock on or before the row date (PRD-005 §9)
```

In `HistoryRow.properties`, after `gold`, add:

```yaml
        dividends:
          type: object
          description: Dividends per currency as of the row date — computed on read, never snapshotted (PRD-005 §9)
          additionalProperties:
            $ref: "#/components/schemas/DividendHistoryOverlay"
```

New schema:

```yaml
    DividendHistoryOverlay:
      type: object
      required: [to_date, on_day]
      properties:
        to_date: { type: number, format: double }
        on_day: { type: number, format: double }
```

Regenerate.

* [ ] **Step 5: Controller (Edit `controllers/history.go`)**

Current:

```go
 h.attachGoldOverlay(ctx, uid, list.Rows)
 return api.ListHistory200JSONResponse(toAPIHistoryList(list)), nil
}
```

Replacement:

```go
 h.attachGoldOverlay(ctx, currentUserId, list.Rows)
 h.attachDividendOverlay(ctx, currentUserId, list.Rows)
 return api.ListHistory200JSONResponse(toAPIHistoryList(list)), nil
}

// attachDividendOverlay decorates rows with dividends to date per currency
// and per stock (PRD-005 §9). Failure degrades to rows without dividends,
// like the gold overlay.
func (h *Controller) attachDividendOverlay(ctx context.Context, userId primitive.ObjectID, rows []services.HistoryRow) {
 if len(rows) == 0 {
  return
 }
 dates := make([]string, 0, len(rows))
 for _, r := range rows {
  dates = append(dates, r.Date)
 }
 overlay, err := h.dividends.HistoryOverlay(ctx, userId, dates)
 if err != nil {
  logger := h.reqLog(ctx)
  logger.Warn("dividend history overlay failed", zap.Error(err))
  return
 }
 for i := range rows {
  day, ok := overlay[rows[i].Date]
  if !ok {
   continue
  }
  if len(day.ByCurrency) > 0 {
   rows[i].Dividends = day.ByCurrency
  }
  for j := range rows[i].Holdings {
   rows[i].Holdings[j].Dividends = day.BySymbol[rows[i].Holdings[j].Symbol]
  }
 }
}
```

`ListHistory` is edited, so its `uid` local is renamed `currentUserId`
(current `uid, err := currentUserID(ctx)` and
`list, err := h.history.List(ctx, uid, from, to)` → replacement
`currentUserId, err := currentUserID(ctx)` and
`list, err := h.history.List(ctx, currentUserId, from, to)`).

Mapping — current:

```go
  Gold:     toAPIGoldOverlay(r.Gold),
 }
}
```

replacement:

```go
  Gold:      toAPIGoldOverlay(r.Gold),
  Dividends: toAPIDividendOverlay(r.Dividends),
 }
}

func toAPIDividendOverlay(in map[string]services.DividendHistoryPoint) *map[string]api.DividendHistoryOverlay {
 if len(in) == 0 {
  return nil
 }
 out := make(map[string]api.DividendHistoryOverlay, len(in))
 for c, p := range in {
  out[c] = api.DividendHistoryOverlay{ToDate: p.ToDate, OnDay: p.OnDay}
 }
 return &out
}
```

current:

```go
   Current:    new(h.Current),
  })
```

replacement:

```go
   Current:    new(h.Current),
   Dividends:  new(h.Dividends),
  })
```

* [ ] **Step 6: `dividend_history_test.go`**

```go
package services

import (
 "testing"

 "go.mongodb.org/mongo-driver/bson/primitive"

 "portfolio-dashboard/internal/domain"
)

func TestDividendOverlay(t *testing.T) {
 tcs, sap := primitive.NewObjectID(), primitive.NewObjectID()
 holdings := []domain.Holding{{ID: tcs, Symbol: "TCS.NS"}, {ID: sap, Symbol: "SAP.DE"}}
 eur := dividendEvent(sap, "2020-02-10", 40)
 eur.Currency = "EUR"
 blank := dividendEvent(tcs, "2020-03-15", 1250.5)
 blank.Currency = "" // legacy blank currency = INR
 txns := []domain.Transaction{dividendEvent(tcs, "2020-01-01", 300), dividendEvent(tcs, "2020-01-01", 300), eur, blank}

 got := DividendOverlay(txns, holdings, []string{"2020-03-15", "2019-12-31", "2020-01-31"})

 if len(got["2019-12-31"].ByCurrency) != 0 {
  t.Error("no dividends before the first payout")
 }
 if p := got["2020-01-31"].ByCurrency["INR"]; p.ToDate != 600 || p.OnDay != 0 {
  t.Errorf("31 Jan INR = %+v, want to_date 600, on_day 0", p)
 }
 if p := got["2020-03-15"].ByCurrency["INR"]; p.ToDate != 1850.5 || p.OnDay != 1250.5 {
  t.Errorf("15 Mar INR = %+v, want 1850.5 / 1250.5 (blank currency counted as INR)", p)
 }
 if p := got["2020-03-15"].ByCurrency["EUR"]; p.ToDate != 40 {
  t.Errorf("15 Mar EUR = %+v, want 40 (never mixed with INR)", p)
 }
 if got["2020-03-15"].BySymbol["TCS.NS"] != 1850.5 || got["2020-03-15"].BySymbol["SAP.DE"] != 40 {
  t.Errorf("per symbol = %v", got["2020-03-15"].BySymbol)
 }
}
```

* [ ] **Step 7: Verify**

```bash
cd backend && go build ./... && go test ./internal/services/ ./internal/controllers/ -run 'DividendOverlay|History' -v 2>&1 | grep -E -- '--- (PASS|FAIL)'
```

Expected: `--- PASS: TestDividendOverlay`; every existing History test PASS.

* [ ] **Step 8: curl (PR8)**

```bash
curl -s -b c.txt "$B/history?from=2020-01-01&to=2020-03-31" | jq '.rows[-1].dividends, .rows[-1].holdings[0].dividends'
# {"INR":{"to_date":…,"on_day":…}} and a per-stock number; rows before the first dividend have no "dividends"
```

* [ ] **Step 9: Commit, push, PR8**

```bash
git checkout -b feat/PD-048-history-dividends-api main
git add backend/api/specs/portfolio-api.yaml backend/api/models.gen.go backend/api/server.gen.go backend/internal/services/dividend_history.go backend/internal/services/dividend_history_test.go backend/internal/services/dividends.go backend/internal/services/history.go backend/internal/controllers/history.go docs/history-and-snapshots.md
git commit -m "✨ Show dividends received in History"
git push -u origin feat/PD-048-history-dividends-api
gh pr create --title "✨ Add dividends received to date to every History row" --body-file pr8.md
```

---

## Task 18: Frontend types, routing, client (PR9)

**Files:**

* Modify: `frontend/src/lib/api/schema.gen.ts`, `frontend/src/types.ts`, `frontend/src/features/admin/actAsRouting.ts`, `actAsRouting.test.ts`, `frontend/src/lib/api/client.ts`

* [ ] **Step 1: Regenerate + types (Edit `types.ts`)**

```bash
cd frontend && npm run gen:api
```

Current:

```ts
export type TransactionWithHolding = Schemas['TransactionWithHolding']
```

Replacement:

```ts
export type TransactionWithHolding = Schemas['TransactionWithHolding']
export type DividendView = Schemas['DividendView']
export type DividendRow = Schemas['DividendRow']
export type DividendImportRow = Schemas['DividendImportRow']
export type DividendImportInput = Schemas['DividendImportInput']
export type DividendImportPreview = Schemas['DividendImportPreview']
export type DividendImportResult = Schemas['DividendImportResult']
export type DividendNameResolution = Schemas['DividendNameResolution']
export type DividendCurrency = DividendImportInput['currency']
```

* [ ] **Step 2: Routing (append to `actAsRouting.ts`)**

WHY: every act-as path decision lives in this one tested module, so a page
can never call the admin's own endpoint under a target's heading (DD-004 §3.3).

```ts
/** Dividend tab + import + delete-all base path (PD-048). */
export function dividendsPath(userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/dividends` : '/dividends'
}

/** Per-holding ledger list/create (PD-048: writable in act-as). */
export function holdingTransactionsPath(holdingId: string, userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/holdings/${holdingId}/transactions` : `/holdings/${holdingId}/transactions`
}

/** One ledger event, for update/delete (PD-048: writable in act-as). */
export function transactionPath(transactionId: string, userId?: string): string {
  const id = actingAs(userId)
  return id ? `/admin/users/${id}/transactions/${transactionId}` : `/transactions/${transactionId}`
}
```

Append to `actAsRouting.test.ts` (and add the three names to its import):

```ts
describe('dividend + ledger write paths', () => {
  it('maps own vs act-as', () => {
    expect(dividendsPath()).toBe('/dividends')
    expect(dividendsPath('u1')).toBe('/admin/users/u1/dividends')
    expect(holdingTransactionsPath('h1')).toBe('/holdings/h1/transactions')
    expect(holdingTransactionsPath('h1', 'u1')).toBe('/admin/users/u1/holdings/h1/transactions')
    expect(transactionPath('t1', ' ')).toBe('/transactions/t1')
    expect(transactionPath('t1', 'u1')).toBe('/admin/users/u1/transactions/t1')
  })
})
```

* [ ] **Step 3: Client (Edit `client.ts`)**

WHY: the import's 422 returns a preview the UI must render, so `ApiError`
keeps the parsed body (an additive optional field).

Current:

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
```

Replacement:

```ts
export class ApiError extends Error {
  // body is the parsed JSON error payload, when there was one (e.g. the
  // dividend import's 422 preview).
  constructor(public status: number, message: string, public body?: unknown) {
    super(message)
  }
}
```

Current: `throw new ApiError(res.status, msg)` — replacement:
`throw new ApiError(res.status, msg, data ?? undefined)`.

Current:

```ts
  listTransactions:   (holdingId: string) =>
    request<Transaction[]>('GET', `/holdings/${holdingId}/transactions`),
  createTransaction:  (holdingId: string, body: TransactionInput) =>
    request<Transaction>('POST', `/holdings/${holdingId}/transactions`, body),
  updateTransaction:  (id: string, body: TransactionInput) =>
    request<Transaction>('PUT', `/transactions/${id}`, body),
  deleteTransaction:  (id: string) =>
    request<DeleteResponse>('DELETE', `/transactions/${id}`),
```

Replacement:

```ts
  listTransactions:   (holdingId: string, userId?: string) =>
    request<Transaction[]>('GET', holdingTransactionsPath(holdingId, userId)),
  createTransaction:  (holdingId: string, body: TransactionInput, userId?: string) =>
    request<Transaction>('POST', holdingTransactionsPath(holdingId, userId), body),
  updateTransaction:  (id: string, body: TransactionInput, userId?: string) =>
    request<Transaction>('PUT', transactionPath(id, userId), body),
  deleteTransaction:  (id: string, userId?: string) =>
    request<DeleteResponse>('DELETE', transactionPath(id, userId)),
```

Current:

```ts
  listAllTransactions: (userId?: string) =>
    request<TransactionWithHolding[]>('GET', transactionsPath(userId)),
```

Replacement:

```ts
  listAllTransactions: (userId?: string) =>
    request<TransactionWithHolding[]>('GET', transactionsPath(userId)),

  // Dividends (PD-048): one currency tab, CSV import, delete-all. Single
  // dividends are written through the ledger methods above.
  listDividends: (currency: DividendCurrency, userId?: string) =>
    request<DividendView>('GET', `${dividendsPath(userId)}?currency=${currency}`),
  previewDividendImport: (body: DividendImportInput, userId?: string) =>
    request<DividendImportPreview>('POST', `${dividendsPath(userId)}/import/preview`, body),
  importDividends: (body: DividendImportInput, userId?: string) =>
    request<DividendImportResult>('POST', `${dividendsPath(userId)}/import`, body),
  deleteAllDividends: (currency: DividendCurrency, userId?: string) =>
    request<{ deleted: number }>('DELETE', `${dividendsPath(userId)}?currency=${currency}`),
```

Current:

```ts
  TransactionWithHolding,
} from '../../types'
import {
  holdingPath,
  holdingsPath,
  pricesPath,
  summaryPath,
  transactionsPath,
} from '../../features/admin/actAsRouting'
```

Replacement:

```ts
  TransactionWithHolding,
  DividendCurrency,
  DividendImportInput,
  DividendImportPreview,
  DividendImportResult,
  DividendView,
} from '../../types'
import {
  dividendsPath,
  holdingPath,
  holdingTransactionsPath,
  holdingsPath,
  pricesPath,
  summaryPath,
  transactionPath,
  transactionsPath,
} from '../../features/admin/actAsRouting'
```

* [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/features/admin/actAsRouting.test.ts
```

Expected: no type errors; routing tests PASS. (Existing ledger callers keep
compiling — `userId` is optional.)

* [ ] **Step 5: Commit**

```bash
git checkout -b feat/PD-048-dividends-page main
git add frontend/src/lib/api/schema.gen.ts frontend/src/types.ts frontend/src/features/admin/actAsRouting.ts frontend/src/features/admin/actAsRouting.test.ts frontend/src/lib/api/client.ts
git commit -m "✨ Add dividend API client and act-as paths"
```

---

## Task 19: Dividends page (PR9)

**Files:**

* Create: `frontend/src/features/dividends/useDividends.ts`, `DividendsPage.tsx`, `DividendsTable.tsx`, `DividendsAnalytics.tsx`, `DividendsPage.test.tsx`
* Modify: `frontend/src/App.tsx`, `frontend/src/features/dashboard/DashboardPage.tsx`

* [ ] **Step 1: `useDividends.ts`**

WHY: same shape as `useAllTransactions` — the page owns no fetch logic.
Holdings are loaded for the add-dividend dropdown and the import popup.

```ts
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { DividendCurrency, DividendView, Holding } from '../../types'

const EMPTY: DividendView = {
  rows: [], by_year: [], by_month: [], by_holding: [],
  summary: { total: 0, count: 0, holdings: 0 },
}

// One currency tab of dividends plus the holdings list. userId targets the
// admin act-as endpoints, like useAllTransactions.
export function useDividends(currency: DividendCurrency, userId?: string) {
  const [view, setView] = useState<DividendView>(EMPTY)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [v, h] = await Promise.all([api.listDividends(currency, userId), api.listHoldings(userId)])
      setView(v)
      setHoldings(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [currency, userId])

  useEffect(() => { void refresh() }, [refresh])

  return { view, holdings, loading, error, refresh }
}
```

* [ ] **Step 2: `DividendsTable.tsx`**

WHY: both running totals come from the server over the whole tab and are
shown untouched, so a filtered row still shows its true place (DD-005 §3.3).

```tsx
import type { CSSProperties } from 'react'
import type { DividendRow } from '../../types'
import { formatDate } from '../../lib/formDates'
import { formatMoney } from '../../lib/currency'
import { EditIcon, TrashIcon } from '../../components/Icon'
import { actionCell, actionTd, actionTh, td, th } from '../history/historyShared'

const num: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const numTh: CSSProperties = { ...th, textAlign: 'right' }

interface Props {
  rows: DividendRow[]
  currency: string
  onEdit?: (row: DividendRow) => void
  onDelete?: (row: DividendRow) => void
}

export default function DividendsTable({ rows, currency, onEdit, onDelete }: Props) {
  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, width: 48 }}>#</th>
            <th style={th}>Date</th>
            <th style={th}>Holding</th>
            <th style={numTh}>Dividend</th>
            <th style={numTh}>Cumulative</th>
            <th style={numTh}>Holding cumulative</th>
            {(onEdit || onDelete) && <th style={actionTh}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{i + 1}</td>
              <td style={td}>{formatDate(r.date)}</td>
              <td style={td}>
                <span style={{ fontWeight: 600 }}>{r.script || '—'}</span>{' '}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.symbol}</span>
              </td>
              <td style={num}>{formatMoney(r.amount, currency)}</td>
              <td style={{ ...num, color: 'var(--green)', fontWeight: 600 }}>{formatMoney(r.cumulative, currency)}</td>
              <td style={num}>{formatMoney(r.holding_cumulative, currency)}</td>
              {(onEdit || onDelete) && (
                <td style={actionTd}>
                  <div style={actionCell}>
                    {onEdit && (
                      <button className="btn-row btn-row-accent" aria-label={`Edit dividend of ${formatDate(r.date)}`} onClick={() => onEdit(r)}>
                        <EditIcon size={16} />
                      </button>
                    )}
                    {onDelete && (
                      <button className="btn-row btn-row-danger" aria-label={`Delete dividend of ${formatDate(r.date)}`} onClick={() => onDelete(r)}>
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

* [ ] **Step 3: `DividendsAnalytics.tsx`**

WHY: Recharts is the app's chart library; tooltips use the shared
theme-aware `chartTooltipProps` (the History dark-mode fix).

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DividendView } from '../../types'
import { formatMoney } from '../../lib/currency'
import { chartTooltipProps, td, th } from '../history/historyShared'

const panel: CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
}
const title: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }

export default function DividendsAnalytics({ view, currency }: { view: DividendView; currency: string }) {
  const [period, setPeriod] = useState<'year' | 'month'>('year')
  const series = (period === 'year' ? view.by_year : view.by_month).map(p => ({ period: p.period, total: p.total }))
  const money = (n: number) => formatMoney(n, currency)

  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
      <div style={panel}>
        <div style={title}>
          <span>Dividend income over time · {currency}</span>
          <span role="group" aria-label="Chart period" style={{ display: 'inline-flex', gap: 4 }}>
            <button className={period === 'month' ? 'btn btn-current' : 'btn'} onClick={() => setPeriod('month')}>Monthly</button>
            <button className={period === 'year' ? 'btn btn-current' : 'btn'} onClick={() => setPeriod('year')}>Yearly</button>
          </span>
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} width={70} />
              <Tooltip {...chartTooltipProps} formatter={(v: number) => money(v)} />
              <Bar dataKey="total" fill="var(--blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={th}>Year</th><th style={{ ...th, textAlign: 'right' }}>Dividends</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {[...view.by_year].reverse().map(y => (
              <tr key={y.period}>
                <td style={td}>{y.period}</td>
                <td style={{ ...td, textAlign: 'right' }}>{y.count}</td>
                <td style={{ ...td, textAlign: 'right' }}>{money(y.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={panel}>
        <div style={title}><span>By holding · {currency}</span><span style={{ color: 'var(--text-muted)' }}>biggest first</span></div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={th}>Holding</th><th style={th}>Share</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
          <tbody>
            {view.by_holding.map(h => (
              <tr key={h.holding_id}>
                <td style={td}>{h.script || h.symbol}</td>
                <td style={td}>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--green)', width: `${Math.max(2, h.share * 100)}%` }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(h.share * 100).toFixed(1)}%</span>
                </td>
                <td style={{ ...td, textAlign: 'right' }}>{money(h.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

* [ ] **Step 4: `DividendsPage.tsx`**

WHY: the tab lives in the URL (`?currency=`) so it is linkable and survives
a refresh; tabs come from `SUPPORTED_CURRENCIES`. The shell mirrors
`TransactionsPage` (nav-glass header, theme picker, page-main).

```tsx
import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SUPPORTED_CURRENCIES, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import { useAuthOptional } from '../auth/AuthContext'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import type { DividendCurrency } from '../../types'
import { useDividends } from './useDividends'
import DividendsTable from './DividendsTable'
import DividendsAnalytics from './DividendsAnalytics'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '7px 10px', color: 'var(--text-primary)', outline: 'none', fontSize: 13,
}
const card: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '11px 13px', flex: '1 1 180px' }
const cardLabel: CSSProperties = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }

interface Props {
  actAsUserId?: string
  actAsLabel?: string
}

// tabFrom reads the ?currency= tab, falling back to INR for anything else.
export function tabFrom(raw: string | null): DividendCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(raw ?? '') ? (raw as DividendCurrency) : 'INR'
}

export default function DividendsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const [params, setParams] = useSearchParams()
  const currency = tabFrom(params.get('currency'))
  const { view, loading, error } = useDividends(currency, actAsUserId)
  const [holdingId, setHoldingId] = useState('')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return view.rows.filter(r =>
      (!holdingId || r.holding_id === holdingId) &&
      (!q || r.script.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q)))
  }, [view.rows, holdingId, search])

  return (
    <div className="page-art page-art-history" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}` : '/'} className="btn-icon" aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Dividends</h1>
          {actAsLabel && (
            <span className="pill" style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)', padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>{actAsLabel}</span>
          )}
        </div>
        <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ width: '100%', maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Currency" style={{ display: 'inline-flex', gap: 4 }}>
            {SUPPORTED_CURRENCIES.map(c => (
              <button key={c} role="tab" aria-selected={c === currency} className={c === currency ? 'btn btn-current' : 'btn'}
                onClick={() => { setParams({ currency: c }); setHoldingId('') }}>
                {currencySymbol(c)} {c}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <select aria-label="Holding" style={{ ...INPUT, cursor: 'pointer' }} value={holdingId} onChange={e => setHoldingId(e.target.value)}>
            <option value="">All holdings</option>
            {view.by_holding.map(h => <option key={h.holding_id} value={h.holding_id}>{h.script || h.symbol}</option>)}
          </select>
          <input aria-label="Search" placeholder="Search holding…" style={{ ...INPUT, minWidth: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
        {loading && <div className="spinner" style={{ width: 16, height: 16 }} />}

        {!loading && view.summary.count === 0 ? (
          <section style={{ ...card, textAlign: 'center', padding: 40 }}>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No {currency} dividends yet</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upload a CSV with this header, or add a dividend by hand.</p>
            <code style={{ fontSize: 12 }}>Date,Share Name,Dividend,CUMULATIVE</code>
          </section>
        ) : (
          <>
            <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={card}><div style={cardLabel}>Total dividends · {currency}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{formatMoney(view.summary.total, currency)}</div></div>
              <div style={card}><div style={cardLabel}>Dividends</div><div style={{ fontSize: 18, fontWeight: 700 }}>{view.summary.count}</div></div>
              <div style={card}><div style={cardLabel}>Holdings paying</div><div style={{ fontSize: 18, fontWeight: 700 }}>{view.summary.holdings}</div></div>
              <div style={card}><div style={cardLabel}>Range</div><div style={{ fontSize: 13, fontWeight: 700 }}>{formatDate(view.summary.first_date)} → {formatDate(view.summary.last_date)}</div></div>
            </section>
            {visible.length !== view.rows.length && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Showing {visible.length} of {view.rows.length}</p>
            )}
            <DividendsTable rows={visible} currency={currency} />
            <DividendsAnalytics view={view} currency={currency} />
          </>
        )}
      </main>
    </div>
  )
}
```

* [ ] **Step 5: Route + nav (Edit)**

`App.tsx` — current:

```tsx
import TransactionsPage from './features/transactions/TransactionsPage'
```

replacement:

```tsx
import TransactionsPage from './features/transactions/TransactionsPage'
import DividendsPage from './features/dividends/DividendsPage'
```

current:

```tsx
            <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
```

replacement:

```tsx
            <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
            <Route path="/dividends" element={<RequireAuth><DividendsPage /></RequireAuth>} />
```

`DashboardPage.tsx` — current:

```tsx
            <ListIcon size={14} /> <span className="dash-nav-label-sm">Transactions</span>
          </Link>
          {!actAsUserId && user?.gold_enabled && (
```

replacement:

```tsx
            <ListIcon size={14} /> <span className="dash-nav-label-sm">Transactions</span>
          </Link>
          {/* Own portfolio only until the act-as route lands (PD-048 task 26). */}
          {!actAsUserId && (
            <Link to="/dividends" className="btn dash-nav-btn">
              <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Dividends</span>
            </Link>
          )}
          {!actAsUserId && user?.gold_enabled && (
```

* [ ] **Step 6: `DividendsPage.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DividendView } from '../../types'

const mockApi = vi.hoisted(() => ({ listDividends: vi.fn(), listHoldings: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import DividendsPage, { tabFrom } from './DividendsPage'

const row = (id: string, holding: string, script: string, date: string, amount: number, cumulative: number, holdingCumulative: number) => ({
  id, holding_id: holding, script, symbol: `${script}.NS`, date, amount, currency: 'INR', cumulative, holding_cumulative: holdingCumulative,
})

const inr: DividendView = {
  rows: [
    row('d1', 'h1', 'TCS', '2020-01-01', 300, 300, 300),
    row('d2', 'h1', 'TCS', '2020-01-01', 300, 600, 600),
    row('d3', 'h2', 'JIO', '2020-03-15', 1250.5, 1850.5, 1250.5),
  ],
  summary: { total: 1850.5, count: 3, holdings: 2, first_date: '2020-01-01', last_date: '2020-03-15' },
  by_year: [{ period: '2020', total: 1850.5, count: 3 }],
  by_month: [{ period: '2020-01', total: 600, count: 2 }, { period: '2020-03', total: 1250.5, count: 1 }],
  by_holding: [
    { holding_id: 'h2', script: 'JIO', symbol: 'JIO.NS', total: 1250.5, count: 1, share: 0.676 },
    { holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 600, count: 2, share: 0.324 },
  ],
}
const empty: DividendView = { rows: [], by_year: [], by_month: [], by_holding: [], summary: { total: 0, count: 0, holdings: 0 } }

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listDividends.mockImplementation((c: string) => Promise.resolve(c === 'INR' ? inr : empty))
  mockApi.listHoldings.mockResolvedValue([])
})

const renderAt = (url = '/dividends') => render(<MemoryRouter initialEntries={[url]}><DividendsPage /></MemoryRouter>)

describe('DividendsPage', () => {
  it('shows the INR tab in order with both running totals', async () => {
    renderAt()
    const tables = await screen.findAllByRole('table')
    const rows = within(tables[0]).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getAllByText(/600\.00/)).toHaveLength(2) // cumulative + holding cumulative
    expect(within(rows[2]).getByText(/1,850\.50/)).toBeInTheDocument()
    expect(mockApi.listDividends).toHaveBeenCalledWith('INR', undefined)
  })

  it('switches tab and refetches', async () => {
    renderAt()
    await screen.findAllByRole('table')
    fireEvent.click(screen.getByRole('tab', { name: /EUR/ }))
    await waitFor(() => expect(mockApi.listDividends).toHaveBeenCalledWith('EUR', undefined))
    expect(await screen.findByText('No EUR dividends yet')).toBeInTheDocument()
  })

  it('filters by holding but keeps the full-tab cumulative', async () => {
    renderAt()
    await screen.findAllByRole('table')
    fireEvent.change(screen.getByLabelText('Holding'), { target: { value: 'h2' } })
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument()
    expect(screen.getAllByText(/1,850\.50/).length).toBeGreaterThan(0)
  })

  it('reads the tab from the URL and falls back to INR', () => {
    expect(tabFrom('EUR')).toBe('EUR')
    expect(tabFrom('USD')).toBe('INR')
    expect(tabFrom(null)).toBe('INR')
  })
})
```

* [ ] **Step 7: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/features/dividends src/features/dashboard
```

Expected: 4 DividendsPage tests PASS; DashboardPage tests PASS.

* [ ] **Step 8: Commit, push, PR9**

```bash
git add frontend/src/features/dividends/useDividends.ts frontend/src/features/dividends/DividendsPage.tsx frontend/src/features/dividends/DividendsTable.tsx frontend/src/features/dividends/DividendsAnalytics.tsx frontend/src/features/dividends/DividendsPage.test.tsx frontend/src/App.tsx frontend/src/features/dashboard/DashboardPage.tsx
git commit -m "✨ Add the Dividends page with INR/EUR tabs"
git push -u origin feat/PD-048-dividends-page
gh pr create --title "✨ Add a Dividends page with INR and EUR tabs, running totals and analytics" --body-file pr9.md
```

PR9 How to test: `make frontend`; dashboard → **Dividends** → the rows from
PR3's curl show with both cumulatives; switch to EUR; filter by holding;
`npx vitest run src/features/dividends` (4 tests).

---

## Task 20: Add / edit / delete / delete all (PR10)

**Files:**

* Create: `frontend/src/features/dividends/DividendModal.tsx`, `DeleteAllDialog.tsx`, `DividendCrud.test.tsx`
* Modify: `frontend/src/features/dividends/DividendsPage.tsx`

* [ ] **Step 1: `DividendModal.tsx`**

WHY: a dividend is a ledger event, so the modal writes through the existing
ledger endpoints — the same path as the per-holding editor, so the two can
never disagree. Identical rows are allowed (PRD-005 §2). Only the tab's
currency holdings are offered. Delete confirmation is in-app, never
`window.confirm`.

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
import { canonicalCurrency, formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import type { DividendCurrency, DividendRow, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '8px 10px', color: 'var(--text-primary)', width: '100%', fontSize: 13,
}
const LABEL: CSSProperties = { display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 5 }

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  editing: DividendRow | null
  userId?: string
  onClose: () => void
  onSaved: () => void
}

export default function DividendModal({ currency, holdings, editing, userId, onClose, onSaved }: Props) {
  const inTab = holdings.filter(h => canonicalCurrency(h.currency) === currency)
  const [holdingId, setHoldingId] = useState(editing?.holding_id ?? inTab[0]?.id ?? '')
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const value = parseDecimalInput(amount)
    if (!holdingId || !date || !(value > 0)) {
      setErr('Choose a holding, a date and a positive amount.')
      return
    }
    setSaving(true)
    setErr('')
    const body = { type: 'dividend' as const, date: `${date}T00:00:00Z`, amount: value, notes: editing?.notes }
    try {
      if (editing) await api.updateTransaction(editing.id, body, userId)
      else await api.createTransaction(holdingId, body, userId)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={editing ? 'Edit dividend' : 'Add dividend'}>
      <div style={{ ...modalCard, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{editing ? 'Edit dividend' : 'Add dividend'}</h2>
        <div>
          <label style={LABEL} htmlFor="div-holding">Holding ({currency})</label>
          <select id="div-holding" style={INPUT} value={holdingId} disabled={!!editing} onChange={e => setHoldingId(e.target.value)}>
            {inTab.map(h => <option key={h.id} value={h.id}>{h.script} · {h.symbol}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL} htmlFor="div-date">Date</label>
          <input id="div-date" type="date" style={INPUT} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL} htmlFor="div-amount">Dividend (total received)</label>
          <DecimalInput id="div-amount" style={INPUT} value={amount} onValueChange={setAmount} />
        </div>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export function DeleteDividendDialog({ row, currency, userId, onClose, onDeleted }: {
  row: DividendRow; currency: string; userId?: string; onClose: () => void; onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteTransaction(row.id, userId)
      onDeleted()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Delete dividend">
      <div style={{ ...modalCard, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Delete dividend?</h2>
        <p style={{ fontSize: 13, margin: 0 }}>{row.script} · {formatDate(row.date)} · {formatMoney(row.amount, currency)}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>The holding's dividend total and every later running total drop by this amount.</p>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-row-danger" disabled={busy} onClick={remove}>Delete</button>
        </div>
      </div>
    </div>
  )
}
```

* [ ] **Step 2: `DeleteAllDialog.tsx`**

WHY: typed `DELETE` plus the count (PRD-005 §8); the copy says hand-entered
dividends go too, because they are the same records.

```tsx
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import type { DividendCurrency } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '8px 10px', color: 'var(--text-primary)', width: '100%', fontSize: 13,
}

export default function DeleteAllDialog({ currency, count, userId, onClose, onDeleted }: {
  currency: DividendCurrency; count: number; userId?: string; onClose: () => void; onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const confirm = async () => {
    setBusy(true)
    try {
      await api.deleteAllDividends(currency, userId)
      onDeleted()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={`Delete all ${currency} dividends`}>
      <div style={{ ...modalCard, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Delete all {currency} dividends?</h2>
        <p style={{ fontSize: 13, margin: 0 }}><strong>{count} dividends</strong> will be deleted, including ones entered in a holding's ledger.</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Holdings, buys, sells and dividends in the other currency are not affected. Dividend totals on the dashboard and in History update straight away.</p>
        <label htmlFor="delete-all-confirm" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Type DELETE to confirm</label>
        <input id="delete-all-confirm" style={INPUT} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-row-danger" disabled={typed !== 'DELETE' || busy} onClick={confirm}>Delete {count} dividends</button>
        </div>
      </div>
    </div>
  )
}
```

* [ ] **Step 3: Wire into the page (Edit `DividendsPage.tsx`)**

Current:

```tsx
import type { DividendCurrency } from '../../types'
import { useDividends } from './useDividends'
import DividendsTable from './DividendsTable'
import DividendsAnalytics from './DividendsAnalytics'
```

Replacement:

```tsx
import type { DividendCurrency, DividendRow } from '../../types'
import { useDividends } from './useDividends'
import DividendsTable from './DividendsTable'
import DividendsAnalytics from './DividendsAnalytics'
import DividendModal, { DeleteDividendDialog } from './DividendModal'
import DeleteAllDialog from './DeleteAllDialog'
```

Current:

```tsx
  const { view, loading, error } = useDividends(currency, actAsUserId)
  const [holdingId, setHoldingId] = useState('')
  const [search, setSearch] = useState('')
```

Replacement:

```tsx
  const { view, holdings, loading, error, refresh } = useDividends(currency, actAsUserId)
  const [holdingId, setHoldingId] = useState('')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ row: DividendRow | null } | null>(null)
  const [deleting, setDeleting] = useState<DividendRow | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  // after closes the dialog and refetches the tab.
  const after = (close: () => void) => () => { close(); void refresh() }
```

Current:

```tsx
          <input aria-label="Search" placeholder="Search holding…" style={{ ...INPUT, minWidth: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
```

Replacement:

```tsx
          <input aria-label="Search" placeholder="Search holding…" style={{ ...INPUT, minWidth: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-primary" onClick={() => setEditor({ row: null })}>+ Add dividend</button>
          {view.summary.count > 0 && (
            <button className="btn btn-row-danger" onClick={() => setDeletingAll(true)}>Delete all {currency}</button>
          )}
        </div>
```

Current:

```tsx
            <DividendsTable rows={visible} currency={currency} />
```

Replacement:

```tsx
            <DividendsTable rows={visible} currency={currency} onEdit={row => setEditor({ row })} onDelete={setDeleting} />
```

Current (end of component):

```tsx
      </main>
    </div>
  )
}
```

Replacement:

```tsx
      </main>
      {editor && (
        <DividendModal currency={currency} holdings={holdings} editing={editor.row} userId={actAsUserId}
          onClose={() => setEditor(null)} onSaved={after(() => setEditor(null))} />
      )}
      {deleting && (
        <DeleteDividendDialog row={deleting} currency={currency} userId={actAsUserId}
          onClose={() => setDeleting(null)} onDeleted={after(() => setDeleting(null))} />
      )}
      {deletingAll && (
        <DeleteAllDialog currency={currency} count={view.summary.count} userId={actAsUserId}
          onClose={() => setDeletingAll(false)} onDeleted={after(() => setDeletingAll(false))} />
      )}
    </div>
  )
}
```

* [ ] **Step 4: `DividendCrud.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockApi = vi.hoisted(() => ({
  listDividends: vi.fn(), listHoldings: vi.fn(),
  createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), deleteAllDividends: vi.fn(),
}))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import DividendsPage from './DividendsPage'

const view = {
  rows: [{ id: 'd1', holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: '2020-01-01', amount: 300, currency: 'INR', cumulative: 300, holding_cumulative: 300 }],
  summary: { total: 300, count: 1, holdings: 1, first_date: '2020-01-01', last_date: '2020-01-01' },
  by_year: [{ period: '2020', total: 300, count: 1 }], by_month: [{ period: '2020-01', total: 300, count: 1 }],
  by_holding: [{ holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 300, count: 1, share: 1 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listDividends.mockResolvedValue(view)
  mockApi.listHoldings.mockResolvedValue([
    { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR' },
    { id: 'h9', script: 'SAP', symbol: 'SAP.DE', currency: 'EUR' },
  ])
  mockApi.createTransaction.mockResolvedValue({})
  mockApi.deleteAllDividends.mockResolvedValue({ deleted: 1 })
  mockApi.deleteTransaction.mockResolvedValue({})
})

const renderPage = () => render(<MemoryRouter initialEntries={['/dividends']}><DividendsPage /></MemoryRouter>)

describe('dividend CRUD', () => {
  it('adds a dividend through the ledger to an INR holding and refreshes', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('+ Add dividend'))
    expect(screen.queryByRole('option', { name: /SAP/ })).toBeNull() // EUR holding not offered on the INR tab
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } })
    fireEvent.change(screen.getByLabelText('Dividend (total received)'), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mockApi.createTransaction).toHaveBeenCalledWith('h1',
      { type: 'dividend', date: '2024-03-15T00:00:00Z', amount: 300, notes: undefined }, undefined))
    await waitFor(() => expect(mockApi.listDividends).toHaveBeenCalledTimes(2))
  })

  it('deletes one dividend after an in-app confirmation', async () => {
    renderPage()
    fireEvent.click(await screen.findByLabelText('Delete dividend of 01-01-2020'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockApi.deleteTransaction).toHaveBeenCalledWith('d1', undefined))
  })

  it('delete all needs DELETE typed', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Delete all INR'))
    const button = screen.getByRole('button', { name: 'Delete 1 dividends' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    fireEvent.click(button)
    await waitFor(() => expect(mockApi.deleteAllDividends).toHaveBeenCalledWith('INR', undefined))
  })
})
```

* [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/features/dividends
```

Expected: DividendsPage (4) + DividendCrud (3) PASS.

* [ ] **Step 6: Commit, push, PR10**

```bash
git checkout -b feat/PD-048-dividends-crud-ui main
git add frontend/src/features/dividends/DividendModal.tsx frontend/src/features/dividends/DeleteAllDialog.tsx frontend/src/features/dividends/DividendCrud.test.tsx frontend/src/features/dividends/DividendsPage.tsx
git commit -m "✨ Add, edit and delete dividends on the page"
git push -u origin feat/PD-048-dividends-crud-ui
gh pr create --title "✨ Add, edit, delete and delete-all dividends on the Dividends page" --body-file pr10.md
```

---

## Task 21: Shared date and money-cell parsers in `lib/` (PR11)

**Files:**

* Modify: `frontend/src/lib/formDates.ts`, `formDates.test.ts`, `frontend/src/lib/formNumbers.ts`, `formNumbers.test.ts`, `frontend/src/features/history/historyShared.ts`

* [ ] **Step 1: Move `normaliseDate` with a real-calendar check (Edit)**

WHY: the dividend CSV needs exactly this date parser; one implementation, two
callers (reuse rule). The calendar check protects both callers — the current
regex accepts `31/02/2021` and `13/13/2020`.

Remove from `historyShared.ts` (current):

```ts
// normaliseDate accepts the common European-style formats users paste
// from spreadsheets and returns "YYYY-MM-DD". Returns "" when the input
// can't be parsed as a date.
export function normaliseDate(s: string): string {
  const t = s.trim()
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return ''
}
```

Append to `lib/formDates.ts`:

```ts
// normaliseDate accepts the day-first formats users paste or upload from
// spreadsheets — YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (1-digit day
// or month allowed) — and returns "YYYY-MM-DD", or "" when the input is not a
// real calendar date (31/02/2021 and 13/13/2020 are rejected).
export function normaliseDate(s: string): string {
  const t = s.trim()
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  const dayFirst = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(t)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (dayFirst) [d, m, y] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])]
  else return ''
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
```

At the top of `historyShared.ts`, after its existing imports, add — so
`parsePasteText` keeps working and every existing History import is
unchanged:

```ts
import { normaliseDate } from '../../lib/formDates'

// Moved to lib/ for the dividend CSV import (PD-048); re-exported so History
// callers and tests keep importing from here.
export { normaliseDate }
```

* [ ] **Step 2: `parseMoneyCell` on top of `parseDecimalInput` (append to `lib/formNumbers.ts`)**

WHY: History's `parseAmount` strips every comma, so a European cell on the EUR
tab is silently misread (`1.250,50` → 1.2505, `40,5` → 405). The app already
has a parser that reads both number styles — `parseDecimalInput`, used by
every amount input including the add-dividend modal — so the CSV reuses it
and a CSV cell and a typed amount always read the same. `parseAmount` stays
where it is for History's paste, unchanged.

```ts
const CURRENCY_SIGNS_RE = /[₹€$£]/g

// parseMoneyCell reads a spreadsheet money cell in either number style —
// 1,250.50 (Indian/English) or 1.250,50 (European) — by stripping currency
// signs and delegating to parseDecimalInput, the parser the amount inputs
// use. Empty → 0; unreadable → NaN.
export function parseMoneyCell(s: string): number {
  return parseDecimalInput(s.replace(CURRENCY_SIGNS_RE, ''))
}
```

* [ ] **Step 3: Tests (append)**

`formDates.test.ts` (add `normaliseDate` to its import):

```ts
describe('normaliseDate', () => {
  it('reads day-first dates', () => {
    expect(normaliseDate('1/2/2020')).toBe('2020-02-01')
    expect(normaliseDate('12/5/2023')).toBe('2023-05-12')
    expect(normaliseDate('15-03-2020')).toBe('2020-03-15')
    expect(normaliseDate('2020-03-15')).toBe('2020-03-15')
  })
  it('rejects impossible dates', () => {
    expect(normaliseDate('31/02/2021')).toBe('')
    expect(normaliseDate('13/13/2020')).toBe('')
    expect(normaliseDate('abc')).toBe('')
  })
})
```

`formNumbers.test.ts` (add `parseMoneyCell` to its import):

```ts
describe('parseMoneyCell', () => {
  it('reads both number styles and strips currency signs', () => {
    expect(parseMoneyCell('₹1,250.50')).toBe(1250.5)
    expect(parseMoneyCell('1.250,50')).toBe(1250.5)
    expect(parseMoneyCell('€ 40,5')).toBe(40.5)
    expect(parseMoneyCell('12,34,567.89')).toBe(1234567.89)
    expect(parseMoneyCell('')).toBe(0)
    expect(parseMoneyCell('abc')).toBeNaN()
  })
  it('reads a cell the same way as a typed amount', () => {
    for (const raw of ['1.250,50', '40,5', '1,250.50']) {
      expect(parseMoneyCell(raw)).toBe(parseDecimalInput(raw))
    }
  })
})
```

* [ ] **Step 4: Verify**

```bash
cd frontend && npx vitest run src/lib src/features/history
```

Expected: all PASS, including every existing History paste test.

* [ ] **Step 5: Commit**

```bash
git checkout -b feat/PD-048-dividends-import-ui main
git add frontend/src/lib/formDates.ts frontend/src/lib/formDates.test.ts frontend/src/lib/formNumbers.ts frontend/src/lib/formNumbers.test.ts frontend/src/features/history/historyShared.ts
git commit -m "♻️ Share date and money-cell parsers in lib"
```

---

## Task 22: CSV tokenizer + dividend CSV parser (PR11)

**Files:**

* Create: `frontend/src/lib/csv.ts`, `csv.test.ts`, `frontend/src/features/dividends/dividendCsv.ts`, `dividendCsv.test.ts`

* [ ] **Step 1: `lib/csv.ts`**

WHY: spreadsheet exports quote amounts like `"1,250.50"`, so `split(',')`
breaks real files. About 40 lines beats a dependency.

```ts
// parseCsv tokenises RFC-4180 CSV: quoted fields, "" escapes, embedded
// commas/newlines, CRLF or LF, a leading BOM. Blank lines are kept as ['']
// so file line numbers stay true.
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}
```

* [ ] **Step 2: `dividendCsv.ts`**

WHY: header matched by name (case/space-insensitive, any order); CUMULATIVE
optional and passed through only for the server's warning check; every error
carries its file line so the owner finds it in the spreadsheet. Lines the
browser already rejects are counted as invalid and never sent.

```ts
import { parseCsv } from '../../lib/csv'
import { normaliseDate } from '../../lib/formDates'
import { parseMoneyCell } from '../../lib/formNumbers'
import type { DividendImportRow } from '../../types'

export const MAX_ROWS = 5000
const COLUMNS = { date: 'date', share_name: 'share name', amount: 'dividend', cumulative: 'cumulative' } as const
const REQUIRED = ['date', 'share_name', 'amount'] as const

export interface DividendCsvError { line: number; reason: string }
export interface DividendCsv { rows: DividendImportRow[]; errors: DividendCsvError[]; total: number }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// parseDividendCsv reads a Date,Share Name,Dividend[,CUMULATIVE] file. rows
// are the parseable lines (sent to the server); errors are lines the browser
// can already reject; total counts every data line.
export function parseDividendCsv(text: string, today: string): DividendCsv {
  const all = parseCsv(text)
  const h = all.findIndex(r => r.some(c => c.trim() !== ''))
  if (h < 0) return { rows: [], errors: [{ line: 1, reason: 'The file is empty' }], total: 0 }
  const header = all[h].map(norm)
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, n]) => [k, header.indexOf(n)])) as Record<keyof typeof COLUMNS, number>
  const missing = REQUIRED.filter(k => col[k] < 0).map(k => COLUMNS[k])
  if (missing.length) {
    return { rows: [], errors: [{ line: h + 1, reason: `Missing column(s): ${missing.join(', ')}. Expected header: Date,Share Name,Dividend,CUMULATIVE` }], total: 0 }
  }

  const rows: DividendImportRow[] = []
  const errors: DividendCsvError[] = []
  let total = 0
  for (let i = h + 1; i < all.length; i++) {
    const cells = all[i]
    if (cells.every(c => c.trim() === '')) continue
    total++
    const line = i + 1
    const rawDate = cells[col.date] ?? ''
    const date = normaliseDate(rawDate)
    const share_name = (cells[col.share_name] ?? '').trim().replace(/\s+/g, ' ')
    const amount = parseMoneyCell(cells[col.amount] ?? '')
    const cum = col.cumulative >= 0 ? parseMoneyCell(cells[col.cumulative] ?? '') : NaN
    const reasons: string[] = []
    if (!date) reasons.push(`Date "${rawDate}" is not a valid DD/MM/YYYY date`)
    else if (date > today) reasons.push('Date is in the future')
    if (!share_name) reasons.push('Share Name is empty')
    if (!(amount > 0)) reasons.push(`Dividend "${cells[col.amount] ?? ''}" is not a positive number`)
    if (reasons.length) {
      errors.push({ line, reason: reasons.join('; ') })
      continue
    }
    rows.push({ line, date, share_name, amount, ...(Number.isFinite(cum) && cum > 0 ? { cumulative: cum } : {}) })
  }
  if (total > MAX_ROWS) errors.push({ line: 0, reason: `More than ${MAX_ROWS} rows — split the file` })
  return { rows, errors, total }
}

// todayIST is the IST calendar day as YYYY-MM-DD — the server's istToday.
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}
```

* [ ] **Step 3: Tests**

`lib/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
    expect(parseCsv('﻿a,"1,250.50",c\r\n\r\n"he said ""hi""",x\n')).toEqual([
      ['a', '1,250.50', 'c'], [''], ['he said "hi"', 'x'],
    ])
  })
  it('keeps a final line without newline', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
  })
})
```

`features/dividends/dividendCsv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseDividendCsv, todayIST } from './dividendCsv'

const TODAY = '2026-10-30'

describe('parseDividendCsv', () => {
  it('reads the owner sheet, keeping in-sheet repeats', () => {
    const csv = 'Date,Share Name,Dividend,CUMULATIVE\n1/1/2020,TCS,300,300\n1/1/2020,TCS,300,600\n15/03/2020,Jio Platforms,"₹1,250.50","1,850.50"\n'
    const r = parseDividendCsv(csv, TODAY)
    expect(r.errors).toEqual([])
    expect(r.total).toBe(3)
    expect(r.rows).toEqual([
      { line: 2, date: '2020-01-01', share_name: 'TCS', amount: 300, cumulative: 300 },
      { line: 3, date: '2020-01-01', share_name: 'TCS', amount: 300, cumulative: 600 },
      { line: 4, date: '2020-03-15', share_name: 'Jio Platforms', amount: 1250.5, cumulative: 1850.5 },
    ])
  })
  it('reads European-style amounts on an EUR sheet', () => {
    const csv = 'Date,Share Name,Dividend,CUMULATIVE\n10/02/2020,SAP,"1.250,50","1.250,50"\n11/02/2020,SAP,"40,5","1.291,00"\n'
    const r = parseDividendCsv(csv, TODAY)
    expect(r.errors).toEqual([])
    expect(r.rows.map(x => [x.amount, x.cumulative])).toEqual([[1250.5, 1250.5], [40.5, 1291]])
  })
  it('accepts any header case and order, CUMULATIVE optional', () => {
    const r = parseDividendCsv(' dividend , SHARE  NAME,date\n300,TCS,1/2/2020\n', TODAY)
    expect(r.rows).toEqual([{ line: 2, date: '2020-02-01', share_name: 'TCS', amount: 300 }])
  })
  it('reports a missing column once', () => {
    const r = parseDividendCsv('Date,Share Name\n1/1/2020,TCS\n', TODAY)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].reason).toMatch(/Missing column\(s\): dividend/)
  })
  it('flags bad lines with true line numbers and does not send them', () => {
    const csv = 'Date,Share Name,Dividend\n\n31/02/2021,ITC,410\n2/6/2022,HDFC,abc\n3/7/2022,,10\n1/1/2099,TCS,5\n'
    const r = parseDividendCsv(csv, TODAY)
    expect(r.rows).toEqual([])
    expect(r.total).toBe(4)
    expect(r.errors.map(e => e.line)).toEqual([3, 4, 5, 6])
    expect(r.errors[3].reason).toBe('Date is in the future')
  })
  it('computes the IST day', () => {
    expect(todayIST(new Date('2026-10-30T20:00:00Z'))).toBe('2026-10-31')
  })
})
```

* [ ] **Step 4: Verify**

```bash
cd frontend && npx vitest run src/lib/csv.test.ts src/features/dividends/dividendCsv.test.ts
```

Expected: 2 + 5 PASS.

* [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/csv.ts frontend/src/lib/csv.test.ts frontend/src/features/dividends/dividendCsv.ts frontend/src/features/dividends/dividendCsv.test.ts
git commit -m "✨ Parse dividend CSV files in the browser"
```

---

## Task 23: Import dialog + name popup (PR11)

**Files:**

* Create: `frontend/src/features/dividends/NameConfirmDialog.tsx`, `DividendImportModal.tsx`, `DividendImport.test.tsx`
* Modify: `frontend/src/features/dividends/DividendsPage.tsx`

* [ ] **Step 1: `NameConfirmDialog.tsx`**

WHY: the owner's rule — any name that is not an exact match is confirmed
here, never guessed (PRD-005 §6.2). A suggestion is pre-selected only when
the server marked it a clear best; "Leave unresolved" is an explicit answer
(its rows become invalid). Continue is enabled once every name is answered.

```tsx
import { useState } from 'react'
import type { DividendNameResolution, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

export type Answers = Record<string, string | null>

const OTHER = '__other__'
const NONE = '__none__'

export default function NameConfirmDialog({ names, holdings, currencyLabel, onBack, onConfirm }: {
  names: DividendNameResolution[]
  holdings: Holding[]
  currencyLabel: string
  onBack: () => void
  onConfirm: (answers: Answers) => void
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map(n => [n.sheet_name, n.preselect ?? ''])))
  const [other, setOther] = useState<Record<string, string>>({})

  const answered = names.every(n => {
    const c = choice[n.sheet_name]
    return c === NONE || (c === OTHER ? !!other[n.sheet_name] : !!c)
  })

  const confirm = () => {
    const answers: Answers = {}
    for (const n of names) {
      const c = choice[n.sheet_name]
      answers[n.sheet_name] = c === NONE ? null : c === OTHER ? other[n.sheet_name] : c
    }
    onConfirm(answers)
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Confirm share names">
      <div style={{ ...modalCard, width: 'min(620px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Confirm share names · {currencyLabel}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time.
        </p>
        {names.map(n => (
          <fieldset key={n.sheet_name} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <legend style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--yellow)' }}>
              {n.sheet_name} <span style={{ color: 'var(--text-muted)' }}>· {n.rows} rows{n.status === 'ambiguous' ? ' · matches more than one holding' : ''}</span>
            </legend>
            {n.suggestions.map(s => (
              <label key={s.holding_id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="radio" name={n.sheet_name} checked={choice[n.sheet_name] === s.holding_id}
                  onChange={() => setChoice(c => ({ ...c, [n.sheet_name]: s.holding_id }))} />
                {s.script} · {s.symbol}{n.preselect === s.holding_id && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>suggested</span>}
              </label>
            ))}
            <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
              <input type="radio" name={n.sheet_name} checked={choice[n.sheet_name] === OTHER}
                onChange={() => setChoice(c => ({ ...c, [n.sheet_name]: OTHER }))} />
              Other holding…
              <select aria-label={`Other holding for ${n.sheet_name}`} value={other[n.sheet_name] ?? ''}
                onChange={e => { setOther(o => ({ ...o, [n.sheet_name]: e.target.value })); setChoice(c => ({ ...c, [n.sheet_name]: OTHER })) }}>
                <option value="">Choose…</option>
                {holdings.map(h => <option key={h.id} value={h.id}>{h.script} · {h.symbol}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="radio" name={n.sheet_name} checked={choice[n.sheet_name] === NONE}
                onChange={() => setChoice(c => ({ ...c, [n.sheet_name]: NONE }))} />
              Leave unresolved <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>its rows become invalid</span>
            </label>
          </fieldset>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onBack}>Back</button>
          <button className="btn-primary" disabled={!answered} onClick={confirm}>Continue to preview</button>
        </div>
      </div>
    </div>
  )
}
```

* [ ] **Step 2: `DividendImportModal.tsx`**

WHY: the steps follow PRD-005 §7: pick → (popup) → preview → confirm →
result. The browser's parse errors are merged into the counts so the preview
always shows all three numbers; Confirm stays disabled while anything is
invalid. The server re-checks on confirm; its 422 preview replaces the local
one.

```tsx
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import type { DividendCurrency, DividendImportPreview, DividendImportResult, DividendImportRow, Holding } from '../../types'
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { parseDividendCsv, todayIST, type DividendCsvError } from './dividendCsv'
import NameConfirmDialog, { type Answers } from './NameConfirmDialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const open = (p: DividendImportPreview, answers: Answers) =>
  p.names.filter(n => (n.status === 'needs_confirmation' || n.status === 'ambiguous') && !(n.sheet_name in answers))

export default function DividendImportModal({ currency, holdings, userId, onClose, onImported }: {
  currency: DividendCurrency; holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<DividendImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<DividendCsvError[]>([])
  const [total, setTotal] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [preview, setPreview] = useState<DividendImportPreview | null>(null)
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inTab = useMemo(() => holdings.filter(h => canonicalCurrency(h.currency) === currency), [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`

  const runPreview = async (r: DividendImportRow[], a: Answers) => {
    setBusy(true)
    setErr('')
    try {
      const p = await api.previewDividendImport({ currency, rows: r, mappings: a }, userId)
      setPreview(p)
      setStep(open(p, a).length > 0 ? 'names' : 'preview')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) { setErr('The file is larger than 1 MB — split it.'); return }
    setFileName(file.name)
    const parsed = parseDividendCsv(await file.text(), todayIST())
    setRows(parsed.rows)
    setLocalErrors(parsed.errors)
    setTotal(parsed.total)
    setAnswers({})
    if (parsed.rows.length === 0) {
      setPreview({ counts: { ready: 0, duplicate: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] })
      setStep('preview')
      return
    }
    await runPreview(parsed.rows, {})
  }

  const counts = preview && {
    ready: preview.counts.ready,
    duplicate: preview.counts.duplicate,
    invalid: preview.counts.invalid + localErrors.length,
    total: Math.max(total, preview.counts.total + localErrors.length),
  }
  const invalidLines = [
    ...localErrors.map(e => ({ line: e.line, reason: e.reason })),
    ...(preview?.rows.filter(r => r.status === 'invalid').map(r => ({ line: r.line, reason: r.reason ?? '' })) ?? []),
  ].sort((a, b) => a.line - b.line)

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      setResult(await api.importDividends({ currency, rows, mappings: answers }, userId))
      setStep('result')
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body) {
        setPreview(e.body as DividendImportPreview)
        setErr('The data changed since the preview — review it again.')
      } else {
        setErr(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  if (step === 'names' && preview) {
    return (
      <NameConfirmDialog names={open(preview, answers)} holdings={inTab} currencyLabel={label} onBack={() => setStep('pick')}
        onConfirm={a => { const next = { ...answers, ...a }; setAnswers(next); void runPreview(rows, next) }} />
    )
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import dividends">
      <div style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{step === 'result' ? 'Import complete' : step === 'preview' ? 'Preview import' : 'Import dividends'}</h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Importing into <strong>{label}</strong> · dates read as <strong>DD/MM/YYYY</strong> (1/2/2020 = 1 Feb 2020){fileName && ` · ${fileName}`}
        </p>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}

        {step === 'pick' && (
          <>
            <label htmlFor="dividend-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="dividend-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => void pick(e.target.files?.[0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Expected header (any order, any case; CUMULATIVE optional): <code>Date,Share Name,Dividend,CUMULATIVE</code>. Nothing is saved until you confirm.</p>
            {busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {step === 'preview' && counts && preview && (
          <>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 320 }}>
              <thead><tr><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                <tr><td style={td}>Ready to import</td><td style={{ ...td, textAlign: 'right' }}>{counts.ready}</td></tr>
                <tr><td style={td}>Already exists</td><td style={{ ...td, textAlign: 'right' }}>{counts.duplicate}</td></tr>
                <tr><td style={td}>Invalid</td><td style={{ ...td, textAlign: 'right' }}>{counts.invalid}</td></tr>
                <tr><td style={{ ...td, fontWeight: 700 }}>Total</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{counts.total}</td></tr>
              </tbody>
            </table>
            {counts.invalid > 0 && (
              <>
                <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}><strong>{counts.invalid} rows need fixing</strong> before you can import. Nothing has been saved.</p>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th style={th}>Line</th><th style={th}>Problem</th></tr></thead>
                  <tbody>{invalidLines.map(l => <tr key={l.line}><td style={td}>{l.line}</td><td style={td}>{l.reason}</td></tr>)}</tbody>
                </table>
              </>
            )}
            {preview.warnings.map(w => (
              <p key={w.line} style={{ color: 'var(--yellow)', fontSize: 12, margin: 0 }}>⚠ Line {w.line}: {w.message}. Import is still allowed.</p>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {Object.keys(answers).length > 0 && <button className="btn" onClick={() => { setAnswers({}); void runPreview(rows, {}) }}>Change names</button>}
              <button className="btn" onClick={() => setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={counts.invalid > 0 || busy} onClick={confirm}>Confirm import</button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <p style={{ color: 'var(--green)', margin: 0 }}><strong>{result.imported} imported</strong> into {label}.</p>
            {result.duplicates.length > 0 && (
              <>
                <p role="status" style={{ color: 'var(--yellow)', margin: 0 }}>⚠ <strong>{result.duplicates.length} duplicates are discarded</strong> — already saved.</p>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th style={th}>Line</th><th style={th}>Date</th><th style={th}>Share</th><th style={{ ...th, textAlign: 'right' }}>Dividend</th></tr></thead>
                  <tbody>{result.duplicates.map(d => (
                    <tr key={d.line}><td style={td}>{d.line}</td><td style={td}>{formatDate(d.date)}</td><td style={td}>{d.share_name}</td><td style={{ ...td, textAlign: 'right' }}>{formatMoney(d.amount, currency)}</td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => { onImported(); onClose() }}>Done</button>
            </div>
          </>
        )}

        {step !== 'result' && (
          <div>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

* [ ] **Step 3: Wire (Edit `DividendsPage.tsx`)**

Current:

```tsx
import DeleteAllDialog from './DeleteAllDialog'
```

Replacement:

```tsx
import DeleteAllDialog from './DeleteAllDialog'
import DividendImportModal from './DividendImportModal'
```

Current:

```tsx
  const [deletingAll, setDeletingAll] = useState(false)
```

Replacement:

```tsx
  const [deletingAll, setDeletingAll] = useState(false)
  const [importing, setImporting] = useState(false)
```

Current:

```tsx
          <button className="btn-primary" onClick={() => setEditor({ row: null })}>+ Add dividend</button>
```

Replacement:

```tsx
          <button className="btn" onClick={() => setImporting(true)}>⇪ Upload CSV</button>
          <button className="btn-primary" onClick={() => setEditor({ row: null })}>+ Add dividend</button>
```

Current:

```tsx
      </main>
      {editor && (
```

Replacement:

```tsx
      </main>
      {importing && (
        <DividendImportModal currency={currency} holdings={holdings} userId={actAsUserId}
          onClose={() => setImporting(false)} onImported={() => void refresh()} />
      )}
      {editor && (
```

* [ ] **Step 4: `DividendImport.test.tsx`**

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../../lib/api/client'

const mockApi = vi.hoisted(() => ({ previewDividendImport: vi.fn(), importDividends: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import DividendImportModal from './DividendImportModal'

const holdings = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR' },
  { id: 'h2', script: 'Jio Platforms Ltd', symbol: 'JIOPLA.NS', currency: 'INR' },
]
const csv = 'Date,Share Name,Dividend,CUMULATIVE\n1/1/2020,TCS,300,300\n1/1/2020,TCS,300,600\n15/03/2020,JLP,500,1100\n'
const pick = (text: string) =>
  fireEvent.change(screen.getByLabelText('Choose a .csv file'), { target: { files: [new File([text], 'divs.csv', { type: 'text/csv' })] } })

const names = [
  { sheet_name: 'TCS', rows: 2, status: 'auto', holding_id: 'h1', matched_by: 'script', suggestions: [] },
  { sheet_name: 'JLP', rows: 1, status: 'needs_confirmation', suggestions: [] },
]
const needsJlp = { counts: { ready: 2, duplicate: 0, invalid: 1, total: 3 }, names, rows: [], warnings: [] }
const ready = { counts: { ready: 2, duplicate: 1, invalid: 0, total: 3 }, names, rows: [], warnings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.previewDividendImport.mockResolvedValueOnce(needsJlp).mockResolvedValueOnce(ready)
  mockApi.importDividends.mockResolvedValue({ imported: 2, duplicates: [{ line: 2, date: '2020-01-01', share_name: 'TCS', amount: 300 }], batch_id: 'b', warnings: [] })
})

const renderModal = () => render(<DividendImportModal currency="INR" holdings={holdings} onClose={vi.fn()} onImported={vi.fn()} />)

describe('DividendImportModal', () => {
  it('confirms an inconsistent name, previews, imports and reports duplicates', async () => {
    renderModal()
    expect(screen.getByText(/Importing into/)).toHaveTextContent('₹ INR')
    pick(csv)
    expect(await screen.findByRole('dialog', { name: 'Confirm share names' })).toBeInTheDocument()
    const cont = screen.getByRole('button', { name: 'Continue to preview' })
    expect(cont).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Other holding for JLP'), { target: { value: 'h2' } })
    fireEvent.click(cont)
    await waitFor(() => expect(mockApi.previewDividendImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: 'INR', mappings: { JLP: 'h2' } }), undefined))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByText('2 imported')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 duplicates are discarded')
  })

  it('keeps Confirm disabled while any row is invalid', async () => {
    mockApi.previewDividendImport.mockReset().mockResolvedValue({ ...ready, names: [], counts: { ready: 1, duplicate: 0, invalid: 0, total: 1 } })
    renderModal()
    pick('Date,Share Name,Dividend\n1/1/2020,TCS,300\n31/02/2021,TCS,300\n')
    expect(await screen.findByText(/1 rows need fixing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
    expect(screen.getByText(/31\/02\/2021/)).toBeInTheDocument()
  })

  it('shows the server preview when confirm finds a new problem (422)', async () => {
    mockApi.previewDividendImport.mockReset().mockResolvedValue({ ...ready, names: [] })
    mockApi.importDividends.mockRejectedValue(new ApiError(422, 'invalid', {
      ...ready, names: [], counts: { ready: 1, duplicate: 1, invalid: 1, total: 3 },
      rows: [{ line: 3, status: 'invalid', reason: 'no holding chosen for "X"' }],
    }))
    renderModal()
    pick('Date,Share Name,Dividend\n1/1/2020,TCS,300\n')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByText(/data changed since the preview/)).toBeInTheDocument()
    expect(screen.getByText('no holding chosen for "X"')).toBeInTheDocument()
  })
})
```

* [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/features/dividends src/lib src/features/history
```

Expected: all PASS (3 import tests added).

* [ ] **Step 6: Commit, push, PR11**

```bash
git add frontend/src/features/dividends/NameConfirmDialog.tsx frontend/src/features/dividends/DividendImportModal.tsx frontend/src/features/dividends/DividendImport.test.tsx frontend/src/features/dividends/DividendsPage.tsx
git commit -m "✨ Upload dividend CSVs with name confirmation"
git push -u origin feat/PD-048-dividends-import-ui
gh pr create --title "✨ Upload a dividend CSV with share-name confirmation, preview and duplicate report" --body-file pr11.md
```

---

## Task 24: Dashboard dividend figures (PR12)

**Files:**

* Modify: `frontend/src/features/holdings/HoldingsTable.tsx`, `frontend/src/components/SummaryCards.tsx`, `frontend/src/components/SummaryCards.test.tsx`, `frontend/src/features/dashboard/DashboardPage.tsx`

* [ ] **Step 1: Dividends column + total (Edit `HoldingsTable.tsx`)**

WHY: `total_dividends` is already ledger-derived on every holding; this is
display only, beside P&L — never added into it (PRD-005 §9).

Current:

```tsx
    acc.real += h.realized_pnl || 0
```

Replacement:

```tsx
    acc.real += h.realized_pnl || 0
    acc.div += h.total_dividends || 0
```

Current:

```tsx
  }, { cost: 0, value: 0, unreal: 0, real: 0, dayGain: null as number | null, dayGainPartial: false })
```

Replacement:

```tsx
  }, { cost: 0, value: 0, unreal: 0, real: 0, div: 0, dayGain: null as number | null, dayGainPartial: false })
```

Current:

```tsx
            <TH className="col-hide-sm">Realised Gain</TH>
            <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
```

Replacement:

```tsx
            <TH className="col-hide-sm">Realised Gain</TH>
            <TH className="col-hide-sm">Dividends</TH>
            <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
```

Current: `<td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>`
Replacement: `<td colSpan={10} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>`

Current:

```tsx
                <TD className={`mono col-hide-sm ${realized !== 0 ? realCls : 'neutral'}`}>
                  {realized !== 0 ? MONEY(h.realized_pnl) : '—'}
                </TD>
```

Replacement:

```tsx
                <TD className={`mono col-hide-sm ${realized !== 0 ? realCls : 'neutral'}`}>
                  {realized !== 0 ? MONEY(h.realized_pnl) : '—'}
                </TD>

                {/* Dividends received — ledger-derived, native currency (PRD-005 §9) */}
                <TD className={`mono col-hide-sm ${(h.total_dividends ?? 0) > 0 ? 'pos' : 'neutral'}`}>
                  {(h.total_dividends ?? 0) > 0 ? MONEY(h.total_dividends) : '—'}
                </TD>
```

Current:

```tsx
              <TD className={`mono col-hide-sm ${totals.real >= 0 ? 'pos' : 'neg'}`}>{TOTAL_MONEY(totals.real)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
```

Replacement:

```tsx
              <TD className={`mono col-hide-sm ${totals.real >= 0 ? 'pos' : 'neg'}`}>{TOTAL_MONEY(totals.real)}</TD>
              <TD className={`mono col-hide-sm ${totals.div > 0 ? 'pos' : 'neutral'}`}>{TOTAL_MONEY(totals.div)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
```

* [ ] **Step 2: Dividend income card (Edit `SummaryCards.tsx`)**

WHY: reuses the existing `BreakdownLine` row so the card matches the
breakdown cards; one line per currency, never summed across currencies.

Current:

```tsx
// FlipCard wraps a toggleable card: rotates out (0→90°), swaps content at the
```

Replacement:

```tsx
// DividendIncomeCard shows ledger-derived dividend income per currency
// (PRD-005 §9). Displayed beside P&L, never added to it; INR and EUR are
// separate lines, never summed.
function DividendIncomeCard({inr, eur}: { inr?: number; eur?: number }) {
    const rows: BreakdownRow[] = [
        ...(inr != null && inr > 0 ? [{name: 'INR', symbol: '₹', value: inr, bg: 'var(--breakdown-inr-bg)'}] : []),
        ...(eur != null && eur > 0 ? [{name: 'EUR', symbol: '€', value: eur, bg: 'var(--breakdown-eur-bg)'}] : []),
    ]
    return (
        <div className="card" style={cardStyle}>
            <div style={cardLabelStyle}>Dividend Income</div>
            {rows.map(r => <BreakdownLine key={r.name} row={r}/>)}
        </div>
    )
}

// FlipCard wraps a toggleable card: rotates out (0→90°), swaps content at the
```

Current:

```tsx
    computedDayGainInr?: number | null
    computedDayGainEur?: number | null
}
```

Replacement:

```tsx
    computedDayGainInr?: number | null
    computedDayGainEur?: number | null
    // Ledger-derived dividend income per native currency (PRD-005 §9).
    dividendsInr?: number
    dividendsEur?: number
}
```

Current:

```tsx
                                         computedDayGainInr,
                                         computedDayGainEur
                                     }: SummaryCardsProps) {
```

Replacement:

```tsx
                                         computedDayGainInr,
                                         computedDayGainEur,
                                         dividendsInr,
                                         dividendsEur
                                     }: SummaryCardsProps) {
```

Current:

```tsx
                <Card label="Total P&L" inr={totalPnL} eur={totalPnLEur}
                      positive={totalPnL >= 0} negative={totalPnL < 0}/>
```

Replacement:

```tsx
                <Card label="Total P&L" inr={totalPnL} eur={totalPnLEur}
                      positive={totalPnL >= 0} negative={totalPnL < 0}/>
                {(dividendsInr ?? 0) + (dividendsEur ?? 0) > 0 && (
                    <DividendIncomeCard inr={dividendsInr} eur={dividendsEur}/>
                )}
```

* [ ] **Step 3: Pass the values (Edit `DashboardPage.tsx`)**

Current:

```tsx
          stocksInvestedInr={enriched.filter(h => h.currency === 'INR').reduce((s, h) => s + (h.cost_price ?? 0), 0)}
```

Replacement:

```tsx
          stocksInvestedInr={enriched.filter(h => h.currency === 'INR').reduce((s, h) => s + (h.cost_price ?? 0), 0)}
          dividendsInr={enriched.filter(h => h.currency !== 'EUR').reduce((s, h) => s + (h.total_dividends ?? 0), 0)}
          dividendsEur={enriched.filter(h => h.currency === 'EUR').reduce((s, h) => s + (h.total_dividends ?? 0), 0)}
```

(`currency !== 'EUR'` keeps blank-currency holdings in INR, matching `CurrencyOf`.)

* [ ] **Step 4: Test (append to `SummaryCards.test.tsx`)**

```tsx
describe('SummaryCards dividend income', () => {
  it('shows dividend income per currency and leaves Total P&L unchanged', () => {
    render(<SummaryCards summary={base} loading={false} dividendsInr={1850.5} dividendsEur={40} />)
    expect(screen.getByText('Dividend Income')).toBeInTheDocument()
    expect(screen.getByText('₹1,850.50')).toBeInTheDocument()
    expect(screen.getByText('€40.00')).toBeInTheDocument()
    expect(screen.getByText('Total P&L').parentElement).not.toHaveTextContent('1,850.50')
  })

  it('hides the card when there is no dividend income', () => {
    render(<SummaryCards summary={base} loading={false} dividendsInr={0} dividendsEur={0} />)
    expect(screen.queryByText('Dividend Income')).toBeNull()
  })
})
```

* [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/components src/features/holdings src/features/dashboard
```

Expected: all PASS, including the two new SummaryCards tests.

* [ ] **Step 6: Commit**

```bash
git checkout -b feat/PD-048-dividends-integration-ui main
git add frontend/src/features/holdings/HoldingsTable.tsx frontend/src/components/SummaryCards.tsx frontend/src/components/SummaryCards.test.tsx frontend/src/features/dashboard/DashboardPage.tsx
git commit -m "✨ Show dividend income on the dashboard"
```

---

## Task 25: History dividends column (PR12)

**Files:**

* Modify: `frontend/src/lib/api/client.ts`, `frontend/src/features/history/HistoryTable.tsx`, `frontend/src/features/history/HistoryModals.tsx`, `frontend/src/features/history/HistoryPage.test.tsx`

* [ ] **Step 1: Types (Edit `client.ts`)**

WHY: History types are hand-written in `client.ts` (not generated), so they
take the two optional fields from Task 17 here.

Current:

```ts
  price_date?: string
  current?: number
}
```

Replacement:

```ts
  price_date?: string
  current?: number
  // Dividends from this stock on or before the row date (PRD-005 §9).
  dividends?: number
}

// Dividends per currency as of a History row (PRD-005 §9), computed on read.
export interface DividendHistoryOverlay {
  to_date: number
  on_day: number
}
```

Current:

```ts
  gold?: GoldHistoryOverlay
```

Replacement:

```ts
  gold?: GoldHistoryOverlay
  // Dividends to date per currency; absent before the first dividend.
  dividends?: Record<string, DividendHistoryOverlay>
```

* [ ] **Step 2: Column (Edit `HistoryTable.tsx`)**

WHY: one more cell per currency group; a day a dividend landed gets the
green tint, like the "new investment" signal. The group separator moves from
P/L% to the new last cell.

Current:

```tsx
      <th style={hdr}>Daily volatlity</th>
      <th style={{ ...hdr, ...sep }}>P/L%</th>
```

Replacement:

```tsx
      <th style={hdr}>Daily volatlity</th>
      <th style={hdr}>P/L%</th>
      <th style={{ ...hdr, ...sep }}>Dividends</th>
```

Current:

```tsx
  const rs = r.regions[region]
```

Replacement:

```tsx
  const rs = r.regions[region]
  const div = r.dividends?.[CURRENCY_BY_REGION[region]]
```

Current:

```tsx
  const pnlStyle: React.CSSProperties = {
    ...base,
    ...sep,
    background: dir ? PRICE_DIR_TINT[dir] : tint,
  }
```

Replacement:

```tsx
  const pnlStyle: React.CSSProperties = {
    ...base,
    background: dir ? PRICE_DIR_TINT[dir] : tint,
  }
  // Dividends cell: green on a day a dividend landed (PRD-005 §9).
  const divStyle: React.CSSProperties = {
    ...base,
    ...sep,
    background: div && div.on_day > 0 ? 'var(--green-dim)' : tint,
  }
```

Current:

```tsx
      <td {...mouseProps} style={pnlStyle}>
        {pnl === null ? '—' : `${pnl.toFixed(2)}%`}
      </td>
    </>
```

Replacement:

```tsx
      <td {...mouseProps} style={pnlStyle}>
        {pnl === null ? '—' : `${pnl.toFixed(2)}%`}
      </td>
      <td {...mouseProps} style={divStyle}
        title={div && div.on_day > 0 ? `+${fmtCurrency(div.on_day, sym)} received this day` : undefined}>
        {div ? fmtCurrency(div.to_date, sym) : '—'}
      </td>
    </>
```

* [ ] **Step 3: Breakdown (Edit `HistoryModals.tsx`)**

Current:

```tsx
                  <th style={{ ...th, textAlign: 'right' }}>Daily change</th>
```

Replacement:

```tsx
                  <th style={{ ...th, textAlign: 'right' }}>Daily change</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dividends to date</th>
```

Current:

```tsx
                      <td style={{ ...num, color }}>{pct === null ? '—' : `${pct.toFixed(2)}%`}</td>
```

Replacement:

```tsx
                      <td style={{ ...num, color }}>{pct === null ? '—' : `${pct.toFixed(2)}%`}</td>
                      <td style={num}>{h.dividends ? priceFmt(h.dividends) : '—'}</td>
```

* [ ] **Step 4: Test (append inside `describe('HistoryTable', …)` in `HistoryPage.test.tsx`)**

```tsx
  it('renders dividends to date per currency with the day tint', () => {
    const rows: HistoryRow[] = [
      row({ date: '2020-03-15', dividends: { INR: { to_date: 1850.5, on_day: 1250.5 } } }),
      row({ date: '2020-03-14', dividends: { INR: { to_date: 600, on_day: 0 } } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(screen.getAllByText('Dividends').length).toBeGreaterThan(0)
    expect(screen.getByText('₹1,850.50')).toHaveAttribute('title', '+₹1,250.50 received this day')
    expect(screen.getByText('₹600.00')).not.toHaveAttribute('title')
  })
```

(`row` is the file's existing `HistoryRow` builder at line 50.) Existing
assertions that count header cells per group change from 4 to 5 where they
count them.

* [ ] **Step 5: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src/features/history
```

Expected: all PASS.

* [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/client.ts frontend/src/features/history/HistoryTable.tsx frontend/src/features/history/HistoryModals.tsx frontend/src/features/history/HistoryPage.test.tsx
git commit -m "✨ Show dividends received in History"
```

---

## Task 26: Act-as dividends + ledger writes (PR12)

**Files:**

* Create: `frontend/src/features/admin/AdminUserDividends.tsx`
* Modify: `frontend/src/App.tsx`, `frontend/src/features/dashboard/DashboardPage.tsx`, `frontend/src/features/holdings/TransactionsModal.tsx`, `TransactionsModal.test.tsx`, `frontend/src/features/transactions/TransactionsPage.tsx`

* [ ] **Step 1: Route (create `AdminUserDividends.tsx`)**

WHY: the id lives in the URL so the act-as page is linkable and refresh-safe
and picks its endpoint from the same source as its heading (PD-047 pattern).

```tsx
import DividendsPage from '../dividends/DividendsPage'
import { ActAsShell } from './ActAsShell'

// /admin/users/:id/dividends — the target user's dividends, managed in act-as.
export default function AdminUserDividends() {
  return (
    <ActAsShell>
      {user => <DividendsPage actAsUserId={user.id} actAsLabel={`${user.username}'s dividends`} />}
    </ActAsShell>
  )
}
```

`App.tsx` — current:

```tsx
import AdminUserTransactions from './features/admin/AdminUserTransactions'
```

replacement:

```tsx
import AdminUserTransactions from './features/admin/AdminUserTransactions'
import AdminUserDividends from './features/admin/AdminUserDividends'
```

current:

```tsx
            <Route path="/admin/users/:id/transactions" element={<RequireAdmin><AdminUserTransactions /></RequireAdmin>} />
```

replacement:

```tsx
            <Route path="/admin/users/:id/transactions" element={<RequireAdmin><AdminUserTransactions /></RequireAdmin>} />
            <Route path="/admin/users/:id/dividends" element={<RequireAdmin><AdminUserDividends /></RequireAdmin>} />
```

`DashboardPage.tsx` — current:

```tsx
          {/* Own portfolio only until the act-as route lands (PD-048 task 26). */}
          {!actAsUserId && (
            <Link to="/dividends" className="btn dash-nav-btn">
              <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Dividends</span>
            </Link>
          )}
```

replacement:

```tsx
          {/* Target-aware for act-as, same rule as Transactions above. */}
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}/dividends` : '/dividends'}
            className="btn dash-nav-btn">
            <CoinsIcon size={14} /> <span className="dash-nav-label-sm">Dividends</span>
          </Link>
```

* [ ] **Step 2: `TransactionsModal` act-as writes (Edit)**

Current:

```tsx
  onChanged: () => void
}

export default function TransactionsModal({ holding, onClose, onChanged }: Props) {
```

Replacement:

```tsx
  onChanged: () => void
  // Set in admin act-as: reads and writes go to the target's ledger (PD-048).
  userId?: string
}

export default function TransactionsModal({ holding, onClose, onChanged, userId }: Props) {
```

| Current | Replacement |
|---|---|
| `const data = await api.listTransactions(holding.id)` | `const data = await api.listTransactions(holding.id, userId)` |
| `await api.updateTransaction(editingId, payload)` | `await api.updateTransaction(editingId, payload, userId)` |
| `await api.createTransaction(holding.id, payload)` | `await api.createTransaction(holding.id, payload, userId)` |
| `await api.deleteTransaction(id)` | `await api.deleteTransaction(id, userId)` |

`TransactionsPage.tsx` — current `onEdit={actAsUserId ? undefined : openEditor}`,
replacement `onEdit={openEditor}`; where it renders
`<TransactionsModal holding={editing}`, add `userId={actAsUserId}`; current
`}}>{actAsLabel} · read-only</span>` → replacement `}}>{actAsLabel}</span>`.

* [ ] **Step 3: Tests (Edit `TransactionsModal.test.tsx`)**

The existing assertion now sees a third (undefined) argument — current:

```tsx
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      quantity: 1.5,
      amount: 30.68,
    }))
```

replacement:

```tsx
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      quantity: 1.5,
      amount: 30.68,
    }), undefined)
```

Append:

```tsx
  it('reads and writes the target ledger in act-as', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} userId="u1" />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith('holding-1', 'u1'))
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({ amount: 100 }), 'u1'))
  })
```

* [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc --noEmit && npx vitest run src && npm run build
```

Expected: every suite PASS; Vite build succeeds.

* [ ] **Step 5: Commit, push, PR12**

```bash
git add frontend/src/features/admin/AdminUserDividends.tsx frontend/src/App.tsx frontend/src/features/dashboard/DashboardPage.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/holdings/TransactionsModal.test.tsx frontend/src/features/transactions/TransactionsPage.tsx
git commit -m "✨ Manage a user's dividends in act-as"
git push -u origin feat/PD-048-dividends-integration-ui
gh pr create --title "✨ Show dividends on the dashboard and in History, and manage them in act-as" --body-file pr12.md
```

---

## Task 27: End-to-end verification (dev stack, `dev` label)

**Files:** none

* [ ] **Step 1: Deploy** — add the `dev` label to PR12 once PR2–PR11 have
  merged (PD-044 flow). Expected: dev Cloud Run + Pages preview updated; the
  dev Atlas cluster already supports transactions.

* [ ] **Step 2: Scenarios** (dev super admin, owner's real sheet)

1. **First import** — INR tab → Upload → popup lists each inconsistent name
   → confirm → preview Invalid 0 → Confirm → "N imported". Expected: table
   order, amounts and Cumulative equal the sheet's columns.
2. **Re-upload** — same file. Expected: no popup (aliases), preview 0 ready /
   N already exists; confirm → "0 imported", "N duplicates are discarded".
3. **Scenarios A–C** — a crafted 3-line file. Expected: as PRD-005 §5.
4. **Invalid** — `31/02/2021`, `abc`, an unresolved name. Expected: 3 invalid
   with line numbers; Confirm disabled; `GET /dividends` count unchanged.
5. **Warning** — wrong CUMULATIVE on one line. Expected: warning shown,
   import allowed.
6. **Consistency** — one holding: dashboard Dividends column = Dividends page
   by-holding total = History "to date" on today's row = sum of its dividend
   rows in the per-holding ledger editor.
7. **CRUD + delete-all** — add, edit, delete one; delete all INR. Expected:
   every view updates; holdings and buy/sell rows untouched; EUR tab intact.
8. **Act-as** — admin opens an in-region user → Dividends → add + import.
   Expected: writes land on that user; another region's id → 404.
9. **Isolation + themes** — a second user sees nothing; dark / light /
   cyberpunk match the visual spec.

* [ ] **Step 3: Record** — paste the scenario results as a comment on PR12.

Expected: all nine pass before PR12 merges.

## Done

* The owner's sheet imports after one round of name confirmation; re-upload is idempotent.
* Duplicates follow occurrence matching (PRD-005 §5 A–D); identical manual adds still work.
* Invalid rows block the import with line + reason; nothing partial is ever written.
* Imports and delete-all are atomic (MongoDB transactions).
* Dashboard, History, Dividends page and every ledger view agree; no double counting.
* Admins manage dividends in act-as within region scope.
* All Go and vitest suites green; `npm run build` succeeds.

Next: partial imports (skip invalid rows and report them), CSV export, alias
management on the holding edit form.
