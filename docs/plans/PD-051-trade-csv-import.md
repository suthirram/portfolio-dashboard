# PD-051: Rollout plan — import trades from a broker CSV

* **Status**: Draft v1, owner decisions of 2026-11-03 applied
* **Owner**: project owner
* **Goal**: An **Import CSV** button on All transactions reads a broker
  order history (the owner's Groww export) into buy and sell ledger events:
  day-first dates (a time in the cell is ignored), symbols matched without the exchange
  suffix, unknown symbols mapped or created, rows on or before an opening
  date covered, identical trades replaced (never duplicated), and the whole
  commit — History included — in one transaction.
* **Architecture**: the dividend import's preview → commit flow, matching
  and occurrence rule become shared pieces (PR2 backend, PR4 frontend) with
  no behaviour change; the trades import is their second user (PR3 API,
  PR5 UI). The browser parses the file; the server previews (reads only)
  and commits (re-evaluates inside `InTransaction`, heals History inside it).
* **Tech stack**: Go (echo strict server, oapi-codegen, MongoDB
  transactions, mtest), React 18 + TypeScript, vitest + Testing Library,
  ESLint `id-length` on changed files. No new dependencies.
* **Spec**: [PRD-008](../prds/PRD-008-trade-csv-import.md) ·
  [DD-008](../designs/DD-008-trade-csv-import.md) ·
  [visual spec](../visuals/PD-051-trade-csv-import.html)
  ([published](https://claude.ai/artifact/E9QgoLHTdo5iDUJVkQf9fd))

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Dates only; the file's time has no effect | owner (2026-11-03) | trades are dated at the day; same-day order = saved trades, then the file's new trades in file order |
| Reuse before writing | CLAUDE.md | `partitionByKey`, `resolveWith` + `matchIndex`, `confirmedAliases`, `MoveAliases`, `InTransaction`, `RecomputePosition`, `recomputeAndPersist`, `RecomputeFrom`, `normaliseDate`, `parseCsv`, `NameConfirmDialog`, the preview tables |
| Feature branch, one PR per task | owner (PD-048 / PD-050) | `feat/PD-051-trade-csv-import` from `main`; each task branches from it after the previous task merged, and its PR targets it; the feature merges to `main` last |
| Frontend and backend never in one PR | CLAUDE.md | PR2–PR3 backend, PR4–PR5 frontend; the final feature → `main` PR carries `FE/BE-EXCEPTION:` |
| Endpoint PRs carry curl | CLAUDE.md | PR3 |
| Every slice passes the three gates | `task-breakdown` skill | §PR sequence |
| Behaviour tests only; mtest for Go | CLAUDE.md | §6 of DD-008 |
| Tracing span + logger per service method | CLAUDE.md | `Preview`, `Import` |
| Services never touch `bson` / collections | CLAUDE.md (persistence layer) | `ListTradesByHoldings` owns the query |
| Descriptive names, ESLint on changed files | CLAUDE.md | `formDates.ts`'s two `p` locals renamed in PR4 |
| Gitmoji, subject ≤ 50 chars, no attribution | CLAUDE.md | every commit and PR below |
| Edit tool for source | CLAUDE.md | every Modify step is an Edit (current → replacement) |
| Go blocks: tabs shown as 4 spaces | markdownlint MD010 (as PD-048) | type them with tabs, or run `gofmt -w` on the file; Verify steps run `gofmt -l` |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `docs/prds/PRD-008-trade-csv-import.md` | what and why |
| Create | `docs/designs/DD-008-trade-csv-import.md` | how |
| Create | `docs/plans/PD-051-trade-csv-import.md` | this plan |
| Create | `docs/visuals/PD-051-trade-csv-import.html` | interactive mockups |
| Modify | `docs/visuals/README.md` | index row |
| Modify | `backend/internal/services/dividend_import.go` | `partitionByKey` |
| Modify | `backend/internal/services/dividend_match.go` | `matchIndex`, `resolveWith`, `nameCount.label` |
| Modify | `backend/api/specs/*.yaml`, `backend/api/*.gen.go` | trade import schemas, paths, generated code |
| Modify | `backend/internal/persistence/transactions.go` | `ListTradesByHoldings` |
| Create | `backend/internal/services/trade_import.go` (+ test) | `TradeImportService`: evaluate, Preview, Import |
| Create | `backend/internal/controllers/trade_import.go` | 4 handlers |
| Modify | `backend/internal/controllers/controllers.go`, `backend/internal/httpserver/auth.go` | wiring, admin tiers |
| Modify | `frontend/src/lib/formDates.ts`, `frontend/src/lib/csv.ts` (+ tests) | `normaliseDate` reads past a time, `sniffDelimiter` |
| Move + modify | `frontend/src/features/imports/NameConfirmDialog.tsx` | shared, optional create |
| Create | `frontend/src/features/imports/ImportTables.tsx` | `ImportCounts`, `InvalidLines` |
| Modify | `frontend/src/features/dividends/DividendImportModal.tsx` | uses the shared pieces |
| Modify | `frontend/src/lib/api/schema.gen.ts`, `frontend/src/types.ts`, `frontend/src/lib/api/client.ts` | API types and methods |
| Create | `frontend/src/features/transactions/tradeCsv.ts`, `frontend/src/features/transactions/TradeImportModal.tsx` (+ tests) | file reader, dialog |
| Modify | `frontend/src/features/transactions/TransactionsPage.tsx` (+ test) | Import CSV button |
| Modify | `docs/portfolio-model.md` | user doc |

## PR sequence (each slice passes the three gates)

| # | Branch → base | Task | Value (gate 2) | Test that fails without it (gate 3) | No regression (gate 1) |
|---|---|---|---|---|---|
| PR1 | `docs/PD-051-trade-csv-import` → `main` | 0 | agreed design on record | — (docs) | docs only |
| — | `feat/PD-051-trade-csv-import` from `main` | — | integration branch | — | — |
| PR2 | `refactor/PD-051-shared-import-helpers` → feature | 1 | the matching and occurrence rules usable by any import | `TestPartitionByKey_AnyKey` | refactor; every dividend test unchanged and green |
| PR3 | `feat/PD-051-trade-import-api` → feature | 2 | trades can be previewed and imported atomically over the API (curl) | `TestTradeImport` (6 cases) + 4 pure tests | new routes only; dividends and the ledger's replay order untouched |
| PR4 | `refactor/PD-051-shared-import-ui` → feature | 3 | day-first dates (a trailing time ignored) and tab files work in every import; shared dialog | `normaliseDate`, `sniffDelimiter` tests | the dividend import's tests pass unchanged |
| PR5 | `feat/PD-051-trade-import-ui` → feature | 4 | the user imports a broker file from Transactions | `tradeCsv`, `TradeImport`, page tests | the button only opens a dialog; nothing saves before confirm |
| PR6 | `feat/PD-051-trade-csv-import` → `main` | — | ships the feature | all of the above | `FE/BE-EXCEPTION: PD-051 feature branch` |
| — | — | 5 | end to end on the local stack | scenarios 1–7 | — |

Each task branches from the feature branch after the previous task's PR
merged into it; never stack a task on an unmerged branch.

## PR bodies

Every PR description uses this shape and stays under 200 words:

````markdown
## What
<value this slice adds, 1–2 sentences>

## How to test
1. <step>
2. <expected result>
- Automated: `<command>` (<N> tests pass)

## No regression
<why existing flows are untouched>
````

---

## Task 0: Land the docs (PR1), then create the feature branch

**Files:**

* Create: `docs/prds/PRD-008-trade-csv-import.md`, `docs/designs/DD-008-trade-csv-import.md`, `docs/plans/PD-051-trade-csv-import.md`, `docs/visuals/PD-051-trade-csv-import.html`
* Modify: `docs/visuals/README.md`

* [ ] **Step 1: Lint the markdown**

```bash
npx markdownlint-cli@0.45.0 --config .markdownlintrc docs/prds/PRD-008-trade-csv-import.md docs/designs/DD-008-trade-csv-import.md docs/plans/PD-051-trade-csv-import.md docs/visuals/README.md
```

Expected: no output.

* [ ] **Step 2: Commit, push, open PR1**

```bash
git add docs/prds/PRD-008-trade-csv-import.md docs/designs/DD-008-trade-csv-import.md docs/plans/PD-051-trade-csv-import.md docs/visuals/PD-051-trade-csv-import.html docs/visuals/README.md
git commit -m "📝 Plan the trades CSV import"
git push -u origin docs/PD-051-trade-csv-import
gh pr create --title "📝 Add the PRD, design doc, plan and visual spec for the trades CSV import" --body-file pr1.md
```

Expected: PR URL; CI markdownlint green.

* [ ] **Step 3: After PR1 merges, create the feature branch**

```bash
git fetch origin && git checkout -b feat/PD-051-trade-csv-import origin/main && git push -u origin feat/PD-051-trade-csv-import
```

Expected: the branch exists on GitHub; Tasks 1–4 target it.

---

## Task 1: Share the import helpers (backend, PR2)

**Files:**

* Modify: `backend/internal/services/dividend_import.go`, `backend/internal/services/dividend_match.go`, `backend/internal/services/dividend_match_test.go`, `backend/internal/services/dividend_import_test.go`

* [ ] **Step 1: Branch from the feature branch**

```bash
git fetch origin && git checkout -b refactor/PD-051-shared-import-helpers origin/feat/PD-051-trade-csv-import
```

* [ ] **Step 2: Make the occurrence rule generic (Edit `backend/internal/services/dividend_import.go`)**

WHY: the trades import needs the same "each stored event absorbs one sheet row" rule with its own key (holding, day, type, quantity, value). `partitionByKey` takes the key functions; dividends keep `partition` as a one-line wrapper, so their call sites and tests do not change.

Current:

```go
}

// partition splits valid rows (sheet order) into new and duplicate by
// occurrence: each stored dividend with the same key absorbs one sheet row;
// sheet repeats beyond the stored count are new (PRD-005 §5 A–D).
func partition(rows []importRow, existing []domain.Transaction) (fresh, duplicates []importRow) {
    remaining := make(map[domain.DividendKey]int, len(existing))
    for _, storedDividend := range existing {
        remaining[domain.DividendKeyOf(storedDividend)]++
    }
    for _, row := range rows {
        if rowKey := row.key(); remaining[rowKey] > 0 {
            remaining[rowKey]--
            duplicates = append(duplicates, row)
            continue
```

Replacement:

```go
}

// partition splits valid dividend rows (sheet order) into new and duplicate
// by occurrence (PRD-005 §5 A–D).
func partition(rows []importRow, existing []domain.Transaction) (fresh, duplicates []importRow) {
    return partitionByKey(rows, existing, importRow.key, domain.DividendKeyOf)
}

// partitionByKey is the occurrence rule shared by every CSV import: each
// stored event with the same key absorbs one sheet row; sheet repeats beyond
// the stored count are new.
func partitionByKey[Row any, Key comparable](rows []Row, existing []domain.Transaction, rowKey func(Row) Key, storedKey func(domain.Transaction) Key) (fresh, duplicates []Row) {
    remaining := make(map[Key]int, len(existing))
    for _, stored := range existing {
        remaining[storedKey(stored)]++
    }
    for _, row := range rows {
        if key := rowKey(row); remaining[key] > 0 {
            remaining[key]--
            duplicates = append(duplicates, row)
            continue
```

* [ ] **Step 3: Resolve names against a pluggable index (Edit `backend/internal/services/dividend_match.go`)**

WHY: dividends match on the script and aliases; trades match on the symbol without its exchange suffix and aliases. Everything after the index (answers win, one match is auto, several are ambiguous, none asks with suggestions) is the same, so it moves into `resolveWith`. `nameCount.label` is what suggestions are scored on: the name itself for dividends, the stock name for a symbol.

Current:

```go
}

// nameCount is one distinct sheet name and how many rows use it.
type nameCount struct {
    name string
    rows int
}
```

Replacement:

```go
}

// nameCount is one distinct sheet name and how many rows use it. label is
// the text suggestions are scored on: the name itself for a dividend sheet,
// the stock name for a trade sheet keyed by symbol.
type nameCount struct {
    name  string
    label string
    rows  int
}
```

Current:

```go
        }
        index[name] = len(out)
        out = append(out, nameCount{name: name, rows: 1})
    }
    return out
```

Replacement:

```go
        }
        index[name] = len(out)
        out = append(out, nameCount{name: name, label: name, rows: 1})
    }
    return out
```

Current:

```go
}

// resolveNames resolves each sheet name against candidates (the tab's
// currency only), honouring the user's popup answers in mappings: a holding
// id confirms, nil leaves the name unresolved.
func resolveNames(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
    exact := map[string][]exactMatch{}
    holdingsById := map[string]*domain.Holding{}
    for i := range candidates {
        holding := &candidates[i]
        holdingsById[holding.ID.Hex()] = holding
        addMatch := func(key, by string) {
            if key == "" {
                return
            }
            for _, match := range exact[key] {
                if match.holding.ID == holding.ID {
                    return
                }
            }
            exact[key] = append(exact[key], exactMatch{holding: holding, by: by})
        }
        // Automatic matches: the display name (case/space-insensitive) or a name
        // the owner confirmed before. The symbol is deliberately absent — a
        // symbol-shaped sheet name is a suggestion (suggestionScore), not a match.
        addMatch(exactKey(holding.Script), "script")
        for _, alias := range holding.Aliases {
            addMatch(alias, "alias")
        }
    }
```

Replacement:

```go
}

// matchIndex maps an exactKey to the holdings it names automatically.
type matchIndex map[string][]exactMatch

// add records that key names holding (by = how: script, symbol, alias).
func (index matchIndex) add(key, by string, holding *domain.Holding) {
    if key == "" {
        return
    }
    for _, match := range index[key] {
        if match.holding.ID == holding.ID {
            return
        }
    }
    index[key] = append(index[key], exactMatch{holding: holding, by: by})
}

// resolveNames resolves each dividend sheet name against candidates (the
// tab's currency only), honouring the user's popup answers in mappings: a
// holding id confirms, nil leaves the name unresolved.
func resolveNames(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
    index := matchIndex{}
    for i := range candidates {
        holding := &candidates[i]
        // Automatic matches: the display name (case/space-insensitive) or a name
        // the owner confirmed before. The symbol is deliberately absent — a
        // symbol-shaped sheet name is a suggestion (suggestionScore), not a match.
        index.add(exactKey(holding.Script), "script", holding)
        for _, alias := range holding.Aliases {
            index.add(alias, "alias", holding)
        }
    }
    return resolveWith(names, index, candidates, mappings)
}

// resolveWith is the resolution shared by every CSV import: an answer in
// mappings wins; otherwise one exact match is automatic, several are
// ambiguous, and none asks the user, with suggestions scored on the label.
func resolveWith(names []nameCount, index matchIndex, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
    holdingsById := map[string]*domain.Holding{}
    for i := range candidates {
        holdingsById[candidates[i].ID.Hex()] = &candidates[i]
    }
```

Current:

```go
    for _, sheet := range names {
        resolution := nameResolution{view: api.DividendNameResolution{SheetName: sheet.name, Rows: sheet.rows, Suggestions: []api.DividendSuggestion{}}}
        matches := exact[exactKey(sheet.name)]

        if answer, answered := mappings[sheet.name]; answered {
```

Replacement:

```go
    for _, sheet := range names {
        resolution := nameResolution{view: api.DividendNameResolution{SheetName: sheet.name, Rows: sheet.rows, Suggestions: []api.DividendSuggestion{}}}
        matches := index[exactKey(sheet.name)]

        if answer, answered := mappings[sheet.name]; answered {
```

Current:

```go
        default:
            resolution.view.Status = nameNeedsConfirmation
            resolution.view.Suggestions, resolution.view.Preselect = suggest(sheet.name, candidates)
        }
        out = append(out, resolution)
```

Replacement:

```go
        default:
            resolution.view.Status = nameNeedsConfirmation
            resolution.view.Suggestions, resolution.view.Preselect = suggest(sheet.label, candidates)
        }
        out = append(out, resolution)
```

* [ ] **Step 4: Give the test helper its label (Edit `backend/internal/services/dividend_match_test.go`)**

WHY: the helper builds a `nameCount` literally; without a label it would score suggestions on "".

Current:

```go

func resolveOne(name string, candidates []domain.Holding, mappings map[string]*string) nameResolution {
    return resolveNames([]nameCount{{name: name, rows: 1}}, candidates, mappings)[0]
}
```

Replacement:

```go

func resolveOne(name string, candidates []domain.Holding, mappings map[string]*string) nameResolution {
    return resolveNames([]nameCount{{name: name, label: name, rows: 1}}, candidates, mappings)[0]
}
```

* [ ] **Step 5: Test the generic rule with another key type (Edit `backend/internal/services/dividend_import_test.go`)**

WHY: proves the rule is key-agnostic (a test that cannot compile without the change), which is what the trades import relies on.

Current:

```go
}

func TestCumulativeWarnings(t *testing.T) {
    cumulative := func(value float64) *float64 { return &value }
```

Replacement:

```go
}

// The occurrence rule works for any row and key type, so the trade import
// reuses it with its own key.
func TestPartitionByKey_AnyKey(t *testing.T) {
    stored := []domain.Transaction{{Quantity: 2}, {Quantity: 2}, {Quantity: 5}}
    rows := []int{2, 2, 2, 5, 7}
    fresh, duplicates := partitionByKey(rows, stored,
        func(row int) float64 { return float64(row) },
        func(stored domain.Transaction) float64 { return stored.Quantity })
    if len(duplicates) != 3 || len(fresh) != 2 || fresh[0] != 2 || fresh[1] != 7 {
        t.Fatalf("fresh %v, duplicates %v; want fresh [2 7] and 3 duplicates", fresh, duplicates)
    }
}

func TestCumulativeWarnings(t *testing.T) {
    cumulative := func(value float64) *float64 { return &value }
```

* [ ] **Step 6: Verify**

WHY: every dividend test must pass unchanged: that is the no-regression proof for the refactor.

```bash
cd backend && gofmt -l internal && go vet ./internal/services && go test ./internal/... && golangci-lint run ./...
```

Expected: no gofmt output; every package `ok`; `0 issues.`

* [ ] **Step 7: Commit, push, open PR2 into the feature branch**

```bash
git add backend/internal/services/dividend_import.go backend/internal/services/dividend_match.go backend/internal/services/dividend_match_test.go backend/internal/services/dividend_import_test.go
git commit -m "♻️ Share the CSV import helpers"
git push -u origin refactor/PD-051-shared-import-helpers
gh pr create --base feat/PD-051-trade-csv-import --title "♻️ Share the dividend import's matching and duplicate rules" --body-file pr2.md
```

Expected: PR URL; CI green (Go tests, Go linter).

---

## Task 2: Trades import endpoints (backend, PR3)

**Files:**

* Create: `backend/internal/services/trade_import.go`, `backend/internal/services/trade_import_test.go`, `backend/internal/controllers/trade_import.go`
* Modify: `backend/api/specs/portfolio-api.yaml`, `backend/api/specs/transactions/transactions.yaml`, `backend/api/specs/admin/admin.yaml`, `backend/api/specs/openapi.yaml`, `backend/api/models.gen.go`, `backend/api/server.gen.go`, `backend/internal/persistence/transactions.go`, `backend/internal/controllers/controllers.go`, `backend/internal/httpserver/auth.go`

* [ ] **Step 1: Branch from the feature branch (after PR2 merged)**

```bash
git fetch origin && git checkout -b feat/PD-051-trade-import-api origin/feat/PD-051-trade-csv-import
```

* [ ] **Step 2: Schemas (Edit `backend/api/specs/portfolio-api.yaml`)**

WHY: the request carries parsed rows (the browser reads the file, as for dividends), the popup answers and the symbols to create; the preview reuses the dividend name/row/warning schemas and adds the replace and covered counts (DD-008 §2).

Current:

```yaml
        batch_id: { type: string }
        warnings: { type: array, items: { $ref: "#/components/schemas/DividendImportWarning" } }
    DividendHistoryOverlay:
      type: object
```

Replacement:

```yaml
        batch_id: { type: string }
        warnings: { type: array, items: { $ref: "#/components/schemas/DividendImportWarning" } }
    TradeImportRow:
      type: object
      required: [line, date, symbol, stock_name, exchange, type, quantity, amount]
      properties:
        line: { type: integer, description: 1-based file line (header = 1) }
        date: { type: string, format: date }
        symbol: { type: string, description: Exchange ticker without suffix (KALYANKJIL) }
        stock_name: { type: string }
        exchange: { type: string, enum: [NSE, BSE] }
        type: { type: string, enum: [buy, sell] }
        quantity: { type: number, format: double }
        amount: { type: number, format: double, description: Total cash value of the trade }
        isin: { type: string, nullable: true }
    TradeImportInput:
      type: object
      required: [rows]
      properties:
        rows: { type: array, maxItems: 5000, items: { $ref: "#/components/schemas/TradeImportRow" } }
        mappings:
          type: object
          description: Popup answers by sheet symbol — a holding id, or null to leave unresolved
          additionalProperties: { type: string, nullable: true }
        create:
          type: array
          description: Sheet symbols to create a new INR holding for
          items: { type: string }
    TradeImportCounts:
      type: object
      required: [ready, replace, covered, invalid, total]
      properties:
        ready: { type: integer, description: New trades }
        replace: { type: integer, description: Rows that replace an identical existing trade }
        covered: { type: integer, description: Rows on or before the holding's opening date }
        invalid: { type: integer }
        total: { type: integer }
    TradeImportPreview:
      type: object
      required: [counts, names, rows, warnings]
      properties:
        counts: { $ref: "#/components/schemas/TradeImportCounts" }
        names: { type: array, description: "Per sheet symbol; status adds create", items: { $ref: "#/components/schemas/DividendNameResolution" } }
        rows: { type: array, description: "status: ready | replace | covered | invalid", items: { $ref: "#/components/schemas/DividendImportRowStatus" } }
        warnings: { type: array, items: { $ref: "#/components/schemas/DividendImportWarning" } }
    TradeImportResult:
      type: object
      required: [imported, replaced, covered, created_holdings, batch_id]
      properties:
        imported: { type: integer }
        replaced: { type: integer }
        covered: { type: integer }
        created_holdings: { type: integer }
        batch_id: { type: string }
    DividendHistoryOverlay:
      type: object
```

* [ ] **Step 3: Own-portfolio paths (Edit `backend/api/specs/transactions/transactions.yaml`)**

WHY: preview reads only; import is the atomic commit with 422 + fresh preview when rows became invalid, exactly the dividend contract.

Current:

```yaml
                  example: deleted
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"
```

Replacement:

```yaml
                  example: deleted
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"

transactions_import_preview:
  post:
    tags: [Transactions]
    summary: Evaluate a trades CSV import without writing anything
    operationId: previewTradeImport
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/TradeImportInput"
    responses:
      "200":
        description: What an import would do now
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportPreview"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"

transactions_import:
  post:
    tags: [Transactions]
    summary: Commit a trades CSV import atomically
    description: |
      Re-runs the preview against the database as it is now and, when no row
      is invalid, in one transaction: creates the confirmed new holdings,
      inserts new trades, replaces identical existing trades in place, saves
      confirmed aliases, recomputes the affected holdings and heals History
      from the earliest trade. Rows covered by an opening balance are skipped.
      422 returns the fresh preview when rows are invalid; nothing is written.
    operationId: importTrades
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/TradeImportInput"
    responses:
      "200":
        description: Imported
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportResult"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "422":
        description: Invalid rows — nothing written
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportPreview"
```

* [ ] **Step 4: Act-as paths (Edit `backend/api/specs/admin/admin.yaml`)**

WHY: the owner wants admins to import into a user's ledger (PRD-008 §5); 404 covers an unknown or out-of-region user, as for the other act-as routes.

Current:

```yaml
        content: { application/json: { schema: { type: object, properties: { message: { type: string } } } } }
      "400": { $ref: "../portfolio-api.yaml#/components/responses/BadRequest" }
      "404": { $ref: "../portfolio-api.yaml#/components/responses/NotFound" }
```

Replacement:

```yaml
        content: { application/json: { schema: { type: object, properties: { message: { type: string } } } } }
      "400": { $ref: "../portfolio-api.yaml#/components/responses/BadRequest" }
      "404": { $ref: "../portfolio-api.yaml#/components/responses/NotFound" }

users_id_transactions_import_preview:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
  post:
    tags: [Admin]
    summary: Evaluate a trades CSV import for a user (act-as) without writing anything
    operationId: adminPreviewUserTradeImport
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/TradeImportInput"
    responses:
      "200":
        description: What an import would do now
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportPreview"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"

users_id_transactions_import:
  parameters:
    - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
  post:
    tags: [Admin]
    summary: Commit a trades CSV import for a user (act-as) atomically
    description: |
      Re-runs the preview against the database as it is now and, when no row
      is invalid, in one transaction: creates the confirmed new holdings,
      inserts new trades, replaces identical existing trades in place, saves
      confirmed aliases, recomputes the affected holdings and heals History
      from the earliest trade. Rows covered by an opening balance are skipped.
      422 returns the fresh preview when rows are invalid; nothing is written.
    operationId: adminImportUserTrades
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/TradeImportInput"
    responses:
      "200":
        description: Imported
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportResult"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"
      "422":
        description: Invalid rows — nothing written
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportPreview"
```

* [ ] **Step 5: Route the paths (Edit `backend/api/specs/openapi.yaml`)**

WHY: the root spec lists every path file entry.

Current:

```yaml
  /transactions/{id}:
    $ref: "./transactions/transactions.yaml#/transactions_id"
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
```

Replacement:

```yaml
  /transactions/{id}:
    $ref: "./transactions/transactions.yaml#/transactions_id"
  /transactions/import/preview:
    $ref: "./transactions/transactions.yaml#/transactions_import_preview"
  /transactions/import:
    $ref: "./transactions/transactions.yaml#/transactions_import"
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
```

Current:

```yaml
  /admin/users/{id}/transactions:
    $ref: "./admin/admin.yaml#/users_id_transactions"
  /admin/users/{id}/dividends:
    $ref: "./admin/admin.yaml#/users_id_dividends"
```

Replacement:

```yaml
  /admin/users/{id}/transactions:
    $ref: "./admin/admin.yaml#/users_id_transactions"
  /admin/users/{id}/transactions/import/preview:
    $ref: "./admin/admin.yaml#/users_id_transactions_import_preview"
  /admin/users/{id}/transactions/import:
    $ref: "./admin/admin.yaml#/users_id_transactions_import"
  /admin/users/{id}/dividends:
    $ref: "./admin/admin.yaml#/users_id_dividends"
```

* [ ] **Step 6: Regenerate the Go API**

WHY: models.gen.go and server.gen.go are generated; never edit them by hand.

```bash
cd backend && go generate -tags tools ./...
```

Expected: `api/models.gen.go` gains `TradeImport*`; the build then fails until Step 11 implements the four handlers.

* [ ] **Step 7: Load the stored trades (Edit `backend/internal/persistence/transactions.go`)**

WHY: the match lookup needs the buys and sells of the matched holdings across the file's date range (`ListDividendsByHoldings` with the trade types), so the query stays in persistence and the service never builds `bson` (CLAUDE.md). A matched saved trade is never written, so no update method.

Current:

```go
    return s.find(ctx, scopedFilter(userId, bson.M{
        "type":       string(domain.TxnDividend),
        "holding_id": bson.M{"$in": holdingIds},
        "date":       bson.M{"$gte": from, "$lte": to},
```

Replacement:

```go
    return s.find(ctx, scopedFilter(userId, bson.M{
        "type":       string(domain.TxnDividend),
        "holding_id": bson.M{"$in": holdingIds},
        "date":       bson.M{"$gte": from, "$lte": to},
    }), dividendOrder)
}

// ListTradesByHoldings returns the buy and sell events of the given holdings
// with from ≤ date ≤ to — the replace window of a trades import.
func (s *TransactionStore) ListTradesByHoldings(ctx context.Context, userId primitive.ObjectID, holdingIds []primitive.ObjectID, from, to time.Time) ([]domain.Transaction, error) {
    return s.find(ctx, scopedFilter(userId, bson.M{
        "type":       bson.M{"$in": []string{string(domain.TxnBuy), string(domain.TxnSell)}},
        "holding_id": bson.M{"$in": holdingIds},
        "date":       bson.M{"$gte": from, "$lte": to},
```

* [ ] **Step 8: The service (Create `backend/internal/services/trade_import.go`)**

WHY: evaluation reads only (symbols, opening cover, replace pairing, oversell replay); Import re-runs it inside one transaction and writes holdings, trades, replacements, aliases, positions and the History heal together (owner: ACID; a heal error aborts). Same-day order is by day only (owner, 2026-11-03: the file's time has no effect): a trade is dated at the bare day, a saved trade keeps its place, and the day's new trades follow it in the file's order (`created_at` = the import time, a millisecond apart in that order); the ledger already replays by date, then `created_at`. Split into named steps to keep each function small (gocyclo).

```go
package services

import (
    "cmp"
    "context"
    "errors"
    "fmt"
    "math"
    "slices"
    "strings"
    "time"

    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/api"
    "portfolio-dashboard/internal/domain"
    "portfolio-dashboard/internal/logging"
    "portfolio-dashboard/internal/persistence"
)

// Trades CSV import (PRD-008, DD-008): a broker's order history becomes
// buy/sell ledger events. Preview reads only; Import re-evaluates and
// commits everything in one transaction, History heal included.

// Row statuses and the name status a trade import adds.
const (
    tradeReady   = "ready"
    tradeReplace = "replace"
    tradeCovered = "covered"
    tradeInvalid = "invalid"
    nameCreate   = "create"
)

// maxTradeAmount bounds one trade's value, as maxDividendAmount does.
const maxTradeAmount = 1e12

// TradeImportService owns the trades CSV import.
type TradeImportService struct {
    txns       *persistence.TransactionStore
    holdings   *persistence.HoldingStore
    runner     txRunner
    recomputer snapshotRecomputer
    logger     *zap.Logger
    today      func() time.Time // IST calendar day; tests pin it
    now        func() time.Time
}

// NewTradeImportService wires a TradeImportService. recomputer may be nil
// (no History heal), as for TransactionsService.
func NewTradeImportService(txns *persistence.TransactionStore, holdings *persistence.HoldingStore, runner txRunner, recomputer snapshotRecomputer, logger *zap.Logger) *TradeImportService {
    return &TradeImportService{txns: txns, holdings: holdings, runner: runner, recomputer: recomputer, logger: logger,
        today: istToday, now: func() time.Time { return time.Now().UTC() }}
}

func (s *TradeImportService) log(ctx context.Context) *zap.Logger {
    return logging.FromContextOr(ctx, s.logger)
}

// tradeRow is a valid sheet row resolved to a holding.
type tradeRow struct {
    sheetRow api.TradeImportRow
    day      time.Time
    holding  *domain.Holding
}

// tradeKey is "the same trade": one holding, day, type, quantity and value.
// A sheet row with the key of a stored trade replaces it (owner, 2026-11-03).
type tradeKey struct {
    HoldingId primitive.ObjectID
    Day       string
    Type      domain.TxnType
    Micros    int64 // quantity in millionths of a share
    Cents     int64
}

func quantityMicros(quantity float64) int64 { return int64(math.Round(quantity * 1e6)) }

func (r tradeRow) key() tradeKey {
    return tradeKey{HoldingId: r.holding.ID, Day: r.day.Format(time.DateOnly), Type: domain.TxnType(r.sheetRow.Type),
        Micros: quantityMicros(r.sheetRow.Quantity), Cents: domain.AmountCents(r.sheetRow.Amount)}
}

func tradeKeyOf(stored domain.Transaction) tradeKey {
    return tradeKey{HoldingId: stored.HoldingID, Day: domain.UTCDate(stored.Date).Format(time.DateOnly), Type: stored.Type,
        Micros: quantityMicros(stored.Quantity), Cents: domain.AmountCents(stored.Amount)}
}

// sheetSymbol is a sheet symbol as displayed and as the mappings key.
func sheetSymbol(raw string) string { return strings.ToUpper(strings.TrimSpace(raw)) }

// baseSymbol drops the Yahoo exchange suffix: "GOLDBEES.NS" → "GOLDBEES".
func baseSymbol(symbol string) string {
    return sheetSymbol(exchangeSuffix.ReplaceAllString(strings.ToLower(strings.TrimSpace(symbol)), ""))
}

// countSymbols lists distinct sheet symbols in first-appearance order;
// suggestions are scored on the stock name.
func countSymbols(rows []api.TradeImportRow) []nameCount {
    index := map[string]int{}
    var out []nameCount
    for _, row := range rows {
        symbol := sheetSymbol(row.Symbol)
        if symbol == "" {
            continue
        }
        if position, seen := index[symbol]; seen {
            out[position].rows++
            continue
        }
        index[symbol] = len(out)
        out = append(out, nameCount{name: symbol, label: sheetName(row.StockName), rows: 1})
    }
    return out
}

// resolveSymbols matches each sheet symbol to an INR holding: its symbol
// without the exchange suffix (so a BSE row finds the .NS holding) or an
// alias the owner confirmed before.
func resolveSymbols(names []nameCount, candidates []domain.Holding, mappings map[string]*string) []nameResolution {
    index := matchIndex{}
    for i := range candidates {
        holding := &candidates[i]
        index.add(exactKey(baseSymbol(holding.Symbol)), "symbol", holding)
        for _, alias := range holding.Aliases {
            index.add(alias, "alias", holding)
        }
    }
    return resolveWith(names, index, candidates, mappings)
}

// newHolding is the INR holding a confirmed "create" adds, named and
// suffixed from the symbol's first sheet row.
func newHolding(userId primitive.ObjectID, symbol string, first api.TradeImportRow, now time.Time) *domain.Holding {
    suffix := ".NS"
    if first.Exchange == api.TradeImportRowExchangeBSE {
        suffix = ".BO"
    }
    return &domain.Holding{ID: primitive.NewObjectID(), UserID: userId, Script: sheetName(first.StockName), Symbol: symbol + suffix,
        Exchange: string(first.Exchange), Type: "stock", Currency: "INR", CreatedAt: now, UpdatedAt: now}
}

// validateTrade is the per-row rule: a known type and exchange, a positive
// quantity and value, dated no later than today (IST).
func validateTrade(row api.TradeImportRow, today time.Time) string {
    switch {
    case !row.Type.Valid():
        return fmt.Sprintf("Type %q is not BUY or SELL", row.Type)
    case !row.Exchange.Valid():
        return fmt.Sprintf("Exchange %q is not NSE or BSE", row.Exchange)
    case math.IsNaN(row.Quantity) || math.IsInf(row.Quantity, 0) || quantityMicros(row.Quantity) <= 0:
        return "Quantity must be a positive number"
    case math.IsNaN(row.Amount) || math.IsInf(row.Amount, 0) || domain.AmountCents(row.Amount) <= 0 || row.Amount >= maxTradeAmount:
        return "Value must be a positive amount"
    case domain.UTCDate(row.Date.Time).After(today):
        return "Date is in the future"
    }
    return ""
}

// tradePlan is an evaluated import: what preview shows, what confirm writes.
type tradePlan struct {
    preview  api.TradeImportPreview
    fresh    []tradeRow // in replay order
    replaced int        // rows already saved; their trades stay untouched
    created  []*domain.Holding
    aliases  map[primitive.ObjectID][]string
}

// toTransaction builds the ledger event for a new imported trade. created
// orders same-day events (the ledger replays date, then created_at).
func (r tradeRow) toTransaction(userId primitive.ObjectID, batchId string, created time.Time) domain.Transaction {
    return domain.Transaction{
        ID: primitive.NewObjectID(), UserID: userId, HoldingID: r.holding.ID,
        Type: domain.TxnType(r.sheetRow.Type), Date: r.day, Quantity: r.sheetRow.Quantity,
        Amount: domain.RoundCents(r.sheetRow.Amount), Currency: ledgerCurrency(*r.holding),
        Import:    &domain.ImportMeta{BatchId: batchId, Line: r.sheetRow.Line, SheetName: sheetName(r.sheetRow.StockName)},
        CreatedAt: created, UpdatedAt: created,
    }
}

// rowStatuses collects each sheet line's outcome for the preview.
type rowStatuses []api.DividendImportRowStatus

func (statuses *rowStatuses) add(line int, status string, holding *domain.Holding, reason string) {
    entry := api.DividendImportRowStatus{Line: line, Status: status}
    if holding != nil {
        holdingId := holding.ID.Hex()
        entry.HoldingId = &holdingId
    }
    if reason != "" {
        entry.Reason = &reason
    }
    *statuses = append(*statuses, entry)
}

// counts tallies the statuses, in line order.
func (statuses rowStatuses) counts() api.TradeImportCounts {
    slices.SortFunc(statuses, func(first, second api.DividendImportRowStatus) int { return cmp.Compare(first.Line, second.Line) })
    counts := api.TradeImportCounts{Total: len(statuses)}
    for _, status := range statuses {
        switch status.Status {
        case tradeReady:
            counts.Ready++
        case tradeReplace:
            counts.Replace++
        case tradeCovered:
            counts.Covered++
        default:
            counts.Invalid++
        }
    }
    return counts
}

// resolveTradeNames resolves the sheet symbols against the INR holdings and
// turns each confirmed "create" into a new (not yet stored) holding.
func resolveTradeNames(userId primitive.ObjectID, input api.TradeImportInput, holdings []domain.Holding, now time.Time) ([]nameResolution, []*domain.Holding) {
    candidates := make([]domain.Holding, 0, len(holdings))
    for _, holding := range holdings {
        if currency, ok := CurrencyOf(holding); ok && currency == "INR" {
            candidates = append(candidates, holding)
        }
    }
    var mappings map[string]*string
    if input.Mappings != nil {
        mappings = *input.Mappings
    }
    toCreate := map[string]bool{}
    if input.Create != nil {
        for _, symbol := range *input.Create {
            toCreate[sheetSymbol(symbol)] = true
        }
    }
    firstRow := map[string]api.TradeImportRow{}
    for _, row := range input.Rows {
        if _, seen := firstRow[sheetSymbol(row.Symbol)]; !seen {
            firstRow[sheetSymbol(row.Symbol)] = row
        }
    }
    names := resolveSymbols(countSymbols(input.Rows), candidates, mappings)
    var created []*domain.Holding
    for i := range names {
        symbol := names[i].view.SheetName
        if _, answered := mappings[symbol]; names[i].holding == nil && toCreate[symbol] && !answered {
            names[i].holding, names[i].view.Status = newHolding(userId, symbol, firstRow[symbol], now), nameCreate
            created = append(created, names[i].holding)
        }
    }
    return names, created
}

// classifyRows validates each row and sets aside the rows an opening
// balance already holds; the rest come back in replay order (day, the
// sheet's time, file order).
func classifyRows(rows []api.TradeImportRow, names []nameResolution, openings map[primitive.ObjectID]domain.Transaction, today time.Time, statuses *rowStatuses) []tradeRow {
    bySymbol := make(map[string]*domain.Holding, len(names))
    for _, resolution := range names {
        bySymbol[resolution.view.SheetName] = resolution.holding
    }
    var valid []tradeRow
    for _, sheetRow := range rows {
        symbol := sheetSymbol(sheetRow.Symbol)
        reason := validateTrade(sheetRow, today)
        holding := bySymbol[symbol]
        switch {
        case symbol == "":
            reason = "Symbol is empty"
        case reason == "" && holding == nil:
            reason = fmt.Sprintf("no holding chosen for %q", symbol)
        }
        if reason != "" {
            statuses.add(sheetRow.Line, tradeInvalid, nil, reason)
            continue
        }
        day := domain.UTCDate(sheetRow.Date.Time)
        // The opening balance already holds every trade up to its date
        // (owner decision, PRD-008 §5): those rows would double-count it.
        if opening, ok := openings[holding.ID]; ok && opening.Quantity > 0 {
            if opening.OpeningDate == nil {
                statuses.add(sheetRow.Line, tradeInvalid, holding, fmt.Sprintf("set the opening date of %s on the dashboard first", holding.Script))
                continue
            }
            if !day.After(domain.UTCDate(*opening.OpeningDate)) {
                statuses.add(sheetRow.Line, tradeCovered, holding, "")
                continue
            }
        }
        valid = append(valid, tradeRow{sheetRow: sheetRow, day: day, holding: holding})
    }
    // By day only; a stable sort keeps the file's order within a day.
    slices.SortStableFunc(valid, func(first, second tradeRow) int { return first.day.Compare(second.day) })
    return valid
}

func isCreated(created []*domain.Holding, holdingId primitive.ObjectID) bool {
    return slices.ContainsFunc(created, func(holding *domain.Holding) bool { return holding.ID == holdingId })
}

// splitReplacements separates the rows that repeat a stored trade (they
// replace it) from the new ones.
func (s *TradeImportService) splitReplacements(ctx context.Context, userId primitive.ObjectID, valid []tradeRow, created []*domain.Holding, plan *tradePlan, statuses *rowStatuses) ([]tradeRow, error) {
    if len(valid) == 0 {
        return nil, nil
    }
    var storedIds []primitive.ObjectID
    for _, row := range valid {
        if !slices.Contains(storedIds, row.holding.ID) && !isCreated(created, row.holding.ID) {
            storedIds = append(storedIds, row.holding.ID)
        }
    }
    var existing []domain.Transaction
    if len(storedIds) > 0 {
        from, to := valid[0].day, valid[len(valid)-1].day.Add(24*time.Hour-time.Nanosecond)
        var err error
        if existing, err = s.txns.ListTradesByHoldings(ctx, userId, storedIds, from, to); err != nil {
            return nil, err
        }
    }
    // Per key, n sheet rows against m saved trades add max(0, n−m); a saved
    // trade the sheet lacks is never removed (owner, 2026-11-03).
    fresh, duplicates := partitionByKey(valid, existing, tradeRow.key, tradeKeyOf)
    plan.replaced = len(duplicates)
    for _, row := range duplicates {
        statuses.add(row.sheetRow.Line, tradeReplace, row.holding, "")
    }
    return fresh, nil
}

// oversoldHoldings replays each holding's ledger with its new trades: a
// holding whose sells would exceed what it holds is returned.
func (s *TradeImportService) oversoldHoldings(ctx context.Context, userId primitive.ObjectID, fresh []tradeRow, created []*domain.Holding, now time.Time) (map[primitive.ObjectID]bool, error) {
    byHolding := map[primitive.ObjectID][]domain.Transaction{}
    for i, row := range fresh {
        byHolding[row.holding.ID] = append(byHolding[row.holding.ID], row.toTransaction(userId, "", now.Add(time.Duration(i)*time.Millisecond)))
    }
    oversold := map[primitive.ObjectID]bool{}
    for holdingId, events := range byHolding {
        var ledger []domain.Transaction
        if !isCreated(created, holdingId) {
            stored, err := s.txns.ListByHolding(ctx, userId, holdingId)
            if err != nil {
                return nil, err
            }
            ledger = stored
        }
        ledger = append(ledger, events...)
        if _, err := RecomputePosition(ledger); errors.Is(err, ErrOversell) {
            oversold[holdingId] = true
        } else if err != nil {
            return nil, err
        }
    }
    return oversold, nil
}

// evaluate runs validation, symbol resolution, the opening-balance cover,
// the replace lookup and the oversell check. Reads only.
func (s *TradeImportService) evaluate(ctx context.Context, userId primitive.ObjectID, input api.TradeImportInput) (tradePlan, error) {
    holdings, err := s.holdings.ListByUser(ctx, userId)
    if err != nil {
        return tradePlan{}, err
    }
    now := s.now()
    names, created := resolveTradeNames(userId, input, holdings, now)
    openings, err := s.txns.OpeningsByUser(ctx, userId)
    if err != nil {
        return tradePlan{}, err
    }
    plan := tradePlan{created: created, aliases: confirmedAliases(names)}
    statuses := rowStatuses{}
    valid := classifyRows(input.Rows, names, openings, s.today(), &statuses)
    fresh, err := s.splitReplacements(ctx, userId, valid, created, &plan, &statuses)
    if err != nil {
        return tradePlan{}, err
    }
    oversold, err := s.oversoldHoldings(ctx, userId, fresh, created, now)
    if err != nil {
        return tradePlan{}, err
    }
    for _, row := range fresh {
        if oversold[row.holding.ID] && row.sheetRow.Type == api.TradeImportRowTypeSell {
            statuses.add(row.sheetRow.Line, tradeInvalid, row.holding, fmt.Sprintf("sells more %s than held — check earlier buys or the opening balance", row.holding.Script))
            continue
        }
        statuses.add(row.sheetRow.Line, tradeReady, row.holding, "")
        plan.fresh = append(plan.fresh, row)
    }

    views := make([]api.DividendNameResolution, 0, len(names))
    for _, resolution := range names {
        views = append(views, resolution.view)
    }
    plan.preview = api.TradeImportPreview{Counts: statuses.counts(), Names: views, Rows: statuses, Warnings: []api.DividendImportWarning{}}
    return plan, nil
}

// checkTradeInput rejects malformed requests (400) before any read.
func checkTradeInput(input api.TradeImportInput) error {
    if len(input.Rows) > maxImportRows {
        return fmt.Errorf("%w: more than %d rows — split the file", ErrValidation, maxImportRows)
    }
    return nil
}

// Preview evaluates a trades import without writing anything.
func (s *TradeImportService) Preview(ctx context.Context, userId primitive.ObjectID, input api.TradeImportInput) (_ api.TradeImportPreview, retErr error) {
    ctx, span := tracer.Start(ctx, "TradeImportService.Preview")
    defer endSpan(span, &retErr)
    logger := s.log(ctx)
    if err := checkTradeInput(input); err != nil {
        return api.TradeImportPreview{}, err
    }
    plan, err := s.evaluate(ctx, userId, input)
    if err != nil {
        logger.Error("trade import preview failed", zap.Error(err))
        return api.TradeImportPreview{}, err
    }
    return plan.preview, nil
}

// TradeImportInvalidError carries the fresh preview when a confirm finds
// invalid rows; nothing was written. Controllers map it to 422.
type TradeImportInvalidError struct{ Preview api.TradeImportPreview }

func (e *TradeImportInvalidError) Error() string {
    return fmt.Sprintf("trade import: %d invalid rows", e.Preview.Counts.Invalid)
}

// Import commits the new holdings, new trades, replacements, aliases, the
// recomputed positions and the History heal together, or nothing.
func (s *TradeImportService) Import(ctx context.Context, userId primitive.ObjectID, input api.TradeImportInput) (_ api.TradeImportResult, retErr error) {
    ctx, span := tracer.Start(ctx, "TradeImportService.Import")
    defer endSpan(span, &retErr)
    logger := s.log(ctx)
    if err := checkTradeInput(input); err != nil {
        return api.TradeImportResult{}, err
    }
    var result api.TradeImportResult
    err := s.runner.InTransaction(ctx, func(ctx context.Context) error {
        plan, err := s.evaluate(ctx, userId, input)
        if err != nil {
            return err
        }
        if plan.preview.Counts.Invalid > 0 {
            return &TradeImportInvalidError{Preview: plan.preview}
        }
        batchId := primitive.NewObjectID().Hex()
        now := s.now()
        for _, holding := range plan.created {
            if err := s.holdings.Insert(ctx, *holding); err != nil {
                return err
            }
        }
        trades := make([]domain.Transaction, 0, len(plan.fresh))
        var affected []primitive.ObjectID
        var earliest time.Time
        for i, row := range plan.fresh {
            trades = append(trades, row.toTransaction(userId, batchId, now.Add(time.Duration(i)*time.Millisecond)))
            if !slices.Contains(affected, row.holding.ID) {
                affected = append(affected, row.holding.ID)
            }
            if earliest.IsZero() || row.day.Before(earliest) {
                earliest = row.day
            }
        }
        if len(trades) > 0 {
            if err := s.txns.InsertMany(ctx, trades); err != nil {
                return err
            }
        }
        // A row matching a saved trade writes nothing: the saved trade stays
        // exactly as it is.
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
        // History heals inside the same transaction, so ledger, holdings and
        // snapshots commit together (owner: the import must be ACID).
        if s.recomputer != nil && !earliest.IsZero() && earliest.Before(domain.UTCDate(now)) {
            if err := s.recomputer.RecomputeFrom(ctx, userId, earliest); err != nil {
                return err
            }
        }
        result = api.TradeImportResult{Imported: len(trades), Replaced: plan.replaced, Covered: plan.preview.Counts.Covered,
            CreatedHoldings: len(plan.created), BatchId: batchId}
        return nil
    })
    if err != nil {
        if _, ok := errors.AsType[*TradeImportInvalidError](err); !ok {
            logger.Error("trade import failed", zap.Error(err))
        }
        return api.TradeImportResult{}, err
    }
    logger.Info("trades imported", zap.Int("imported", result.Imported), zap.Int("replaced", result.Replaced),
        zap.Int("covered", result.Covered), zap.Int("created_holdings", result.CreatedHoldings), zap.String("batch_id", result.BatchId))
    return result, nil
}
```

* [ ] **Step 9: Service tests (Create `backend/internal/services/trade_import_test.go`)**

WHY: behaviour only, with the mtest mock as the dividend import does: suffix-insensitive symbols, an unknown symbol waits, row validation, the occurrence rule (add only what is missing, never remove), re-upload writes nothing to transactions (saved trades untouched), new trades of a day follow its saved trades in file order dated at the bare day, opening cover, oversell blocks all, a created symbol inserts its holding, and the heal runs inside the commit from the earliest trade and fails the import when it fails.

```go
package services

import (
    "context"
    "errors"
    "fmt"
    "slices"
    "testing"
    "time"

    openapi_types "github.com/oapi-codegen/runtime/types"
    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.mongodb.org/mongo-driver/mongo/integration/mtest"

    "portfolio-dashboard/api"
    "portfolio-dashboard/internal/domain"
    "portfolio-dashboard/internal/persistence"
)

func tradeSheetRow(line int, day string, symbol string, kind api.TradeImportRowType, quantity, amount float64) api.TradeImportRow {
    date, _ := time.Parse(time.DateOnly, day)
    return api.TradeImportRow{Line: line, Date: openapi_types.Date{Time: date}, Symbol: symbol, StockName: symbol + " LTD",
        Exchange: api.TradeImportRowExchangeNSE, Type: kind, Quantity: quantity, Amount: amount}
}

// A BSE row finds the .NS holding: the match is on the symbol without its
// exchange suffix (PRD-008 §5).
func TestResolveSymbols_ExchangeSuffixIgnored(t *testing.T) {
    gold := domain.Holding{ID: primitive.NewObjectID(), Script: "Gold BeES", Symbol: "GOLDBEES.NS", Currency: "INR"}
    got := resolveSymbols([]nameCount{{name: "GOLDBEES", label: "NIP IND ETF GOLD BEES", rows: 3}}, []domain.Holding{gold}, nil)[0]
    if got.view.Status != nameAuto || got.holding == nil || got.holding.ID != gold.ID || *got.view.MatchedBy != "symbol" {
        t.Fatalf("status %q matched %v; want auto by symbol to GOLDBEES.NS", got.view.Status, got.view.MatchedBy)
    }
}

// An unknown symbol is never guessed: it waits for the user, with
// suggestions scored on the sheet's stock name.
func TestResolveSymbols_UnknownSymbolNeedsConfirmation(t *testing.T) {
    lg := domain.Holding{ID: primitive.NewObjectID(), Script: "LG Electronics India", Symbol: "LGEI.NS", Currency: "INR"}
    got := resolveSymbols([]nameCount{{name: "LGEINDIA", label: "LG ELECTRONICS INDIA LTD", rows: 2}}, []domain.Holding{lg}, nil)[0]
    if got.view.Status != nameNeedsConfirmation || got.holding != nil {
        t.Fatalf("status %q; want needs_confirmation with no holding", got.view.Status)
    }
    if len(got.view.Suggestions) == 0 || got.view.Suggestions[0].HoldingId != lg.ID.Hex() {
        t.Errorf("suggestions %v; want LG Electronics India first", got.view.Suggestions)
    }
}

func TestValidateTrade(t *testing.T) {
    today := time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
    ok := tradeSheetRow(2, "2026-11-02", "ITC", api.TradeImportRowTypeBuy, 1, 400)
    for name, testCase := range map[string]struct {
        mutate func(*api.TradeImportRow)
        want   string
    }{
        "valid":         {func(*api.TradeImportRow) {}, ""},
        "unknown type":  {func(row *api.TradeImportRow) { row.Type = "short" }, `Type "short" is not BUY or SELL`},
        "zero quantity": {func(row *api.TradeImportRow) { row.Quantity = 0 }, "Quantity must be a positive number"},
        "zero value":    {func(row *api.TradeImportRow) { row.Amount = 0.004 }, "Value must be a positive amount"},
        "future":        {func(row *api.TradeImportRow) { row.Date = openapi_types.Date{Time: today.AddDate(0, 0, 1)} }, "Date is in the future"},
    } {
        row := ok
        testCase.mutate(&row)
        if got := validateTrade(row, today); got != testCase.want {
            t.Errorf("%s: got %q, want %q", name, got, testCase.want)
        }
    }
}

// The owner's rule (2026-11-03), per holding, day, type, quantity and value:
// n identical sheet rows against m saved trades add max(0, n−m), and a saved
// trade the sheet lacks is never removed.
func TestTradeOccurrences_AddOnlyWhatIsMissing(t *testing.T) {
    holding := &domain.Holding{ID: primitive.NewObjectID()}
    day := time.Date(2025, 4, 7, 0, 0, 0, 0, time.UTC)
    saved := domain.Transaction{HoldingID: holding.ID, Type: domain.TxnBuy, Date: day, Quantity: 5, Amount: 617.25}
    row := tradeRow{sheetRow: tradeSheetRow(2, "2025-04-07", "ITC", api.TradeImportRowTypeBuy, 5, 617.25), day: day, holding: holding}
    for name, testCase := range map[string]struct {
        sheet, saved, wantAdded int
    }{
        "twice in the sheet, none saved": {2, 0, 2},
        "twice in the sheet, once saved": {2, 1, 1},
        "twice in both":                  {2, 2, 0},
        "once in the sheet, twice saved": {1, 2, 0},
        "saved, not in the sheet":        {0, 1, 0},
    } {
        fresh, duplicates := partitionByKey(slices.Repeat([]tradeRow{row}, testCase.sheet), slices.Repeat([]domain.Transaction{saved}, testCase.saved), tradeRow.key, tradeKeyOf)
        if len(fresh) != testCase.wantAdded || len(duplicates) != testCase.sheet-testCase.wantAdded {
            t.Errorf("%s: %d added, %d already saved; want %d added", name, len(fresh), len(duplicates), testCase.wantAdded)
        }
    }
}

func TestTradeImport(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    userId, gold := primitive.NewObjectID(), primitive.NewObjectID()
    holdingDocs := func(mt *mtest.T) bson.D {
        return mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
            bson.D{{Key: "_id", Value: gold}, {Key: "user_id", Value: userId}, {Key: "script", Value: "Gold BeES"}, {Key: "symbol", Value: "GOLDBEES.NS"}, {Key: "currency", Value: "INR"}})
    }
    transactions := func(mt *mtest.T, docs ...bson.D) bson.D {
        return mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, docs...)
    }
    stored := func(day string, kind string, quantity, amount float64) bson.D {
        date, _ := time.Parse(time.DateOnly, day)
        return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: gold},
            {Key: "type", Value: kind}, {Key: "date", Value: date}, {Key: "quantity", Value: quantity}, {Key: "amount", Value: amount}}
    }
    service := func(mt *mtest.T) *TradeImportService {
        store := persistence.New(mt.DB)
        tradeImport := NewTradeImportService(store.Transactions, store.Holdings, directRunner{}, nil, nil)
        tradeImport.today = func() time.Time { return time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC) }
        return tradeImport
    }
    twoBuys := api.TradeImportInput{Rows: []api.TradeImportRow{
        tradeSheetRow(2, "2025-04-04", "GOLDBEES", api.TradeImportRowTypeBuy, 17, 1278.4),
        tradeSheetRow(3, "2025-04-07", "GOLDBEES", api.TradeImportRowTypeBuy, 1, 73.55),
    }}

    mt.Run("re-uploading the same trades writes nothing: saved trades stay untouched", func(mt *mtest.T) {
        first, second := stored("2025-04-04", "buy", 17, 1278.4), stored("2025-04-07", "buy", 1, 73.55)
        mt.AddMockResponses(
            holdingDocs(mt),
            transactions(mt), // no opening
            transactions(mt, first, second),
        )
        result, err := service(mt).Import(context.Background(), userId, twoBuys)
        if err != nil {
            t.Fatalf("Import: %v", err)
        }
        if result.Imported != 0 || result.Replaced != 2 {
            t.Errorf("imported %d replaced %d; want 0 / 2", result.Imported, result.Replaced)
        }
        for _, write := range []string{"insert", "update", "findAndModify", "delete"} {
            if count := commandCount(mt, write, "transactions"); count != 0 {
                t.Errorf("%d %s commands on transactions; want none", count, write)
            }
        }
    })

    mt.Run("rows up to the opening date are covered; later rows import", func(mt *mtest.T) {
        openingDate := time.Date(2025, 4, 5, 0, 0, 0, 0, time.UTC)
        opening := bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: gold},
            {Key: "type", Value: "opening"}, {Key: "date", Value: openingDate}, {Key: "opening_date", Value: openingDate}, {Key: "quantity", Value: 40.0}, {Key: "amount", Value: 2800.0}}
        mt.AddMockResponses(
            holdingDocs(mt),
            transactions(mt, opening),
            transactions(mt),          // nothing stored to replace
            transactions(mt, opening), // oversell replay
            mtest.CreateSuccessResponse(),
            transactions(mt, opening), // recompute
            mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
        )
        result, err := service(mt).Import(context.Background(), userId, twoBuys)
        if err != nil {
            t.Fatalf("Import: %v", err)
        }
        if result.Imported != 1 || result.Covered != 1 {
            t.Errorf("imported %d covered %d; want 1 / 1 (4 Apr is inside the opening)", result.Imported, result.Covered)
        }
    })

    mt.Run("History heals inside the commit, from the earliest new trade; a failed heal fails the import", func(mt *mtest.T) {
        mt.AddMockResponses(
            holdingDocs(mt), transactions(mt), transactions(mt), transactions(mt),
            mtest.CreateSuccessResponse(), // insertMany
            transactions(mt),              // recompute
            mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
        )
        healer := &recordingRecomputer{err: errors.New("snapshot write failed")}
        tradeImport := service(mt)
        tradeImport.recomputer = healer
        _, err := tradeImport.Import(context.Background(), userId, twoBuys)
        if err == nil || !healer.from.Equal(time.Date(2025, 4, 4, 0, 0, 0, 0, time.UTC)) {
            t.Fatalf("err = %v, healed from %v; want the heal error, healed from 2025-04-04", err, healer.from)
        }
    })

    mt.Run("a sell beyond the shares held blocks the whole import", func(mt *mtest.T) {
        mt.AddMockResponses(holdingDocs(mt), transactions(mt), transactions(mt), transactions(mt))
        input := api.TradeImportInput{Rows: []api.TradeImportRow{tradeSheetRow(2, "2025-04-04", "GOLDBEES", api.TradeImportRowTypeSell, 5, 400)}}
        _, err := service(mt).Import(context.Background(), userId, input)
        var invalid *TradeImportInvalidError
        if !errors.As(err, &invalid) || invalid.Preview.Counts.Invalid != 1 {
            t.Fatalf("err = %v; want TradeImportInvalidError with the sell invalid", err)
        }
        if inserts := commandCount(mt, "insert", "transactions"); inserts != 0 {
            t.Errorf("%d inserts issued; want none", inserts)
        }
    })

    // Same-day order is by day only (owner, 2026-11-03: the file's time has no
    // effect): a saved trade keeps its place, new trades of that day follow
    // it in the file's order, each dated at the bare day.
    mt.Run("new trades of a day follow its saved trades, in file order, dated at the day", func(mt *mtest.T) {
        saved := stored("2025-04-07", "buy", 1, 73.55)
        mt.AddMockResponses(
            holdingDocs(mt), transactions(mt), transactions(mt, saved),
            transactions(mt, saved),       // oversell replay
            mtest.CreateSuccessResponse(), // insertMany
            transactions(mt, saved),       // recompute
            mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: gold}}}),
        )
        input := api.TradeImportInput{Rows: []api.TradeImportRow{
            tradeSheetRow(2, "2025-04-07", "GOLDBEES", api.TradeImportRowTypeSell, 1, 75),
            tradeSheetRow(3, "2025-04-07", "GOLDBEES", api.TradeImportRowTypeBuy, 2, 150),
        }}
        tradeImport := service(mt)
        importedAt := time.Date(2026, 11, 3, 9, 0, 0, 0, time.UTC)
        tradeImport.now = func() time.Time { return importedAt }
        if _, err := tradeImport.Import(context.Background(), userId, input); err != nil {
            t.Fatalf("Import: %v", err)
        }
        if problem := dayOrderProblem(insertedTrades(mt), []string{"sell", "buy"}, time.Date(2025, 4, 7, 0, 0, 0, 0, time.UTC), importedAt); problem != "" {
            t.Error(problem)
        }
    })

    mt.Run("a confirmed new symbol creates its holding with the trades", func(mt *mtest.T) {
        mt.AddMockResponses(
            mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch), // no holdings
            transactions(mt),              // no openings
            mtest.CreateSuccessResponse(), // insert holding
            mtest.CreateSuccessResponse(), // insertMany trades
            transactions(mt),              // recompute
            mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: primitive.NewObjectID()}}}),
        )
        input := api.TradeImportInput{Rows: []api.TradeImportRow{
            tradeSheetRow(2, "2025-10-13", "LGEINDIA", api.TradeImportRowTypeBuy, 13, 14820),
            tradeSheetRow(3, "2025-10-14", "LGEINDIA", api.TradeImportRowTypeSell, 13, 22258.6),
        }, Create: &[]string{"LGEINDIA"}}
        result, err := service(mt).Import(context.Background(), userId, input)
        if err != nil {
            t.Fatalf("Import: %v", err)
        }
        if result.CreatedHoldings != 1 || result.Imported != 2 {
            t.Errorf("created %d imported %d; want 1 / 2", result.CreatedHoldings, result.Imported)
        }
        if inserts := commandCount(mt, "insert", "holdings"); inserts != 1 {
            t.Errorf("%d holding inserts; want 1", inserts)
        }
    })
}

// insertedTrades returns the documents of every insert on transactions.
func insertedTrades(mt *mtest.T) []bson.Raw {
    var inserted []bson.Raw
    for _, event := range mt.GetAllStartedEvents() {
        if event.CommandName == "insert" && event.Command.Lookup("insert").StringValue() == "transactions" {
            documents, _ := event.Command.Lookup("documents").Array().Values()
            for _, document := range documents {
                inserted = append(inserted, document.Document())
            }
        }
    }
    return inserted
}

// dayOrderProblem describes how inserted trades break the day-only order —
// the given types in file order, each dated at the bare day and created at
// or after importedAt with created_at rising in file order — or "" when they
// keep it.
func dayOrderProblem(inserted []bson.Raw, types []string, day, importedAt time.Time) string {
    if len(inserted) != len(types) {
        return fmt.Sprintf("%d trades inserted; want %d", len(inserted), len(types))
    }
    previous := importedAt.Add(-time.Nanosecond)
    for i, trade := range inserted {
        created := trade.Lookup("created_at").Time()
        switch {
        case trade.Lookup("type").StringValue() != types[i]:
            return fmt.Sprintf("trade %d is a %s; want %v in file order", i, trade.Lookup("type").StringValue(), types)
        case !trade.Lookup("date").Time().UTC().Equal(day):
            return fmt.Sprintf("trade %d dated %v; want the bare day %v", i, trade.Lookup("date").Time().UTC(), day)
        case !created.After(previous):
            return fmt.Sprintf("trade %d created %v; want after %v (the import, then file order)", i, created, previous)
        }
        previous = created
    }
    return ""
}

// recordingRecomputer records the heal start and returns err.
type recordingRecomputer struct {
    from time.Time
    err  error
}

func (r *recordingRecomputer) RecomputeFrom(_ context.Context, _ primitive.ObjectID, from time.Time) error {
    r.from = from
    return r.err
}
```

* [ ] **Step 10: Wire the service (Edit `backend/internal/controllers/controllers.go`)**

WHY: the import heals History, so it shares the transactions service's snapshot recomputer; one instance, built once.

Current:

```go
    history      *services.HistoryService
    dividends    *services.DividendsService
    gold         *services.GoldService // nil when Postgres is not configured (DD-003 §1) — gold routes answer 503
    logger       *zap.Logger
```

Replacement:

```go
    history      *services.HistoryService
    dividends    *services.DividendsService
    tradeImport  *services.TradeImportService
    gold         *services.GoldService // nil when Postgres is not configured (DD-003 §1) — gold routes answer 503
    logger       *zap.Logger
```

Current:

```go
// or a stub price fetcher.
func newWithDeps(store *persistence.Store, priceService services.PriceFetcher, logger *zap.Logger, cookieSecure bool) *Controller {
    return &Controller{
        store:        store,
        priceService: priceService,
        holdings:     services.NewHoldingsService(store.Holdings, store.Transactions, logger),
        transactions: services.NewTransactionsService(store.Transactions, store.Holdings,
            services.NewSnapshotRecomputer(store.Holdings, store.Transactions, store.Snapshots, logger), logger),
        portfolio:    services.NewPortfolioService(store.Holdings, store.Snapshots, priceService, logger),
        history:      services.NewHistoryService(store.Snapshots, logger),
        dividends:    services.NewDividendsService(store.Transactions, store.Holdings, store, logger),
        logger:       logger,
        cookieSecure: cookieSecure,
```

Replacement:

```go
// or a stub price fetcher.
func newWithDeps(store *persistence.Store, priceService services.PriceFetcher, logger *zap.Logger, cookieSecure bool) *Controller {
    recomputer := services.NewSnapshotRecomputer(store.Holdings, store.Transactions, store.Snapshots, logger)
    return &Controller{
        store:        store,
        priceService: priceService,
        holdings:     services.NewHoldingsService(store.Holdings, store.Transactions, logger),
        transactions: services.NewTransactionsService(store.Transactions, store.Holdings, recomputer, logger),
        portfolio:    services.NewPortfolioService(store.Holdings, store.Snapshots, priceService, logger),
        history:      services.NewHistoryService(store.Snapshots, logger),
        dividends:    services.NewDividendsService(store.Transactions, store.Holdings, store, logger),
        tradeImport:  services.NewTradeImportService(store.Transactions, store.Holdings, store, recomputer, logger),
        logger:       logger,
        cookieSecure: cookieSecure,
```

* [ ] **Step 11: Handlers (Create `backend/internal/controllers/trade_import.go`)**

WHY: thin wrappers like the dividend handlers; a commit-time oversell is a client error (400), using the ledger's existing `badTransaction`.

```go
package controllers

import (
    "context"
    "errors"

    "portfolio-dashboard/api"
    "portfolio-dashboard/internal/services"
)

// Trades CSV import (PRD-008): own portfolio and admin act-as, mirroring the
// dividend import's handlers. A commit-time oversell is a 400 like ErrValidation.

func (h *Controller) PreviewTradeImport(ctx context.Context, request api.PreviewTradeImportRequestObject) (api.PreviewTradeImportResponseObject, error) {
    currentUserId, err := currentUserID(ctx)
    if err != nil {
        return nil, err
    }
    preview, err := h.tradeImport.Preview(ctx, currentUserId, *request.Body)
    if err != nil {
        if errors.Is(err, services.ErrValidation) {
            return api.PreviewTradeImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
        }
        return nil, err
    }
    return api.PreviewTradeImport200JSONResponse(preview), nil
}

func (h *Controller) AdminPreviewUserTradeImport(ctx context.Context, request api.AdminPreviewUserTradeImportRequestObject) (api.AdminPreviewUserTradeImportResponseObject, error) {
    caller, err := adminCaller(ctx)
    if err != nil {
        return nil, err
    }
    target, found, err := h.loadTargetUser(ctx, caller, request.Id)
    if err != nil {
        return nil, err
    }
    if !found {
        return api.AdminPreviewUserTradeImport404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }
    preview, err := h.tradeImport.Preview(ctx, target.ID, *request.Body)
    if err != nil {
        if errors.Is(err, services.ErrValidation) {
            return api.AdminPreviewUserTradeImport400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
        }
        return nil, err
    }
    return api.AdminPreviewUserTradeImport200JSONResponse(preview), nil
}

func (h *Controller) ImportTrades(ctx context.Context, request api.ImportTradesRequestObject) (api.ImportTradesResponseObject, error) {
    currentUserId, err := currentUserID(ctx)
    if err != nil {
        return nil, err
    }
    result, err := h.tradeImport.Import(ctx, currentUserId, *request.Body)
    var invalid *services.TradeImportInvalidError
    switch {
    case errors.As(err, &invalid):
        return api.ImportTrades422JSONResponse(invalid.Preview), nil
    case badTransaction(err):
        return api.ImportTrades400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
    case err != nil:
        return nil, err
    }
    return api.ImportTrades200JSONResponse(result), nil
}

func (h *Controller) AdminImportUserTrades(ctx context.Context, request api.AdminImportUserTradesRequestObject) (api.AdminImportUserTradesResponseObject, error) {
    caller, err := adminCaller(ctx)
    if err != nil {
        return nil, err
    }
    target, found, err := h.loadTargetUser(ctx, caller, request.Id)
    if err != nil {
        return nil, err
    }
    if !found {
        return api.AdminImportUserTrades404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }
    result, err := h.tradeImport.Import(ctx, target.ID, *request.Body)
    var invalid *services.TradeImportInvalidError
    switch {
    case errors.As(err, &invalid):
        return api.AdminImportUserTrades422JSONResponse(invalid.Preview), nil
    case badTransaction(err):
        return api.AdminImportUserTrades400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
    case err != nil:
        return nil, err
    }
    return api.AdminImportUserTrades200JSONResponse(result), nil
}
```

* [ ] **Step 12: Admin route tiers (Edit `backend/internal/httpserver/auth.go`)**

WHY: every admin route must declare its tier (`TestAuthGate_TierTableMatchesGeneratedRoutes`).

Current:

```go
    "POST /api/admin/users/:id/dividends/import/preview":         tierAdmin,
    "POST /api/admin/users/:id/dividends/import":                 tierAdmin,
    "DELETE /api/admin/users/:id/dividends":                      tierAdmin,
    "GET /api/admin/users/:id/holdings/:holdingId/transactions":  tierAdmin,
```

Replacement:

```go
    "POST /api/admin/users/:id/dividends/import/preview":         tierAdmin,
    "POST /api/admin/users/:id/dividends/import":                 tierAdmin,
    "POST /api/admin/users/:id/transactions/import/preview":      tierAdmin,
    "POST /api/admin/users/:id/transactions/import":              tierAdmin,
    "DELETE /api/admin/users/:id/dividends":                      tierAdmin,
    "GET /api/admin/users/:id/holdings/:holdingId/transactions":  tierAdmin,
```

* [ ] **Step 13: Verify**

```bash
cd backend && gofmt -l internal && go vet ./... && go test ./... && golangci-lint run ./...
```

Expected: no gofmt output; every package `ok` (services +5 tests, one with 6 cases); `0 issues.`

* [ ] **Step 14: Commit, push, open PR3 into the feature branch**

WHY: the PR body carries the curl block below (endpoint PRs).

```bash
git add backend/api/specs/ backend/api/models.gen.go backend/api/server.gen.go backend/internal/persistence/transactions.go backend/internal/services/trade_import.go backend/internal/services/trade_import_test.go backend/internal/controllers/trade_import.go backend/internal/controllers/controllers.go backend/internal/httpserver/auth.go
git commit -m "✨ Add the trades CSV import API"
git push -u origin feat/PD-051-trade-import-api
gh pr create --base feat/PD-051-trade-csv-import --title "✨ Preview and import trades from a broker CSV atomically" --body-file pr3.md
```

Expected: PR URL; CI green.

How to test (PR3 body), with the dev stack running:

````bash
curl -s -c jar -H 'X-Requested-With: portfolio-dashboard' -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<dev password>"}' localhost:8080/api/auth/login
curl -s -b jar -H 'X-Requested-With: portfolio-dashboard' -H 'Content-Type: application/json' \
  -d '{"rows":[{"line":2,"date":"2025-10-13","symbol":"LGEINDIA","stock_name":"LG ELECTRONICS INDIA LTD","exchange":"NSE","type":"buy","quantity":13,"amount":14820}],"create":["LGEINDIA"]}' \
  localhost:8080/api/transactions/import/preview
# 200: counts.ready 1, names[0].status "create"
curl -s -b jar -H 'X-Requested-With: portfolio-dashboard' -H 'Content-Type: application/json' \
  -d '<same body>' localhost:8080/api/transactions/import
# 200: imported 1, created_holdings 1; repeat it → imported 0, replaced 1
````

---

## Task 3: Share the import pieces (frontend, PR4)

**Files:**

* Create: `frontend/src/features/imports/ImportTables.tsx`
* Modify: `frontend/src/lib/formDates.ts`, `frontend/src/lib/formDates.test.ts`, `frontend/src/lib/csv.ts`, `frontend/src/lib/csv.test.ts`, `frontend/src/features/dividends/DividendImportModal.tsx`
* Move: `frontend/src/features/dividends/NameConfirmDialog.tsx` → `frontend/src/features/imports/NameConfirmDialog.tsx`

* [ ] **Step 1: Branch from the feature branch (after PR3 merged)**

```bash
git fetch origin && git checkout -b refactor/PD-051-shared-import-ui origin/feat/PD-051-trade-csv-import
```

* [ ] **Step 2: Day-first dates, a trailing time ignored (Edit `frontend/src/lib/formDates.ts`)**

WHY: the owner's file mixes `1/11/2024` and `17-12-2024 03:30 PM` in one column; both are day-first (owner, 2026-11-03), and only the day is imported: the time has no effect. `normaliseDate` reads past a real 12/24-hour clock time and drops it (trailing text or an impossible time still makes the date invalid), so dividends and the History paste gain the same tolerance. The two `p` locals are renamed because `lint:changed` checks this file now.

Current:

```ts
// callers can pass through placeholders/empty strings safely.
export function formatDate(iso: string | null | undefined): string {
  const p = splitISO(iso)
  return p ? `${p.d}-${p.m}-${p.y}` : iso ?? ''
}
```

Replacement:

```ts
// callers can pass through placeholders/empty strings safely.
export function formatDate(iso: string | null | undefined): string {
  const parts = splitISO(iso)
  return parts ? `${parts.d}-${parts.m}-${parts.y}` : iso ?? ''
}
```

Current:

```ts
// input is returned unchanged, same as formatDate.
export function formatDayMonth(iso: string | null | undefined): string {
  const p = splitISO(iso)
  return p ? `${p.d}-${p.m}` : iso ?? ''
}
```

Replacement:

```ts
// input is returned unchanged, same as formatDate.
export function formatDayMonth(iso: string | null | undefined): string {
  const parts = splitISO(iso)
  return parts ? `${parts.d}-${parts.m}` : iso ?? ''
}
```

Current:

```ts
}

// normaliseDate accepts the day-first formats users paste or upload from
// spreadsheets — YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (1-digit day
// or month allowed) — and returns "YYYY-MM-DD", or "" when the input is not a
// real calendar date (31/02/2021 and 13/13/2020 are rejected).
export function normaliseDate(raw: string): string {
  const trimmed = raw.trim()
  let year: number, month: number, day: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  const dayFirst = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(trimmed)
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (dayFirst) [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])]
```

Replacement:

```ts
}

// A clock time after the date: "03:30 PM", "9:05 am", "15:30", "15:30:12".
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i

// isClockTime is true for a real 12- or 24-hour clock time.
function isClockTime(text: string): boolean {
  const time = TIME.exec(text)
  if (!time) return false
  const hours = Number(time[1])
  return Number(time[2]) <= 59 && (time[4] ? hours >= 1 && hours <= 12 : hours <= 23)
}

// normaliseDate accepts the day-first formats users paste or upload from
// spreadsheets — YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (1-digit day
// or month allowed), optionally followed by a clock time, which is read past
// and dropped: only the day is kept (PRD-008 §4). Returns "YYYY-MM-DD", or ""
// when the input is not a real calendar date (31/02/2021 and 13/13/2020 are
// rejected) or what follows the date is not a clock time.
export function normaliseDate(raw: string): string {
  const [datePart = '', ...rest] = raw.trim().split(/\s+/)
  let year: number, month: number, day: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  const dayFirst = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(datePart)
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (dayFirst) [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])]
```

Current:

```ts
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
```

Replacement:

```ts
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return ''
  if (rest.length > 0 && !isClockTime(rest.join(' '))) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
```

* [ ] **Step 3: Date tests (Edit `frontend/src/lib/formDates.test.ts`)**

WHY: the sample's two shapes, the 12 AM edge, 24-hour times with seconds, and the rejections.

Current:

```ts
    expect(normaliseDate('abc')).toBe('')
  })
})
```

Replacement:

```ts
    expect(normaliseDate('abc')).toBe('')
  })
  // The owner's broker file mixes both shapes in one column (PRD-008 §4);
  // the time is read past and dropped, the day kept.
  it('keeps only the day when a time follows the date', () => {
    expect(normaliseDate('1/11/2024')).toBe('2024-11-01')
    expect(normaliseDate('17-12-2024 03:30 PM')).toBe('2024-12-17')
    expect(normaliseDate('01-01-2026 12:05 AM')).toBe('2026-01-01')
    expect(normaliseDate('25-06-2025 15:30')).toBe('2025-06-25')
    expect(normaliseDate('25-06-2025 09:00:45')).toBe('2025-06-25')
  })
  it('rejects an impossible time or a trailing word', () => {
    expect(normaliseDate('17-12-2024 13:30 PM')).toBe('')
    expect(normaliseDate('17-12-2024 24:00')).toBe('')
    expect(normaliseDate('17-12-2024 03:30 PM IST')).toBe('')
  })
})
```

* [ ] **Step 4: Detect the separator (Edit `frontend/src/lib/csv.ts`)**

WHY: the owner pasted a tab-separated file; Excel exports comma or, in comma-decimal locales, semicolon. Sniffing the header line keeps one reader for all.

Current:

```ts
// parseCsv tokenises RFC-4180 CSV: quoted fields, "" escapes, embedded
// commas/newlines, CRLF or LF, a leading BOM. Blank lines are kept as ['']
// so file line numbers stay true.
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
```

Replacement:

```ts
// sniffDelimiter picks the separator of a spreadsheet export from its first
// non-blank line: tab (a copy-paste or .tsv), semicolon (a comma-decimal
// locale) or comma, whichever appears most; comma when none does.
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find(line => line.trim() !== '') ?? ''
  const counts = [',', '\t', ';'].map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length - 1 }))
  const best = counts.reduce((top, candidate) => (candidate.count > top.count ? candidate : top))
  return best.count > 0 ? best.delimiter : ','
}

// parseCsv tokenises RFC-4180 CSV: quoted fields, "" escapes, embedded
// delimiters/newlines, CRLF or LF, a leading BOM. Blank lines are kept as
// [''] so file line numbers stay true. The delimiter defaults to the
// sniffed one, so a tab-separated file reads the same as a comma one.
export function parseCsv(text: string, delimiter = sniffDelimiter(text)): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
```

Current:

```ts
    }
    if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
```

Replacement:

```ts
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
```

* [ ] **Step 5: Separator tests (Edit `frontend/src/lib/csv.test.ts`)**

WHY: a comma inside a tab-separated cell stays in the cell.

Current:

```ts
import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
```

Replacement:

```ts
import { describe, expect, it } from 'vitest'
import { parseCsv, sniffDelimiter } from './csv'

describe('parseCsv', () => {
```

Current:

```ts
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
  })
})
```

Replacement:

```ts
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
  })
  it('reads a tab-separated file, keeping commas inside cells', () => {
    expect(parseCsv('Stock name\tValue\nHCL TECHNOLOGIES LTD\t1,777\n')).toEqual([
      ['Stock name', 'Value'], ['HCL TECHNOLOGIES LTD', '1,777'],
    ])
  })
})

describe('sniffDelimiter', () => {
  it('picks the separator the header uses most', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(sniffDelimiter('\nStock name\tSymbol\tType\n')).toBe('\t')
    expect(sniffDelimiter('a;b;c')).toBe(';')
    expect(sniffDelimiter('single')).toBe(',')
  })
})
```

* [ ] **Step 6: Move the name dialog to the shared folder**

WHY: both imports use it; git keeps the history.

```bash
git mv frontend/src/features/dividends/NameConfirmDialog.tsx frontend/src/features/imports/NameConfirmDialog.tsx
```

* [ ] **Step 7: The shared name dialog (replace the moved file's content) (Create `frontend/src/features/imports/NameConfirmDialog.tsx`)**

WHY: the heading and intro become props (the heading stays the accessible name, so the dividend test's "Confirm share names" still finds it), and an optional `createLabel` adds "Create a new holding" for the trades import; `onConfirm` also returns the names to create.

```tsx
// The "which holding does this sheet name mean?" step shared by the CSV
// imports (PRD-005 §6, PRD-008 §5). Answers are a holding id or null
// (unresolved); `created` lists the names the user chose to create a new
// holding for, offered only when the import supports it (createLabel).
import { useState } from 'react'
import type { DividendNameResolution, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

export type Answers = Record<string, string | null>

const OTHER = '__other__'
const NONE = '__none__'
const CREATE = '__create__'

export default function NameConfirmDialog({ names, holdings, heading, context, intro, createLabel, onBack, onConfirm }: {
  names: DividendNameResolution[]
  holdings: Holding[]
  heading: string // also the dialog's accessible name
  context?: string // shown after the heading, e.g. the dividend tab "₹ INR"
  intro: string
  // When set, each name also offers "Create a new holding" with this label.
  createLabel?: (sheetName: string) => string
  onBack: () => void
  onConfirm: (answers: Answers, created: string[]) => void
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map(name => [name.sheet_name, name.preselect ?? ''])))
  const [other, setOther] = useState<Record<string, string>>({})

  const answered = names.every(name => {
    const chosen = choice[name.sheet_name]
    return chosen === NONE || chosen === CREATE || (chosen === OTHER ? !!other[name.sheet_name] : !!chosen)
  })

  const confirm = () => {
    const answers: Answers = {}
    const created: string[] = []
    for (const name of names) {
      const chosen = choice[name.sheet_name]
      if (chosen === CREATE) created.push(name.sheet_name)
      else answers[name.sheet_name] = chosen === NONE ? null : chosen === OTHER ? other[name.sheet_name] : chosen
    }
    onConfirm(answers, created)
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={heading}>
      <div style={{ ...modalCard, width: 'min(620px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{heading}{context && ` · ${context}`}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{intro}</p>
        {names.map(name => (
          <fieldset key={name.sheet_name} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <legend style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--yellow)' }}>
              {name.sheet_name} <span style={{ color: 'var(--text-muted)' }}>· {name.rows} rows{name.status === 'ambiguous' ? ' · matches more than one holding' : ''}</span>
            </legend>
            {name.suggestions.map(suggestion => (
              <label key={suggestion.holding_id} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === suggestion.holding_id}
                  onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: suggestion.holding_id }))} />
                {suggestion.script} · {suggestion.symbol}{name.preselect === suggestion.holding_id && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>suggested</span>}
              </label>
            ))}
            <label style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'center' }}>
              <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === OTHER}
                onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: OTHER }))} />
              Other holding…
              <select aria-label={`Other holding for ${name.sheet_name}`} value={other[name.sheet_name] ?? ''}
                onChange={e => { setOther(previous => ({ ...previous, [name.sheet_name]: e.target.value })); setChoice(previous => ({ ...previous, [name.sheet_name]: OTHER })) }}>
                <option value="">Choose…</option>
                {holdings.map(holding => <option key={holding.id} value={holding.id}>{holding.script} · {holding.symbol}</option>)}
              </select>
            </label>
            {createLabel && (
              <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === CREATE}
                  onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: CREATE }))} />
                {createLabel(name.sheet_name)}
              </label>
            )}
            <label style={{ display: 'flex', gap: 8, fontSize: 13 }}>
              <input type="radio" name={name.sheet_name} checked={choice[name.sheet_name] === NONE}
                onChange={() => setChoice(previous => ({ ...previous, [name.sheet_name]: NONE }))} />
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

* [ ] **Step 8: Shared preview tables (Create `frontend/src/features/imports/ImportTables.tsx`)**

WHY: the counts table and the invalid-lines table were inline in the dividend modal; trades show the same tables with different rows.

```tsx
// The preview tables shared by the CSV imports: the status counts and the
// lines that need fixing before anything can be imported.
import { td, th } from '../history/historyShared'

export interface InvalidLine { line: number; reason: string }

// ImportCounts lists each status with its count, then the total in bold.
export function ImportCounts({ counts, total }: { counts: [label: string, count: number][]; total: number }) {
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 320 }}>
      <thead><tr><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Count</th></tr></thead>
      <tbody>
        {counts.map(([label, count]) => (
          <tr key={label}><td style={td}>{label}</td><td style={{ ...td, textAlign: 'right' }}>{count}</td></tr>
        ))}
        <tr><td style={{ ...td, fontWeight: 700 }}>Total</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{total}</td></tr>
      </tbody>
    </table>
  )
}

// InvalidLines explains why the import is blocked, one row per bad line.
export function InvalidLines({ lines }: { lines: InvalidLine[] }) {
  if (lines.length === 0) return null
  return (
    <>
      <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}><strong>{lines.length} rows need fixing</strong> before you can import. Nothing has been saved.</p>
      <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead><tr><th style={th}>Line</th><th style={th}>Problem</th></tr></thead>
        <tbody>{lines.map(invalidLine => <tr key={invalidLine.line}><td style={td}>{invalidLine.line}</td><td style={td}>{invalidLine.reason}</td></tr>)}</tbody>
      </table>
    </>
  )
}
```

* [ ] **Step 9: The dividend modal uses the shared pieces (Edit `frontend/src/features/dividends/DividendImportModal.tsx`)**

WHY: same text, same behaviour; only where the markup lives changes.

Current:

```tsx
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
import NameConfirmDialog, { type Answers } from './NameConfirmDialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
```

Replacement:

```tsx
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
import { ImportCounts, InvalidLines } from '../imports/ImportTables'
import NameConfirmDialog, { type Answers } from '../imports/NameConfirmDialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
```

Current:

```tsx
  if (step === 'names' && preview) {
    return (
      <NameConfirmDialog names={open(preview, answers)} holdings={inTab} currencyLabel={label} onBack={() => setStep('pick')}
        onConfirm={confirmed => { const next = { ...answers, ...confirmed }; setAnswers(next); void runPreview(rows, next) }} />
    )
```

Replacement:

```tsx
  if (step === 'names' && preview) {
    return (
      <NameConfirmDialog names={open(preview, answers)} holdings={inTab} heading="Confirm share names" context={label}
        intro="These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time."
        onBack={() => setStep('pick')}
        onConfirm={confirmed => { const next = { ...answers, ...confirmed }; setAnswers(next); void runPreview(rows, next) }} />
    )
```

Current:

```tsx
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
                  <tbody>{invalidLines.map(invalidLine => <tr key={invalidLine.line}><td style={td}>{invalidLine.line}</td><td style={td}>{invalidLine.reason}</td></tr>)}</tbody>
                </table>
              </>
            )}
            {preview.warnings.map(warning => (
              <p key={warning.line} style={{ color: 'var(--yellow)', fontSize: 12, margin: 0 }}>⚠ Line {warning.line}: {warning.message}. Import is still allowed.</p>
```

Replacement:

```tsx
        {step === 'preview' && counts && preview && (
          <>
            <ImportCounts total={counts.total}
              counts={[['Ready to import', counts.ready], ['Already exists', counts.duplicate], ['Invalid', counts.invalid]]} />
            <InvalidLines lines={invalidLines} />
            {preview.warnings.map(warning => (
              <p key={warning.line} style={{ color: 'var(--yellow)', fontSize: 12, margin: 0 }}>⚠ Line {warning.line}: {warning.message}. Import is still allowed.</p>
```

* [ ] **Step 10: Verify**

WHY: the dividend import tests must pass unchanged.

```bash
cd frontend && npm run typecheck && npx vitest run && npm run lint:changed
```

Expected: every suite passes (+7 tests: dates 5, separator 2); no lint errors.

* [ ] **Step 11: Commit, push, open PR4 into the feature branch**

```bash
git add frontend/src/lib/formDates.ts frontend/src/lib/formDates.test.ts frontend/src/lib/csv.ts frontend/src/lib/csv.test.ts frontend/src/features/imports/ frontend/src/features/dividends/
git commit -m "♻️ Share the CSV import dialog and parsers"
git push -u origin refactor/PD-051-shared-import-ui
gh pr create --base feat/PD-051-trade-csv-import --title "♻️ Share the dividend import's dialog, tables and parsers" --body-file pr4.md
```

Expected: PR URL; CI green (Frontend job incl. `lint changed files`).

---

## Task 4: Import CSV on the Transactions page (frontend, PR5)

**Files:**

* Create: `frontend/src/features/transactions/tradeCsv.ts`, `frontend/src/features/transactions/tradeCsv.test.ts`, `frontend/src/features/transactions/TradeImportModal.tsx`, `frontend/src/features/transactions/TradeImport.test.tsx`
* Modify: `frontend/src/lib/api/schema.gen.ts`, `frontend/src/types.ts`, `frontend/src/lib/api/client.ts`, `frontend/src/features/transactions/TransactionsPage.tsx`, `frontend/src/features/transactions/TransactionsPage.test.tsx`, `docs/portfolio-model.md`

* [ ] **Step 1: Branch from the feature branch (after PR4 merged)**

```bash
git fetch origin && git checkout -b feat/PD-051-trade-import-ui origin/feat/PD-051-trade-csv-import
```

* [ ] **Step 2: Regenerate the frontend API types**

WHY: schema.gen.ts is generated from the spec PR3 merged.

```bash
cd frontend && npm run gen:api
```

Expected: `src/lib/api/schema.gen.ts` gains `TradeImportRow` … `TradeImportResult`.

* [ ] **Step 3: Type aliases (Edit `frontend/src/types.ts`)**

WHY: the app imports API types from `types.ts`, never from the generated file.

Current:

```ts
export type DividendNameResolution = Schemas['DividendNameResolution']
export type DividendCurrency = DividendImportInput['currency']

export type Exchange = NonNullable<Holding['exchange']>
```

Replacement:

```ts
export type DividendNameResolution = Schemas['DividendNameResolution']
export type DividendCurrency = DividendImportInput['currency']
export type TradeImportRow = Schemas['TradeImportRow']
export type TradeImportInput = Schemas['TradeImportInput']
export type TradeImportPreview = Schemas['TradeImportPreview']
export type TradeImportResult = Schemas['TradeImportResult']

export type Exchange = NonNullable<Holding['exchange']>
```

* [ ] **Step 4: Client methods (Edit `frontend/src/lib/api/client.ts`)**

WHY: `transactionsPath` already maps own vs act-as, so the import follows the same routing as the ledger list.

Current:

```ts
  DividendImportResult,
  DividendView,
} from '../../types'
import {
```

Replacement:

```ts
  DividendImportResult,
  DividendView,
  TradeImportInput,
  TradeImportPreview,
  TradeImportResult,
} from '../../types'
import {
```

Current:

```ts
  listAllTransactions: (userId?: string) =>
    request<TransactionWithHolding[]>('GET', transactionsPath(userId)),

  // Dividends (PD-048): one currency tab, CSV import, delete-all. Single
```

Replacement:

```ts
  listAllTransactions: (userId?: string) =>
    request<TransactionWithHolding[]>('GET', transactionsPath(userId)),
  // Trades CSV import (PD-051): preview, then an atomic commit.
  previewTradeImport: (body: TradeImportInput, userId?: string) =>
    request<TradeImportPreview>('POST', `${transactionsPath(userId)}/import/preview`, body),
  importTrades: (body: TradeImportInput, userId?: string) =>
    request<TradeImportResult>('POST', `${transactionsPath(userId)}/import`, body),

  // Dividends (PD-048): one currency tab, CSV import, delete-all. Single
```

* [ ] **Step 5: Read the broker file (Create `frontend/src/features/transactions/tradeCsv.ts`)**

WHY: header names in any order and case; required vs optional columns; day-first dates, a trailing time ignored; not-executed orders skipped (shown, not errors); every bad line keeps its reason.

```ts
// Reads a broker order-history export (Groww's columns, PRD-008 §4) into
// trade rows for the import preview. Dates are always day-first; a time
// after the date is ignored (only the day is imported). Rows whose order did
// not execute are skipped, not errors.
import { parseCsv } from '../../lib/csv'
import { normaliseDate } from '../../lib/formDates'
import { parseMoneyCell } from '../../lib/formNumbers'
import type { InvalidLine } from '../imports/ImportTables'
import type { TradeImportRow } from '../../types'

export const MAX_ROWS = 5000
const COLUMNS = {
  stock_name: 'stock name', symbol: 'symbol', isin: 'isin', type: 'type', quantity: 'quantity', value: 'value',
  exchange: 'exchange', executed: 'execution date and time', status: 'order status',
} as const
const REQUIRED = ['symbol', 'type', 'quantity', 'value', 'exchange', 'executed'] as const
const HEADER = 'Stock name, Symbol, ISIN, Type, Quantity, Value, Exchange, Exchange Order Id, Execution date and time, Order status'

export interface TradeCsv { rows: TradeImportRow[]; errors: InvalidLine[]; skipped: InvalidLine[]; total: number }

const normaliseHeader = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, ' ')

export function parseTradeCsv(text: string, today: string): TradeCsv {
  const all = parseCsv(text)
  const headerIndex = all.findIndex(record => record.some(cell => cell.trim() !== ''))
  if (headerIndex < 0) return { rows: [], errors: [{ line: 1, reason: 'The file is empty' }], skipped: [], total: 0 }
  const header = all[headerIndex].map(normaliseHeader)
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name)])) as Record<keyof typeof COLUMNS, number>
  const missing = REQUIRED.filter(key => col[key] < 0).map(key => COLUMNS[key])
  if (missing.length) {
    return { rows: [], errors: [{ line: headerIndex + 1, reason: `Missing column(s): ${missing.join(', ')}. Expected header: ${HEADER}` }], skipped: [], total: 0 }
  }

  const cell = (cells: string[], key: keyof typeof COLUMNS) => (col[key] >= 0 ? (cells[col[key]] ?? '').trim() : '')
  const rows: TradeImportRow[] = []
  const errors: InvalidLine[] = []
  const skipped: InvalidLine[] = []
  let total = 0
  for (let i = headerIndex + 1; i < all.length; i++) {
    const cells = all[i]
    if (cells.every(value => value.trim() === '')) continue
    total++
    const line = i + 1
    const status = cell(cells, 'status')
    if (status && status.toLowerCase() !== 'executed') {
      skipped.push({ line, reason: `Order status is ${status}` })
      continue
    }
    const rawDate = cell(cells, 'executed')
    const date = normaliseDate(rawDate)
    const symbol = cell(cells, 'symbol').toUpperCase()
    const type = cell(cells, 'type').toLowerCase()
    const exchange = cell(cells, 'exchange').toUpperCase()
    const quantity = parseMoneyCell(cell(cells, 'quantity'))
    const amount = parseMoneyCell(cell(cells, 'value'))
    const reasons: string[] = []
    if (!date) reasons.push(`Date "${rawDate}" is not a DD/MM/YYYY date (a time like 03:30 PM is optional)`)
    else if (date > today) reasons.push('Date is in the future')
    if (!symbol) reasons.push('Symbol is empty')
    if (type !== 'buy' && type !== 'sell') reasons.push(`Type "${cell(cells, 'type')}" is not BUY or SELL`)
    if (exchange !== 'NSE' && exchange !== 'BSE') reasons.push(`Exchange "${cell(cells, 'exchange')}" is not NSE or BSE`)
    if (!(quantity > 0)) reasons.push(`Quantity "${cell(cells, 'quantity')}" is not a positive number`)
    if (!(amount > 0)) reasons.push(`Value "${cell(cells, 'value')}" is not a positive amount`)
    if (reasons.length) {
      errors.push({ line, reason: reasons.join('; ') })
      continue
    }
    const isin = cell(cells, 'isin')
    rows.push({
      line, date, symbol, stock_name: cell(cells, 'stock_name') || symbol,
      exchange: exchange as TradeImportRow['exchange'], type: type as TradeImportRow['type'], quantity, amount,
      ...(isin ? { isin } : {}),
    })
  }
  if (total > MAX_ROWS) errors.push({ line: 0, reason: `More than ${MAX_ROWS} rows — split the file` })
  return { rows, errors, skipped, total }
}
```

* [ ] **Step 6: Parser tests (Create `frontend/src/features/transactions/tradeCsv.test.ts`)**

WHY: lines from the owner's own file, both date shapes, comma and tab.

```ts
import { describe, expect, it } from 'vitest'
import { parseTradeCsv } from './tradeCsv'

// Lines from the owner's Groww export (tab-separated, as pasted), including
// both date shapes the column mixes.
const HEADER = 'Stock name\tSymbol\tISIN\tType\tQuantity\tValue\tExchange\tExchange Order Id\tExecution date and time\tOrder status'
const file = (...lines: string[]) => [HEADER, ...lines].join('\n') + '\n'

describe('parseTradeCsv', () => {
  it('reads both date shapes day-first, with the time when given', () => {
    const parsed = parseTradeCsv(file(
      'KALYAN JEWELLERS IND LTD\tKALYANKJIL\tINE303R01014\tBUY\t3\t2010\tNSE\t1200000000136474\t1/11/2024\tExecuted',
      'VISHAL MEGA MART LIMITED\tVMM\tINE01EA01019\tSELL\t190\t20896.2\tNSE\t1.3E+15\t19-12-2024 10:11 AM\tExecuted',
    ), '2026-11-03')
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toEqual([
      { line: 2, date: '2024-11-01', symbol: 'KALYANKJIL', stock_name: 'KALYAN JEWELLERS IND LTD', exchange: 'NSE', type: 'buy', quantity: 3, amount: 2010, isin: 'INE303R01014' },
      { line: 3, date: '2024-12-19', symbol: 'VMM', stock_name: 'VISHAL MEGA MART LIMITED', exchange: 'NSE', type: 'sell', quantity: 190, amount: 20896.2, isin: 'INE01EA01019' },
    ])
  })

  it('reads a comma-separated export the same way', () => {
    const parsed = parseTradeCsv('Stock name,Symbol,Type,Quantity,Value,Exchange,Execution date and time\nITC LTD,ITC,BUY,1,427,NSE,10/2/2025\n', '2026-11-03')
    expect(parsed.rows[0]).toMatchObject({ date: '2025-02-10', symbol: 'ITC', quantity: 1, amount: 427 })
  })

  it('skips orders that did not execute, and rejects bad lines with the reason', () => {
    const parsed = parseTradeCsv(file(
      'ITC LTD\tITC\tINE154A01025\tBUY\t1\t400\tNSE\t1\t7/4/2025\tCancelled',
      'ITC LTD\tITC\tINE154A01025\tHOLD\t1\t400\tNYSE\t1\t31/02/2025\tExecuted',
      'ITC LTD\tITC\tINE154A01025\tBUY\t1\t400\tNSE\t1\t4/12/2026\tExecuted',
    ), '2026-11-03')
    expect(parsed.skipped).toEqual([{ line: 2, reason: 'Order status is Cancelled' }])
    expect(parsed.errors.map(error => error.line)).toEqual([3, 4])
    expect(parsed.errors[0].reason).toContain('Date "31/02/2025" is not a DD/MM/YYYY date')
    expect(parsed.errors[0].reason).toContain('Type "HOLD" is not BUY or SELL')
    expect(parsed.errors[0].reason).toContain('Exchange "NYSE" is not NSE or BSE')
    expect(parsed.errors[1].reason).toBe('Date is in the future')
    expect(parsed.total).toBe(3)
  })

  it('names the missing columns', () => {
    const parsed = parseTradeCsv('Symbol,Type\nITC,BUY\n', '2026-11-03')
    expect(parsed.errors[0].reason).toMatch(/^Missing column\(s\): quantity, value, exchange, execution date and time/)
  })
})
```

* [ ] **Step 7: The import dialog (Create `frontend/src/features/transactions/TradeImportModal.tsx`)**

WHY: the dividend flow on the shared pieces, plus "create a new holding" and the four counts; confirm stays disabled while anything is invalid or nothing would be written.

```tsx
// The trades CSV import (PD-051): choose a broker export → confirm unknown
// symbols (map, create or leave) → preview → one atomic commit. Built from
// the dividend import's shared pieces (features/imports).
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
import { ImportCounts, InvalidLines, type InvalidLine } from '../imports/ImportTables'
import NameConfirmDialog, { type Answers } from '../imports/NameConfirmDialog'
import { parseTradeCsv } from './tradeCsv'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const EMPTY: TradeImportPreview = { counts: { ready: 0, replace: 0, covered: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] }
const open = (preview: TradeImportPreview, answers: Answers, created: string[]) =>
  preview.names.filter(name => (name.status === 'needs_confirmation' || name.status === 'ambiguous')
    && !(name.sheet_name in answers) && !created.includes(name.sheet_name))

export default function TradeImportModal({ holdings, userId, onClose, onImported }: {
  holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<TradeImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<InvalidLine[]>([])
  const [skipped, setSkipped] = useState<InvalidLine[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [created, setCreated] = useState<string[]>([])
  const [preview, setPreview] = useState<TradeImportPreview | null>(null)
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Trades import into INR holdings only (NSE / BSE).
  const inrHoldings = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === 'INR'), [holdings])

  const runPreview = async (sheetRows: TradeImportRow[], mappings: Answers, create: string[]) => {
    setBusy(true)
    setErr('')
    try {
      const evaluated = await api.previewTradeImport({ rows: sheetRows, mappings, create }, userId)
      setPreview(evaluated)
      setStep(open(evaluated, mappings, create).length > 0 ? 'names' : 'preview')
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) { setErr('The file is larger than 1 MB — split it.'); return }
    setFileName(file.name)
    const parsed = parseTradeCsv(await file.text(), todayIST())
    setRows(parsed.rows)
    setLocalErrors(parsed.errors)
    setSkipped(parsed.skipped)
    setAnswers({})
    setCreated([])
    if (parsed.rows.length === 0) {
      setPreview(EMPTY)
      setStep('preview')
      return
    }
    await runPreview(parsed.rows, {}, [])
  }

  const counts = preview && { ...preview.counts, invalid: preview.counts.invalid + localErrors.length }
  const invalidLines = [
    ...localErrors,
    ...(preview?.rows.filter(row => row.status === 'invalid').map(row => ({ line: row.line, reason: row.reason ?? '' })) ?? []),
  ].sort((first, second) => first.line - second.line)

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      setResult(await api.importTrades({ rows, mappings: answers, create: created }, userId))
      setStep('result')
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.body) {
        setPreview(error.body as TradeImportPreview)
        setErr('The data changed since the preview — review it again.')
      } else {
        setErr(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setBusy(false)
    }
  }

  if (step === 'names' && preview) {
    return (
      <NameConfirmDialog names={open(preview, answers, created)} holdings={inrHoldings} heading="Confirm symbols"
        intro="These symbols don't match a holding. Choose the holding each one means, or create a new one. Your answers are remembered for next time."
        createLabel={symbol => `Create a new holding ${symbol}`}
        onBack={() => setStep('pick')}
        onConfirm={(confirmed, newHoldings) => {
          const nextAnswers = { ...answers, ...confirmed }
          const nextCreated = [...created, ...newHoldings]
          setAnswers(nextAnswers)
          setCreated(nextCreated)
          void runPreview(rows, nextAnswers, nextCreated)
        }} />
    )
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import trades">
      <div style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{step === 'result' ? 'Import complete' : step === 'preview' ? 'Preview import' : 'Import trades'}</h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Buys and sells into <strong>₹ INR</strong> holdings · dates read as <strong>DD/MM/YYYY</strong> (1/11/2024 = 1 Nov 2024), a time like 03:30 PM is optional{fileName && ` · ${fileName}`}
        </p>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}

        {step === 'pick' && (
          <>
            <label htmlFor="trades-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="trades-csv" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" style={{ display: 'none' }} onChange={e => void pick(e.target.files?.[0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              A broker order history with the columns <code>Stock name, Symbol, ISIN, Type, Quantity, Value, Exchange, Execution date and time, Order status</code> (comma- or tab-separated). Nothing is saved until you confirm.
            </p>
            {busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {step === 'preview' && counts && preview && (
          <>
            <ImportCounts total={counts.total + localErrors.length}
              counts={[['Ready to import', counts.ready], ['Replaces an identical trade', counts.replace], ['Covered by the opening balance', counts.covered], ['Invalid', counts.invalid]]} />
            {counts.replace > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>A row with the same holding, day, type, quantity and value as a saved trade replaces it — nothing is duplicated.</p>}
            {counts.covered > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Rows on or before a holding&apos;s opening date are already in its opening balance and are not imported.</p>}
            {skipped.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{skipped.length} rows skipped: the order did not execute.</p>}
            <InvalidLines lines={invalidLines} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {(Object.keys(answers).length > 0 || created.length > 0) && (
                <button className="btn" onClick={() => { setAnswers({}); setCreated([]); void runPreview(rows, {}, []) }}>Change symbols</button>
              )}
              <button className="btn" onClick={() => setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={counts.invalid > 0 || counts.ready + counts.replace === 0 || busy} onClick={confirm}>Confirm import</button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <p role="status" style={{ color: 'var(--green)', margin: 0 }}>
              <strong>{result.imported} imported</strong> · {result.replaced} replaced · {result.covered} covered by an opening balance
              {result.created_holdings > 0 && ` · ${result.created_holdings} new holdings`}
            </p>
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

* [ ] **Step 8: Dialog tests (Create `frontend/src/features/transactions/TradeImport.test.tsx`)**

WHY: the owner's flow end to end against a mocked API: dates sent day-first as the day alone, create a symbol, preview with replacements, import; invalid lines block; a 422 re-previews.

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../../lib/api/client'
import type { Holding } from '../../types'

const mockApi = vi.hoisted(() => ({ previewTradeImport: vi.fn(), importTrades: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import TradeImportModal from './TradeImportModal'

const holdings: Holding[] = [{ id: 'h1', script: 'ITC', symbol: 'ITC.NS', currency: 'INR' }]
const csv = [
  'Stock name\tSymbol\tISIN\tType\tQuantity\tValue\tExchange\tExchange Order Id\tExecution date and time\tOrder status',
  'ITC LTD\tITC\tINE154A01025\tBUY\t1\t427\tNSE\t1.1E+15\t10/2/2025\tExecuted',
  'LG ELECTRONICS INDIA LTD\tLGEINDIA\tINE324D01010\tBUY\t13\t14820\tNSE\t83385640\t13-10-2025 03:30 PM\tExecuted',
  'LG ELECTRONICS INDIA LTD\tLGEINDIA\tINE324D01010\tSELL\t13\t22258.6\tNSE\t1400000000800144\t14-10-2025 10:00 AM\tExecuted',
].join('\n')
const pick = (text: string) =>
  fireEvent.change(screen.getByLabelText('Choose a .csv file'), { target: { files: [new File([text], 'orders.csv', { type: 'text/csv' })] } })

const names = [
  { sheet_name: 'ITC', rows: 1, status: 'auto', holding_id: 'h1', matched_by: 'symbol', suggestions: [] },
  { sheet_name: 'LGEINDIA', rows: 2, status: 'needs_confirmation', suggestions: [] },
]
const needsLg = { counts: { ready: 0, replace: 1, covered: 0, invalid: 2, total: 3 }, names, rows: [], warnings: [] }
const ready = { counts: { ready: 2, replace: 1, covered: 0, invalid: 0, total: 3 }, names, rows: [], warnings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.previewTradeImport.mockResolvedValueOnce(needsLg).mockResolvedValueOnce(ready)
  mockApi.importTrades.mockResolvedValue({ imported: 2, replaced: 1, covered: 0, created_holdings: 1, batch_id: 'b' })
})

const renderModal = (onImported = vi.fn()) => render(<TradeImportModal holdings={holdings} onClose={vi.fn()} onImported={onImported} />)

describe('TradeImportModal', () => {
  it('creates an unknown symbol, previews the replacements and imports in one go', async () => {
    const onImported = vi.fn()
    renderModal(onImported)
    expect(screen.getByText(/dates read as/)).toHaveTextContent('DD/MM/YYYY')
    pick(csv)

    // Both date shapes reach the server as the day alone, read day-first.
    await waitFor(() => expect(mockApi.previewTradeImport).toHaveBeenCalledTimes(1))
    const sent = mockApi.previewTradeImport.mock.calls[0][0]
    expect(sent.rows.map((row: Record<string, unknown>) => [row.date, 'minutes' in row]))
      .toEqual([['2025-02-10', false], ['2025-10-13', false], ['2025-10-14', false]])

    expect(await screen.findByRole('dialog', { name: 'Confirm symbols' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Create a new holding LGEINDIA'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to preview' }))
    await waitFor(() => expect(mockApi.previewTradeImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ mappings: {}, create: ['LGEINDIA'] }), undefined))

    expect(await screen.findByText('Replaces an identical trade')).toBeInTheDocument()
    expect(screen.getByText(/nothing is duplicated/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('status')).toHaveTextContent('2 imported · 1 replaced · 0 covered by an opening balance · 1 new holdings')
    expect(mockApi.importTrades).toHaveBeenCalledWith(expect.objectContaining({ create: ['LGEINDIA'] }), undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalled()
  })

  it('blocks the import while lines are invalid, naming each line', async () => {
    renderModal()
    pick(csv.replace('10/2/2025', '31/02/2025'))
    fireEvent.click(await screen.findByLabelText('Create a new holding LGEINDIA'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to preview' }))
    expect(await screen.findByText(/rows need fixing/)).toBeInTheDocument()
    expect(screen.getByText(/Date "31\/02\/2025" is not a DD\/MM\/YYYY date/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })

  it('shows the fresh preview when the data changed since the preview (422)', async () => {
    mockApi.importTrades.mockRejectedValue(new ApiError(422, 'invalid', { ...ready, counts: { ...ready.counts, ready: 1, invalid: 1 } }))
    renderModal()
    pick(csv)
    fireEvent.click(await screen.findByLabelText('Create a new holding LGEINDIA'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to preview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByText('The data changed since the preview — review it again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })
})
```

* [ ] **Step 9: Import CSV button (own and act-as) (Edit `frontend/src/features/transactions/TransactionsPage.tsx`)**

WHY: the toolbar is where the page's actions live; `afterLedgerChange` is shared by the ledger editor and the import so both refresh the table and the investment delta chart.

Current:

```tsx
import TransactionsAllTable from './TransactionsAllTable'
import { InvestmentDeltaPanel } from './InvestmentDeltaPanel'
import TransactionsModal, { TYPE_LABEL } from '../holdings/TransactionsModal'
import { useAuthOptional } from '../auth/AuthContext'
```

Replacement:

```tsx
import TransactionsAllTable from './TransactionsAllTable'
import { InvestmentDeltaPanel } from './InvestmentDeltaPanel'
import TradeImportModal from './TradeImportModal'
import TransactionsModal, { TYPE_LABEL } from '../holdings/TransactionsModal'
import { useAuthOptional } from '../auth/AuthContext'
```

Current:

```tsx
  // reloads the History rows the backend has just healed.
  const [ledgerVersion, setLedgerVersion] = useState(0)

  const patch = (next: Partial<Filters>) => setFilters(current => ({ ...current, ...next }))
```

Replacement:

```tsx
  // reloads the History rows the backend has just healed.
  const [ledgerVersion, setLedgerVersion] = useState(0)
  const [importing, setImporting] = useState(false)

  // After any ledger write (the editor or a CSV import): reload the table
  // and tell the investment delta panel.
  const afterLedgerChange = () => {
    void refresh()
    setLedgerVersion(version => version + 1)
  }

  const patch = (next: Partial<Filters>) => setFilters(current => ({ ...current, ...next }))
```

Current:

```tsx

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {filtered && (
              <button className="btn btn-sm" onClick={() => setFilters(emptyFilters())}>
```

Replacement:

```tsx

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-sm" onClick={() => setImporting(true)}>Import CSV</button>
            {filtered && (
              <button className="btn btn-sm" onClick={() => setFilters(emptyFilters())}>
```

Current:

```tsx
          userId={actAsUserId}
          onClose={() => setEditing(null)}
          onChanged={() => {
            void refresh()
            setLedgerVersion(version => version + 1)
          }}
        />
      )}
    </div>
```

Replacement:

```tsx
          userId={actAsUserId}
          onClose={() => setEditing(null)}
          onChanged={afterLedgerChange}
        />
      )}

      {/* Act-as imports into the target's ledger, as the dividend import does. */}
      {importing && (
        <TradeImportModal holdings={holdings} userId={actAsUserId}
          onClose={() => setImporting(false)} onImported={afterLedgerChange} />
      )}
    </div>
```

* [ ] **Step 10: Page test (Edit `frontend/src/features/transactions/TransactionsPage.test.tsx`)**

WHY: the button opens the import on the own page and in act-as.

Current:

```tsx
    await screen.findByText('SIP tranche')
    expect(screen.getByRole('button', { name: /Investment delta/ })).toBeInTheDocument()
  })
```

Replacement:

```tsx
    await screen.findByText('SIP tranche')
    expect(screen.getByRole('button', { name: /Investment delta/ })).toBeInTheDocument()
  })

  it('opens the trades CSV import from the toolbar, own page and act-as alike', async () => {
    const { unmount } = renderPage()
    await screen.findByText('SIP tranche')
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import trades' })).toBeInTheDocument()
    unmount()

    renderPage({ actAsUserId: 'u2', actAsLabel: "bob's transactions" })
    await screen.findByText('SIP tranche')
    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import trades' })).toBeInTheDocument()
  })
```

* [ ] **Step 11: User doc (Edit `docs/portfolio-model.md`)**

WHY: what the import reads, matches, replaces and skips, in the user's words.

Current:

```markdown
transaction in a holding's ledger, so it matches History.

## Symbol format (Yahoo Finance)
```

Replacement:

```markdown
transaction in a holding's ledger, so it matches History.

### Importing trades from a CSV

**Import CSV** on the All transactions page reads a broker's order history
(Groww's columns: Stock name, Symbol, ISIN, Type, Quantity, Value,
Exchange, Execution date and time, Order status; comma- or tab-separated)
and adds each executed buy and sell to its holding's ledger
([PRD-008](prds/PRD-008-trade-csv-import.md)):

* **Dates are day-first**: `1/11/2024` is 1 November 2024, and
  `17-12-2024 03:30 PM` is 17 December 2024; the time only orders trades on
  the same day.
* **Symbols** match a holding without its exchange suffix (`GOLDBEES`
  finds `GOLDBEES.NS`, also on a BSE row). An unknown symbol asks you to
  pick the holding, create a new INR holding, or leave it out.
* **Nothing is duplicated**: a row with the same holding, day, type,
  quantity and value as a saved trade replaces it, so uploading the same
  file twice changes nothing.
* **Opening balances win**: rows on or before a holding's opening date are
  already in that balance and are skipped.
* **All or nothing**: the preview shows every count first; the import then
  saves the trades, new holdings, positions and History together, or
  nothing at all. An admin can import into a user's ledger from act-as.

## Symbol format (Yahoo Finance)
```

* [ ] **Step 12: Verify**

```bash
cd frontend && npm run typecheck && npx vitest run && npm run lint:changed && npm run build
```

Expected: every suite passes (+8 tests); no lint errors; build succeeds.

* [ ] **Step 13: Commit, push, open PR5 into the feature branch**

```bash
git add frontend/src/lib/api/schema.gen.ts frontend/src/types.ts frontend/src/lib/api/client.ts frontend/src/features/transactions/ docs/portfolio-model.md
git commit -m "✨ Import trades from a CSV on Transactions"
git push -u origin feat/PD-051-trade-import-ui
gh pr create --base feat/PD-051-trade-csv-import --title "✨ Import trades from a broker CSV on the Transactions page" --body-file pr5.md
```

Expected: PR URL; CI green.

---

## Task 5: End-to-end verification (local stack), then PR6

**Files:** none

* [ ] **Step 1: Run the stack** (`run-app` skill): `make dev-db` (a replica
  set: the import needs MongoDB transactions), `make backend`,
  `make frontend`; log in as yourself.

* [ ] **Step 2: Scenarios** (the owner's Groww file, saved as `.csv` and as
  tab-separated `.txt`)

1. **Dates** — preview: `1/11/2024` rows land on 01-11-2024 and
   `17-12-2024 03:30 PM` on 17-12-2024 in the ledger after import.
2. **Symbols** — `GOLDBEES` (incl. the BSE row of 06-05-2025) matches
   GOLDBEES.NS; `LGEINDIA` and `NSE$` ask; create LGEINDIA; leave `NSE$`
   unresolved → its 2 rows invalid, Confirm disabled; map it to the NSE
   holding (or create it) → Confirm enabled.
3. **Opening cover** — a holding with opening date 15-06-2026: its earlier
   rows show as covered and are not in the ledger afterwards.
4. **Never duplicate** — import, then upload the same file again: 0
   imported, every row "replaces"; positions and History unchanged.
5. **Oversell** — delete a buy that a later sell needs, re-import a file
   holding only that sell: the sell is invalid, nothing saved.
6. **Atomicity** — stop MongoDB mid-confirm (or point the backend at a
   standalone mongod): the import fails and no trade, holding or History
   change is left.
7. **Act-as + refresh** — as an admin, import into a user's Transactions;
   the table and an open investment delta chart reload; History for the
   affected months shows the healed invested values.

* [ ] **Step 3: Record and ship** — paste the results as a comment on PR5,
  then open PR6:

```bash
gh pr create --base main --head feat/PD-051-trade-csv-import --title "✨ Import trades from a broker CSV" --body-file pr6.md
```

PR6's body includes the line `FE/BE-EXCEPTION: PD-051 feature branch
(PR2–PR5 reviewed separately)`.

Expected: all seven pass before PR6 merges.

## Done

* Import CSV on All transactions (own and act-as) reads a broker order
  history into buys and sells.
* Dates are day-first; a time in the cell is ignored; tab or comma files.
* Symbols match without the exchange suffix; unknown ones are mapped,
  created or left out, and remembered.
* Rows on or before an opening date are covered; identical trades are
  replaced, never duplicated.
* One transaction writes holdings, trades, positions and History.
* The dividend import runs on the same shared pieces, unchanged.

Next: a EUR column map for European brokers, and matching on ISIN once
holdings store it.
