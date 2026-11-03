# PD-052: Rollout plan — investment delta from the transactions ledger

* **Status**: Draft v1, owner decisions of 2026-11-03 applied
* **Review fixes** (after #262/#263): #265 (`userId`, not `uid`, in
  `InvestedOn`), #266 (keep a column sold out during the year), #267
  (the ledger panel refreshes at IST midnight)
* **Owner**: project owner
* **Goal**: The All transactions page's investment delta panel computes
  each month's cost basis and delta from the ledger by default, and the
  super admin can switch an account back to the History-based version.
* **Architecture**: one read-only endpoint replays every holding's ledger
  as of each month end with the History heal's own replay
  (`asOfLedger` + `RecomputePosition`), Gold from the gold purchases alone;
  a per-user flag on a shared super-admin switch path; the panel keeps its
  chart and changes only its source.
* **Tech stack**: Go (echo strict server, oapi-codegen, mtest), React 18 +
  TypeScript, vitest + Testing Library. No new dependencies.
* **Spec**: [PRD-009](../prds/PRD-009-investment-delta-from-transactions.md) ·
  [DD-009](../designs/DD-009-investment-delta-from-transactions.md) ·
  [visual spec](../visuals/PD-052-investment-delta-from-transactions.html)
  ([published](https://claude.ai/artifact/PXcEJhW656MgPrhmNDKhUs))

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | `asOfLedger`, `RecomputePosition`, `CurrencyOf`, the gold store's `ListTransactions`, `round`, `istToday` → `istDayOf`, the chart and `MonthlyInvestment`; gold + premium handlers → `setUserFlag` |
| Feature branch, one PR per task | owner (PD-048 / PD-050 / PD-051) | `feat/PD-052-delta-from-transactions` from `main`; task PRs target it and may build on each other; the feature merges to `main` last |
| Nothing may break prod | owner (2026-11-03) | `main` only receives the feature PR, after every task PR merged and Task 3 passed |
| Frontend and backend never in one PR | CLAUDE.md | PR2 backend, PR3 frontend; the feature → `main` PR carries `FE/BE-EXCEPTION:` |
| Endpoint PRs carry curl | CLAUDE.md | PR2 |
| Behaviour tests only; mtest for Go | CLAUDE.md | DD-009 §6 |
| Tracing span + logger per service method | CLAUDE.md | `InvestmentDelta` |
| Descriptive names, ESLint on changed files | CLAUDE.md | `AdminUserList.tsx`'s `r` / `q` / `u` renamed in PR3 |
| Gitmoji, subject ≤ 50 chars, no attribution | CLAUDE.md | every commit and PR below |
| Edit tool for source | CLAUDE.md | every Modify step is an Edit (current → replacement) |
| Go blocks: tabs shown as 4 spaces | markdownlint MD010 | type them with tabs, or run `gofmt -w`; Verify runs `gofmt -l` |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `docs/prds/PRD-009-investment-delta-from-transactions.md` | what and why |
| Create | `docs/designs/DD-009-investment-delta-from-transactions.md` | how |
| Create | `docs/plans/PD-052-investment-delta-from-transactions.md` | this plan |
| Create | `docs/visuals/PD-052-investment-delta-from-transactions.html` | interactive mockups |
| Modify | `docs/visuals/README.md` | index row |
| Modify | `backend/api/specs/*.yaml`, `backend/api/*.gen.go` | endpoint, switch route, schemas, generated code |
| Modify | `backend/internal/domain/user.go`, `backend/internal/services/mapper.go` | `DeltaFromHistory` on the user and `/auth/me` |
| Modify | `backend/internal/services/clock.go`, `backend/internal/services/transactions.go` | `istDayOf`, `currentTime` |
| Modify | `backend/internal/services/gold_history.go` | `InvestedOn`: gold invested from the purchases alone (no price) |
| Create | `backend/internal/services/investment_delta.go` (+ test) | `monthEnds`, `investedOn`, `deltaColumns`, `InvestmentDelta` |
| Create | `backend/internal/controllers/investment_delta.go` | `GetInvestmentDelta` |
| Modify | `backend/internal/controllers/admin.go` (+ test), `backend/internal/httpserver/auth.go` | `setUserFlag`, the switch handler, its tier |
| Modify | `frontend/src/lib/api/schema.gen.ts`, `frontend/src/lib/api/client.ts` | API types and methods |
| Modify | `frontend/src/features/transactions/InvestmentDeltaPanel.tsx` (+ test), `frontend/src/features/transactions/TransactionsPage.test.tsx` | ledger source, History behind the switch |
| Modify | `frontend/src/features/admin/AdminUserList.tsx` (+ test), `frontend/src/features/auth/guardRules.test.ts` | the admin button; the user fixture |
| Modify | `docs/portfolio-model.md` | user doc |

## PR sequence (each slice passes the three gates)

| # | Branch → base | Task | Value (gate 2) | Test that fails without it (gate 3) | No regression (gate 1) |
|---|---|---|---|---|---|
| PR1 | `docs/PD-052-delta-from-transactions` → `main` | 0 | agreed design on record | — (docs) | docs only |
| — | `feat/PD-052-delta-from-transactions` from `main` | — | integration branch | — | — |
| PR2 | `feat/PD-052-delta-api` → feature | 1 | the ledger's monthly cost basis over the API (curl); the switch settable | `TestTransactionsService_InvestmentDelta`, `TestAdminSetUserDeltaFromHistory` + 3 pure tests | new routes; gold and premium tests unchanged |
| PR3 | `feat/PD-052-delta-ui` → feature | 2 | the panel charts the ledger; the super admin can switch an account back | the panel's ledger block, the admin button test | the PD-050 tests pass with the switch on |
| PR4 | `feat/PD-052-delta-from-transactions` → `main` | — | ships it | all of the above | `FE/BE-EXCEPTION: PD-052 feature branch` |
| — | — | 3 | end to end on the local stack | scenarios 1–6 | — |

PR3 may be opened while PR2 is in review (it builds on PR2's branch); it
merges after PR2. Before PR4 merges, `git diff origin/main origin/feat/PD-052-delta-from-transactions`
must show exactly PR2 and PR3, and no task PR may be in a GitHub stack.

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

* Create: `docs/prds/PRD-009-investment-delta-from-transactions.md`, `docs/designs/DD-009-investment-delta-from-transactions.md`, `docs/plans/PD-052-investment-delta-from-transactions.md`, `docs/visuals/PD-052-investment-delta-from-transactions.html`
* Modify: `docs/visuals/README.md`

* [ ] **Step 1: Lint the markdown**

```bash
npx markdownlint-cli@0.45.0 --config .markdownlintrc docs/prds/PRD-009-investment-delta-from-transactions.md docs/designs/DD-009-investment-delta-from-transactions.md docs/plans/PD-052-investment-delta-from-transactions.md docs/visuals/README.md
```

Expected: no output.

* [ ] **Step 2: Commit, push, open PR1**

```bash
git add docs/prds/PRD-009-investment-delta-from-transactions.md docs/designs/DD-009-investment-delta-from-transactions.md docs/plans/PD-052-investment-delta-from-transactions.md docs/visuals/PD-052-investment-delta-from-transactions.html docs/visuals/README.md
git commit -m "📝 Plan the investment delta from the ledger"
git push -u origin docs/PD-052-delta-from-transactions
gh pr create --title "📝 Add the PRD, design doc, plan and visual spec for the investment delta from transactions" --body-file pr1.md
```

Expected: PR URL; CI markdownlint green.

* [ ] **Step 3: After PR1 merges, create the feature branch**

```bash
git fetch origin && git checkout -b feat/PD-052-delta-from-transactions origin/main && git push -u origin feat/PD-052-delta-from-transactions
```

Expected: the branch exists on GitHub; Tasks 1–2 target it.

---

## Task 1: Ledger investment delta endpoint and the per-user switch (backend, PR2)

**Files:**

* Create: `backend/internal/services/investment_delta.go`, `backend/internal/services/investment_delta_test.go`, `backend/internal/controllers/investment_delta.go`
* Modify: `backend/api/specs/portfolio-api.yaml`, `backend/api/specs/transactions/transactions.yaml`, `backend/api/specs/admin/admin.yaml`, `backend/api/specs/openapi.yaml`, `backend/api/models.gen.go`, `backend/api/server.gen.go`, `backend/internal/domain/user.go`, `backend/internal/services/mapper.go`, `backend/internal/services/clock.go`, `backend/internal/services/transactions.go`, `backend/internal/services/gold_history.go`, `backend/internal/controllers/admin.go`, `backend/internal/controllers/admin_test.go`, `backend/internal/httpserver/auth.go`

* [ ] **Step 1: Branch from the feature branch**

```bash
git fetch origin && git checkout -b feat/PD-052-delta-api origin/feat/PD-052-delta-from-transactions
```

* [ ] **Step 2: Schemas (Edit `backend/api/specs/portfolio-api.yaml`)**

WHY: the month shape mirrors the chart's `MonthlyInvestment` (month0, invested, delta; required and null after today, so an empty month says null rather than dropping the key), so the panel maps it straight through. `delta_from_history` joins the user like `gold_enabled` and `premium`; `UserFlagToggleRequest` is the body of the new switch (DD-009 §2).

Current:

```yaml
    User:
      type: object
      required: [id, username, name, role, region, disabled, locked, gold_enabled, premium, must_change_password]
      properties:
        id:
```

Replacement:

```yaml
    User:
      type: object
      required: [id, username, name, role, region, disabled, locked, gold_enabled, premium, delta_from_history, must_change_password]
      properties:
        id:
```

Current:

```yaml
          type: boolean
          description: Premium features enabled (super-admin toggled, PD-046 — cyberpunk theme)
        must_change_password:
          type: boolean
```

Replacement:

```yaml
          type: boolean
          description: Premium features enabled (super-admin toggled, PD-046 — cyberpunk theme)
        delta_from_history:
          type: boolean
          description: The Transactions page's investment delta reads History rows instead of the ledger (super-admin toggled, PD-052)
        must_change_password:
          type: boolean
```

Current:

```yaml
          type: boolean
          description: Turn premium features on or off for the account

    BrandingFont:
```

Replacement:

```yaml
          type: boolean
          description: Turn premium features on or off for the account

    UserFlagToggleRequest:
      type: object
      required: [enabled]
      properties:
        enabled:
          type: boolean
          description: Turn the per-user switch on or off for the account

    BrandingFont:
```

Current:

```yaml
        covered: { type: integer }
        created_holdings: { type: integer }
    DividendHistoryOverlay:
      type: object
```

Replacement:

```yaml
        covered: { type: integer }
        created_holdings: { type: integer }
    InvestmentDeltaMonth:
      type: object
      required: [month0, invested, delta]
      properties:
        month0: { type: integer, description: 0 = January }
        invested: { type: number, format: double, nullable: true, description: "Cost basis at the month end (today for the current month); null after today" }
        delta: { type: number, format: double, nullable: true, description: "invested minus the previous month end's; null after today" }
    InvestmentDeltaColumn:
      type: object
      required: [column, months]
      properties:
        column: { type: string, enum: [INR, EUR, GOLD] }
        months: { type: array, description: "12 entries, January first", items: { $ref: "#/components/schemas/InvestmentDeltaMonth" } }
    InvestmentDelta:
      type: object
      required: [year, columns]
      properties:
        year: { type: integer }
        columns: { type: array, description: "Columns with money invested at some month end of the year", items: { $ref: "#/components/schemas/InvestmentDeltaColumn" } }
    DividendHistoryOverlay:
      type: object
```

* [ ] **Step 3: The endpoint (Edit `backend/api/specs/transactions/transactions.yaml`)**

WHY: read-only, own portfolio (the panel is not shown in act-as); 400 for a year outside 2020 … now.

Current:

```yaml
        description: Invalid rows — nothing written
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportPreview"
```

Replacement:

```yaml
        description: Invalid rows — nothing written
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/TradeImportPreview"

transactions_investment_delta:
  get:
    tags: [Transactions]
    summary: Monthly investment delta for one year, from the ledger
    description: |
      PD-052. Per currency (INR, EUR) the cost basis of every holding at
      each month end of `year` (today for the current month), replayed from
      the ledger as of that day, and its change from the previous month end;
      GOLD from the physical-gold ledger for gold-enabled users. Months after
      today are null. Read-only.
    operationId: getInvestmentDelta
    parameters:
      - name: year
        in: query
        required: true
        schema:
          type: integer
          minimum: 2020
    responses:
      "200":
        description: The year's monthly cost basis and delta per column
        content:
          application/json:
            schema:
              $ref: "../portfolio-api.yaml#/components/schemas/InvestmentDelta"
      "400":
        $ref: "../portfolio-api.yaml#/components/responses/BadRequest"
```

* [ ] **Step 4: The switch route (Edit `backend/api/specs/admin/admin.yaml`)**

WHY: super admin only, like gold and premium.

Current:

```yaml
      "204":
        description: Premium access updated
      "403":
        $ref: "../portfolio-api.yaml#/components/responses/Forbidden"
```

Replacement:

```yaml
      "204":
        description: Premium access updated
      "403":
        $ref: "../portfolio-api.yaml#/components/responses/Forbidden"
      "404":
        $ref: "../portfolio-api.yaml#/components/responses/NotFound"

users_id_delta_from_history:
  put:
    tags: [Admin]
    summary: Switch an account's investment delta back to History (super admin only)
    description: |
      PD-052. On: the Transactions page's investment delta reads History
      rows (the PD-050 version). Off (default): it is computed from the
      ledger. Super admin only; the super admin may switch their own account.
    operationId: adminSetUserDeltaFromHistory
    parameters:
      - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "../portfolio-api.yaml#/components/schemas/UserFlagToggleRequest"
    responses:
      "204":
        description: Switch updated
      "403":
        $ref: "../portfolio-api.yaml#/components/responses/Forbidden"
```

* [ ] **Step 5: Route the paths (Edit `backend/api/specs/openapi.yaml`)**

WHY: the root spec lists every path file entry.

Current:

```yaml
  /transactions/import:
    $ref: "./transactions/transactions.yaml#/transactions_import"
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
```

Replacement:

```yaml
  /transactions/import:
    $ref: "./transactions/transactions.yaml#/transactions_import"
  /transactions/investment-delta:
    $ref: "./transactions/transactions.yaml#/transactions_investment_delta"
  /dividends:
    $ref: "./dividends/dividends.yaml#/dividends"
```

Current:

```yaml
  /admin/users/{id}/premium:
    $ref: "./admin/admin.yaml#/users_id_premium"
  /admin/branding:
    $ref: "./admin/admin.yaml#/branding"
```

Replacement:

```yaml
  /admin/users/{id}/premium:
    $ref: "./admin/admin.yaml#/users_id_premium"
  /admin/users/{id}/delta-from-history:
    $ref: "./admin/admin.yaml#/users_id_delta_from_history"
  /admin/branding:
    $ref: "./admin/admin.yaml#/branding"
```

* [ ] **Step 6: Regenerate the Go API**

WHY: models.gen.go and server.gen.go are generated; never edit them by hand.

```bash
cd backend && go generate -tags tools ./...
```

Expected: `api/models.gen.go` gains `InvestmentDelta*` and `User.DeltaFromHistory`; the build fails until Step 15.

* [ ] **Step 7: The user flag (Edit `backend/internal/domain/user.go`)**

WHY: omitted in Mongo = false = the ledger version, so no migration: every existing user gets the new default.

Current:

```go
    GoldEnabled     bool               `bson:"gold_enabled,omitempty" json:"gold_enabled"` // gold-tracking access (PRD-003 §2.4); super-admin toggled, omitted = false
    Premium         bool               `bson:"premium,omitempty" json:"premium"`           // premium features (PD-046, cyberpunk theme); super-admin toggled, omitted = false

    LoginFailures            int  `bson:"login_failures" json:"-"`
```

Replacement:

```go
    GoldEnabled     bool               `bson:"gold_enabled,omitempty" json:"gold_enabled"` // gold-tracking access (PRD-003 §2.4); super-admin toggled, omitted = false
    Premium         bool               `bson:"premium,omitempty" json:"premium"`           // premium features (PD-046, cyberpunk theme); super-admin toggled, omitted = false
    // DeltaFromHistory switches the Transactions page's investment delta back
    // to History rows (PD-052); omitted = false = computed from the ledger.
    DeltaFromHistory bool `bson:"delta_from_history,omitempty" json:"delta_from_history"`

    LoginFailures            int  `bson:"login_failures" json:"-"`
```

* [ ] **Step 8: Expose it on the user (Edit `backend/internal/services/mapper.go`)**

WHY: `/auth/me` carries it, so the panel reads it from the session user.

Current:

```go
        GoldEnabled:        u.GoldEnabled,
        Premium:            u.Premium,
        MustChangePassword: u.MustChangePassword,
    }
```

Replacement:

```go
        GoldEnabled:        u.GoldEnabled,
        Premium:            u.Premium,
        DeltaFromHistory:   u.DeltaFromHistory,
        MustChangePassword: u.MustChangePassword,
    }
```

* [ ] **Step 9: IST day of an instant (Edit `backend/internal/services/clock.go`)**

WHY: `istToday` reads the wall clock; the endpoint needs the IST day of the service clock so tests pin it.

Current:

```go
// so it compares cleanly with stored dates.
func istToday() time.Time {
    now := time.Now().In(istZone)
    return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}
```

Replacement:

```go
// so it compares cleanly with stored dates.
func istToday() time.Time {
    return istDayOf(time.Now())
}

// istDayOf is the IST calendar day of instant as a bare UTC-midnight date.
func istDayOf(instant time.Time) time.Time {
    local := instant.In(istZone)
    return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
}
```

* [ ] **Step 10: One clock helper on the service (Edit `backend/internal/services/transactions.go`)**

WHY: `healSnapshots` already did the "s.now or the wall clock" dance inline; the endpoint needs the same, so it becomes `currentTime`. `healSnapshots`' `uid` becomes `userId` (CLAUDE.md naming).

Current:

```go
// effort: a recompute failure is logged, not surfaced — the ledger write has
// already succeeded and must not be rolled back for a history-heal miss.
func (s *TransactionsService) healSnapshots(ctx context.Context, uid primitive.ObjectID, dates ...time.Time) {
    if s.recomputer == nil {
        return
```

Replacement:

```go
// effort: a recompute failure is logged, not surfaced — the ledger write has
// already succeeded and must not be rolled back for a history-heal miss.
func (s *TransactionsService) healSnapshots(ctx context.Context, userId primitive.ObjectID, dates ...time.Time) {
    if s.recomputer == nil {
        return
```

Current:

```go
        return
    }
    now := time.Now().UTC()
    if s.now != nil {
        now = s.now()
    }
    if !domain.UTCDate(earliest).Before(domain.UTCDate(now)) {
        return // today or future: nothing earlier to heal
    }
    if err := s.recomputer.RecomputeFrom(ctx, uid, earliest); err != nil {
        logger := s.log(ctx)
        logger.Warn("snapshot heal failed", zap.String("user_id", uid.Hex()), zap.Error(err))
    }
}
```

Replacement:

```go
        return
    }
    if !domain.UTCDate(earliest).Before(domain.UTCDate(s.currentTime())) {
        return // today or future: nothing earlier to heal
    }
    if err := s.recomputer.RecomputeFrom(ctx, userId, earliest); err != nil {
        logger := s.log(ctx)
        logger.Warn("snapshot heal failed", zap.String("user_id", userId.Hex()), zap.Error(err))
    }
}

// currentTime is s.now, or the wall clock (UTC) when a test built the
// service without it.
func (s *TransactionsService) currentTime() time.Time {
    if s.now != nil {
        return s.now()
    }
    return time.Now().UTC()
}
```

* [ ] **Step 11: Gold invested from the purchases alone (Edit `backend/internal/services/gold_history.go`)**

WHY: `HistoryOverlay` has no value for a date until a gold price exists, which would move a purchase into the month of the first price and hide Gold for a user with no prices. `InvestedOn` sums the cash paid for the purchases dated on or before each day, from one read of the purchases (DD-009 §3 step 5).

Current:

```go
    }
    return goldOverlay(txns, prices, parsed), nil
}
```

Replacement:

```go
    }
    return goldOverlay(txns, prices, parsed), nil
}

// InvestedOn is the physical-gold invested amount at the end of each day:
// the cash paid for the purchases dated on or before it (PD-052). Unlike
// HistoryOverlay it needs no price, so a purchase counts from its own day
// even before the first price is entered. One store read.
func (s *GoldService) InvestedOn(ctx context.Context, userId string, days []time.Time) (_ []float64, retErr error) {
    ctx, span := tracer.Start(ctx, "GoldService.InvestedOn")
    defer endSpan(span, &retErr)
    txns, err := s.store.ListTransactions(ctx, userId)
    if err != nil {
        return nil, err
    }
    return goldInvestedOn(txns, days), nil
}

// goldInvestedOn sums ActualPaid of the purchases dated on or before each
// day; purchases and days may come in any order.
func goldInvestedOn(txns []domain.GoldTransaction, days []time.Time) []float64 {
    invested := make([]float64, len(days))
    for i, day := range days {
        for _, txn := range txns {
            if !dateOnly(txn.Date).After(dateOnly(day)) {
                invested[i] += txn.ActualPaid
            }
        }
    }
    return invested
}
```

* [ ] **Step 12: The computation (Create `backend/internal/services/investment_delta.go`)**

WHY: each month end replays every holding's ledger as of that day with the History heal's own replay (`asOfLedger` + `RecomputePosition`), so a healed History row and the ledger agree; Gold reuses the gold purchases (`InvestedOn`). Pure helpers (`monthEnds`, `investedOn`, `deltaColumns`) carry the logic; the method only loads and wires (DD-009 §3).

```go
package services

import (
    "context"
    "fmt"
    "slices"
    "time"

    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/api"
    "portfolio-dashboard/internal/domain"
)

// The Transactions page's investment delta computed from the ledger
// (PD-052): per currency, the cost basis at each month end and its change
// from the previous month end. Each day replays every holding's ledger as of
// that day with the History heal's own replay (asOfLedger +
// RecomputePosition), so a month end reads what a healed History row on that
// day holds as invested.

// minInvestmentDeltaYear is the chart's first year (the frontend's MIN_YEAR).
const minInvestmentDeltaYear = 2020

// goldColumn is the chart column of the physical-gold ledger.
const goldColumn = "GOLD"

// GoldInvested is the gold purchases' invested amount at the end of each
// day (GoldService.InvestedOn: purchases only, no price needed). The caller
// passes nil when the user has no gold, or Postgres is not configured.
type GoldInvested interface {
    InvestedOn(ctx context.Context, userId string, days []time.Time) ([]float64, error)
}

// monthEnds lists the days the chart reads for year: 31 Dec of the previous
// year (January's opening), then each month's last day, or today for the
// current month. Months after today have no day.
func monthEnds(year int, today time.Time) []time.Time {
    days := []time.Time{time.Date(year, time.January, 0, 0, 0, 0, 0, time.UTC)}
    for month := time.January; month <= time.December; month++ {
        if time.Date(year, month, 1, 0, 0, 0, 0, time.UTC).After(today) {
            break
        }
        end := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC)
        if end.After(today) {
            end = today
        }
        days = append(days, end)
    }
    return days
}

// investedOn is, per currency, the cost basis (shares × average cost) of
// every holding at the end of day. An oversold as-of ledger counts at its
// clamped position, as the History heal values it.
func investedOn(holdings []domain.Holding, ledgers map[primitive.ObjectID][]domain.Transaction, day time.Time) map[string]float64 {
    invested := map[string]float64{}
    for _, holding := range holdings {
        currency, ok := CurrencyOf(holding)
        if !ok {
            continue
        }
        ledger := asOfLedger(ledgers[holding.ID], day.AddDate(0, 0, 1))
        if len(ledger) == 0 {
            continue
        }
        position, _ := RecomputePosition(ledger)
        invested[currency] += position.StocksOwned * position.AvgCostPrice
    }
    return invested
}

// deltaColumns turns each column's invested amount on the monthEnds days
// (values[0] = January's opening) into the chart's columns, in chart order.
// A column appears when some month end of the year has money invested.
func deltaColumns(figures map[string][]float64) []api.InvestmentDeltaColumn {
    columns := []api.InvestmentDeltaColumn{}
    for _, column := range []string{domain.CurrencyINR, domain.CurrencyEUR, goldColumn} {
        values, ok := figures[column]
        if !ok || !slices.ContainsFunc(values[1:], func(value float64) bool { return round(value) > 0 }) {
            continue
        }
        months := make([]api.InvestmentDeltaMonth, 12)
        for month0 := range months {
            months[month0].Month0 = month0
            if month0+1 < len(values) {
                invested, delta := round(values[month0+1]), round(values[month0+1]-values[month0])
                months[month0].Invested, months[month0].Delta = &invested, &delta
            }
        }
        columns = append(columns, api.InvestmentDeltaColumn{Column: api.InvestmentDeltaColumnColumn(column), Months: months})
    }
    return columns
}

// InvestmentDelta is the Transactions page's monthly investment delta for
// year, from the ledger (PD-052). GOLD comes from gold when it is non-nil;
// a gold failure leaves the column out rather than failing the chart, as
// History does with its gold overlay.
func (s *TransactionsService) InvestmentDelta(ctx context.Context, userId primitive.ObjectID, year int, gold GoldInvested) (_ api.InvestmentDelta, retErr error) {
    ctx, span := tracer.Start(ctx, "TransactionsService.InvestmentDelta")
    defer endSpan(span, &retErr)
    logger := s.log(ctx)
    today := istDayOf(s.currentTime())
    if year < minInvestmentDeltaYear || year > today.Year() {
        return api.InvestmentDelta{}, fmt.Errorf("%w: year must be %d to %d", ErrValidation, minInvestmentDeltaYear, today.Year())
    }
    holdings, err := s.holdings.ListByUser(ctx, userId)
    if err != nil {
        logger.Error("investment delta: list holdings failed", zap.Error(err))
        return api.InvestmentDelta{}, err
    }
    txns, err := s.txns.ListByUser(ctx, userId)
    if err != nil {
        logger.Error("investment delta: list transactions failed", zap.Error(err))
        return api.InvestmentDelta{}, err
    }
    ledgers := map[primitive.ObjectID][]domain.Transaction{}
    for _, txn := range txns {
        ledgers[txn.HoldingID] = append(ledgers[txn.HoldingID], txn)
    }

    days := monthEnds(year, today)
    figures := map[string][]float64{domain.CurrencyINR: make([]float64, len(days)), domain.CurrencyEUR: make([]float64, len(days))}
    for i, day := range days {
        for currency, invested := range investedOn(holdings, ledgers, day) {
            figures[currency][i] = invested
        }
    }
    if gold != nil {
        values, err := gold.InvestedOn(ctx, userId.Hex(), days)
        if err != nil {
            logger.Warn("investment delta: gold purchases failed", zap.Error(err))
        } else {
            figures[goldColumn] = values
        }
    }
    return api.InvestmentDelta{Year: year, Columns: deltaColumns(figures)}, nil
}
```

* [ ] **Step 13: Service tests (Create `backend/internal/services/investment_delta_test.go`)**

WHY: behaviour only: the days read, average cost through a sell, the day inclusive, an opening from its declared date, delta from the previous month end, empty columns and months, the method end to end with a pinned clock (gold present, gold failing), the year bounds, and gold counted from each purchase's day with no price, or before a first price entered months later.

```go
package services

import (
    "context"
    "encoding/json"
    "errors"
    "testing"
    "time"

    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.mongodb.org/mongo-driver/mongo/integration/mtest"

    "portfolio-dashboard/api"
    "portfolio-dashboard/internal/domain"
    "portfolio-dashboard/internal/persistence"
)

func mustDate(value string) time.Time {
    parsed, err := time.Parse(time.DateOnly, value)
    if err != nil {
        panic(err)
    }
    return parsed
}

// The chart reads 31 Dec of the year before, then every month end; the
// current month ends today and later months have no day.
func TestMonthEnds(t *testing.T) {
    past := monthEnds(2025, mustDate("2026-11-03"))
    if len(past) != 13 || !past[0].Equal(mustDate("2024-12-31")) || !past[2].Equal(mustDate("2025-02-28")) || !past[12].Equal(mustDate("2025-12-31")) {
        t.Errorf("2025 days = %v; want 31 Dec 2024 then the 12 month ends", past)
    }
    current := monthEnds(2026, mustDate("2026-11-03"))
    if len(current) != 12 || !current[10].Equal(mustDate("2026-10-31")) || !current[11].Equal(mustDate("2026-11-03")) {
        t.Errorf("2026 days = %v; want up to 31 Oct, then today for November", current)
    }
}

// Cost basis per currency at the end of a day: average cost (a sell removes
// its shares at the average), events up to and including the day, and an
// opening counted from its declared date.
func TestInvestedOn(t *testing.T) {
    india := domain.Holding{ID: primitive.NewObjectID(), Currency: "INR"}
    europe := domain.Holding{ID: primitive.NewObjectID(), Currency: "EUR"}
    openingDate := mustDate("2026-02-01")
    ledgers := map[primitive.ObjectID][]domain.Transaction{
        india.ID: {
            {Type: domain.TxnBuy, Date: mustDate("2026-01-10"), Quantity: 10, Amount: 1000},
            {Type: domain.TxnSell, Date: mustDate("2026-02-05"), Quantity: 4, Amount: 600},
            {Type: domain.TxnBuy, Date: mustDate("2026-03-01"), Quantity: 5, Amount: 800},
        },
        europe.ID: {{Type: domain.TxnOpening, Date: openingDate, OpeningDate: &openingDate, Quantity: 2, Amount: 300}},
    }
    holdings := []domain.Holding{india, europe}
    for day, want := range map[string]map[string]float64{
        "2026-01-31": {"INR": 1000},
        "2026-02-28": {"INR": 600, "EUR": 300},
        "2026-03-01": {"INR": 1400, "EUR": 300},
    } {
        got := investedOn(holdings, ledgers, mustDate(day))
        if !approx(got["INR"], want["INR"]) || !approx(got["EUR"], want["EUR"]) {
            t.Errorf("%s: invested %v; want %v", day, got, want)
        }
    }
}

// Each month's figure is the month-end cost basis and its change from the
// previous month end; a column with nothing invested in the year is left
// out, and months after today stay empty.
func TestDeltaColumns(t *testing.T) {
    columns := deltaColumns(map[string][]float64{
        "INR":  {100, 150, 150, 120},
        "EUR":  {0, 0, 0, 0},
        "GOLD": {0, 0, 50, 50},
    })
    if len(columns) != 2 || columns[0].Column != api.InvestmentDeltaColumnColumnINR || columns[1].Column != api.InvestmentDeltaColumnColumnGOLD {
        t.Fatalf("columns = %v; want INR then GOLD (EUR has nothing invested)", columns)
    }
    india := columns[0].Months
    if len(india) != 12 || *india[0].Invested != 150 || *india[0].Delta != 50 || *india[2].Invested != 120 || *india[2].Delta != -30 {
        t.Errorf("INR months = %+v; want Jan 150 (+50) … Mar 120 (−30)", india)
    }
    if india[3].Invested != nil || india[3].Delta != nil || india[11].Month0 != 11 {
        t.Errorf("April onwards = %+v; want empty months 3–11", india[3:])
    }
    // On the wire an empty month says so: null, not a missing key.
    if wire, _ := json.Marshal(india[11]); string(wire) != `{"delta":null,"invested":null,"month0":11}` {
        t.Errorf("December JSON = %s; want explicit nulls", wire)
    }
}

// Gold invested counts each purchase from its own day, with no price: a
// January purchase is January's even when no price exists, or the first
// price is only entered in March (History's overlay has no row value until
// then, which would push the purchase into March).
func TestGoldInvestedOn_NeedsNoPrice(t *testing.T) {
    purchases := []domain.GoldTransaction{
        {Date: mustDate("2026-01-05"), ActualPaid: 70000},
        {Date: mustDate("2026-05-20"), ActualPaid: 36000},
    }
    days := []time.Time{mustDate("2025-12-31"), mustDate("2026-01-31"), mustDate("2026-02-28"), mustDate("2026-03-31"), mustDate("2026-05-20")}
    got := goldInvestedOn(purchases, days)
    want := []float64{0, 70000, 70000, 70000, 106000}
    for i := range want {
        if got[i] != want[i] {
            t.Fatalf("invested on %v = %v; want %v (no price needed; the day inclusive)", days, got, want)
        }
    }

    firstPriceInMarch := []domain.GoldPrice{{Date: mustDate("2026-03-10"), PricePerGram: 7000}}
    overlay := goldOverlay(purchases, firstPriceInMarch, days)
    if _, ok := overlay["2026-01-31"]; ok {
        t.Errorf("goldOverlay valued 31 Jan before any price; this test's premise changed")
    }
}

// fakeGold stands in for GoldService.InvestedOn.
type fakeGold struct {
    invested map[string]float64
    err      error
}

func (gold fakeGold) InvestedOn(_ context.Context, _ string, days []time.Time) ([]float64, error) {
    if gold.err != nil {
        return nil, gold.err
    }
    values := make([]float64, len(days))
    for i, day := range days {
        values[i] = gold.invested[day.Format(time.DateOnly)]
    }
    return values, nil
}

func TestTransactionsService_InvestmentDelta(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
    service := func(mt *mtest.T) *TransactionsService {
        store := persistence.New(mt.DB)
        transactions := NewTransactionsService(store.Transactions, store.Holdings, nil, nil)
        transactions.now = func() time.Time { return time.Date(2026, 2, 15, 9, 0, 0, 0, time.UTC) }
        return transactions
    }
    ledger := func(mt *mtest.T) []bson.D {
        buy := func(day string, amount float64) bson.D {
            return bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: holdingId},
                {Key: "type", Value: "buy"}, {Key: "date", Value: mustDate(day)}, {Key: "quantity", Value: 10.0}, {Key: "amount", Value: amount}}
        }
        return []bson.D{
            mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
                bson.D{{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "currency", Value: "INR"}}),
            mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, buy("2026-01-10", 1000), buy("2026-02-02", 500)),
        }
    }

    mt.Run("INR from the ledger, GOLD from the gold ledger, nothing after today", func(mt *mtest.T) {
        mt.AddMockResponses(ledger(mt)...)
        gold := fakeGold{invested: map[string]float64{"2026-01-31": 7000, "2026-02-15": 7500}}
        delta, err := service(mt).InvestmentDelta(context.Background(), userId, 2026, gold)
        if err != nil {
            t.Fatalf("InvestmentDelta: %v", err)
        }
        if len(delta.Columns) != 2 || delta.Columns[0].Column != api.InvestmentDeltaColumnColumnINR || delta.Columns[1].Column != api.InvestmentDeltaColumnColumnGOLD {
            t.Fatalf("columns = %+v; want INR and GOLD", delta.Columns)
        }
        india, gilt := delta.Columns[0].Months, delta.Columns[1].Months
        if *india[0].Invested != 1000 || *india[0].Delta != 1000 || *india[1].Invested != 1500 || *india[1].Delta != 500 || india[2].Invested != nil {
            t.Errorf("INR = Jan %v (+%v), Feb %v (+%v), Mar %v; want 1000 (+1000), 1500 (+500), none",
                *india[0].Invested, *india[0].Delta, *india[1].Invested, *india[1].Delta, india[2].Invested)
        }
        if *gilt[0].Invested != 7000 || *gilt[1].Delta != 500 {
            t.Errorf("GOLD = Jan %v, Feb delta %v; want 7000, +500 (February reads today)", *gilt[0].Invested, *gilt[1].Delta)
        }
    })

    mt.Run("a gold failure leaves GOLD out, not the chart", func(mt *mtest.T) {
        mt.AddMockResponses(ledger(mt)...)
        delta, err := service(mt).InvestmentDelta(context.Background(), userId, 2026, fakeGold{err: errors.New("postgres down")})
        if err != nil || len(delta.Columns) != 1 || delta.Columns[0].Column != api.InvestmentDeltaColumnColumnINR {
            t.Fatalf("delta = %+v, err %v; want INR only", delta, err)
        }
    })

    mt.Run("a year before 2020 or after this year is invalid", func(mt *mtest.T) {
        for _, year := range []int{2019, 2027} {
            if _, err := service(mt).InvestmentDelta(context.Background(), userId, year, nil); !errors.Is(err, ErrValidation) {
                t.Errorf("year %d: err %v; want ErrValidation", year, err)
            }
        }
    })
}
```

* [ ] **Step 14: The handler (Create `backend/internal/controllers/investment_delta.go`)**

WHY: GOLD only for gold-enabled callers while the gold store is attached, exactly as History's overlay.

```go
package controllers

import (
    "context"
    "errors"

    "portfolio-dashboard/api"
    "portfolio-dashboard/internal/auth"
    "portfolio-dashboard/internal/services"
)

// GetInvestmentDelta serves the Transactions page's investment delta from
// the ledger (PD-052). GOLD is included only for gold-enabled callers while
// the gold store is attached, as on History.
func (h *Controller) GetInvestmentDelta(ctx context.Context, request api.GetInvestmentDeltaRequestObject) (api.GetInvestmentDeltaResponseObject, error) {
    currentUserId, err := currentUserID(ctx)
    if err != nil {
        return nil, err
    }
    var gold services.GoldInvested
    if caller, ok := auth.UserFromContext(ctx); ok && caller.GoldEnabled && h.gold != nil {
        gold = h.gold
    }
    delta, err := h.transactions.InvestmentDelta(ctx, currentUserId, request.Params.Year, gold)
    if errors.Is(err, services.ErrValidation) {
        return api.GetInvestmentDelta400JSONResponse{BadRequestJSONResponse: api.BadRequestJSONResponse{Error: new(err.Error())}}, nil
    }
    if err != nil {
        return nil, err
    }
    return api.GetInvestmentDelta200JSONResponse(delta), nil
}
```

* [ ] **Step 15: The switch, on a shared flag path (Edit `backend/internal/controllers/admin.go`)**

WHY: gold and premium were the same handler twice; a third copy would break the reuse rule, so the body becomes `setUserFlag` and all three map its result to 403 / 404 / 204 (DD-009 §4).

Current:

```go
// off hides gold data but deletes nothing.
func (h *Controller) AdminSetUserGold(ctx context.Context, request api.AdminSetUserGoldRequestObject) (api.AdminSetUserGoldResponseObject, error) {
    caller, ok := superAdminCaller(ctx)
    if !ok {
        return api.AdminSetUserGold403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
    }
    target, found, err := h.loadTargetUser(ctx, caller, request.Id)
    if err != nil {
        return nil, err
    }
    if !found {
        return api.AdminSetUserGold404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }

    if err := h.store.Users.Update(ctx, target.ID, bson.M{
        "gold_enabled": request.Body.Enabled,
        "updated_at":   time.Now(),
    }); err != nil {
        h.reqLog(ctx).Error("gold toggle failed", zap.String("error", err.Error()))
        return nil, err
    }
    h.reqLog(ctx).Info("gold tracking toggled",
        zap.String("target", target.ID.Hex()), zap.Bool("enabled", request.Body.Enabled))
    return api.AdminSetUserGold204Response{}, nil
}
```

Replacement:

```go
// off hides gold data but deletes nothing.
func (h *Controller) AdminSetUserGold(ctx context.Context, request api.AdminSetUserGoldRequestObject) (api.AdminSetUserGoldResponseObject, error) {
    allowed, found, err := h.setUserFlag(ctx, request.Id, "gold_enabled", request.Body.Enabled)
    switch {
    case err != nil:
        return nil, err
    case !allowed:
        return api.AdminSetUserGold403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
    case !found:
        return api.AdminSetUserGold404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }
    return api.AdminSetUserGold204Response{}, nil
}
```

Current:

```go
// off revokes eligibility but deletes nothing.
func (h *Controller) AdminSetUserPremium(ctx context.Context, request api.AdminSetUserPremiumRequestObject) (api.AdminSetUserPremiumResponseObject, error) {
    caller, ok := superAdminCaller(ctx)
    if !ok {
        return api.AdminSetUserPremium403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
    }
    target, found, err := h.loadTargetUser(ctx, caller, request.Id)
    if err != nil {
        return nil, err
    }
    if !found {
        return api.AdminSetUserPremium404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }

    logger := h.reqLog(ctx)
    if err := h.store.Users.Update(ctx, target.ID, bson.M{
        "premium":    request.Body.Enabled,
        "updated_at": time.Now(),
    }); err != nil {
        logger.Error("premium toggle failed", zap.Error(err))
        return nil, err
    }
    logger.Info("premium toggled",
        zap.String("target", target.ID.Hex()), zap.Bool("enabled", request.Body.Enabled))
    return api.AdminSetUserPremium204Response{}, nil
}
```

Replacement:

```go
// off revokes eligibility but deletes nothing.
func (h *Controller) AdminSetUserPremium(ctx context.Context, request api.AdminSetUserPremiumRequestObject) (api.AdminSetUserPremiumResponseObject, error) {
    allowed, found, err := h.setUserFlag(ctx, request.Id, "premium", request.Body.Enabled)
    switch {
    case err != nil:
        return nil, err
    case !allowed:
        return api.AdminSetUserPremium403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
    case !found:
        return api.AdminSetUserPremium404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }
    return api.AdminSetUserPremium204Response{}, nil
}

// AdminSetUserDeltaFromHistory switches an account's investment delta on
// Transactions back to History rows (PD-052); off (default) computes it
// from the ledger. Super admin only; like gold and premium, the super admin
// may switch their own account.
func (h *Controller) AdminSetUserDeltaFromHistory(ctx context.Context, request api.AdminSetUserDeltaFromHistoryRequestObject) (api.AdminSetUserDeltaFromHistoryResponseObject, error) {
    allowed, found, err := h.setUserFlag(ctx, request.Id, "delta_from_history", request.Body.Enabled)
    switch {
    case err != nil:
        return nil, err
    case !allowed:
        return api.AdminSetUserDeltaFromHistory403JSONResponse{ForbiddenJSONResponse: forbiddenMsg("super admin access required")}, nil
    case !found:
        return api.AdminSetUserDeltaFromHistory404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
    }
    return api.AdminSetUserDeltaFromHistory204Response{}, nil
}

// setUserFlag is the super-admin per-user switch shared by the gold,
// premium and delta-source toggles: load the target in the caller's scope,
// set field to enabled (and updated_at), log it. allowed=false: the caller
// is not the super admin (403); found=false: no such user (404).
func (h *Controller) setUserFlag(ctx context.Context, userIdHex, field string, enabled bool) (allowed, found bool, err error) {
    caller, ok := superAdminCaller(ctx)
    if !ok {
        return false, false, nil
    }
    target, found, err := h.loadTargetUser(ctx, caller, userIdHex)
    if err != nil || !found {
        return true, found, err
    }
    logger := h.reqLog(ctx)
    if err := h.store.Users.Update(ctx, target.ID, bson.M{field: enabled, "updated_at": time.Now()}); err != nil {
        logger.Error("user flag toggle failed", zap.String("flag", field), zap.Error(err))
        return true, true, err
    }
    logger.Info("user flag toggled", zap.String("flag", field), zap.String("target", target.ID.Hex()), zap.Bool("enabled", enabled))
    return true, true, nil
}
```

* [ ] **Step 16: Switch tests (Edit `backend/internal/controllers/admin_test.go`)**

WHY: the super admin's 204 writes `delta_from_history`; a region admin gets 403; an unknown user 404. The gold and premium tests pass unchanged: the no-regression proof for the shared path.

Current:

```go
}

func TestAdminSetUserRegion(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
```

Replacement:

```go
}

// PD-052: the per-user switch back to the History-based investment delta,
// on the shared super-admin flag path.
func TestAdminSetUserDeltaFromHistory(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

    mt.Run("super admin switches an account to History", func(mt *mtest.T) {
        target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
        mt.AddMockResponses(
            mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
            mtest.CreateSuccessResponse(),
        )
        h := newIntegrationHandler(mt, &mockPriceFetcher{})
        resp, err := h.AdminSetUserDeltaFromHistory(userCtx(superAdmin()), api.AdminSetUserDeltaFromHistoryRequestObject{
            Id:   primitive.NewObjectID().Hex(),
            Body: &api.UserFlagToggleRequest{Enabled: true},
        })
        if err != nil {
            t.Fatalf("AdminSetUserDeltaFromHistory: %v", err)
        }
        if _, ok := resp.(api.AdminSetUserDeltaFromHistory204Response); !ok {
            t.Fatalf("response = %T, want 204", resp)
        }
        for _, event := range mt.GetAllStartedEvents() {
            if event.CommandName == "update" {
                set := event.Command.Lookup("updates").Array().Index(0).Value().Document().Lookup("u", "$set").Document()
                if enabled, ok := set.Lookup("delta_from_history").BooleanOK(); !ok || !enabled {
                    t.Errorf("update $set = %v; want delta_from_history true", set)
                }
            }
        }
    })

    mt.Run("regional admins cannot switch it", func(mt *mtest.T) {
        h := newIntegrationHandler(mt, &mockPriceFetcher{})
        resp, err := h.AdminSetUserDeltaFromHistory(userCtx(regionalAdmin("india")), api.AdminSetUserDeltaFromHistoryRequestObject{
            Id:   primitive.NewObjectID().Hex(),
            Body: &api.UserFlagToggleRequest{Enabled: true},
        })
        if err != nil {
            t.Fatalf("AdminSetUserDeltaFromHistory: %v", err)
        }
        if _, ok := resp.(api.AdminSetUserDeltaFromHistory403JSONResponse); !ok {
            t.Fatalf("response = %T, want 403", resp)
        }
    })

    mt.Run("unknown target is a 404", func(mt *mtest.T) {
        mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch))
        h := newIntegrationHandler(mt, &mockPriceFetcher{})
        resp, err := h.AdminSetUserDeltaFromHistory(userCtx(superAdmin()), api.AdminSetUserDeltaFromHistoryRequestObject{
            Id:   primitive.NewObjectID().Hex(),
            Body: &api.UserFlagToggleRequest{Enabled: false},
        })
        if err != nil {
            t.Fatalf("AdminSetUserDeltaFromHistory: %v", err)
        }
        if _, ok := resp.(api.AdminSetUserDeltaFromHistory404JSONResponse); !ok {
            t.Fatalf("response = %T, want 404", resp)
        }
    })
}

func TestAdminSetUserRegion(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
```

* [ ] **Step 17: Route tier (Edit `backend/internal/httpserver/auth.go`)**

WHY: every admin route declares its tier (`TestAuthGate_TierTableMatchesGeneratedRoutes`).

Current:

```go
    // Super-admin only — promote / demote / change-region, plus the
    // admin-roster view itself.
    "GET /api/admin/admins":             tierSuperAdmin,
    "POST /api/admin/users/:id/promote": tierSuperAdmin,
    "POST /api/admin/users/:id/demote":  tierSuperAdmin,
    "PUT /api/admin/users/:id/region":   tierSuperAdmin,
    "PUT /api/admin/users/:id/gold":     tierSuperAdmin,
    "PUT /api/admin/users/:id/premium":  tierSuperAdmin,
    "PUT /api/admin/branding":           tierSuperAdmin,

    // Admin or super-admin — every other /api/admin/... route.
```

Replacement:

```go
    // Super-admin only — promote / demote / change-region, plus the
    // admin-roster view itself.
    "GET /api/admin/admins":                       tierSuperAdmin,
    "POST /api/admin/users/:id/promote":           tierSuperAdmin,
    "POST /api/admin/users/:id/demote":            tierSuperAdmin,
    "PUT /api/admin/users/:id/region":             tierSuperAdmin,
    "PUT /api/admin/users/:id/gold":               tierSuperAdmin,
    "PUT /api/admin/users/:id/premium":            tierSuperAdmin,
    "PUT /api/admin/users/:id/delta-from-history": tierSuperAdmin,
    "PUT /api/admin/branding":                     tierSuperAdmin,

    // Admin or super-admin — every other /api/admin/... route.
```

* [ ] **Step 18: Verify**

```bash
cd backend && gofmt -l internal && go vet ./... && go test ./... && golangci-lint run ./...
```

Expected: no gofmt output; every package `ok`; `0 issues.`

* [ ] **Step 19: Commit, push, open PR2 into the feature branch**

WHY: the PR body carries the curl block below (endpoint PRs).

```bash
git add backend/api/specs/portfolio-api.yaml backend/api/specs/transactions/transactions.yaml backend/api/specs/admin/admin.yaml backend/api/specs/openapi.yaml backend/api/models.gen.go backend/api/server.gen.go backend/internal/domain/user.go backend/internal/services/mapper.go backend/internal/services/clock.go backend/internal/services/transactions.go backend/internal/services/gold_history.go backend/internal/services/investment_delta.go backend/internal/services/investment_delta_test.go backend/internal/controllers/investment_delta.go backend/internal/controllers/admin.go backend/internal/controllers/admin_test.go backend/internal/httpserver/auth.go
git commit -m "✨ Compute the investment delta from the ledger"
git push -u origin feat/PD-052-delta-api
gh pr create --base feat/PD-052-delta-from-transactions --title "✨ Serve the investment delta from the ledger, with a per-user switch" --body-file pr2.md
```

Expected: PR URL; CI green.

How to test (PR2 body), with the dev stack running:

````bash
curl -s -c jar -H 'X-Requested-With: portfolio-dashboard' -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<dev password>"}' localhost:8080/api/auth/login
curl -s -b jar 'localhost:8080/api/transactions/investment-delta?year=2026'
# 200: {"year":2026,"columns":[{"column":"INR","months":[{"month0":0,"invested":…,"delta":…}, …]}]}; months after today: null
curl -s -b jar -o /dev/null -w '%{http_code}\n' 'localhost:8080/api/transactions/investment-delta?year=2019'
# 400
curl -s -b jar -X PUT -H 'X-Requested-With: portfolio-dashboard' -H 'Content-Type: application/json' \
  -d '{"enabled":true}' -o /dev/null -w '%{http_code}\n' localhost:8080/api/admin/users/<user id>/delta-from-history
# 204; GET /api/auth/me as that user → "delta_from_history": true
````

---

## Task 2: The panel reads the ledger; the admin switch (frontend, PR3)

**Files:**

* Modify: `frontend/src/lib/api/schema.gen.ts`, `frontend/src/lib/api/client.ts`, `frontend/src/features/transactions/InvestmentDeltaPanel.tsx`, `frontend/src/features/transactions/InvestmentDeltaPanel.test.tsx`, `frontend/src/features/transactions/TransactionsPage.test.tsx`, `frontend/src/features/auth/guardRules.test.ts`, `frontend/src/features/admin/AdminUserList.tsx`, `frontend/src/features/admin/AdminUserList.test.tsx`, `docs/portfolio-model.md`

* [ ] **Step 1: Branch from the feature branch (PR2 in it, or merged in)**

```bash
git fetch origin && git checkout -b feat/PD-052-delta-ui origin/feat/PD-052-delta-from-transactions
```

* [ ] **Step 2: Regenerate the API types**

WHY: schema.gen.ts is generated from the backend spec.

```bash
cd frontend && npm run gen:api
```

Expected: `src/lib/api/schema.gen.ts` gains `InvestmentDelta` and `delta_from_history`.

* [ ] **Step 3: Client methods (Edit `frontend/src/lib/api/client.ts`)**

WHY: one method per new endpoint, typed from the schema.

Current:

```ts
export type GoldToggleRequest = Schemas['GoldToggleRequest']
export type PremiumToggleRequest = Schemas['PremiumToggleRequest']
export type BrandingFont = Schemas['BrandingFont']
export type BrandingSettings = Schemas['BrandingSettings']
```

Replacement:

```ts
export type GoldToggleRequest = Schemas['GoldToggleRequest']
export type PremiumToggleRequest = Schemas['PremiumToggleRequest']
export type UserFlagToggleRequest = Schemas['UserFlagToggleRequest']
export type InvestmentDelta = Schemas['InvestmentDelta']
export type BrandingFont = Schemas['BrandingFont']
export type BrandingSettings = Schemas['BrandingSettings']
```

Current:

```ts
  importTrades: (body: TradeImportInput, userId?: string) =>
    request<TradeImportResult>('POST', `${transactionsPath(userId)}/import`, body),

  // Dividends (PD-048): one currency tab, CSV import, delete-all. Single
```

Replacement:

```ts
  importTrades: (body: TradeImportInput, userId?: string) =>
    request<TradeImportResult>('POST', `${transactionsPath(userId)}/import`, body),
  // The Transactions page's investment delta from the ledger (PD-052).
  getInvestmentDelta: (year: number) => request<InvestmentDelta>('GET', `/transactions/investment-delta?year=${year}`),

  // Dividends (PD-048): one currency tab, CSV import, delete-all. Single
```

Current:

```ts
  adminSetUserGold:     (id: string, body: GoldToggleRequest) => request<void>('PUT', `/admin/users/${id}/gold`, body),
  adminSetUserPremium:  (id: string, body: PremiumToggleRequest) => request<void>('PUT', `/admin/users/${id}/premium`, body),
  adminUpdateBranding:  (body: BrandingUpdateRequest) => request<BrandingSettings>('PUT', '/admin/branding', body),
```

Replacement:

```ts
  adminSetUserGold:     (id: string, body: GoldToggleRequest) => request<void>('PUT', `/admin/users/${id}/gold`, body),
  adminSetUserPremium:  (id: string, body: PremiumToggleRequest) => request<void>('PUT', `/admin/users/${id}/premium`, body),
  adminSetUserDeltaFromHistory: (id: string, body: UserFlagToggleRequest) =>
    request<void>('PUT', `/admin/users/${id}/delta-from-history`, body),
  adminUpdateBranding:  (body: BrandingUpdateRequest) => request<BrandingSettings>('PUT', '/admin/branding', body),
```

* [ ] **Step 4: The panel: ledger by default, History behind the switch (Edit `frontend/src/features/transactions/InvestmentDeltaPanel.tsx`)**

WHY: the chart, toolbar and refresh stay; only the source changes. Switched users run the PD-050 code path untouched (History rows plus the live row); everyone else loads the ledger months, which are already as of today, so the live-row hook stays inactive (DD-009 §5).

Current:

```tsx
// The Transactions page's investment delta panel (PD-050), just below the
// filters: expanded from a handle bar, it charts each month's investment
// delta for one year and one column.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, type HistoryRow } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'
import {
  MIN_YEAR, PERFORMANCE_COLUMNS, PERFORMANCE_COLUMN_LABELS, columnPosition, monthRange, monthlyInvestment,
  yearMonth0, type PerformanceColumn,
} from '../history/historyShared'
import { useLiveHistoryRows, useTradingClock } from '../history/useLiveHistoryRows'
```

Replacement:

```tsx
// The Transactions page's investment delta panel (PD-050), just below the
// filters: expanded from a handle bar, it charts each month's investment
// delta for one year and one column. The figures come from the ledger
// (PD-052); a user switched to History by the super admin
// (`delta_from_history`) gets the PD-050 version read off History rows.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, type HistoryRow, type InvestmentDelta } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'
import {
  MIN_YEAR, PERFORMANCE_COLUMNS, PERFORMANCE_COLUMN_LABELS, columnPosition, monthRange, monthlyInvestment,
  yearMonth0, type MonthlyInvestment, type PerformanceColumn,
} from '../history/historyShared'
import { useLiveHistoryRows, useTradingClock } from '../history/useLiveHistoryRows'
```

Current:

```tsx
  })
  const [year, setYear] = useState(currentYear)
  // The loaded rows and the year they belong to. A ledger refresh keeps the
  // current figures on screen while it reloads; another year shows the
  // spinner until its own rows arrive.
  const [loaded, setLoaded] = useState<{ year: number; rows: HistoryRow[] } | null>(null)
  // null = not loaded yet for this year.
  const rows = loaded && loaded.year === year ? loaded.rows : null
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PerformanceColumn | null>(null)
```

Replacement:

```tsx
  })
  const [year, setYear] = useState(currentYear)
  const fromHistory = Boolean(auth?.user?.delta_from_history)
  // The loaded figures and the year they belong to: History rows, or the
  // ledger's months. A ledger refresh keeps the current figures on screen
  // while it reloads; another year shows the spinner until its own arrive.
  const [loaded, setLoaded] = useState<{ year: number; rows: HistoryRow[] } | null>(null)
  const [ledger, setLedger] = useState<{ year: number; delta: InvestmentDelta } | null>(null)
  // null = not loaded yet for this year.
  const rows = loaded && loaded.year === year ? loaded.rows : null
  const ledgerDelta = ledger && ledger.year === year ? ledger.delta : null
  const ready = fromHistory ? rows !== null : ledgerDelta !== null
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PerformanceColumn | null>(null)
```

Current:

```tsx
    void (async () => {
      try {
        // 1 Jan → 31 Dec, plus the latest row before 1 Jan as January's baseline.
        const list = await api.listHistory(monthRange(year, 0).from, monthRange(year, 11).to, true)
        if (!cancelled) setLoaded({ year, rows: list.rows })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
```

Replacement:

```tsx
    void (async () => {
      try {
        if (fromHistory) {
          // 1 Jan → 31 Dec, plus the latest row before 1 Jan as January's baseline.
          const list = await api.listHistory(monthRange(year, 0).from, monthRange(year, 11).to, true)
          if (!cancelled) setLoaded({ year, rows: list.rows })
        } else {
          const delta = await api.getInvestmentDelta(year)
          if (!cancelled) setLedger({ year, delta })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
```

Current:

```tsx
    })()
    return () => { cancelled = true }
  }, [open, year, refreshKey])

  // Today's live row, as on History, while the current year is pulled up.
  const displayRows = useLiveHistoryRows(rows ?? NO_ROWS, {
    active: open && rows !== null && year === currentYear,
    todayStr, liveWindowOpen, goldEnabled: Boolean(auth?.user?.gold_enabled), refreshKey,
  })

  // Only columns with money invested on a row inside the year are offered;
  // the baseline row before 1 Jan stays in for January's opening.
  const yearStart = monthRange(year, 0).from
  const columns = useMemo(
    () => PERFORMANCE_COLUMNS.filter(column =>
      displayRows.some(row => row.date >= yearStart && columnPosition(row, column).invested > 0)),
    [displayRows, yearStart],
  )
  const column = picked && columns.includes(picked) ? picked : columns[0] ?? null
  const months = useMemo(
    () => (column ? monthlyInvestment(displayRows, year, column) : []),
    [displayRows, year, column],
  )

  return (
```

Replacement:

```tsx
    })()
    return () => { cancelled = true }
  }, [open, year, refreshKey, fromHistory])

  // Today's live row, as on History, while the current year is pulled up
  // (the History version only: the ledger is already as of today).
  const displayRows = useLiveHistoryRows(rows ?? NO_ROWS, {
    active: fromHistory && open && rows !== null && year === currentYear,
    todayStr, liveWindowOpen, goldEnabled: Boolean(auth?.user?.gold_enabled), refreshKey,
  })

  // Only columns with money invested inside the year are offered: on
  // History, on a row of the year (the baseline row before 1 Jan stays in
  // for January's opening); from the ledger, the server already filters.
  const yearStart = monthRange(year, 0).from
  const columns = useMemo<PerformanceColumn[]>(
    () => fromHistory
      ? PERFORMANCE_COLUMNS.filter(column =>
        displayRows.some(row => row.date >= yearStart && columnPosition(row, column).invested > 0))
      : (ledgerDelta?.columns ?? []).map(entry => entry.column),
    [fromHistory, displayRows, yearStart, ledgerDelta],
  )
  const column = picked && columns.includes(picked) ? picked : columns[0] ?? null
  const months = useMemo<MonthlyInvestment[]>(() => {
    if (!column) return []
    if (fromHistory) return monthlyInvestment(displayRows, year, column)
    const entry = ledgerDelta?.columns.find(candidate => candidate.column === column)
    return (entry?.months ?? []).map(month => ({ month0: month.month0, delta: month.delta ?? null, invested: month.invested ?? null }))
  }, [fromHistory, displayRows, year, column, ledgerDelta])

  return (
```

Current:

```tsx
          {error ? (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>
          ) : rows === null ? (
            <div style={centred}><span className="spinner" /></div>
          ) : !column ? (
            <div style={centred}>No History rows for {year}</div>
          ) : (
            <div role="img" aria-label={`Investment delta ${year}, ${PERFORMANCE_COLUMN_LABELS[column]}`}
```

Replacement:

```tsx
          {error ? (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>
          ) : !ready ? (
            <div style={centred}><span className="spinner" /></div>
          ) : !column ? (
            <div style={centred}>{fromHistory ? `No History rows for ${year}` : `Nothing invested in ${year}`}</div>
          ) : (
            <div role="img" aria-label={`Investment delta ${year}, ${PERFORMANCE_COLUMN_LABELS[column]}`}
```

* [ ] **Step 5: Panel tests (Edit `frontend/src/features/transactions/InvestmentDeltaPanel.test.tsx`)**

WHY: the existing PD-050 tests run with the switch on (they are the History version's regression suite); a new block covers the ledger version: its months reach the chart, History and prices are never read, the returned columns are offered, the year shown is asked for and reloaded on an edit, and the empty state.

Current:

```tsx
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HistoryList, HistoryRow } from '../../lib/api/client'
import type { MonthlyInvestment } from '../history/historyShared'
import { historyRow } from '../history/historyTestRows'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn(), getPrices: vi.fn(), getGoldMetrics: vi.fn() }))
const chart = vi.hoisted(() => ({ months: [] as MonthlyInvestment[] }))
```

Replacement:

```tsx
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HistoryList, HistoryRow, InvestmentDelta } from '../../lib/api/client'
import type { MonthlyInvestment } from '../history/historyShared'
import { historyRow } from '../history/historyTestRows'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn(), getInvestmentDelta: vi.fn(), getPrices: vi.fn(), getGoldMetrics: vi.fn() }))
// The signed-in user's per-user switch (PD-052): true reads History rows.
const session = vi.hoisted(() => ({ deltaFromHistory: true }))
const chart = vi.hoisted(() => ({ months: [] as MonthlyInvestment[] }))
```

Current:

```tsx
  return { ...actual, api: mockApi }
})

vi.mock('./InvestmentDeltaChart', () => ({
```

Replacement:

```tsx
  return { ...actual, api: mockApi }
})

vi.mock('../auth/AuthContext', () => ({
  useAuthOptional: () => ({ user: { gold_enabled: false, delta_from_history: session.deltaFromHistory } }),
}))

vi.mock('./InvestmentDeltaChart', () => ({
```

Current:

```tsx
const FROZEN_NOW = new Date('2026-06-16T22:00:00Z')

describe('InvestmentDeltaPanel', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
```

Replacement:

```tsx
const FROZEN_NOW = new Date('2026-06-16T22:00:00Z')

// The PD-050 version, for users the super admin switched to History.
describe('InvestmentDeltaPanel (switched to History)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
```

Current:

```tsx
    vi.setSystemTime(FROZEN_NOW)
    chart.months = []
    // This jsdom has no localStorage (hence `window.localStorage?.` in app
    // code); a fresh stub per test, as History's charts-on-top test does.
```

Replacement:

```tsx
    vi.setSystemTime(FROZEN_NOW)
    chart.months = []
    session.deltaFromHistory = true
    // This jsdom has no localStorage (hence `window.localStorage?.` in app
    // code); a fresh stub per test, as History's charts-on-top test does.
```

Current:

```tsx
  })
})
```

Replacement:

```tsx
  })
})

// The default since PD-052: the figures come from the ledger endpoint.
describe('InvestmentDeltaPanel (from the ledger)', () => {
  const months = (values: Array<[number, number]>) => Array.from({ length: 12 }, (_, month0) => (
    values[month0] ? { month0, invested: values[month0][0], delta: values[month0][1] } : { month0, invested: null, delta: null }))
  const delta = (year: number): InvestmentDelta => ({
    year,
    columns: [
      { column: 'INR', months: months([[150, 50], [150, 0]]) },
      { column: 'GOLD', months: months([[7000, 7000]]) },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    chart.months = []
    session.deltaFromHistory = false
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) },
      },
    })
    mockApi.getInvestmentDelta.mockImplementation((year: number) => Promise.resolve(delta(year)))
  })

  it('charts the ledger months and never reads History', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByRole('img', { name: /Investment delta \d+, 🇮🇳 India/ })).toBeInTheDocument()
    expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(1)
    expect(mockApi.listHistory).not.toHaveBeenCalled()
    expect(mockApi.getPrices).not.toHaveBeenCalled()
    expect(chart.months[0]).toEqual({ month0: 0, delta: 50, invested: 150 })
    expect(chart.months[2]).toEqual({ month0: 2, delta: null, invested: null })
  })

  it('offers the columns the ledger returns', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    fireEvent.click(await screen.findByRole('button', { name: '🥇 Gold' }))
    await waitFor(() => expect(chart.months[0]).toEqual({ month0: 0, delta: 7000, invested: 7000 }))
    expect(screen.queryByRole('button', { name: '🇪🇺 Europe' })).not.toBeInTheDocument()
  })

  it('asks the ledger for the year shown, and reloads after a ledger edit', async () => {
    const { rerender } = renderPanel()
    fireEvent.click(handleButton())
    const shown = Number(handleButton().textContent?.match(/\d{4}/)?.[0])
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenLastCalledWith(shown))
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenLastCalledWith(shown - 1))
    rerender(<InvestmentDeltaPanel theme="dark" refreshKey={1} />)
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(3))
  })

  it('says so when nothing was invested in the year', async () => {
    mockApi.getInvestmentDelta.mockImplementation((year: number) => Promise.resolve({ year, columns: [] }))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText(/^Nothing invested in \d{4}$/)).toBeInTheDocument()
  })
})
```

* [ ] **Step 6: Page test (Edit `frontend/src/features/transactions/TransactionsPage.test.tsx`)**

WHY: the page-level refresh test now expects the ledger figures to reload after an edit.

Current:

```tsx
  listTransactions: vi.fn(),
  listHistory: vi.fn(),
  getPrices: vi.fn(),
  deleteTransaction: vi.fn(),
```

Replacement:

```tsx
  listTransactions: vi.fn(),
  listHistory: vi.fn(),
  getInvestmentDelta: vi.fn(),
  getPrices: vi.fn(),
  deleteTransaction: vi.fn(),
```

Current:

```tsx
    beforeEach(() => {
      mockApi.listHistory.mockResolvedValue({ currency: 'INR', rows: [] })
      mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
      mockApi.listTransactions.mockResolvedValue([txns[0]])
```

Replacement:

```tsx
    beforeEach(() => {
      mockApi.listHistory.mockResolvedValue({ currency: 'INR', rows: [] })
      mockApi.getInvestmentDelta.mockResolvedValue({ year: 2026, columns: [] })
      mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
      mockApi.listTransactions.mockResolvedValue([txns[0]])
```

Current:

```tsx
    }

    it('reloads the History rows of an open investment delta panel', async () => {
      renderPage()
      await screen.findByText('SIP tranche')
      fireEvent.click(screen.getByRole('button', { name: /Investment delta/ }))
      await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledTimes(1))

      await deleteThroughEditor()
      await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledTimes(2))
    })

    it('fetches no History while the panel is collapsed', async () => {
      renderPage()
      await screen.findByText('SIP tranche')
```

Replacement:

```tsx
    }

    it('reloads the ledger figures of an open investment delta panel', async () => {
      renderPage()
      await screen.findByText('SIP tranche')
      fireEvent.click(screen.getByRole('button', { name: /Investment delta/ }))
      await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(1))

      await deleteThroughEditor()
      await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(2))
    })

    it('fetches no figures while the panel is collapsed', async () => {
      renderPage()
      await screen.findByText('SIP tranche')
```

Current:

```tsx
      await deleteThroughEditor()
      await waitFor(() => expect(mockApi.listAllTransactions).toHaveBeenCalledTimes(2))
      expect(mockApi.listHistory).not.toHaveBeenCalled()
    })
```

Replacement:

```tsx
      await deleteThroughEditor()
      await waitFor(() => expect(mockApi.listAllTransactions).toHaveBeenCalledTimes(2))
      expect(mockApi.getInvestmentDelta).not.toHaveBeenCalled()
      expect(mockApi.listHistory).not.toHaveBeenCalled()
    })
```

* [ ] **Step 7: A user fixture gains the flag (Edit `frontend/src/features/auth/guardRules.test.ts`)**

WHY: the generated `User` requires it.

Current:

```ts
  gold_enabled: false,
  premium: false,
  ...(over as object),
})
```

Replacement:

```ts
  gold_enabled: false,
  premium: false,
  delta_from_history: false,
  ...(over as object),
})
```

* [ ] **Step 8: The admin switch (Edit `frontend/src/features/admin/AdminUserList.tsx`)**

WHY: next to premium, super admin only. The file is now under `lint:changed`, so its one-letter locals (`r`, `q`, `u`) get names.

Current:

```tsx

  const regionLabel = useCallback((id: string) =>
    regions.find(r => r.id === id)?.label ?? id, [regions])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return users.filter(u => {
      if (!q) return true
      return u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    })
  }, [users, filter])
```

Replacement:

```tsx

  const regionLabel = useCallback((id: string) =>
    regions.find(region => region.id === id)?.label ?? id, [regions])

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return users.filter(listedUser => {
      if (!needle) return true
      return listedUser.username.toLowerCase().includes(needle) || listedUser.name.toLowerCase().includes(needle)
    })
  }, [users, filter])
```

Current:

```tsx
  }

  const setRegionFor = async (u: User) => {
    if (!isSuper) return
    const choice = prompt(
      `Move ${u.username} to which region? (${regions.map(r => r.id).join(', ')})`,
      u.region || regions[0]?.id || '',
    )
    if (!choice) return
    if (!regions.find(r => r.id === choice)) { alert('Unknown region'); return }
    await runAction(u.id, () => api.adminSetUserRegion(u.id, { region: choice }))
  }
```

Replacement:

```tsx
  }

  const setRegionFor = async (listedUser: User) => {
    if (!isSuper) return
    const choice = prompt(
      `Move ${listedUser.username} to which region? (${regions.map(region => region.id).join(', ')})`,
      listedUser.region || regions[0]?.id || '',
    )
    if (!choice) return
    if (!regions.find(region => region.id === choice)) { alert('Unknown region'); return }
    await runAction(listedUser.id, () => api.adminSetUserRegion(listedUser.id, { region: choice }))
  }
```

Current:

```tsx
            </thead>
            <tbody>
              {visible.map(u => {
                const isSelf = u.id === caller?.id
                const isRowSuper = u.role === 'superadmin'
                const flags: string[] = []
                if (u.disabled) flags.push('Hidden')
                if (u.locked) flags.push('Locked')
                return (
                  <tr key={u.id} style={{ opacity: u.disabled ? 0.55 : 1 }}>
                    <td style={td}>
                      <Link to={`/admin/users/${u.id}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {u.username}
                      </Link>
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </td>
                    <td style={td}>{u.name}</td>
                    <td style={td}>{u.role}</td>
                    <td style={td}>{u.region ? regionLabel(u.region) : '—'}</td>
                    <td style={td}>
                      {flags.length === 0
```

Replacement:

```tsx
            </thead>
            <tbody>
              {visible.map(listedUser => {
                const isSelf = listedUser.id === caller?.id
                const isRowSuper = listedUser.role === 'superadmin'
                const flags: string[] = []
                if (listedUser.disabled) flags.push('Hidden')
                if (listedUser.locked) flags.push('Locked')
                return (
                  <tr key={listedUser.id} style={{ opacity: listedUser.disabled ? 0.55 : 1 }}>
                    <td style={td}>
                      <Link to={`/admin/users/${listedUser.id}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {listedUser.username}
                      </Link>
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </td>
                    <td style={td}>{listedUser.name}</td>
                    <td style={td}>{listedUser.role}</td>
                    <td style={td}>{listedUser.region ? regionLabel(listedUser.region) : '—'}</td>
                    <td style={td}>
                      {flags.length === 0
```

Current:

```tsx
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/users/${u.id}`} className="btn btn-sm">
                          Open
                        </Link>
                        {u.locked && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminResetLockout(u.id))}>
                            Unlock
                          </button>
                        )}
                        {!isRowSuper && !u.disabled && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminHideUser(u.id), `Hide ${u.username}? They cannot log in until reactivated.`)}>
                            Hide
                          </button>
                        )}
                        {!isRowSuper && u.disabled && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminReactivateUser(u.id))}>
                            Reactivate
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && u.role === 'user' && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminPromoteUser(u.id), `Promote ${u.username} to admin?`)}>
                            Promote
                          </button>
                        )}
                        {isSuper && u.role === 'admin' && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminDemoteUser(u.id), `Demote ${u.username} back to user?`)}>
                            Demote
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === u.id} onClick={() => setRegionFor(u)}>
                            Move region
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminSetUserGold(u.id, { enabled: !u.gold_enabled }),
                              u.gold_enabled ? `Disable gold tracking for ${u.username}? Data is kept, only hidden.` : undefined)}>
                            {u.gold_enabled ? 'Disable gold' : 'Enable gold'}
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminSetUserPremium(u.id, { enabled: !u.premium }),
                              u.premium ? `Disable premium for ${u.username}? Their theme falls back to dark.` : undefined)}>
                            {u.premium ? 'Disable premium' : 'Enable premium'}
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm btn-danger" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminDeleteUser(u.id), `Permanently delete ${u.username} and all their holdings? This cannot be undone.`)}>
                            Delete
                          </button>
```

Replacement:

```tsx
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/users/${listedUser.id}`} className="btn btn-sm">
                          Open
                        </Link>
                        {listedUser.locked && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminResetLockout(listedUser.id))}>
                            Unlock
                          </button>
                        )}
                        {!isRowSuper && !listedUser.disabled && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminHideUser(listedUser.id), `Hide ${listedUser.username}? They cannot log in until reactivated.`)}>
                            Hide
                          </button>
                        )}
                        {!isRowSuper && listedUser.disabled && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminReactivateUser(listedUser.id))}>
                            Reactivate
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && listedUser.role === 'user' && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminPromoteUser(listedUser.id), `Promote ${listedUser.username} to admin?`)}>
                            Promote
                          </button>
                        )}
                        {isSuper && listedUser.role === 'admin' && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminDemoteUser(listedUser.id), `Demote ${listedUser.username} back to user?`)}>
                            Demote
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id} onClick={() => setRegionFor(listedUser)}>
                            Move region
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminSetUserGold(listedUser.id, { enabled: !listedUser.gold_enabled }),
                              listedUser.gold_enabled ? `Disable gold tracking for ${listedUser.username}? Data is kept, only hidden.` : undefined)}>
                            {listedUser.gold_enabled ? 'Disable gold' : 'Enable gold'}
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminSetUserPremium(listedUser.id, { enabled: !listedUser.premium }),
                              listedUser.premium ? `Disable premium for ${listedUser.username}? Their theme falls back to dark.` : undefined)}>
                            {listedUser.premium ? 'Disable premium' : 'Enable premium'}
                          </button>
                        )}
                        {isSuper && (
                          // PD-052: the Transactions investment delta reads the ledger by
                          // default; this switches the account back to History rows.
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminSetUserDeltaFromHistory(listedUser.id, { enabled: !listedUser.delta_from_history }))}>
                            {listedUser.delta_from_history ? 'Delta from ledger' : 'Delta from History'}
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm btn-danger" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminDeleteUser(listedUser.id), `Permanently delete ${listedUser.username} and all their holdings? This cannot be undone.`)}>
                            Delete
                          </button>
```

* [ ] **Step 9: Admin test (Edit `frontend/src/features/admin/AdminUserList.test.tsx`)**

WHY: the button renders like its siblings and calls the endpoint.

Current:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../lib/api/client'
import AdminUserList from './AdminUserList'
```

Replacement:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type User } from '../../lib/api/client'
import AdminUserList from './AdminUserList'
```

Current:

```tsx
    adminListUsers: vi.fn().mockImplementation(() => Promise.resolve([rowUser])),
    getRegions: vi.fn().mockResolvedValue([{ id: 'india', label: 'India' }]),
  },
}))
```

Replacement:

```tsx
    adminListUsers: vi.fn().mockImplementation(() => Promise.resolve([rowUser])),
    getRegions: vi.fn().mockResolvedValue([{ id: 'india', label: 'India' }]),
    adminSetUserDeltaFromHistory: vi.fn().mockResolvedValue(undefined),
  },
}))
```

Current:

```tsx

    // All plain actions share the same class set (uniform size/colour).
    for (const name of ['Unlock', 'Hide', 'Promote', 'Move region', 'Enable gold', 'Enable premium']) {
      const el = await screen.findByRole('button', { name })
      expect(el, `${name} button`).toHaveClass('btn', 'btn-sm')
```

Replacement:

```tsx

    // All plain actions share the same class set (uniform size/colour).
    for (const name of ['Unlock', 'Hide', 'Promote', 'Move region', 'Enable gold', 'Enable premium', 'Delta from History']) {
      const el = await screen.findByRole('button', { name })
      expect(el, `${name} button`).toHaveClass('btn', 'btn-sm')
```

Current:

```tsx
    expect(wrap!.querySelector('table')).not.toBeNull()
  })
})
```

Replacement:

```tsx
    expect(wrap!.querySelector('table')).not.toBeNull()
  })

  // PD-052: the super admin switches an account's investment delta back to
  // History rows; the ledger is the default.
  it('switches the investment delta to History for the account', async () => {
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Delta from History' }))
    await waitFor(() => expect(api.adminSetUserDeltaFromHistory).toHaveBeenCalledWith('u1', { enabled: true }))
  })
})
```

* [ ] **Step 10: User doc (Edit `docs/portfolio-model.md`)**

WHY: where the figures come from, and the switch.

Current:

```markdown
the filters (your own portfolio only; not in admin act-as). Expand it for a
Jan–Dec chart: each month's bar is the money added (green) or the cost
basis sold (red), the same figure as the History month card, and the line
is the invested amount at each month end. ‹ › change the year, and the
INR / EUR / Gold buttons switch the currency
([PRD-007](prds/PRD-007-investment-delta-chart.md)). The panel remembers
whether you left it open, and reloads after you edit or delete a
transaction in a holding's ledger, so it matches History.

### Importing trades from a CSV
```

Replacement:

```markdown
the filters (your own portfolio only; not in admin act-as). Expand it for a
Jan–Dec chart: each month's bar is the money added (green) or the cost
basis sold (red), and the line is the invested amount (cost basis) at each
month end. ‹ › change the year, and the INR / EUR / Gold buttons switch the
currency ([PRD-007](prds/PRD-007-investment-delta-chart.md)). The panel
remembers whether you left it open, and reloads after you edit or delete a
transaction in a holding's ledger.

The figures come from your transactions: every holding's ledger replayed as
of each month end (today for the current month), and Gold from your gold
purchases ([PRD-009](prds/PRD-009-investment-delta-from-transactions.md)).
The super admin can switch an account back to the earlier version, which
reads the same figures off History rows (**Delta from History** in Admin →
Users).

### Importing trades from a CSV
```

* [ ] **Step 11: Verify**

```bash
cd frontend && npm run typecheck && npx vitest run && npm run lint:changed && npm run build
```

Expected: no type errors; every test passes; `lint:changed` clean; the build succeeds.

* [ ] **Step 12: Commit, push, open PR3 into the feature branch**

```bash
git add frontend/src/lib/api/schema.gen.ts frontend/src/lib/api/client.ts frontend/src/features/transactions/InvestmentDeltaPanel.tsx frontend/src/features/transactions/InvestmentDeltaPanel.test.tsx frontend/src/features/transactions/TransactionsPage.test.tsx frontend/src/features/auth/guardRules.test.ts frontend/src/features/admin/ docs/portfolio-model.md
git commit -m "✨ Chart the investment delta from the ledger"
git push -u origin feat/PD-052-delta-ui
gh pr create --base feat/PD-052-delta-from-transactions --title "✨ Chart the investment delta from transactions by default" --body-file pr3.md
```

Expected: PR URL; CI green.

---

## Task 3: End-to-end verification (local stack), then PR4

**Files:** none

* [ ] **Step 1: Run the stack** on the feature branch, against a throwaway
  database (`MONGODB_DATABASE=pd052_e2e`; the name comes from that variable,
  not from the URI), and sign up a test user there.

* [ ] **Step 2: Scenarios**

1. **Ledger by default**: buys in January and March, no History rows: the
   panel shows January and March bars and a flat February.
2. **Backdated**: add a buy dated last month: that month's bar grows at once.
3. **Sells**: a sell removes its shares at the average cost (the bar is
   negative by that cost basis, not by the proceeds).
4. **Gold**: for a gold-enabled user, Gold counts each purchase in its own
   month, also before the first gold price (enter a price later than a
   purchase to check); elsewhere it matches the History Gold column
   at each month end; with Postgres stopped, Gold disappears and INR stays.
5. **Switch**: as the super admin, **Delta from History** on the user: their
   panel is the PD-050 one again (History rows); **Delta from ledger** back.
6. **Agreement**: run the snapshot job for a few days, then compare: on a
   healed month both versions show the same invested amount.

* [ ] **Step 3: Record and ship**: paste the results as a comment on PR3,
  check the feature branch holds exactly PR2 and PR3
  (`git diff origin/main origin/feat/PD-052-delta-from-transactions --stat`), then:

```bash
gh pr create --base main --head feat/PD-052-delta-from-transactions --title "✨ Chart the investment delta from transactions" --body-file pr4.md
```

PR4's body includes the line `FE/BE-EXCEPTION: PD-052 feature branch
(PR2–PR3 reviewed separately)`.

Expected: all six pass before PR4 merges.

## Done

* The investment delta panel charts the ledger's month-end cost basis per
  currency, with Gold from the gold purchases.
* Months without History rows still have their figures; a backdated trade
  shows at once.
* The super admin can switch any account back to the History version.
* Gold and premium switches share one code path with the new one.

Next: offer the panel in admin act-as, and decide when the History version
can be retired.
