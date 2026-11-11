# PD-055: Stock XIRR

* **Status**: Slice 1 merged (#278); slice 2 (dashboard) in review
* **Owner**: project owner
* **PRD**: [PRD-012](../prds/PRD-012-stock-xirr.md)
* **Design**: [DD-012](../designs/DD-012-stock-xirr.md)
* **Visual spec**: [PD-055-stock-xirr.html](../visuals/PD-055-stock-xirr.html)

## Header

* **Goal**: show the money-weighted annual return (XIRR) of the stock ledger
  per currency and per holding, on the owner's dashboard and in admin act-as.
* **Architecture**: a read-only `GET /xirr` (+ act-as twin) served by a new
  `StockXirrService` that maps the ledger to dated cash flows and reuses the
  gold `xirr()` solver; the dashboard fetches it beside `/prices` as an
  optional extra.
* **Tech stack**: Go (echo, oapi-codegen strict server, mongo `mtest`),
  React 18 + TypeScript (Vitest, Testing Library). No new dependencies.
  Go code below is indented with spaces for markdownlint (MD010); the
  `gofmt -l -w` pre-commit hook restores tabs.
* **Spec links**: `backend/api/specs/holdings/holdings.yaml#/xirr`,
  `backend/api/specs/admin/admin.yaml#/users_id_xirr`,
  `backend/api/specs/portfolio-api.yaml#/components/schemas/StockXirrView`.

## File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `backend/api/specs/openapi.yaml` | Route `/xirr` and `/admin/users/{id}/xirr` |
| Modify | `backend/api/specs/holdings/holdings.yaml` | `getStockXirr` operation |
| Modify | `backend/api/specs/admin/admin.yaml` | `adminGetUserStockXirr` operation |
| Modify | `backend/api/specs/portfolio-api.yaml` | `StockXirrCurrency`/`StockXirrHolding`/`StockXirrView` |
| Regenerate | `backend/api/models.gen.go`, `backend/api/server.gen.go` | Go types + strict server |
| Modify | `backend/internal/services/portfolio.go` | Extract shared `prefetchPrices` |
| Create | `backend/internal/services/stock_xirr.go` | `StockXirrService`, `ledgerFlow`, `buildStockXirr` |
| Create | `backend/internal/services/stock_xirr_test.go` | Pure flow + rate tests |
| Create | `backend/internal/controllers/xirr.go` | Own + act-as handlers |
| Create | `backend/internal/controllers/xirr_test.go` | Scoping + 404 tests |
| Modify | `backend/internal/controllers/controllers.go` | Wire the service |
| Modify | `backend/internal/httpserver/auth.go` | `tierAdmin` for the act-as route |
| Regenerate | `frontend/src/lib/api/schema.gen.ts` | TS types |
| Modify | `frontend/src/types.ts` | Export the XIRR types |
| Modify | `frontend/src/features/admin/actAsRouting.ts` (+ test) | `xirrPath` |
| Modify | `frontend/src/lib/api/client.ts` | `api.getStockXirr` |
| Create | `frontend/src/lib/rate.ts` (+ test) | Shared `formatRate`/`rateTone` |
| Modify | `frontend/src/features/gold/GoldMetricsPanel.tsx` | Reuse `formatRate` |
| Create | `frontend/src/features/holdings/stockXirr.ts` (+ test) | `indexXirr`, caveat helpers |
| Modify | `frontend/src/features/holdings/useHoldings.ts` (+ test) | Fetch + expose `xirr` |
| Modify | `frontend/src/features/holdings/HoldingsTable.tsx` | XIRR column + TOTAL |
| Modify | `frontend/src/features/holdings/HoldingsByCurrency.tsx` (+ test) | XIRR stat, pass-through |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | Pass `xirr` down |

## PR sequence

| # | Branch | Slice | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- | --- |
| 0 | (this PR) | PRD-012, DD-012, this plan, visual spec | Docs only | Reviewable design before code | n/a (docs) |
| 1 | `feat/stock-xirr-api` | Spec, codegen, service, handlers, tier | New routes only; `/summary`, `/prices` untouched | Owners and admins can read XIRR over the API | `stock_xirr_test.go`, `xirr_test.go`, tier-table test |
| 2 | `feat/stock-xirr-ui` | Types, client, hook, stat, column | Rates are optional; a failing `/xirr` leaves prices as today | The rates show on the dashboard | `stockXirr.test.ts`, `rate.test.ts`, `useHoldings.test.tsx`, `HoldingsByCurrency.test.tsx` |

Slice 2 branches from `main` after slice 1 merges.

## Tasks

### Task 1: API contract

**Files:** `backend/api/specs/openapi.yaml`, `backend/api/specs/holdings/holdings.yaml`,
`backend/api/specs/admin/admin.yaml`, `backend/api/specs/portfolio-api.yaml`,
`backend/api/models.gen.go`, `backend/api/server.gen.go`

A separate read keeps `/summary` and `/prices` byte-identical and lets the UI
treat the rates as optional. Rates are fractions like the gold `xirr`.

* [ ] **Modify `backend/api/specs/openapi.yaml`.** Route the own-portfolio read.

  Current:

  ```yaml
    /summary:
      $ref: "./holdings/holdings.yaml#/summary"
  ```

  Replace with:

  ```yaml
    /summary:
      $ref: "./holdings/holdings.yaml#/summary"
    /xirr:
      $ref: "./holdings/holdings.yaml#/xirr"
  ```

* [ ] **Modify `backend/api/specs/openapi.yaml`.** Route the act-as twin next to the other act-as reads.

  Current:

  ```yaml
    /admin/users/{id}/summary:
      $ref: "./admin/admin.yaml#/users_id_summary"
  ```

  Replace with:

  ```yaml
    /admin/users/{id}/summary:
      $ref: "./admin/admin.yaml#/users_id_summary"
    /admin/users/{id}/xirr:
      $ref: "./admin/admin.yaml#/users_id_xirr"
  ```

* [ ] **Modify `backend/api/specs/holdings/holdings.yaml`.** Append after the `summary` item (end of file):

  ```yaml
  xirr:
    get:
      tags: [Holdings]
      summary: XIRR of the stock ledger, per currency and per holding
      operationId: getStockXirr
      responses:
        "200":
          description: Annualized money-weighted returns (PRD-012)
          content:
            application/json:
              schema:
                $ref: "../portfolio-api.yaml#/components/schemas/StockXirrView"
  ```

* [ ] **Modify `backend/api/specs/admin/admin.yaml`.** Insert directly after the `users_id_summary` item:

  ```yaml
  users_id_xirr:
    get:
      tags: [Admin]
      summary: A user's stock XIRR, per currency and per holding (act-as)
      operationId: adminGetUserStockXirr
      parameters:
        - $ref: "../portfolio-api.yaml#/components/parameters/UserID"
      responses:
        "200":
          description: Annualized money-weighted returns (PRD-012)
          content:
            application/json:
              schema:
                $ref: "../portfolio-api.yaml#/components/schemas/StockXirrView"
        "404":
          $ref: "../portfolio-api.yaml#/components/responses/NotFound"
  ```

* [ ] **Modify `backend/api/specs/portfolio-api.yaml`.** Insert directly before `GoldHistoryOverlay:` under `components.schemas`:

  ```yaml
      StockXirrCurrency:
        type: object
        description: XIRR of every stock flow in one currency (PRD-012).
        required: [currency, xirr, undated_openings]
        properties:
          currency: { type: string, enum: [INR, EUR] }
          xirr:
            type: number
            format: double
            nullable: true
            description: Annualized rate as a fraction (0.12 = 12%); null when no rate exists
          since:
            type: string
            format: date
            nullable: true
            description: Date of the earliest flow; a rate over less than a year swings widely
          undated_openings:
            type: integer
            description: Opening balances with no user-set date; their flow falls on the ledger's ordering date
      StockXirrHolding:
        type: object
        description: XIRR of one holding's flows (PRD-012).
        required: [holding_id, xirr, undated_opening]
        properties:
          holding_id: { type: string }
          xirr:
            type: number
            format: double
            nullable: true
            description: Annualized rate as a fraction (0.12 = 12%); null when no rate exists
          since:
            type: string
            format: date
            nullable: true
            description: Date of the holding's earliest flow
          undated_opening:
            type: boolean
            description: The holding's opening balance has no user-set date
      StockXirrView:
        type: object
        required: [as_of, currencies, holdings]
        properties:
          as_of: { type: string, format: date, description: IST day the terminal market value is taken on }
          currencies: { type: array, items: { $ref: "#/components/schemas/StockXirrCurrency" } }
          holdings: { type: array, items: { $ref: "#/components/schemas/StockXirrHolding" } }
  ```

* [ ] **Regenerate.**

  ```bash
  cd backend && go generate -tags tools ./...
  ```

  Expected: `api/models.gen.go` gains `StockXirrCurrency`, `StockXirrHolding`,
  `StockXirrView`; `api/server.gen.go` gains `GetStockXirr` and
  `AdminGetUserStockXirr` (the build fails until Task 4 implements them).

### Task 2: Shared price warm-up

**Files:** `backend/internal/services/portfolio.go`

The new service needs the same concurrent cache warm-up; extracting it keeps
one implementation (CLAUDE.md reuse rule). `PortfolioService` delegates, so
its callers and tests are unchanged.

* [ ] **Modify `backend/internal/services/portfolio.go`.** Split the method into a delegate and a package function.

  Current:

  ```go
  func (s *PortfolioService) prefetchPrices(ctx context.Context, holdings []domain.Holding) {
      ctx, span := tracer.Start(ctx, "PortfolioService.prefetchPrices")
      defer span.End()
  ```

  Replace with:

  ```go
  func (s *PortfolioService) prefetchPrices(ctx context.Context, holdings []domain.Holding) {
      prefetchPrices(ctx, s.priceService, holdings)
  }

  // prefetchPrices is the shared cache warm-up behind PortfolioService and
  // StockXirrService: up to 8 concurrent fetches, one per unique symbol.
  func prefetchPrices(ctx context.Context, fetcher PriceFetcher, holdings []domain.Holding) {
      ctx, span := tracer.Start(ctx, "prefetchPrices")
      defer span.End()
  ```

* [ ] **Modify `backend/internal/services/portfolio.go`.** The body now reads the fetcher parameter.

  Current:

  ```go
              _, _, _ = s.priceService.GetPrice(gctx, symbol)
  ```

  Replace with:

  ```go
              _, _, _ = fetcher.GetPrice(gctx, symbol)
  ```

### Task 3: XIRR service

**Files:** `backend/internal/services/stock_xirr.go`, `backend/internal/services/stock_xirr_test.go`

Write the tests first. They pin the arithmetic with hand-checkable numbers
(₹1,000 → ₹1,100 in 365 days is exactly 10%) and the timing property the
owner asked about: the same prices give a higher rate when more money went
in before the rise.

* [ ] **Create `backend/internal/services/stock_xirr_test.go`.** Pure tests; no database.

  ```go
  package services

  import (
      "math"
      "testing"
      "time"

      "go.mongodb.org/mongo-driver/bson/primitive"

      "portfolio-dashboard/api"
      "portfolio-dashboard/internal/domain"
  )

  func calendarDay(year int, month time.Month, dayOfMonth int) time.Time {
      return time.Date(year, month, dayOfMonth, 0, 0, 0, 0, time.UTC)
  }

  func calendarDayPtr(year int, month time.Month, dayOfMonth int) *time.Time {
      date := calendarDay(year, month, dayOfMonth)
      return &date
  }

  func assertRate(t *testing.T, label string, got *float64, want float64) {
      t.Helper()
      if got == nil {
          t.Fatalf("%s xirr = nil, want %.4f", label, want)
      }
      if math.Abs(*got-want) > 1e-6 {
          t.Errorf("%s xirr = %.6f, want %.6f", label, *got, want)
      }
  }

  func holdingResult(t *testing.T, view api.StockXirrView, holdingId primitive.ObjectID) api.StockXirrHolding {
      t.Helper()
      for _, holding := range view.Holdings {
          if holding.HoldingId == holdingId.Hex() {
              return holding
          }
      }
      t.Fatalf("holding %s missing from view", holdingId.Hex())
      return api.StockXirrHolding{}
  }

  func TestLedgerFlow_SignsAndDates(t *testing.T) {
      cases := []struct {
          name        string
          txn         domain.Transaction
          wantAmount  float64
          wantDate    time.Time
          wantUndated bool
          wantCash    bool
      }{
          {"buy pays out", domain.Transaction{Type: domain.TxnBuy, Date: calendarDay(2025, 3, 1), Amount: 500}, -500, calendarDay(2025, 3, 1), false, true},
          {"sell pays in", domain.Transaction{Type: domain.TxnSell, Date: calendarDay(2025, 3, 2), Amount: 700}, 700, calendarDay(2025, 3, 2), false, true},
          {"dividend pays in", domain.Transaction{Type: domain.TxnDividend, Date: calendarDay(2025, 3, 3), Amount: 40}, 40, calendarDay(2025, 3, 3), false, true},
          {"dated opening uses its opening date", domain.Transaction{
              Type: domain.TxnOpening, Date: calendarDay(2026, 6, 1), OpeningDate: calendarDayPtr(2024, 1, 15), Amount: 900,
          }, -900, calendarDay(2024, 1, 15), false, true},
          {"undated opening falls back to the ordering date", domain.Transaction{
              Type: domain.TxnOpening, Date: calendarDay(2026, 6, 1), Amount: 900,
          }, -900, calendarDay(2026, 6, 1), true, true},
          {"split moves no cash", domain.Transaction{Type: domain.TxnSplit, Date: calendarDay(2025, 1, 1), Ratio: 2}, 0, time.Time{}, false, false},
          {"bonus moves no cash", domain.Transaction{Type: domain.TxnBonus, Date: calendarDay(2025, 1, 1), Ratio: 2}, 0, time.Time{}, false, false},
          {"merger moves no cash", domain.Transaction{Type: domain.TxnMerger, Date: calendarDay(2025, 1, 1)}, 0, time.Time{}, false, false},
      }
      for _, tc := range cases {
          t.Run(tc.name, func(t *testing.T) {
              flow, undated, isCash := ledgerFlow(tc.txn)
              if isCash != tc.wantCash || undated != tc.wantUndated {
                  t.Fatalf("cash=%v undated=%v, want cash=%v undated=%v", isCash, undated, tc.wantCash, tc.wantUndated)
              }
              if !tc.wantCash {
                  return
              }
              if flow.Amount != tc.wantAmount || !flow.Date.Equal(tc.wantDate) {
                  t.Errorf("flow = %v on %s, want %v on %s", flow.Amount, flow.Date, tc.wantAmount, tc.wantDate)
              }
          })
      }
  }

  // ₹1,000 that is worth ₹1,100 exactly 365 days later is a 10% XIRR.
  func TestBuildStockXirr_HeldPosition(t *testing.T) {
      holdingId := primitive.NewObjectID()
      holdings := []domain.Holding{{ID: holdingId, Symbol: "TCS.NS", Currency: "INR", StocksOwned: 10}}
      txns := []domain.Transaction{{HoldingID: holdingId, Type: domain.TxnOpening, Date: calendarDay(2026, 6, 1), OpeningDate: calendarDayPtr(2025, 1, 1), Amount: 1000}}

      view := buildStockXirr(holdings, txns, map[primitive.ObjectID]float64{holdingId: 1100}, calendarDay(2026, 1, 1))

      holding := holdingResult(t, view, holdingId)
      assertRate(t, "holding", holding.Xirr, 0.10)
      if holding.UndatedOpening {
          t.Error("undated_opening = true for a dated opening")
      }
      if holding.Since == nil || !holding.Since.Equal(calendarDay(2025, 1, 1)) {
          t.Errorf("since = %v, want 2025-01-01", holding.Since)
      }
      if len(view.Currencies) != 1 || view.Currencies[0].Currency != "INR" {
          t.Fatalf("currencies = %+v, want one INR bucket", view.Currencies)
      }
      assertRate(t, "INR", view.Currencies[0].Xirr, 0.10)
      if !view.AsOf.Equal(calendarDay(2026, 1, 1)) {
          t.Errorf("as_of = %s, want 2026-01-01", view.AsOf)
      }
  }

  // A sold-out holding has no terminal value: its rate comes from the
  // realised cash alone. ₹1,000 → ₹1,210 over two years is 10% a year.
  func TestBuildStockXirr_SoldOutUsesRealisedCash(t *testing.T) {
      holdingId := primitive.NewObjectID()
      holdings := []domain.Holding{{ID: holdingId, Symbol: "INFY.NS", Currency: "INR"}}
      txns := []domain.Transaction{
          {HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2023, 1, 1), Amount: 1000},
          {HoldingID: holdingId, Type: domain.TxnSell, Date: calendarDay(2025, 1, 1), Amount: 1210},
      }

      view := buildStockXirr(holdings, txns, nil, calendarDay(2026, 11, 11))

      // 2023-01-01 → 2025-01-01 is 731 days (2024 is a leap year), ACT/365.
      assertRate(t, "holding", holdingResult(t, view, holdingId).Xirr, math.Pow(1.21, 365.0/731)-1)
  }

  // Dividends count as money received, so they raise the rate.
  func TestBuildStockXirr_DividendsRaiseTheRate(t *testing.T) {
      holdingId := primitive.NewObjectID()
      holdings := []domain.Holding{{ID: holdingId, Symbol: "ITC.NS", Currency: "INR", StocksOwned: 1}}
      buy := domain.Transaction{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 1000}
      values := map[primitive.ObjectID]float64{holdingId: 1000}

      withoutDividend := buildStockXirr(holdings, []domain.Transaction{buy}, values, calendarDay(2026, 1, 1))
      withDividend := buildStockXirr(holdings, []domain.Transaction{buy,
          {HoldingID: holdingId, Type: domain.TxnDividend, Date: calendarDay(2026, 1, 1), Amount: 100},
      }, values, calendarDay(2026, 1, 1))

      assertRate(t, "no dividend", holdingResult(t, withoutDividend, holdingId).Xirr, 0)
      assertRate(t, "with dividend", holdingResult(t, withDividend, holdingId).Xirr, 0.10)
  }

  // The currency bucket pools every holding in that currency; EUR stays
  // apart, a split moves no cash, and the INR bucket comes first.
  func TestBuildStockXirr_CurrencyBuckets(t *testing.T) {
      tcs, infy, sap := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
      holdings := []domain.Holding{
          {ID: sap, Symbol: "SAP.DE", Currency: "EUR", StocksOwned: 1},
          {ID: tcs, Symbol: "TCS.NS", Currency: "INR", StocksOwned: 1},
          {ID: infy, Symbol: "INFY.NS", Currency: "", StocksOwned: 1}, // empty currency is INR
      }
      txns := []domain.Transaction{
          {HoldingID: tcs, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 600},
          {HoldingID: tcs, Type: domain.TxnSplit, Date: calendarDay(2025, 6, 1), Ratio: 2},
          {HoldingID: infy, Type: domain.TxnOpening, Date: calendarDay(2025, 1, 1), Amount: 400},
          {HoldingID: sap, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 100},
      }
      values := map[primitive.ObjectID]float64{tcs: 700, infy: 400, sap: 95}

      view := buildStockXirr(holdings, txns, values, calendarDay(2026, 1, 1))

      if len(view.Currencies) != 2 || view.Currencies[0].Currency != "INR" || view.Currencies[1].Currency != "EUR" {
          t.Fatalf("currencies = %+v, want INR then EUR", view.Currencies)
      }
      assertRate(t, "INR", view.Currencies[0].Xirr, 0.10) // (700+400) ÷ (600+400)
      assertRate(t, "EUR", view.Currencies[1].Xirr, -0.05)
      if view.Currencies[0].UndatedOpenings != 1 {
          t.Errorf("INR undated_openings = %d, want 1", view.Currencies[0].UndatedOpenings)
      }
      if !holdingResult(t, view, infy).UndatedOpening {
          t.Error("INFY undated_opening = false, want true")
      }
  }

  // XIRR is money-weighted: the same prices give a better rate when more
  // money went in before the rise. Here ₹1,000 is added either just before
  // or just after the price doubles.
  func TestBuildStockXirr_RewardsGoodTiming(t *testing.T) {
      holdingId := primitive.NewObjectID()
      holdings := []domain.Holding{{ID: holdingId, Symbol: "X.NS", Currency: "INR", StocksOwned: 1}}
      first := domain.Transaction{HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 1000}
      today := calendarDay(2026, 1, 1)

      // Early: the second ₹1,000 buys before the doubling, so it doubles too.
      early := buildStockXirr(holdings, []domain.Transaction{first,
          {HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 2, 1), Amount: 1000},
      }, map[primitive.ObjectID]float64{holdingId: 4000}, today)
      // Late: the second ₹1,000 buys after the doubling and stays flat.
      late := buildStockXirr(holdings, []domain.Transaction{first,
          {HoldingID: holdingId, Type: domain.TxnBuy, Date: calendarDay(2025, 12, 1), Amount: 1000},
      }, map[primitive.ObjectID]float64{holdingId: 3000}, today)

      earlyRate := holdingResult(t, early, holdingId).Xirr
      lateRate := holdingResult(t, late, holdingId).Xirr
      if earlyRate == nil || lateRate == nil || *earlyRate <= *lateRate {
          t.Fatalf("early = %v, late = %v; want early > late", earlyRate, lateRate)
      }
  }

  // Holdings outside the INR/EUR buckets are left out, events of an unknown
  // holding are ignored, and a holding with no cash flows has no rate.
  func TestBuildStockXirr_SkipsWhatCannotBeMeasured(t *testing.T) {
      usd, empty := primitive.NewObjectID(), primitive.NewObjectID()
      holdings := []domain.Holding{
          {ID: usd, Symbol: "AAPL", Currency: "USD", StocksOwned: 1},
          {ID: empty, Symbol: "NEW.NS", Currency: "INR"},
      }
      txns := []domain.Transaction{
          {HoldingID: usd, Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 100},
          {HoldingID: primitive.NewObjectID(), Type: domain.TxnBuy, Date: calendarDay(2025, 1, 1), Amount: 999},
      }

      view := buildStockXirr(holdings, txns, map[primitive.ObjectID]float64{usd: 120}, calendarDay(2026, 1, 1))

      if len(view.Holdings) != 1 || view.Holdings[0].HoldingId != empty.Hex() {
          t.Fatalf("holdings = %+v, want only the INR holding", view.Holdings)
      }
      if view.Holdings[0].Xirr != nil || view.Holdings[0].Since != nil {
          t.Errorf("empty holding = %+v, want no rate and no since", view.Holdings[0])
      }
      if len(view.Currencies) != 1 || view.Currencies[0].Xirr != nil {
          t.Errorf("currencies = %+v, want one INR bucket with no rate", view.Currencies)
      }
  }
  ```

* [ ] **Verify the tests fail.**

  ```bash
  cd backend && go test ./internal/services -run 'StockXirr|LedgerFlow'
  ```

  Expected: build failure, `undefined: ledgerFlow` / `undefined: buildStockXirr`.

The service keeps I/O (holdings, ledger, quotes) in `View` and the maths in
the pure `buildStockXirr`. A failed quote values the position at 0, exactly as
`Summary` does, so the rate agrees with the Current Value card.

* [ ] **Create `backend/internal/services/stock_xirr.go`.** Service, flow mapping and pure builder.

  ```go
  package services

  import (
      "context"
      "time"

      openapi_types "github.com/oapi-codegen/runtime/types"
      "go.mongodb.org/mongo-driver/bson/primitive"
      "go.uber.org/zap"

      "portfolio-dashboard/api"
      "portfolio-dashboard/internal/domain"
      "portfolio-dashboard/internal/logging"
      "portfolio-dashboard/internal/persistence"
  )

  // StockXirrService computes the money-weighted annual return (XIRR) of the
  // stock ledger, per currency and per holding (PRD-012 / DD-012). It reads
  // the ledger as cash flows — buys and openings out, sells and dividends in —
  // and closes each series with today's market value.
  type StockXirrService struct {
      holdings     *persistence.HoldingStore
      transactions *persistence.TransactionStore
      prices       PriceFetcher
      logger       *zap.Logger
      // Today lets tests pin the IST day the terminal value is dated on.
      Today func() time.Time
  }

  // NewStockXirrService wires a StockXirrService.
  func NewStockXirrService(holdings *persistence.HoldingStore, transactions *persistence.TransactionStore, prices PriceFetcher, logger *zap.Logger) *StockXirrService {
      return &StockXirrService{holdings: holdings, transactions: transactions, prices: prices, logger: logger, Today: istToday}
  }

  func (s *StockXirrService) log(ctx context.Context) *zap.Logger {
      return logging.FromContextOr(ctx, s.logger)
  }

  // View returns the XIRR view of userId's stock portfolio.
  func (s *StockXirrService) View(ctx context.Context, userId primitive.ObjectID) (_ api.StockXirrView, retErr error) {
      ctx, span := tracer.Start(ctx, "StockXirrService.View")
      defer endSpan(span, &retErr)
      logger := s.log(ctx)

      holdings, err := s.holdings.ListByUser(ctx, userId)
      if err != nil {
          return api.StockXirrView{}, err
      }
      txns, err := s.transactions.ListByUser(ctx, userId)
      if err != nil {
          return api.StockXirrView{}, err
      }

      active := make([]domain.Holding, 0, len(holdings))
      for _, holding := range holdings {
          if holding.StocksOwned > 0 && holding.Symbol != "" {
              active = append(active, holding)
          }
      }
      prefetchPrices(ctx, s.prices, active)
      // A failed quote values the position at 0, exactly as Summary does, so
      // the XIRR agrees with the Current Value card beside it.
      marketValues := make(map[primitive.ObjectID]float64, len(active))
      for _, holding := range active {
          price, _, priceErr := s.prices.GetPrice(ctx, holding.Symbol)
          if priceErr != nil || price <= 0 {
              logger.Warn("stock xirr: quote unavailable, valuing at 0",
                  zap.String("symbol", holding.Symbol), zap.Error(priceErr))
              continue
          }
          marketValues[holding.ID] = holding.StocksOwned * price
      }
      return buildStockXirr(holdings, txns, marketValues, s.Today()), nil
  }

  // ledgerFlow maps one ledger event to its cash flow from the investor's
  // side: money paid in (opening, buy) is negative, money received (sell,
  // dividend) positive. Splits, bonuses and mergers move no cash. An opening
  // is dated on its user-set OpeningDate when there is one; undated reports
  // that it fell back to the ledger's ordering date.
  func ledgerFlow(txn domain.Transaction) (flow cashFlow, undated bool, ok bool) {
      switch txn.Type {
      case domain.TxnOpening:
          if txn.OpeningDate != nil {
              return cashFlow{Date: dateOnly(*txn.OpeningDate), Amount: -txn.Amount}, false, true
          }
          return cashFlow{Date: dateOnly(txn.Date), Amount: -txn.Amount}, true, true
      case domain.TxnBuy:
          return cashFlow{Date: dateOnly(txn.Date), Amount: -txn.Amount}, false, true
      case domain.TxnSell, domain.TxnDividend:
          return cashFlow{Date: dateOnly(txn.Date), Amount: txn.Amount}, false, true
      }
      return cashFlow{}, false, false
  }

  // flowSeries collects one series' flows plus what the UI flags about it.
  type flowSeries struct {
      flows    []cashFlow
      undated  int
      earliest *time.Time
  }

  func (series *flowSeries) add(flow cashFlow) {
      series.flows = append(series.flows, flow)
      if series.earliest == nil || flow.Date.Before(*series.earliest) {
          date := flow.Date
          series.earliest = &date
      }
  }

  // rate is the series' XIRR closed by a terminal value on today; a zero
  // terminal (sold out, or a dead quote) adds no flow, so a sold-out series
  // is measured on its realised cash alone.
  func (series *flowSeries) rate(terminal float64, today time.Time) *float64 {
      flows := series.flows
      if terminal > 0 {
          flows = append(append([]cashFlow(nil), flows...), cashFlow{Date: today, Amount: terminal})
      }
      if rate, ok := xirr(flows); ok {
          return &rate
      }
      return nil
  }

  func (series *flowSeries) since() *openapi_types.Date {
      if series.earliest == nil {
          return nil
      }
      return &openapi_types.Date{Time: *series.earliest}
  }

  // buildStockXirr derives the per-holding and per-currency XIRR from the
  // holdings, their ledger and today's market value per holding. Pure —
  // pinned by unit tests. Holdings in a currency outside CurrencyOf's buckets
  // are left out, as the snapshot job leaves them out; events of a holding
  // not in the list are ignored.
  func buildStockXirr(holdings []domain.Holding, txns []domain.Transaction, marketValues map[primitive.ObjectID]float64, today time.Time) api.StockXirrView {
      txnsByHolding := make(map[primitive.ObjectID][]domain.Transaction, len(holdings))
      for _, txn := range txns {
          txnsByHolding[txn.HoldingID] = append(txnsByHolding[txn.HoldingID], txn)
      }

      byCurrency := map[string]*flowSeries{}
      currencyValue := map[string]float64{}
      view := api.StockXirrView{
          AsOf:       openapi_types.Date{Time: today},
          Currencies: []api.StockXirrCurrency{},
          Holdings:   make([]api.StockXirrHolding, 0, len(holdings)),
      }
      for _, holding := range holdings {
          currency, ok := CurrencyOf(holding)
          if !ok {
              continue
          }
          bucket := byCurrency[currency]
          if bucket == nil {
              bucket = &flowSeries{}
              byCurrency[currency] = bucket
          }
          own := &flowSeries{}
          for _, txn := range txnsByHolding[holding.ID] {
              flow, undated, isCash := ledgerFlow(txn)
              if !isCash {
                  continue
              }
              own.add(flow)
              bucket.add(flow)
              if undated {
                  own.undated++
                  bucket.undated++
              }
          }
          currencyValue[currency] += marketValues[holding.ID]
          view.Holdings = append(view.Holdings, api.StockXirrHolding{
              HoldingId:      holding.ID.Hex(),
              Xirr:           own.rate(marketValues[holding.ID], today),
              Since:          own.since(),
              UndatedOpening: own.undated > 0,
          })
      }

      // CurrencyOf only yields AllCurrencies, so walking it covers every bucket
      // in the dashboard's order (INR, then EUR).
      for _, currency := range domain.AllCurrencies {
          bucket := byCurrency[currency]
          if bucket == nil {
              continue
          }
          view.Currencies = append(view.Currencies, api.StockXirrCurrency{
              Currency:        api.StockXirrCurrencyCurrency(currency),
              Xirr:            bucket.rate(currencyValue[currency], today),
              Since:           bucket.since(),
              UndatedOpenings: bucket.undated,
          })
      }
      return view
  }
  ```

* [ ] **Verify.**

  ```bash
  cd backend && go test ./internal/services -run 'StockXirr|LedgerFlow' -v
  ```

  Expected: `TestLedgerFlow_SignsAndDates`, `TestBuildStockXirr_HeldPosition`,
  `_SoldOutUsesRealisedCash`, `_DividendsRaiseTheRate`, `_CurrencyBuckets`,
  `_RewardsGoodTiming`, `_SkipsWhatCannotBeMeasured` all `PASS`.

### Task 4: Handlers, wiring, tier

**Files:** `backend/internal/controllers/xirr.go`, `backend/internal/controllers/xirr_test.go`,
`backend/internal/controllers/controllers.go`, `backend/internal/httpserver/auth.go`

Handlers stay thin: resolve the owner (caller, or a region-checked target via
`loadTargetUser`) and delegate. Tests pin the scoping rules.

* [ ] **Create `backend/internal/controllers/xirr_test.go`.** Caller scoping, act-as target scoping, out-of-region 404.

  ```go
  package controllers

  import (
      "testing"
      "time"

      "go.mongodb.org/mongo-driver/bson"
      "go.mongodb.org/mongo-driver/bson/primitive"
      "go.mongodb.org/mongo-driver/mongo/integration/mtest"

      "portfolio-dashboard/api"
      "portfolio-dashboard/internal/domain"
  )

  // xirrMockResponses queues the two reads View issues, in order: the owner's
  // holdings, then their ledger. One TCS position bought a year ago for
  // ₹10,000, now 10 × ₹1,100.
  func xirrMockResponses(mt *mtest.T, ownerId primitive.ObjectID) {
      holdingId := primitive.NewObjectID()
      mt.AddMockResponses(
          mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
              {Key: "_id", Value: holdingId}, {Key: "user_id", Value: ownerId}, {Key: "script", Value: "TCS"},
              {Key: "symbol", Value: "TCS.NS"}, {Key: "currency", Value: "INR"}, {Key: "stocks_owned", Value: 10.0},
          }),
          mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, bson.D{
              {Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: ownerId},
              {Key: "holding_id", Value: holdingId}, {Key: "type", Value: "buy"},
              {Key: "date", Value: time.Now().AddDate(-1, 0, 0)}, {Key: "quantity", Value: 10.0}, {Key: "amount", Value: 10000.0},
          }),
      )
  }

  // The caller's own view reads only the caller's holdings and returns a
  // positive rate for a position that gained.
  func TestGetStockXirr_ScopedToCaller(t *testing.T) {
      mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
      mt.Run("own portfolio", func(mt *mtest.T) {
          caller := regionalAdmin("india")
          xirrMockResponses(mt, caller.ID)
          handler := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{"TCS.NS": 1100}})

          response, err := handler.GetStockXirr(userCtx(caller), api.GetStockXirrRequestObject{})
          if err != nil {
              t.Fatalf("GetStockXirr: %v", err)
          }
          view, ok := response.(api.GetStockXirr200JSONResponse)
          if !ok {
              t.Fatalf("response = %T, want 200", response)
          }
          if got := findFilter(t, mt).Lookup("user_id").ObjectID(); got != caller.ID {
              t.Errorf("holdings user_id = %s, want caller %s", got.Hex(), caller.ID.Hex())
          }
          if len(view.Currencies) != 1 || view.Currencies[0].Xirr == nil || *view.Currencies[0].Xirr <= 0 {
              t.Fatalf("currencies = %+v, want one INR bucket with a positive rate", view.Currencies)
          }
      })
  }

  // Act-as reads the target's portfolio, not the admin's.
  func TestAdminGetUserStockXirr_InRegionReadsTarget(t *testing.T) {
      mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
      mt.Run("india target, india admin", func(mt *mtest.T) {
          targetId := primitive.NewObjectID()
          target := userDocument(t, targetId, "bob", "irrelevant1", domain.RoleUser, "india", nil)
          mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
          xirrMockResponses(mt, targetId)
          handler := newIntegrationHandler(mt, &mockPriceFetcher{prices: map[string]float64{"TCS.NS": 1100}})

          response, err := handler.AdminGetUserStockXirr(userCtx(regionalAdmin("india")), api.AdminGetUserStockXirrRequestObject{Id: targetId.Hex()})
          if err != nil {
              t.Fatalf("AdminGetUserStockXirr: %v", err)
          }
          if _, ok := response.(api.AdminGetUserStockXirr200JSONResponse); !ok {
              t.Fatalf("response = %T, want 200", response)
          }
          var holdingsFilter bson.Raw
          for _, event := range mt.GetAllStartedEvents() {
              if event.CommandName == "find" && event.Command.Lookup("find").StringValue() == "holdings" {
                  holdingsFilter = event.Command.Lookup("filter").Document()
              }
          }
          if holdingsFilter == nil {
              t.Fatal("no holdings find issued")
          }
          if got := holdingsFilter.Lookup("user_id").ObjectID(); got != targetId {
              t.Errorf("holdings user_id = %s, want target %s", got.Hex(), targetId.Hex())
          }
      })
  }

  // Act-as is region-scoped: out-of-region reads as 404.
  func TestAdminGetUserStockXirr_OutOfRegion404(t *testing.T) {
      mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
      mt.Run("europe target, india admin", func(mt *mtest.T) {
          target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
          mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
          handler := newIntegrationHandler(mt, &mockPriceFetcher{})

          response, err := handler.AdminGetUserStockXirr(userCtx(regionalAdmin("india")), api.AdminGetUserStockXirrRequestObject{Id: primitive.NewObjectID().Hex()})
          if err != nil {
              t.Fatalf("AdminGetUserStockXirr: %v", err)
          }
          if _, ok := response.(api.AdminGetUserStockXirr404JSONResponse); !ok {
              t.Fatalf("response = %T, want 404", response)
          }
      })
  }
  ```

* [ ] **Create `backend/internal/controllers/xirr.go`.** Own and act-as handlers.

  ```go
  package controllers

  import (
      "context"

      "portfolio-dashboard/api"
  )

  // GetStockXirr is the caller's own stock XIRR view (PRD-012).
  func (h *Controller) GetStockXirr(ctx context.Context, _ api.GetStockXirrRequestObject) (api.GetStockXirrResponseObject, error) {
      currentUserId, err := currentUserID(ctx)
      if err != nil {
          return nil, err
      }
      view, err := h.stockXirr.View(ctx, currentUserId)
      if err != nil {
          return nil, err
      }
      return api.GetStockXirr200JSONResponse(view), nil
  }

  // AdminGetUserStockXirr is the act-as view of a target user's stock XIRR;
  // region scope is enforced by loadTargetUser like every act-as read.
  func (h *Controller) AdminGetUserStockXirr(ctx context.Context, request api.AdminGetUserStockXirrRequestObject) (api.AdminGetUserStockXirrResponseObject, error) {
      caller, err := adminCaller(ctx)
      if err != nil {
          return nil, err
      }
      target, found, err := h.loadTargetUser(ctx, caller, request.Id)
      if err != nil {
          return nil, err
      }
      if !found {
          return api.AdminGetUserStockXirr404JSONResponse{NotFoundJSONResponse: notFoundUser()}, nil
      }
      view, err := h.stockXirr.View(ctx, target.ID)
      if err != nil {
          return nil, err
      }
      return api.AdminGetUserStockXirr200JSONResponse(view), nil
  }
  ```

* [ ] **Modify `backend/internal/controllers/controllers.go`.** Add the service field.

  Current:

  ```go
      portfolio    *services.PortfolioService
  ```

  Replace with:

  ```go
      portfolio    *services.PortfolioService
      stockXirr    *services.StockXirrService
  ```

* [ ] **Modify `backend/internal/controllers/controllers.go`.** Wire it in `newWithDeps`.

  Current:

  ```go
          portfolio:    services.NewPortfolioService(store.Holdings, store.Snapshots, priceService, logger),
  ```

  Replace with:

  ```go
          portfolio:    services.NewPortfolioService(store.Holdings, store.Snapshots, priceService, logger),
          stockXirr:    services.NewStockXirrService(store.Holdings, store.Transactions, priceService, logger),
  ```

* [ ] **Modify `backend/internal/httpserver/auth.go`.** `TestAuthGate_TierTableMatchesGeneratedRoutes` requires every admin route to declare a tier.

  Current:

  ```go
      "GET /api/admin/users/:id/summary":                           tierAdmin,
  ```

  Replace with:

  ```go
      "GET /api/admin/users/:id/summary":                           tierAdmin,
      "GET /api/admin/users/:id/xirr":                              tierAdmin,
  ```

* [ ] **Verify.**

  ```bash
  cd backend && gofmt -l internal && go test ./...
  ```

  Expected: no gofmt output; every package `ok` (including `TestGetStockXirr_ScopedToCaller`,
  `TestAdminGetUserStockXirr_InRegionReadsTarget`, `TestAdminGetUserStockXirr_OutOfRegion404`
  and the tier-table test).

* [ ] **Manual check** (backend running on :8080, dev user with holdings):

  ```bash
  curl -s -c /tmp/pd.cookies http://localhost:8080/api/auth/login \
    -H 'Content-Type: application/json' -H 'X-Requested-With: portfolio-dashboard' \
    -d '{"username":"admin","password":"<dev password>"}'
  # 200, session cookie set
  curl -s -b /tmp/pd.cookies http://localhost:8080/api/xirr
  # 200: {"as_of":"YYYY-MM-DD","currencies":[{"currency":"INR","xirr":0.1…}],"holdings":[…]}
  curl -s -o /dev/null -w '%{http_code}\n' -b /tmp/pd.cookies \
    http://localhost:8080/api/admin/users/<userId>/xirr
  # 200 in region (or as super admin); 404 for an out-of-region target
  ```

* [ ] **Commit and open slice 1.**

  ```bash
  git add backend/api/specs backend/api/models.gen.go backend/api/server.gen.go \
    backend/internal/services/portfolio.go backend/internal/services/stock_xirr.go \
    backend/internal/services/stock_xirr_test.go backend/internal/controllers/xirr.go \
    backend/internal/controllers/xirr_test.go backend/internal/controllers/controllers.go \
    backend/internal/httpserver/auth.go
  git commit -m "✨ Serve stock XIRR per currency and holding"
  ```

### Task 5: Frontend contract

**Files:** `frontend/src/lib/api/schema.gen.ts`, `frontend/src/types.ts`,
`frontend/src/features/admin/actAsRouting.ts`, `frontend/src/features/admin/actAsRouting.test.ts`,
`frontend/src/lib/api/client.ts`

Act-as routing lives in `actAsRouting.ts` so the rule is tested in one place.

* [ ] **Regenerate.**

  ```bash
  cd frontend && npm run gen:api
  ```

  Expected: `schema.gen.ts` gains the three `StockXirr*` schemas and both operations.

* [ ] **Modify `frontend/src/types.ts`.** Export the generated types.

  Current:

  ```ts
  export type TradeImportResult = Schemas['TradeImportResult']
  ```

  Replace with:

  ```ts
  export type TradeImportResult = Schemas['TradeImportResult']
  export type StockXirrView = Schemas['StockXirrView']
  export type StockXirrHolding = Schemas['StockXirrHolding']
  export type StockXirrCurrency = Schemas['StockXirrCurrency']
  ```

* [ ] **Modify `frontend/src/features/admin/actAsRouting.ts`.** Add the path helper above `transactionsPath`.

  Current:

  ```ts
  /** Portfolio-wide ledger listing
  ```

  Replace with:

  ```ts
  /** Stock XIRR per currency and holding (PD-055); read-only in act-as. */
  export function xirrPath(userId?: string): string {
    const id = actingAs(userId)
    return id ? `/admin/users/${id}/xirr` : '/xirr'
  }

  /** Portfolio-wide ledger listing
  ```

* [ ] **Modify `frontend/src/features/admin/actAsRouting.test.ts`.** Import it in the test.

  Current:

  ```ts
    transactionsPath,
  } from './actAsRouting'
  ```

  Replace with:

  ```ts
    transactionsPath,
    xirrPath,
  } from './actAsRouting'
  ```

* [ ] **Modify `frontend/src/features/admin/actAsRouting.test.ts`.** Own path.

  Current:

  ```ts
      expect(transactionsPath()).toBe('/transactions')
    })
  ```

  Replace with:

  ```ts
      expect(transactionsPath()).toBe('/transactions')
      expect(xirrPath()).toBe('/xirr')
    })
  ```

* [ ] **Modify `frontend/src/features/admin/actAsRouting.test.ts`.** Act-as path.

  Current:

  ```ts
      expect(transactionsPath('u9')).toBe('/admin/users/u9/transactions')
    })
  ```

  Replace with:

  ```ts
      expect(transactionsPath('u9')).toBe('/admin/users/u9/transactions')
      expect(xirrPath('u9')).toBe('/admin/users/u9/xirr')
    })
  ```

* [ ] **Modify `frontend/src/lib/api/client.ts`.** Import the type.

  Current:

  ```ts
    Summary,
    Transaction,
  ```

  Replace with:

  ```ts
    StockXirrView,
    Summary,
    Transaction,
  ```

* [ ] **Modify `frontend/src/lib/api/client.ts`.** Import the path.

  Current:

  ```ts
    summaryPath,
    transactionPath,
  ```

  Replace with:

  ```ts
    summaryPath,
    transactionPath,
    xirrPath,
  ```

* [ ] **Modify `frontend/src/lib/api/client.ts`.** Add the call.

  Current:

  ```ts
    getSummary:     (userId?: string) =>
      request<Summary>('GET', summaryPath(userId)),
  ```

  Replace with:

  ```ts
    getSummary:     (userId?: string) =>
      request<Summary>('GET', summaryPath(userId)),
    getStockXirr:   (userId?: string) =>
      request<StockXirrView>('GET', xirrPath(userId)),
  ```

### Task 6: Shared rate formatter

**Files:** `frontend/src/lib/rate.ts`, `frontend/src/lib/rate.test.ts`,
`frontend/src/features/gold/GoldMetricsPanel.tsx`

The gold panel already formats XIRR; moving its `pct` to `lib/rate.ts` gives
stocks and gold one formatter. Touching the panel puts it under
`lint:changed`, so its single-letter names are renamed in the same step.

* [ ] **Create `frontend/src/lib/rate.test.ts`.** Formatter and tone tests.

  ```ts
  import { describe, expect, it } from 'vitest'
  import { formatRate, rateTone } from './rate'

  describe('formatRate', () => {
    it('renders a fraction as a percentage and a missing rate as a dash', () => {
      expect(formatRate(0.1234)).toBe('12.34%')
      expect(formatRate(-0.0432)).toBe('-4.32%')
      expect(formatRate(null)).toBe('—')
      expect(formatRate(undefined)).toBe('—')
    })
  })

  describe('rateTone', () => {
    it('maps the sign to the table tone classes', () => {
      expect(rateTone(0.1)).toBe('pos')
      expect(rateTone(-0.1)).toBe('neg')
      expect(rateTone(0)).toBe('neutral')
      expect(rateTone(null)).toBe('')
    })
  })
  ```

* [ ] **Create `frontend/src/lib/rate.ts`.** The shared formatter.

  ```ts
  // formatRate renders an annualized rate sent as a fraction (0.12 = 12%) as a
  // percentage, "—" when the backend found no rate. Shared by the gold
  // metrics panel and the stock XIRR (PD-055) so both read alike.
  export const formatRate = (rate: number | null | undefined) =>
    rate == null ? '—' : `${(rate * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

  // rateTone is the pos/neg/neutral class for a rate; '' when there is none.
  export const rateTone = (rate: number | null | undefined): 'pos' | 'neg' | 'neutral' | '' =>
    rate == null ? '' : rate > 0 ? 'pos' : rate < 0 ? 'neg' : 'neutral'
  ```

* [ ] **Replace `frontend/src/features/gold/GoldMetricsPanel.tsx`.** Current:

  ```tsx
  import type { CSSProperties } from 'react'
  import type { GoldMetrics } from '../../lib/api/client'

  interface Props {
    metrics: GoldMetrics | null
  }

  const rupee = (v: number | null | undefined) => {
    if (v == null) return '—'
    const sign = v < 0 ? '-' : ''
    return `${sign}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  const grams = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`

  const pct = (v: number | null | undefined) =>
    v == null ? '—' : `${(v * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

  // The PRD-003 §6 metrics table, live from the ledger + latest price +
  // GOLDBEES. Null (unknowable) values render "—", never fake zeros.
  export default function GoldMetricsPanel({ metrics: m }: Props) {
    const rows: Array<{ label: string; value: string; signed?: number | null }> = [
      { label: 'Total amount invested', value: rupee(m?.invested) },
      { label: 'Current value', value: rupee(m?.current) },
      { label: 'Total gold', value: grams(m?.grams) },
      { label: 'Avg cost per gram', value: rupee(m?.avg_per_gram) },
      { label: 'P/L from GOLDBEES (excl. tax)', value: rupee(m?.bees_pl), signed: m?.bees_pl },
      { label: 'Nett P/L excluding bees', value: rupee(m?.nett_ex_bees), signed: m?.nett_ex_bees },
      { label: 'Nett P/L including bees', value: rupee(m?.nett_in_bees), signed: m?.nett_in_bees },
      { label: 'XIRR of physical', value: pct(m?.xirr), signed: m?.xirr },
    ]

    const cell: CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }
    const labelCell: CSSProperties = { ...cell, color: 'var(--text-secondary)' }
    const valueCell: CSSProperties = { ...cell, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }
    const colorFor = (v: number | null | undefined) =>
      v == null || v === 0 ? undefined : v > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'

    return (
      <section aria-label="Gold metrics" style={{
        marginTop: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>Metrics</h2>
        <table id={"metricsTable"} style={{ width: '100%', margin: '0 auto', borderCollapse: 'collapse', maxWidth: 520 }}>
          <tbody>
            {rows.map(r => (
              <tr key={r.label}>
                <td style={labelCell}>{r.label}</td>
                <td style={{ ...valueCell, color: colorFor(r.signed) }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }
  ```

  Replace with:

  ```tsx
  import type { CSSProperties } from 'react'
  import type { GoldMetrics } from '../../lib/api/client'
  import { formatRate } from '../../lib/rate'

  interface Props {
    metrics: GoldMetrics | null
  }

  const rupee = (amount: number | null | undefined) => {
    if (amount == null) return '—'
    const sign = amount < 0 ? '-' : ''
    return `${sign}₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  }

  const grams = (weight: number | null | undefined) =>
    weight == null ? '—' : `${weight.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`

  // The PRD-003 §6 metrics table, live from the ledger + latest price +
  // GOLDBEES. Null (unknowable) values render "—", never fake zeros.
  export default function GoldMetricsPanel({ metrics }: Props) {
    const rows: Array<{ label: string; value: string; signed?: number | null }> = [
      { label: 'Total amount invested', value: rupee(metrics?.invested) },
      { label: 'Current value', value: rupee(metrics?.current) },
      { label: 'Total gold', value: grams(metrics?.grams) },
      { label: 'Avg cost per gram', value: rupee(metrics?.avg_per_gram) },
      { label: 'P/L from GOLDBEES (excl. tax)', value: rupee(metrics?.bees_pl), signed: metrics?.bees_pl },
      { label: 'Nett P/L excluding bees', value: rupee(metrics?.nett_ex_bees), signed: metrics?.nett_ex_bees },
      { label: 'Nett P/L including bees', value: rupee(metrics?.nett_in_bees), signed: metrics?.nett_in_bees },
      { label: 'XIRR of physical', value: formatRate(metrics?.xirr), signed: metrics?.xirr },
    ]

    const cell: CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }
    const labelCell: CSSProperties = { ...cell, color: 'var(--text-secondary)' }
    const valueCell: CSSProperties = { ...cell, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }
    const colorFor = (value: number | null | undefined) =>
      value == null || value === 0 ? undefined : value > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'

    return (
      <section aria-label="Gold metrics" style={{
        marginTop: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 20,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>Metrics</h2>
        <table id={"metricsTable"} style={{ width: '100%', margin: '0 auto', borderCollapse: 'collapse', maxWidth: 520 }}>
          <tbody>
            {rows.map(row => (
              <tr key={row.label}>
                <td style={labelCell}>{row.label}</td>
                <td style={{ ...valueCell, color: colorFor(row.signed) }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )
  }
  ```

### Task 7: XIRR lookups

**Files:** `frontend/src/features/holdings/stockXirr.ts`, `frontend/src/features/holdings/stockXirr.test.ts`

Pure helpers keep the components declarative: index by id/currency, and one
place that words the two caveats (under a year, undated opening).

* [ ] **Create `frontend/src/features/holdings/stockXirr.test.ts`.** Lookup and caveat tests.

  ```ts
  import { describe, expect, it } from 'vitest'
  import { indexXirr, underAYear, xirrNote } from './stockXirr'

  describe('indexXirr', () => {
    it('keys holdings by id and buckets by currency', () => {
      const index = indexXirr({
        as_of: '2026-11-11',
        currencies: [
          { currency: 'INR', xirr: 0.12, since: '2024-01-01', undated_openings: 0 },
          { currency: 'EUR', xirr: null, since: null, undated_openings: 0 },
        ],
        holdings: [{ holding_id: 'h1', xirr: -0.05, since: '2025-01-01', undated_opening: true }],
      })
      expect(index?.asOf).toBe('2026-11-11')
      expect(index?.byHolding.h1?.xirr).toBe(-0.05)
      expect(index?.byCurrency.INR?.xirr).toBe(0.12)
      expect(index?.byCurrency.EUR?.xirr).toBeNull()
    })

    it('is null without a view', () => {
      expect(indexXirr(null)).toBeNull()
    })
  })

  describe('underAYear', () => {
    it('flags windows shorter than 365 days only', () => {
      expect(underAYear('2026-11-01', '2026-11-11')).toBe(true)
      expect(underAYear('2025-11-12', '2026-11-11')).toBe(true)
      expect(underAYear('2025-11-11', '2026-11-11')).toBe(false)
      expect(underAYear(null, '2026-11-11')).toBe(false)
    })
  })

  describe('xirrNote', () => {
    it('explains each caveat, and nothing when there is none', () => {
      expect(xirrNote('2026-11-01', '2026-11-11', false)).toMatch(/less than a year/)
      expect(xirrNote('2020-01-01', '2026-11-11', true)).toMatch(/no date set/)
      expect(xirrNote('2020-01-01', '2026-11-11', false)).toBe('')
    })
  })
  ```

* [ ] **Create `frontend/src/features/holdings/stockXirr.ts`.** The helpers.

  ```ts
  // Pure lookups over the /xirr view (PD-055): the dashboard reads one rate
  // per currency group and one per holding row.
  import type { StockXirrCurrency, StockXirrHolding, StockXirrView } from '../../types'

  export interface XirrIndex {
    asOf: string
    byHolding: Record<string, StockXirrHolding>
    byCurrency: Partial<Record<StockXirrCurrency['currency'], StockXirrCurrency>>
  }

  export function indexXirr(view: StockXirrView | null): XirrIndex | null {
    if (!view) return null
    const byHolding: XirrIndex['byHolding'] = {}
    for (const holding of view.holdings) byHolding[holding.holding_id] = holding
    const byCurrency: XirrIndex['byCurrency'] = {}
    for (const bucket of view.currencies) byCurrency[bucket.currency] = bucket
    return { asOf: view.as_of, byHolding, byCurrency }
  }

  const DAY_MS = 24 * 60 * 60 * 1000

  // underAYear flags a rate measured over less than 365 days: annualizing a
  // short window magnifies it (+6% in ten days reads as hundreds of percent).
  export function underAYear(since: string | null | undefined, asOf: string): boolean {
    if (!since) return false
    return (Date.parse(asOf) - Date.parse(since)) / DAY_MS < 365
  }

  // xirrNote is the hover text explaining a rate's caveats, '' when none.
  export function xirrNote(since: string | null | undefined, asOf: string, undated: boolean): string {
    const notes: string[] = []
    if (underAYear(since, asOf)) notes.push('Measured over less than a year — the annualised rate swings widely.')
    if (undated) notes.push('An opening balance has no date set; it is counted from when it was recorded.')
    return notes.join(' ')
  }
  ```

### Task 8: Fetch in the data hook

**Files:** `frontend/src/features/holdings/useHoldings.ts`, `frontend/src/features/holdings/useHoldings.test.tsx`

The rates ride along with `/prices` but carry their own `catch`, so a failing
`/xirr` never blocks prices. Act-as follows `userId` like every other read.

* [ ] **Replace `frontend/src/features/holdings/useHoldings.ts`.** Current:

  ```ts
  import { useCallback, useEffect, useState } from 'react'
  import { api } from '../../lib/api/client'
  import type { Holding, Summary } from '../../types'
  import {
    attachPreviousClosePrices,
    type HoldingWithPreviousClose,
  } from './dashboardPriceMovement'

  // When userId is set, the hook targets the admin act-as endpoints
  // (/api/admin/users/:id/...) instead of the caller's own portfolio.
  export function useHoldings(userId?: string) {
    const [holdings, setHoldings] = useState<Holding[]>([])
    const [enriched, setEnriched] = useState<HoldingWithPreviousClose[]>([])
    const [summary, setSummary] = useState<Summary | null>(null)
    const [loadingHoldings, setLoadingHoldings] = useState(false)
    const [loadingPrices, setLoadingPrices] = useState(false)
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

    const fetchHoldings = useCallback(async () => {
      setLoadingHoldings(true)
      try {
        const data = await api.listHoldings(userId)
        setHoldings(data)
      } catch (e) {
        console.error('listHoldings:', e)
      } finally {
        setLoadingHoldings(false)
      }
    }, [userId])

    const fetchPrices = useCallback(async () => {
      setLoadingPrices(true)
      try {
        // Two reads in flight: /prices feeds the per-row table; /summary is
        // the authoritative totals + daily-change vs previous close. The
        // summary is fetched here (not synthesised from the rows) so the
        // change_value / per_currency fields the backend computes survive.
        const [prices, summary] = await Promise.all([
          api.getPrices(userId),
          api.getSummary(userId),
        ])
        let enrichedHoldings: HoldingWithPreviousClose[] = prices.holdings || []

        if (!userId && summary.previous_close_date) {
          try {
            const history = await api.listHistory(summary.previous_close_date, summary.previous_close_date)
            const previousRow = history.rows.find(r => r.date === summary.previous_close_date) ?? history.rows[0]
            enrichedHoldings = attachPreviousClosePrices(enrichedHoldings, previousRow?.holdings)
          } catch (e) {
            console.error('previousCloseHistory:', e)
          }
        }

        setEnriched(enrichedHoldings)
        setSummary(summary)
        setLastRefresh(new Date())
      } catch (e) {
        console.error('fetchPrices:', e)
      } finally {
        setLoadingPrices(false)
      }
    }, [userId])

    const refresh = useCallback(async () => {
      await Promise.all([fetchHoldings(), fetchPrices()])
    }, [fetchHoldings, fetchPrices])

    const remove = useCallback(
      async (id: string) => {
        await api.deleteHolding(id, userId)
        await refresh()
      },
      [refresh, userId],
    )

    useEffect(() => {
      void refresh()
    }, [refresh])

    return {
      holdings,
      enriched,
      summary,
      loadingHoldings,
      loadingPrices,
      lastRefresh,
      refresh,
      fetchPrices,
      remove,
    }
  }
  ```

  Replace with:

  ```ts
  import { useCallback, useEffect, useState } from 'react'
  import { api } from '../../lib/api/client'
  import type { Holding, Summary } from '../../types'
  import {
    attachPreviousClosePrices,
    type HoldingWithPreviousClose,
  } from './dashboardPriceMovement'
  import { indexXirr, type XirrIndex } from './stockXirr'

  // When userId is set, the hook targets the admin act-as endpoints
  // (/api/admin/users/:id/...) instead of the caller's own portfolio.
  export function useHoldings(userId?: string) {
    const [holdings, setHoldings] = useState<Holding[]>([])
    const [enriched, setEnriched] = useState<HoldingWithPreviousClose[]>([])
    const [summary, setSummary] = useState<Summary | null>(null)
    const [xirr, setXirr] = useState<XirrIndex | null>(null)
    const [loadingHoldings, setLoadingHoldings] = useState(false)
    const [loadingPrices, setLoadingPrices] = useState(false)
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

    const fetchHoldings = useCallback(async () => {
      setLoadingHoldings(true)
      try {
        const data = await api.listHoldings(userId)
        setHoldings(data)
      } catch (e) {
        console.error('listHoldings:', e)
      } finally {
        setLoadingHoldings(false)
      }
    }, [userId])

    const fetchPrices = useCallback(async () => {
      setLoadingPrices(true)
      try {
        // Two reads in flight: /prices feeds the per-row table; /summary is
        // the authoritative totals + daily-change vs previous close. The
        // summary is fetched here (not synthesised from the rows) so the
        // change_value / per_currency fields the backend computes survive.
        // /xirr rides along but is optional: its failure only hides the rates.
        const xirrRequest = api.getStockXirr(userId).catch(e => {
          console.error('getStockXirr:', e)
          return null
        })
        const [prices, summary, xirrView] = await Promise.all([
          api.getPrices(userId),
          api.getSummary(userId),
          xirrRequest,
        ])
        let enrichedHoldings: HoldingWithPreviousClose[] = prices.holdings || []

        if (!userId && summary.previous_close_date) {
          try {
            const history = await api.listHistory(summary.previous_close_date, summary.previous_close_date)
            const previousRow = history.rows.find(row => row.date === summary.previous_close_date) ?? history.rows[0]
            enrichedHoldings = attachPreviousClosePrices(enrichedHoldings, previousRow?.holdings)
          } catch (e) {
            console.error('previousCloseHistory:', e)
          }
        }

        setEnriched(enrichedHoldings)
        setSummary(summary)
        setXirr(indexXirr(xirrView))
        setLastRefresh(new Date())
      } catch (e) {
        console.error('fetchPrices:', e)
      } finally {
        setLoadingPrices(false)
      }
    }, [userId])

    const refresh = useCallback(async () => {
      await Promise.all([fetchHoldings(), fetchPrices()])
    }, [fetchHoldings, fetchPrices])

    const remove = useCallback(
      async (id: string) => {
        await api.deleteHolding(id, userId)
        await refresh()
      },
      [refresh, userId],
    )

    useEffect(() => {
      void refresh()
    }, [refresh])

    return {
      holdings,
      enriched,
      summary,
      xirr,
      loadingHoldings,
      loadingPrices,
      lastRefresh,
      refresh,
      fetchPrices,
      remove,
    }
  }
  ```

* [ ] **Replace `frontend/src/features/holdings/useHoldings.test.tsx`** (adds the `getStockXirr` mock, its default, and two tests). Replace with:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest'
  import { renderHook, waitFor } from '@testing-library/react'
  import { useHoldings } from './useHoldings'
  import type { HoldingWithPrice } from '../../types'

  const mockApi = vi.hoisted(() => ({
    listHoldings: vi.fn(),
    getPrices: vi.fn(),
    getSummary: vi.fn(),
    getStockXirr: vi.fn(),
    listHistory: vi.fn(),
    deleteHolding: vi.fn(),
  }))

  vi.mock('../../lib/api/client', () => ({ api: mockApi }))

  const liveHolding = (overrides: Partial<HoldingWithPrice> = {}): HoldingWithPrice => ({
    id: '1',
    script: 'TCS',
    symbol: 'TCS.NS',
    exchange: 'NSE',
    type: 'stock',
    stocks_owned: 1,
    avg_cost_price: 100,
    realized_pnl: 0,
    currency: 'INR',
    current_price: 120,
    current_value: 120,
    ...overrides,
  } as HoldingWithPrice)

  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.listHoldings.mockResolvedValue([])
    mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding()] })
    mockApi.getSummary.mockResolvedValue({ previous_close_date: '2026-06-24' })
    mockApi.getStockXirr.mockResolvedValue({
      as_of: '2026-11-11',
      currencies: [{ currency: 'INR', xirr: 0.12, since: '2024-01-01', undated_openings: 0 }],
      holdings: [{ holding_id: '1', xirr: 0.2, since: '2024-01-01', undated_opening: false }],
    })
    mockApi.listHistory.mockResolvedValue({
      currency: 'INR',
      rows: [{
        date: '2026-06-24',
        regions: {},
        totals: { invested_total: 0, current_total: 0, pnl_pct: null },
        holdings: [{
          symbol: 'TCS.NS',
          script: 'TCS',
          currency: 'INR',
          quantity: 1,
          close_price: 100,
        }],
      }],
    })
  })

  describe('useHoldings', () => {
    it('enriches live holdings with previous close prices from the snapshot row', async () => {
      const { result } = renderHook(() => useHoldings())

      await waitFor(() => {
        expect(result.current.enriched[0]?.previous_close_price).toBe(100)
      })

      expect(mockApi.listHistory).toHaveBeenCalledWith('2026-06-24', '2026-06-24')
    })

    it('keeps the Yahoo close when the snapshot has the holding too, the snapshot winning', async () => {
      mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding({ previous_close_price: 90 })] })
      const { result } = renderHook(() => useHoldings())

      await waitFor(() => {
        expect(result.current.enriched[0]?.previous_close_price).toBe(100)
      })
    })

    it('keeps the Yahoo close when there is no snapshot yet', async () => {
      mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding({ previous_close_price: 90 })] })
      mockApi.getSummary.mockResolvedValue({})
      const { result } = renderHook(() => useHoldings())

      await waitFor(() => {
        expect(result.current.enriched[0]?.previous_close_price).toBe(90)
      })
      expect(mockApi.listHistory).not.toHaveBeenCalled()
    })

    it('keeps the Yahoo close in admin act-as mode', async () => {
      mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding({ previous_close_price: 90 })] })
      const { result } = renderHook(() => useHoldings('user-1'))

      await waitFor(() => {
        expect(result.current.enriched[0]?.previous_close_price).toBe(90)
      })
    })

    it('does not fetch own-history snapshots in admin act-as mode', async () => {
      const { result } = renderHook(() => useHoldings('user-1'))

      await waitFor(() => {
        expect(result.current.enriched[0]?.current_price).toBe(120)
      })

      expect(mockApi.getPrices).toHaveBeenCalledWith('user-1')
      expect(mockApi.listHistory).not.toHaveBeenCalled()
    })

    it('indexes the stock XIRR by holding and currency, act-as included', async () => {
      const { result } = renderHook(() => useHoldings('user-1'))

      await waitFor(() => {
        expect(result.current.xirr?.byHolding['1']?.xirr).toBe(0.2)
      })
      expect(result.current.xirr?.byCurrency.INR?.xirr).toBe(0.12)
      expect(mockApi.getStockXirr).toHaveBeenCalledWith('user-1')
    })

    it('still loads prices when /xirr fails, with no rates', async () => {
      mockApi.getStockXirr.mockRejectedValue(new Error('boom'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result } = renderHook(() => useHoldings())

      await waitFor(() => {
        expect(result.current.enriched[0]?.current_price).toBe(120)
      })
      expect(result.current.xirr).toBeNull()
    })
  })
  ```

### Task 9: Show the rates

**Files:** `frontend/src/features/holdings/HoldingsTable.tsx`,
`frontend/src/features/holdings/HoldingsByCurrency.tsx`,
`frontend/src/features/holdings/HoldingsByCurrency.test.tsx`,
`frontend/src/features/dashboard/DashboardPage.tsx`

Per the visual spec: an XIRR stat in each currency strip, an XIRR column per
row, and the currency rate in TOTAL. A starred value carries its caveat on
hover. The empty-state `colSpan` becomes 12 to match the header.

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** Imports.

  Current:

  ```tsx
  import { currencySymbol } from '../../lib/currency'
  ```

  Replace with:

  ```tsx
  import { currencySymbol } from '../../lib/currency'
  import { formatRate, rateTone } from '../../lib/rate'
  import { xirrNote, type XirrIndex } from './stockXirr'
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** New prop and the shared cell.

  Current:

  ```tsx
    /** Currency the TOTAL row is formatted in; rows format per-holding. */
    nativeCurrency?: 'INR' | 'EUR'
  }
  ```

  Replace with:

  ```tsx
    /** Currency the TOTAL row is formatted in; rows format per-holding. */
    nativeCurrency?: 'INR' | 'EUR'
    /** Stock XIRR (PD-055); null while loading or when /xirr failed. */
    xirr?: XirrIndex | null
  }

  // XirrCell shows a rate with an asterisk when it carries a caveat, the
  // caveat itself on hover.
  function XirrCell({ rate, note, className }: { rate: number | null | undefined; note: string; className?: string }) {
    return (
      <TD className={`mono ${rateTone(rate)}${className ? ` ${className}` : ''}`}>
        <span title={note || undefined}>{formatRate(rate)}{note && rate != null ? '*' : ''}</span>
      </TD>
    )
  }
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** Destructure it.

  Current:

  ```tsx
  export default function HoldingsTable({ holdings, loading, onEdit, onDelete, onTransactions, view: viewProp, nativeCurrency }: HoldingsTableProps) {
  ```

  Replace with:

  ```tsx
  export default function HoldingsTable({ holdings, loading, onEdit, onDelete, onTransactions, view: viewProp, nativeCurrency, xirr }: HoldingsTableProps) {
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** The table's currency bucket.

  Current:

  ```tsx
    const TOTAL_MONEY = nativeCurrency === 'EUR' ? EUR : INR
  ```

  Replace with:

  ```tsx
    const TOTAL_MONEY = nativeCurrency === 'EUR' ? EUR : INR
    const currencyXirr = xirr?.byCurrency[nativeCurrency ?? 'INR']
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** Header.

  Current:

  ```tsx
              <TH className="col-hide-sm">Dividends</TH>
              <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
  ```

  Replace with:

  ```tsx
              <TH className="col-hide-sm">Dividends</TH>
              <TH>XIRR</TH>
              <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** Empty-state span.

  Current:

  ```tsx
                <td colSpan={10} style
  ```

  Replace with:

  ```tsx
                <td colSpan={12} style
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** Row lookup.

  Current:

  ```tsx
              const MONEY = holding.currency === 'EUR' ? EUR : INR
  ```

  Replace with:

  ```tsx
              const MONEY = holding.currency === 'EUR' ? EUR : INR
              const holdingXirr = holding.id ? xirr?.byHolding[holding.id] : undefined
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** Row cell after Dividends.

  Current:

  ```tsx
                    {(holding.total_dividends ?? 0) > 0 ? MONEY(holding.total_dividends) : '—'}
                  </TD>
  ```

  Replace with:

  ```tsx
                    {(holding.total_dividends ?? 0) > 0 ? MONEY(holding.total_dividends) : '—'}
                  </TD>

                  {/* XIRR — money-weighted annual return from the ledger (PD-055) */}
                  <XirrCell rate={holdingXirr?.xirr}
                    note={holdingXirr && xirr ? xirrNote(holdingXirr.since, xirr.asOf, holdingXirr.undated_opening) : ''} />
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsTable.tsx`.** TOTAL cell.

  Current:

  ```tsx
                <TD className={`mono col-hide-sm ${totals.dividends > 0 ? 'pos' : 'neutral'}`}>{TOTAL_MONEY(totals.dividends)}</TD>
                <td style={{ borderBottom: '1px solid var(--border)' }} />
  ```

  Replace with:

  ```tsx
                <TD className={`mono col-hide-sm ${totals.dividends > 0 ? 'pos' : 'neutral'}`}>{TOTAL_MONEY(totals.dividends)}</TD>
                <XirrCell rate={currencyXirr?.xirr}
                  note={currencyXirr && xirr ? xirrNote(currencyXirr.since, xirr.asOf, currencyXirr.undated_openings > 0) : ''} />
                <td style={{ borderBottom: '1px solid var(--border)' }} />
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** Imports.

  Current:

  ```tsx
  import { computeGroupDayChange, type GroupDayChange, type HoldingWithPreviousClose } from './dashboardPriceMovement'
  ```

  Replace with:

  ```tsx
  import { computeGroupDayChange, type GroupDayChange, type HoldingWithPreviousClose } from './dashboardPriceMovement'
  import { xirrNote, type XirrIndex } from './stockXirr'
  import { formatRate, rateTone } from '../../lib/rate'
  import { formatDate } from '../../lib/formDates'
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** Prop.

  Current:

  ```tsx
    onTransactions?: (holding: HoldingWithPrice) => void
  }
  ```

  Replace with:

  ```tsx
    onTransactions?: (holding: HoldingWithPrice) => void
    /** Stock XIRR (PD-055); null while loading or when /xirr failed. */
    xirr?: XirrIndex | null
  }
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** Destructure.

  Current:

  ```tsx
  export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions }: Props) {
  ```

  Replace with:

  ```tsx
  export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions, xirr }: Props) {
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** Group bucket.

  Current:

  ```tsx
          const dayChange = computeGroupDayChange(group.holdings)
  ```

  Replace with:

  ```tsx
          const dayChange = computeGroupDayChange(group.holdings)
          // OTHER groups have no XIRR bucket (the backend skips them).
          const bucket = group.currency === 'OTHER' ? undefined : xirr?.byCurrency[group.currency]
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** The stat.

  Current:

  ```tsx
                {dayChange !== null && <ChangeStat dayChange={dayChange} symbol={nativeSym} />}
              </div>
  ```

  Replace with:

  ```tsx
                {dayChange !== null && <ChangeStat dayChange={dayChange} symbol={nativeSym} />}
                {bucket && xirr && (
                  <Stat label="XIRR" primary={formatRate(bucket.xirr)}
                    secondary={bucket.since ? `since ${formatDate(bucket.since)}` : 'no flows'}
                    tone={rateTone(bucket.xirr)}
                    title={xirrNote(bucket.since, xirr.asOf, bucket.undated_openings > 0)} />
                )}
              </div>
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** Pass to the table.

  Current:

  ```tsx
                nativeCurrency={group.currency === 'EUR' ? 'EUR' : 'INR'}
              />
  ```

  Replace with:

  ```tsx
                nativeCurrency={group.currency === 'EUR' ? 'EUR' : 'INR'}
                xirr={xirr}
              />
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.tsx`.** `Stat` takes the rate tone and a hover note.

  Current:

  ```tsx
  function Stat({ label, primary, secondary, tone }: {
    label: string; primary: string; secondary: string; tone?: 'pos' | 'neg'
  }) {
    return (
      <div style={{ flex: '1 1 140px', minWidth: 120 }}>
  ```

  Replace with:

  ```tsx
  function Stat({ label, primary, secondary, tone, title }: {
    label: string; primary: string; secondary: string; tone?: ReturnType<typeof rateTone>; title?: string
  }) {
    return (
      <div style={{ flex: '1 1 140px', minWidth: 120 }} title={title || undefined}>
  ```

* [ ] **Modify `frontend/src/features/dashboard/DashboardPage.tsx`.** Take `xirr` from the hook.

  Current:

  ```tsx
      summary,
      loadingHoldings,
      loadingPrices,
      lastRefresh,
      refresh,
  ```

  Replace with:

  ```tsx
      summary,
      xirr,
      loadingHoldings,
      loadingPrices,
      lastRefresh,
      refresh,
  ```

* [ ] **Modify `frontend/src/features/dashboard/DashboardPage.tsx`.** Pass it down.

  Current:

  ```tsx
              onTransactions={actAsUserId ? undefined : (holding => setTxnModal(holding))}
            />
  ```

  Replace with:

  ```tsx
              onTransactions={actAsUserId ? undefined : (holding => setTxnModal(holding))}
              xirr={xirr}
            />
  ```

* [ ] **Modify `frontend/src/features/holdings/HoldingsByCurrency.test.tsx`.** Add `import { indexXirr } from './stockXirr'` after the `types` import, and replace the file's final `})` with:

  ```tsx
    it('shows each currency XIRR in its card and TOTAL row, and each holding XIRR in its row', () => {
      const xirr = indexXirr({
        as_of: '2026-11-11',
        currencies: [
          { currency: 'INR', xirr: 0.1234, since: '2023-04-01', undated_openings: 0 },
          { currency: 'EUR', xirr: -0.0432, since: '2026-10-01', undated_openings: 0 },
        ],
        holdings: [
          { holding_id: '1', xirr: 0.2, since: '2023-04-01', undated_opening: false },
          { holding_id: '2', xirr: -0.0432, since: '2026-10-01', undated_opening: false },
        ],
      })
      render(<HoldingsByCurrency
        holdings={[
          testHolding({ id: '1', script: 'TCS', currency: 'INR' }),
          testHolding({ id: '2', script: 'SAP', currency: 'EUR' }),
        ]}
        loading={false}
        onEdit={noop}
        onDelete={noop}
        xirr={xirr}
      />)

      const [inr, eur] = Array.from(document.querySelectorAll('section')) as HTMLElement[]
      expect(within(inr).getByText('XIRR', { selector: 'div' })).toBeInTheDocument()
      expect(within(inr).getByText('(since 01-04-2023)')).toBeInTheDocument()
      // The card and the TOTAL row both carry the INR bucket's rate.
      expect(within(inr).getAllByText('12.34%')).toHaveLength(2)
      const inrRow = within(inr).getByText('TCS').closest('tr') as HTMLElement
      expect(within(inrRow).getByText('20%').closest('td')).toHaveClass('pos')
      // Under a year: starred, with the caveat on hover.
      const eurRow = within(eur).getByText('SAP').closest('tr') as HTMLElement
      expect(within(eurRow).getByText('-4.32%*')).toHaveAttribute('title', expect.stringMatching(/less than a year/))
    })

    it('renders dashes for XIRR while the rates are unavailable', () => {
      render(<HoldingsByCurrency
        holdings={[testHolding({ id: '1', script: 'TCS', currency: 'INR' })]}
        loading={false}
        onEdit={noop}
        onDelete={noop}
        xirr={null}
      />)
      const section = document.querySelector('section') as HTMLElement
      expect(within(section).queryByText('XIRR', { selector: 'div' })).not.toBeInTheDocument()
      const row = within(section).getByText('TCS').closest('tr') as HTMLElement
      expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
    })
  })
  ```

* [ ] **Verify.**

  ```bash
  cd frontend && npx tsc --noEmit -p . && npx vitest run && npm run build && npm run lint:changed
  ```

  Expected: no type errors; all test files pass (546 tests at time of
  writing); build succeeds; `lint:changed` clean (run after committing so it
  sees the files).

* [ ] **Commit and open slice 2.**

  ```bash
  git add frontend/src/lib/api/schema.gen.ts frontend/src/types.ts \
    frontend/src/features/admin/actAsRouting.ts frontend/src/features/admin/actAsRouting.test.ts \
    frontend/src/lib/api/client.ts frontend/src/lib/rate.ts frontend/src/lib/rate.test.ts \
    frontend/src/features/gold/GoldMetricsPanel.tsx frontend/src/features/holdings/stockXirr.ts \
    frontend/src/features/holdings/stockXirr.test.ts frontend/src/features/holdings/useHoldings.ts \
    frontend/src/features/holdings/useHoldings.test.tsx frontend/src/features/holdings/HoldingsTable.tsx \
    frontend/src/features/holdings/HoldingsByCurrency.tsx \
    frontend/src/features/holdings/HoldingsByCurrency.test.tsx \
    frontend/src/features/dashboard/DashboardPage.tsx
  git commit -m "✨ Show stock XIRR on the dashboard"
  ```

### Task 10: End-to-end verification

**Files:** none (manual, against `make dev-db`, `make backend`, `make frontend`).

* [ ] **Held position.** Add a holding with a buy one year ago for ₹1,000.
  Expected: its XIRR cell ≈ (value ÷ 1,000 − 1); the INR strip shows the
  pooled rate "since" that date; TOTAL repeats it.
* [ ] **Timing.** On a copy, add a second buy before a known rise, then move
  it after. Expected: the earlier date gives the higher rate.
* [ ] **Sold out.** Sell the whole position. Expected: the row (under All/Nil)
  keeps a rate from realised cash; the strip still counts it.
* [ ] **Short window.** A holding first bought this month. Expected: starred
  value, hover reads "less than a year".
* [ ] **Undated opening.** Create a holding with an opening balance and skip
  the date prompt. Expected: starred, hover reads "no date set"; setting the
  date in the prompt removes the star after refresh.
* [ ] **Failure isolation.** Stop the backend route (or block `/api/xirr` in
  devtools). Expected: prices and totals load; XIRR stat hidden, cells "—".
* [ ] **Act-as.** As an admin, open a user in region. Expected: the user's
  rates; out-of-region target 404s.
* [ ] **Gold unchanged.** `/gold` metrics still show "XIRR of physical".

## Done

* PRD-012, DD-012, this plan and the visual spec merged.
* Slice 1: `/xirr` + act-as twin, tested.
* Slice 2: dashboard strip, column and TOTAL, tested.

Next: compare each currency's XIRR with a benchmark index XIRR over the same
flows (a "what if every rupee went into the Nifty" line), if the owner wants it.
