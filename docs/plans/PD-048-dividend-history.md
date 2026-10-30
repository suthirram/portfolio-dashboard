# PD-048: Rollout plan — dividend history (CSV import + Dividends page)

* **Status**: Draft v2 — owner decisions of 2026-10-30 applied; v1 scope agreed
* **Owner**: project owner
* **Goal**: The owner uploads their dividend sheet on the INR or EUR tab,
  confirms any inconsistent share names in a popup, reviews a preview
  (ready / already exists / invalid) and commits it atomically. Dividends then
  appear on the new Dividends page (table, running totals, yearly / monthly /
  per-holding analytics), on the dashboard, in History and in every ledger
  view — one record each, never counted twice. CRUD, delete-all and admin
  act-as included.
* **Architecture**: dividends are `transactions` documents with
  `type = dividend` (no new collection). A `DividendsService` adds the
  tab view + analytics, the import pipeline (validate → resolve names →
  occurrence-based dedup → cumulative warnings) behind `preview` and an
  atomic `import`, and delete-all — the latter two inside Mongo
  multi-document transactions. Single-row writes reuse `TransactionsService`.
  History reads dividends through an on-read overlay; snapshots are never
  touched.
* **Tech stack**: Go 1.26, echo + oapi-codegen strict server, mongo-driver v1
  (sessions/transactions), zap; MongoDB 7 as a single-node replica set in dev;
  React 18 + TypeScript 5.4 + Vite, Recharts, vitest 4, openapi-typescript.
  No new dependencies.
* **Spec**: [PRD-005](../prds/PRD-005-dividend-history.md) ·
  [DD-005](../designs/DD-005-dividend-history.md) ·
  [visual spec](../visuals/PD-048-dividend-history.html) ([published](https://claude.ai/artifact/N1DGvkdmVHjUyVG5gxiUv6))

## File map

| Action | File | Responsibility |
|---|---|---|
| Modify | `docker-compose.dev.yml`, `docker-compose.yml`, `docs/local-setup.md` | Mongo single-node replica set |
| Modify | `backend/internal/persistence/persistence.go` | `Store.InTransaction` |
| Modify | `backend/internal/domain/transaction.go`, `holding.go` | `ImportMeta`, `Holding.Aliases` |
| Create | `backend/internal/domain/dividend.go` (+test) | `DividendKey`, `AmountCents` |
| Modify | `backend/internal/persistence/transactions.go`, `holdings.go` | dividend queries, `InsertMany`, `DeleteDividends`, `AddAliases` |
| Modify | `backend/internal/db/mongo.go` | dividend index |
| Create | `backend/internal/services/clock.go` | `istToday` (moved from `gold_prices.go`) |
| Modify | `backend/internal/services/gold_prices.go` | call `istToday` |
| Modify | `backend/internal/services/transactions.go` (+test) | skip heal for dividends; shared `validateDividendRow` |
| Create | `backend/internal/services/dividend_match.go` (+test) | name resolution + suggestions |
| Create | `backend/internal/services/dividends.go` (+test) | view/analytics, preview, import, delete-all |
| Modify | `backend/internal/services/history.go` (+test) | dividends overlay |
| Create | `backend/api/specs/dividends/dividends.yaml` | paths |
| Modify | `backend/api/specs/{openapi,portfolio-api}.yaml`, `admin/admin.yaml` | wiring, schemas, admin routes |
| Modify | `backend/api/*.gen.go` | regenerated |
| Create | `backend/internal/controllers/dividends.go` (+test) | own routes |
| Modify | `backend/internal/controllers/admin.go` (+test), `controllers.go` | act-as dividends + ledger writes, wiring |
| Modify | `docs/api.md`, `docs/portfolio-model.md`, `docs/history-and-snapshots.md` | docs |
| Modify | `frontend/src/lib/formDates.ts`, `formNumbers.ts` (+tests), `features/history/historyShared.ts` | moved parsers |
| Create | `frontend/src/lib/csv.ts` (+test) | tokenizer |
| Modify | `frontend/src/lib/api/schema.gen.ts`, `client.ts` | types + methods |
| Create | `frontend/src/features/dividends/*` | page, hook, table, analytics, modals, popup, csv parser |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx`, `features/holdings/HoldingsTable.tsx`, `components/SummaryCards.tsx` | nav + dividend figures |
| Modify | `frontend/src/features/history/HistoryTable.tsx`, `HistoryModals.tsx` | dividends column + breakdown |
| Modify | `frontend/src/features/holdings/TransactionsModal.tsx`, `features/admin/actAsRouting.ts`, `App.tsx` | act-as writes + routes |

## PR sequence (FE/BE split, backend first)

| # | Branch | Tasks | Test anchor |
|---|---|---|---|
| PR1 | `docs/PRD-005-dividend-history` | 0 | — |
| PR2 | `feat/PD-048-mongo-txn` | 1 | `InTransaction` rollback test |
| PR3 | `feat/PD-048-dividend-model` | 2–3 | domain + store + heal-skip tests |
| PR4 | `feat/PD-048-dividends-view-api` | 4–5 | view/analytics tests |
| PR5 | `feat/PD-048-dividends-import-api` | 6–8 | match, partition, preview, import, delete-all |
| PR6 | `feat/PD-048-actas-ledger-api` | 9 | admin 404/200 tests |
| PR7 | `feat/PD-048-history-dividends-api` | 10 | overlay tests |
| PR8 | `feat/PD-048-csv-helpers` | 11–12 | vitest helpers |
| PR9 | `feat/PD-048-dividends-ui` | 13–14 | page, analytics, CRUD |
| PR10 | `feat/PD-048-dividends-import-ui` | 15 | popup, preview, result, delete-all |
| PR11 | `feat/PD-048-dividends-integration-ui` | 16 | dashboard, History, act-as |
| — | — | 17 | end-to-end on dev stack |

---

## Task 0: Land the docs

* [ ] **Step 1: Commit + PR**

```bash
git checkout -b docs/PRD-005-dividend-history main
git add docs/prds/PRD-005-dividend-history.md docs/designs/DD-005-dividend-history.md docs/plans/PD-048-dividend-history.md docs/visuals/PD-048-dividend-history.html docs/visuals/README.md
git commit -m "📝 PRD-005 / DD-005 / PD-048: dividend history"
```

---

## Task 1: Mongo transactions

**Files:** Modify `docker-compose.dev.yml`, `docker-compose.yml`, `docs/local-setup.md`, `backend/internal/persistence/persistence.go`

* [ ] **Step 1: Single-node replica set in compose**

WHY: imports and delete-all must be atomic across many documents and
collections (PRD-005 §7). Mongo transactions need a replica set; Atlas is one,
the dev container is not. A one-node set is the standard local setup.

```yaml
  mongodb:
    image: mongo:7
    container_name: portfolio_mongo_dev
    command: ["--replSet", "rs0", "--bind_ip_all"]
    ports:
      - "27017:27017"
    volumes:
      - mongo_data_dev:/data/db
    environment:
      MONGO_INITDB_DATABASE: portfolio
    healthcheck:
      # Initiates the set on first boot, then reports healthy once PRIMARY.
      test: ["CMD", "mongosh", "--quiet", "--eval", "try { rs.status().ok } catch (e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}).ok }"]
      interval: 5s
      timeout: 10s
      retries: 20
```

Default URI becomes `mongodb://localhost:27017/portfolio?replicaSet=rs0&directConnection=true`
(`config.go` default + `docs/local-setup.md` + `docs/configuration.md`).
Same change in `docker-compose.yml` with host `mongodb:27017`.

* [ ] **Step 2: `Store.InTransaction`**

WHY: one helper so services never touch sessions. The driver carries the
session on the context, so existing store methods join the transaction
unchanged — their `context.WithTimeout(ctx, …)` keeps the session.

```go
// InTransaction runs fn in a Mongo multi-document transaction (DD-005 §2.6).
// Store methods called with the ctx fn receives join it; any error from fn
// aborts and rolls back every write. Requires a replica set.
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

`New(db)` stores `client: db.Client()` on `Store`.

* [ ] **Step 3: Test** — `InTransaction` with a fn that inserts a holding then
  returns an error → the holding is absent afterwards.

* [ ] **Step 4: Verify**

```bash
docker compose -f docker-compose.dev.yml up -d --force-recreate mongodb
docker exec portfolio_mongo_dev mongosh --quiet --eval 'rs.status().members[0].stateStr'
cd backend && go test ./internal/persistence/ -run InTransaction -v
```

Expected: `PRIMARY`; `--- PASS: TestInTransactionRollsBack`.

* [ ] **Step 5: Commit**

```bash
git checkout -b feat/PD-048-mongo-txn main
git add docker-compose.dev.yml docker-compose.yml docs/local-setup.md docs/configuration.md backend/internal/config/config.go backend/internal/persistence/persistence.go backend/internal/persistence/persistence_test.go
git commit -m "🔧 Run Mongo as a replica set and add Store.InTransaction"
```

---

## Task 2: Model — import metadata, aliases, dividend key, index

**Files:** Modify `domain/transaction.go`, `domain/holding.go`, `persistence/transactions.go`, `persistence/holdings.go`, `db/mongo.go`; Create `domain/dividend.go` (+test)

* [ ] **Step 1: Domain** — add `ImportMeta` + `Transaction.Import`,
  `Holding.Aliases`, and `domain/dividend.go` exactly as DD-005 §2.1.

WHY: the duplicate identity lives in `domain` so preview and confirm cannot
disagree; cents avoid `300` ≠ `300.00`. `Import` is audit metadata only.

* [ ] **Step 2: Store methods**

```go
// ListDividends returns userId's dividend events in one currency, in tab
// order (day, then entry order).
func (s *TransactionStore) ListDividends(ctx context.Context, userId primitive.ObjectID, currency string) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, bson.M{"type": string(domain.TxnDividend), "currency": currency}), dividendOrder)
}

// ListDividendsInRange returns dividend events of the given holdings with
// from ≤ date ≤ to — the duplicate window for an import.
func (s *TransactionStore) ListDividendsInRange(ctx context.Context, userId primitive.ObjectID, holdingIds []primitive.ObjectID, from, to time.Time) ([]domain.Transaction, error) {
 return s.find(ctx, scopedFilter(userId, bson.M{
  "type": string(domain.TxnDividend), "holding_id": bson.M{"$in": holdingIds},
  "date": bson.M{"$gte": from, "$lte": to},
 }), dividendOrder)
}

var dividendOrder = bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}, {Key: "_id", Value: 1}}
```

`find` is extracted from the existing `ListByHolding`/`ListByUser` bodies
(same Find + cursor code, now three callers — reuse rule). Plus
`InsertMany` (ordered), `DeleteDividends` (find affected `holding_id`s,
`DeleteMany`, return both) and `HoldingStore.AddAliases`
(`$addToSet: {aliases: {$each: …}}`, scoped).

* [ ] **Step 3: Index** — DD-005 §2.2 entry in `mongo.go`.

* [ ] **Step 4: Test** — `DividendKeyOf`: `300` ≡ `300.004`; different day or
  holding differ.

* [ ] **Step 5: Verify**

```bash
cd backend && go build ./... && go test ./internal/domain/ ./internal/persistence/ -v 2>&1 | tail
```

Expected: build ok; all PASS.

* [ ] **Step 6: Commit**

```bash
git checkout -b feat/PD-048-dividend-model main
git add backend/internal/domain backend/internal/persistence/transactions.go backend/internal/persistence/holdings.go backend/internal/db/mongo.go
git commit -m "✨ Add dividend import metadata, holding aliases and dividend queries"
```

---

## Task 3: Ledger tweaks — shared validation, no heal for dividends, `istToday`

**Files:** Create `services/clock.go`; Modify `services/gold_prices.go`, `services/transactions.go` (+test)

* [ ] **Step 1: Move `goldToday` → `istToday`** in `clock.go` (verbatim body);
  `gold_prices.go` calls it.

WHY: the dividend "not in the future" rule needs the IST day; one function,
two callers.

* [ ] **Step 2: `validateDividendRow(date, amount, today)`** — extracted from
  `validateTxnInput`'s dividend branch, plus the future-date and upper-bound
  checks; `validateTxnInput` calls it.

WHY: hand-entered and imported dividends must obey identical rules.

* [ ] **Step 3: Skip heal for dividends**

WHY: snapshot buckets and lines hold quantity, cost and close — never
dividends — so healing after a dividend write rewrites History rows to
identical values. Dividends reach History via the overlay (Task 10).

In `Create`, `Update`, `Delete`: call `healSnapshots` only when
`t.Type != domain.TxnDividend` (for `Update`, when either the old or new
type is not a dividend).

* [ ] **Step 4: Tests** — dividend create does not call the recomputer
  (fake); buy still does; future-dated dividend → `ErrValidation`.

* [ ] **Step 5: Verify**

```bash
cd backend && go test ./internal/services/ -run 'Transaction|Gold' -v 2>&1 | tail -20
```

Expected: all PASS (gold tests prove the move).

* [ ] **Step 6: Commit + PR3**

```bash
git add backend/internal/services/clock.go backend/internal/services/gold_prices.go backend/internal/services/transactions.go backend/internal/services/transactions_test.go
git commit -m "♻️ Share dividend validation and skip snapshot heal for dividends"
```

---

## Task 4: Spec — view endpoint

**Files:** Create `api/specs/dividends/dividends.yaml`; Modify `openapi.yaml`, `portfolio-api.yaml`; regen

* [ ] **Step 1:** `GET /dividends?currency=` (`listDividends`) → `DividendView`
  per DD-005 §2.10 (`DividendRow` = `allOf` `TransactionWithHolding` +
  `cumulative`, `holding_cumulative`; `DividendSummary`; `DividendPeriodTotal`
  for `by_year`/`by_month`; `DividendHoldingTotal`).
* [ ] **Step 2: Verify** `cd backend && go generate -tags tools ./... && go build ./...`
  → Expected: only `missing method ListDividends`.
* [ ] **Step 3: Commit** `git commit -m "📝 Specify the dividends view endpoint"`

---

## Task 5: `DividendsService.List` + controller

**Files:** Create `services/dividends.go` (+test), `controllers/dividends.go` (+test); Modify `controllers.go`

* [ ] **Step 1: List**

WHY: every total on the page comes out of one pass in integer cents, so the
running totals, yearly/monthly sums and per-holding totals cannot disagree,
and per-holding totals equal `total_dividends` (same events, same sum).

```go
// List returns one currency's dividends in tab order with both running
// totals and the analytics (PRD-005 §8), computed in one pass in cents.
func (s *DividendsService) List(ctx context.Context, userId primitive.ObjectID, currency string) (api.DividendView, error) {
 txns, err := s.store.Transactions.ListDividends(ctx, userId, currency)
 if err != nil {
  return api.DividendView{}, err
 }
 holdings, err := s.store.Holdings.ListByUser(ctx, userId)
 if err != nil {
  return api.DividendView{}, err
 }
 byId := make(map[primitive.ObjectID]domain.Holding, len(holdings))
 for _, h := range holdings {
  byId[h.ID] = h
 }

 view := api.DividendView{Rows: make([]api.DividendRow, 0, len(txns))}
 var total int64
 perHolding := map[primitive.ObjectID]*periodAcc{}
 years, months := newPeriods(), newPeriods()
 for _, t := range txns {
  c := domain.AmountCents(t.Amount)
  total += c
  acc := perHolding[t.HoldingID]
  if acc == nil {
   acc = &periodAcc{}
   perHolding[t.HoldingID] = acc
  }
  acc.add(c)
  years.add(t.Date.Format("2006"), c)
  months.add(t.Date.Format("2006-01"), c)
  h := byId[t.HoldingID]
  view.Rows = append(view.Rows, DividendRowToAPI(t, h, centsToMoney(total), centsToMoney(acc.cents)))
 }
 view.Summary = dividendSummary(txns, total, len(perHolding))
 view.ByYear, view.ByMonth = years.toAPI(), months.toAPI()
 view.ByHolding = holdingTotals(perHolding, byId, total) // biggest first, share = total_h / total
 return view, nil
}
```

`periodAcc`/`newPeriods`/`holdingTotals`/`dividendSummary` are small private
helpers in the same file; `DividendRowToAPI` lives in `mapper.go` and calls
the existing `TransactionToAPI` + holding labels (DD-004 join).

* [ ] **Step 2: Controller** `ListDividends` — `currentUserID` → service → 200.
* [ ] **Step 3: Tests** — order + same-day entry order; cumulatives
  (300, 600, 1850.50); `0.1 × 3 = 0.30`; by_year / by_month; by_holding
  ranked with shares summing to 1; **by_holding total == holding
  `total_dividends`** after recompute; EUR rows absent from INR.
* [ ] **Step 4: Verify**

```bash
cd backend && go test ./internal/services/ ./internal/controllers/ -run Dividend -v 2>&1 | tail
B=http://localhost:8080/api; curl -s -b c.txt "$B/dividends?currency=INR" | jq '.summary, .by_year'
```

Expected: PASS; JSON summary with `total`, `count`; `by_year` array.

* [ ] **Step 5: Commit + PR4** `git commit -m "✨ Serve the dividends view with running totals and analytics"`

---

## Task 6: Name resolution

**Files:** Create `services/dividend_match.go`, `dividend_match_test.go`

* [ ] **Step 1: Normalisers + resolver**

WHY: exact equality (script, symbol, confirmed alias) is safe to apply
silently; anything fuzzy is only ever a *suggestion* — the owner explicitly
asked that `jio` / `JLP` / `Jio Platforms Limited` / `JIOPLA` be confirmed in
a popup, never guessed (PRD-005 §6.2). Only holdings in the tab's currency
are candidates, so an import can never attach an INR dividend to an EUR
holding.

```go
var (
 exchangeSuffix = regexp.MustCompile(`\.(ns|bo)$`)
 nonAlnum       = regexp.MustCompile(`[^a-z0-9]+`)
 corpWords      = map[string]bool{"limited": true, "ltd": true, "inc": true, "plc": true, "corp": true, "corporation": true, "company": true, "co": true, "the": true}
)

// nameKey normalises a share name or symbol for exact matching.
func nameKey(s string) string {
 k := exchangeSuffix.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
 return strings.Join(strings.Fields(nonAlnum.ReplaceAllString(k, " ")), " ")
}

// corpKey is nameKey without corporate filler words — suggestions only.
func corpKey(s string) string {
 var kept []string
 for _, w := range strings.Fields(nameKey(s)) {
  if !corpWords[w] {
   kept = append(kept, w)
  }
 }
 return strings.Join(kept, " ")
}

// suggestionScore rates how likely sheet names holding h (0–1). Never
// applied without confirmation.
func suggestionScore(sheet string, h domain.Holding) float64 {
 s, script, sym := corpKey(sheet), corpKey(h.Script), nameKey(h.Symbol)
 best := 0.0
 if s != "" && s == script {
  best = 0.95
 }
 if tokenPrefix(s, script) || (len(s) >= 4 && strings.HasPrefix(strings.ReplaceAll(sym, " ", ""), strings.ReplaceAll(s, " ", ""))) {
  best = max(best, 0.8)
 }
 if initials(nameKey(h.Script)) == strings.ReplaceAll(s, " ", "") {
  best = max(best, 0.7)
 }
 return max(best, trigramJaccard(s, script))
}
```

`Resolve(names []nameCount, candidates []domain.Holding, overrides map[string]*primitive.ObjectID) []api.DividendNameResolution`
implements DD-005 §2.3 steps 1–5 (`tokenPrefix`, `initials`,
`trigramJaccard` are ~10-line private helpers in the same file).

* [ ] **Step 2: Tests** (holding `Jio Platforms Ltd` / `JIOPLA.NS`, plus
  `TCS` / `TCS.NS`, and an EUR holding `Jio Europe`):

| Sheet name | Expected |
|---|---|
| `TCS`, `tcs.ns`, ` Tcs ` | auto (script / symbol) |
| `JLP` after alias saved | auto (alias) |
| `jio`, `JLP`, `Jio Platforms Limited`, `JIOPLA` | needs_confirmation, Jio Platforms first |
| `Jio Platforms Limited` | preselect = Jio Platforms (0.95) |
| `jio` | preselect = Jio Platforms (0.8, no runner-up — `Jio Europe` is EUR, never a candidate) |
| `jio` with a second INR holding `Jio Financial` | needs_confirmation, **no** preselect (two at 0.8) |
| two INR holdings both scripted `Reliance` | ambiguous, no preselect |
| override `null` | unresolved |

* [ ] **Step 3: Verify** `cd backend && go test ./internal/services/ -run Resolve -v` → Expected: all PASS.
* [ ] **Step 4: Commit** `git checkout -b feat/PD-048-dividends-import-api main && git add backend/internal/services/dividend_match*.go && git commit -m "✨ Resolve sheet share names to holdings"`

---

## Task 7: Preview + atomic import

**Files:** Modify `services/dividends.go` (+test), `dividends.yaml`, `portfolio-api.yaml`, regen, `controllers/dividends.go`

* [ ] **Step 1: Spec** — `POST /dividends/import/preview` (`previewDividendImport`),
  `POST /dividends/import` (`importDividends`), schemas per DD-005 §2.10.

* [ ] **Step 2: Pipeline shared by preview and confirm**

WHY: confirm re-runs the **same** pipeline inside the transaction, so it
re-validates against the database at commit time (PRD-005 §7.7) — a dividend
added between preview and confirm becomes a duplicate instead of a double.
Occurrence counting is DD-005 §2.4's `partition`. Cumulative never enters
the key; it only feeds warnings.

```go
// plan is the evaluated import: what preview shows and what confirm writes.
type plan struct {
 preview  api.DividendImportPreview
 fresh    []resolvedRow
 dups     []resolvedRow
 aliases  map[primitive.ObjectID][]string // confirmed names per holding
}

func (s *DividendsService) evaluate(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (plan, error) {
 currency := string(in.Currency)
 holdings, err := s.store.Holdings.ListByUser(ctx, userId)
 if err != nil {
  return plan{}, err
 }
 candidates := holdingsInCurrency(holdings, currency)
 names := Resolve(countNames(in.Rows), candidates, mappingsOf(in.Mappings))

 rows, invalid := s.resolveRows(in.Rows, names, s.today()) // validateDividendRow + name → holding
 var p plan
 if len(rows) > 0 {
  from, to, ids := windowOf(rows)
  existing, err := s.store.Transactions.ListDividendsInRange(ctx, userId, ids, from, to)
  if err != nil {
   return plan{}, err
  }
  p.fresh, p.dups = partition(rows, existing)
 }
 p.aliases = confirmedAliases(names)
 p.preview = buildPreview(names, p.fresh, p.dups, invalid, cumulativeWarnings(in.Rows))
 return p, nil
}

// Preview evaluates an import without writing anything.
func (s *DividendsService) Preview(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (api.DividendImportPreview, error) {
 p, err := s.evaluate(ctx, userId, in)
 return p.preview, err
}

// Import re-evaluates inside one transaction and commits all eligible rows,
// the confirmed aliases and the recomputed holding totals together — or
// nothing (PRD-005 §7.7, DD-005 §2.6).
func (s *DividendsService) Import(ctx context.Context, userId primitive.ObjectID, in api.DividendImportInput) (api.DividendImportResult, error) {
 var result api.DividendImportResult
 err := s.store.InTransaction(ctx, func(ctx context.Context) error {
  p, err := s.evaluate(ctx, userId, in)
  if err != nil {
   return err
  }
  if p.preview.Counts.Invalid > 0 {
   return &ImportInvalidError{Preview: p.preview}
  }
  batch := primitive.NewObjectID().Hex()
  now := time.Now().UTC()
  txns := make([]domain.Transaction, len(p.fresh))
  affected := map[primitive.ObjectID]bool{}
  for i, r := range p.fresh {
   txns[i] = r.toTransaction(userId, batch, now) // IDs in sheet order (DD-005 §2.2)
   affected[r.holding.ID] = true
  }
  if err := s.store.Transactions.InsertMany(ctx, txns); err != nil {
   return err
  }
  for holdingId, names := range p.aliases {
   if err := s.store.Holdings.AddAliases(ctx, userId, holdingId, names); err != nil {
    return err
   }
  }
  for holdingId := range affected {
   if _, err := recomputeAndPersist(ctx, s.store.Holdings, s.store.Transactions, userId, holdingId); err != nil {
    return err
   }
  }
  result = api.DividendImportResult{Imported: len(txns), Duplicates: importRowsOf(p.dups), BatchId: batch, Warnings: p.preview.Warnings}
  return nil
 })
 return result, err
}
```

Controller: `ImportInvalidError` → `400` with the preview body; anything else
→ 500. No heal (dividends never change snapshots — Task 3).

* [ ] **Step 3: Cumulative warnings** — `cumulativeWarnings(rows)` per DD-005
  §2.8 (pure; cents).

* [ ] **Step 4: Tests**

```text
partition / scenarios (fresh user, holding TCS):
 A  DB 1 × (TCS, 2020-01-01, 300); sheet 2 ×        → ready 1, duplicate 1
 B  DB 2 ×;                         sheet 2 ×        → ready 0, duplicate 2
 C  DB 0;  sheet 2 × with cumulative 300 / 600       → ready 2
 D  import file, import same file again              → second: imported 0, duplicates = all
 E  hand-entered ledger dividend (TransactionsService.Create) then sheet row → duplicate
 F  different day / amount / holding                  → ready
preview:
 - writes nothing (collection count unchanged)
 - 3 invalid lines (bad date 31/02/2021, amount "abc", unresolved name) → counts {ready, duplicate, invalid:3}, reasons per line
 - cumulative mismatch on one line → warning, status unchanged; out-of-order dates → single warning
import:
 - invalid > 0 → ImportInvalidError, nothing written
 - confirmed alias saved; auto matches add no alias
 - holding total_dividends updated; recompute once per holding
 - fault injection (AddAliases returns error) → no transactions, no alias, totals unchanged
 - dividend added between preview and confirm → confirm reports it as duplicate
```

* [ ] **Step 5: Verify**

```bash
cd backend && go test ./internal/services/ ./internal/controllers/ -run 'Dividend|Partition|Import|Preview' -v 2>&1 | tail -30
cat > imp.json <<'J'
{"currency":"INR","rows":[{"line":2,"date":"2020-01-01","share_name":"TCS","amount":300,"cumulative":300},{"line":3,"date":"2020-01-01","share_name":"TCS","amount":300,"cumulative":600},{"line":4,"date":"2020-03-15","share_name":"JLP","amount":1250.5,"cumulative":1850.5}]}
J
H='X-Requested-With: portfolio-dashboard'; J='Content-Type: application/json'
curl -s -b c.txt -H "$H" -H "$J" -d @imp.json $B/dividends/import/preview | jq '.counts, .names'
```

Expected: tests PASS; preview `counts.invalid` = 1 (line 4) and `names` shows
`JLP` `needs_confirmation` with Jio Platforms suggested. Re-run with
`"mappings":{"JLP":"<jio holding id>"}` → `invalid: 0, ready: 3`; then
`POST /dividends/import` twice → `imported: 3`, then `imported: 0` with 3 duplicates.

* [ ] **Step 6: Commit** `git commit -m "✨ Preview and atomically import dividend CSV rows"`

---

## Task 8: Delete all

* [ ] **Step 1:** `DELETE /dividends?currency=` → `DeleteAll` in
  `InTransaction`: `DeleteDividends`, then `recomputeAndPersist` per affected
  holding. The page already knows the count from `summary.count`.

WHY: atomic so totals never show a half-deleted state; scoped to
`type = dividend` + currency so holdings, buys, sells and the other tab are
untouched.

* [ ] **Step 2: Tests** — deletes only INR dividends; EUR dividends, buys,
  opening and holdings intact; totals → 0.
* [ ] **Step 3: Verify** `curl -s -b c.txt -X DELETE -H "$H" "$B/dividends?currency=INR"` → Expected: `{"deleted":3}`; dashboard holding `total_dividends` 0.
* [ ] **Step 4: Commit + PR5** `git commit -m "✨ Delete all dividends of a currency atomically"`

---

## Task 9: Admin act-as — dividends + ledger writes

**Files:** Modify `api/specs/admin/admin.yaml`, `openapi.yaml`, regen, `controllers/admin.go` (+test)

* [ ] **Step 1:** Admin mirrors of the four dividend routes, plus
  `POST /admin/users/{id}/holdings/{hid}/transactions`,
  `PUT/DELETE /admin/users/{id}/transactions/{tid}` — each
  `adminCaller` + `loadTargetUser` (404 on scope miss) → same service with
  the **target** user id.

WHY: act-as can read a user's ledger but not write it (DD-004 §2.4); "manage
dividends" needs the writes, and generic ledger writes serve the per-holding
editor in act-as too rather than adding dividend-only ones.

* [ ] **Step 2: Tests** — in-region 200/201; out-of-region 404 on every new
  route; super admin any region.
* [ ] **Step 3: Verify** `go test ./internal/controllers/ -run Admin -v` → PASS.
* [ ] **Step 4: Commit + PR6** `git commit -m "✨ Let admins manage dividends and ledger events in act-as"`

---

## Task 10: History dividends overlay

**Files:** Modify `services/history.go` (+test), `history.yaml` schemas, regen

* [ ] **Step 1:** `HistoryRow.Dividends map[currency]{to_date, on_day}` and
  `HistoryHolding.Dividends` per DD-005 §2.9 — one `ListDividends` per
  currency per request, walked once against the sorted rows.

WHY: on read, like the gold overlay — imports and deletes show up instantly
and snapshots are never rewritten. Same events as everywhere else, so History
agrees with the dashboard and the Dividends page.

* [ ] **Step 2: Tests** — dividends on 01-01 and 15-03: row 31-01 →
  to_date 600, on_day 0; row 15-03 → on_day 1250.50; per-holding values.
* [ ] **Step 3: Verify** `go test ./internal/services/ -run History -v` → PASS.
* [ ] **Step 4: Commit + PR7** `git commit -m "✨ Show dividends received in History"`

---

## Task 11: Move shared parsers to `lib/`

* [ ] **Step 1:** Move `normaliseDate` → `lib/formDates.ts`, `parseAmount` →
  `lib/formNumbers.ts` verbatim; `historyShared.ts` re-exports. Add a
  real-calendar check (`31/02/2021` → `''`, `13/13/2020` → `''`).

WHY: the dividend CSV needs exactly these parsers (reuse rule); the calendar
check protects both callers.

* [ ] **Step 2: Verify** `cd frontend && npx vitest run src/lib src/features/history` → Expected: PASS incl. `1/2/2020 → 2020-02-01`, `12/5/2023 → 2023-05-12`.
* [ ] **Step 3: Commit** `git checkout -b feat/PD-048-csv-helpers main && git commit -m "♻️ Move date/amount parsers to lib for reuse"`

---

## Task 12: CSV tokenizer + dividend CSV parser

* [ ] **Step 1: `lib/csv.ts`**

```ts
// parseCsv tokenises RFC-4180 CSV: quoted fields, "" escapes, embedded
// commas/newlines, CRLF or LF, leading BOM stripped. Blank lines are kept
// as [''] so file line numbers stay true.
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

* [ ] **Step 2: `features/dividends/dividendCsv.ts`**

WHY: instant line-level feedback before any request; the server re-checks
everything. CUMULATIVE optional and passed through for the server's warning
check only.

```ts
import { parseCsv } from '../../lib/csv'
import { normaliseDate } from '../../lib/formDates'
import { parseAmount } from '../../lib/formNumbers'

export const MAX_ROWS = 5000
const COLUMNS = { date: 'date', share_name: 'share name', amount: 'dividend', cumulative: 'cumulative' } as const
const REQUIRED = ['date', 'share_name', 'amount'] as const

export interface DividendCsvRow { line: number; date: string; share_name: string; amount: number; cumulative?: number }
export interface DividendCsvError { line: number; reason: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function parseDividendCsv(text: string, todayIST: string): { rows: DividendCsvRow[]; errors: DividendCsvError[] } {
  const all = parseCsv(text)
  const h = all.findIndex(r => r.some(c => c.trim() !== ''))
  if (h < 0) return { rows: [], errors: [{ line: 1, reason: 'The file is empty' }] }
  const header = all[h].map(norm)
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, n]) => [k, header.indexOf(n)])) as Record<keyof typeof COLUMNS, number>
  const missing = REQUIRED.filter(k => col[k] < 0).map(k => COLUMNS[k])
  if (missing.length) {
    return { rows: [], errors: [{ line: h + 1, reason: `Missing column(s): ${missing.join(', ')}. Expected header: Date,Share Name,Dividend,CUMULATIVE` }] }
  }
  const rows: DividendCsvRow[] = []
  const errors: DividendCsvError[] = []
  for (let i = h + 1; i < all.length; i++) {
    const cells = all[i]
    if (cells.every(c => c.trim() === '')) continue
    const line = i + 1
    const rawDate = cells[col.date] ?? ''
    const date = normaliseDate(rawDate)
    const share_name = (cells[col.share_name] ?? '').trim().replace(/\s+/g, ' ')
    const amount = parseAmount(cells[col.amount] ?? '')
    const cum = col.cumulative >= 0 ? parseAmount(cells[col.cumulative] ?? '') : NaN
    if (!date) errors.push({ line, reason: `Date "${rawDate}" is not a valid DD/MM/YYYY date` })
    else if (date > todayIST) errors.push({ line, reason: 'Date is in the future' })
    if (!share_name) errors.push({ line, reason: 'Share Name is empty' })
    if (!(amount > 0)) errors.push({ line, reason: `Dividend "${cells[col.amount] ?? ''}" is not a positive number` })
    rows.push({ line, date, share_name, amount, ...(Number.isFinite(cum) && cum > 0 ? { cumulative: cum } : {}) })
  }
  if (rows.length > MAX_ROWS) errors.push({ line: 0, reason: `More than ${MAX_ROWS} rows — split the file` })
  return { rows, errors }
}
```

Client errors are merged into the preview as invalid rows (the preview is
still requested so ready/duplicate counts and name resolution show too —
PRD-005 §7.1 asks for all three counts).

* [ ] **Step 3: Tests** — tokenizer (quotes, `""`, CRLF, BOM); parser (header
  case/order, no CUMULATIVE, missing Dividend, `"₹1,250.50"`, blank lines keep
  line numbers, `1/2/2020` = Feb 1, 2 × identical rows both kept).
* [ ] **Step 4: Verify** `npx vitest run src/lib/csv.test.ts src/features/dividends/dividendCsv.test.ts` → PASS.
* [ ] **Step 5: Commit + PR8** `git commit -m "✨ Parse dividend CSV files"`

---

## Task 13: Dividends page — tabs, table, analytics

**Files:** regen `schema.gen.ts`; `client.ts`; Create `useDividends.ts`, `DividendsPage.tsx`, `DividendsTable.tsx`, `DividendsAnalytics.tsx` (+tests); Modify `App.tsx`

* [ ] **Step 1:** Build frames 02–03: tabs from `SUPPORTED_CURRENCIES`
  bound to `?currency=` (invalid → INR); summary; holding filter + search;
  table with both cumulatives (server values, never recomputed); analytics:
  yearly table + bar, monthly/yearly toggle chart, per-holding ranked table +
  bar (Recharts, theme-aware tooltip from `historyShared.ts`).
* [ ] **Step 2: Verify** — vitest: order + cumulatives rendered; EUR click
  refetches + URL; filtering keeps cumulative values; analytics render
  `by_year` sums. Expected: PASS.
* [ ] **Step 3: Commit** `git checkout -b feat/PD-048-dividends-ui main && git commit -m "✨ Add the Dividends page with analytics"`

---

## Task 14: Add / edit / delete

* [ ] **Step 1:** `DividendModal` (frame 04): holding dropdown (tab currency
  only), date, amount (`DecimalInput`). Writes via existing
  `createTransaction(holdingId, {type:'dividend', date, amount})`,
  `updateTransaction`, `deleteTransaction`; identical rows allowed. In-app
  delete confirm.

WHY: one write path for dividends — the ledger's — so the per-holding editor
and this page can never disagree.

* [ ] **Step 2: Verify** — tests: add posts a dividend txn to the chosen
  holding and refetches; edit pre-fills; delete confirms. PASS.
* [ ] **Step 3: Commit + PR9** `git commit -m "✨ Add, edit and delete dividends"`

---

## Task 15: Import flow + delete all

**Files:** Create `DividendImportModal.tsx`, `NameConfirmDialog.tsx`, `DeleteAllDialog.tsx` (+tests)

* [ ] **Step 1:** Frames 05–09:
  1. Pick file — banner "Importing into **₹ INR** · dates read as **DD/MM/YYYY**".
  2. `parseDividendCsv` → `previewDividendImport({currency, rows, mappings})`.
  3. If any name is `needs_confirmation` / `ambiguous` → **NameConfirmDialog**
     (one line per name: rows count, ranked suggestions as radios, preselect
     only when given, "Other holding…" dropdown of the tab's holdings,
     "Leave unresolved"). Confirm → re-preview with `mappings`.
  4. Preview: status table (Ready / Already exists / Invalid / Total), names
     list with "change", rows list, warnings. **Confirm import** disabled
     while invalid > 0.
  5. Confirm → `importDividends` (button disabled in flight) → result
     "**N imported**" + "**M duplicates are discarded**" list; a 400 re-renders
     the preview it returns.
  6. Close → refetch.
* [ ] **Step 2:** `DeleteAllDialog`: "Delete all 342 INR dividends? This
  includes dividends entered in the holding ledger. Holdings and buy/sell
  transactions are not affected." Input must equal `DELETE`.
* [ ] **Step 3: Verify** — tests: popup preselect / other / unresolved and the
  mappings sent; confirm disabled with invalid > 0; result message and list;
  delete-all button disabled until `DELETE`. PASS.
* [ ] **Step 4: Commit + PR10** `git checkout -b feat/PD-048-dividends-import-ui main && git commit -m "✨ Import dividend CSV with name confirmation and preview"`

---

## Task 16: Dashboard, History, act-as

* [ ] **Step 1:** Dashboard nav **Dividends** link (target-aware, DD-004
  §3.3 rule); `HoldingsTable` **Dividends** column; `SummaryCards` per-currency
  **Dividend income** (beside P&L, not added to it).
* [ ] **Step 2:** `HistoryTable` per-currency **Dividends** column (to date,
  day-change tint); `HoldingsModal` per-holding dividends.
* [ ] **Step 3:** `/admin/users/:id/dividends` route; `DividendsPage` +
  `TransactionsModal` take `userId` and call the admin endpoints;
  `actAsRouting.ts` target.

WHY: PRD-005 §9 — same records in every view; act-as parity for "manage".

* [ ] **Step 4: Verify** — tests: dashboard shows `total_dividends`; History
  renders `dividends.INR.to_date`; act-as href and endpoints. PASS.
* [ ] **Step 5: Commit + PR11** `git checkout -b feat/PD-048-dividends-integration-ui main && git commit -m "✨ Show dividends on the dashboard and History, with act-as"`

---

## Task 17: End-to-end verification (dev stack, `dev` label)

* [ ] **1 — first import**: INR tab, owner's sheet → popup for each
  inconsistent name, confirm → preview invalid 0 → confirm → "N imported";
  table order, amounts and Cumulative equal the sheet.
* [ ] **2 — re-upload**: same file → no popup (aliases), preview 0 ready /
  N already exists → confirm → "0 imported", "N duplicates are discarded".
* [ ] **3 — scenarios A–C** with a small crafted file.
* [ ] **4 — invalid**: `31/02/2021`, `abc`, unresolved name → 3 invalid with
  lines; Confirm disabled; DB unchanged.
* [ ] **5 — warning**: wrong CUMULATIVE on one line → warning, import allowed.
* [ ] **6 — consistency**: holding Dividends column = Dividends page
  per-holding total = History "to date" on today's row = sum in the per-holding
  ledger editor.
* [ ] **7 — CRUD + delete-all**: every view updates; holdings and buy/sell intact.
* [ ] **8 — act-as**: admin manages an in-region user's dividends; another
  region's id → 404.
* [ ] **9 — isolation + themes**: INR/EUR separate; second user sees nothing;
  dark / light / cyberpunk per the visual spec.

## Done

* Owner's sheet imports after one round of name confirmation; re-upload is idempotent.
* Occurrence-based duplicates (A–D) behave as specified; manual identical adds allowed.
* Invalid rows block the import with line + reason; nothing partial is ever written.
* Imports and delete-all are atomic (Mongo transactions).
* Dashboard, History, Dividends page and ledger views agree; no double counting.
* Admin act-as manages dividends within region scope.
* All Go + vitest suites green.

Next: partial imports (skip invalid rows), CSV export, alias management UI on
the holding edit form.
