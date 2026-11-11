# DD-012: Stock XIRR

* **Status**: Accepted
* **Owner**: project owner
* **Implements**: [PRD-012](../prds/PRD-012-stock-xirr.md)
* **Rollout plan**: [PD-055](../plans/PD-055-stock-xirr.md)

## 1. Storage

None. Rates are derived on read from the transactions ledger and live
prices (derive, don't store), like the gold metrics (DD-003 §3).

## 2. API

`GET /xirr` (tag Holdings) and `GET /admin/users/{id}/xirr` (tag Admin,
`tierAdmin`, region-scoped by `loadTargetUser`) both return `StockXirrView`:

* `as_of` — the IST day the terminal value is dated on;
* `currencies[]` — `currency` (INR|EUR), `xirr` (fraction, nullable),
  `since` (earliest flow), `undated_openings` (count);
* `holdings[]` — `holding_id`, `xirr`, `since`, `undated_opening`.

A separate endpoint keeps `/summary` and `/prices` and their tests unchanged
and lets the dashboard treat the rates as optional.

## 3. Computation

`StockXirrService.View` lists the owner's holdings and ledger, prices the
held positions through the shared `prefetchPrices` warm-up (extracted from
`PortfolioService`) and the 5-minute cache, then calls the pure
`buildStockXirr`.

`ledgerFlow` maps events: opening and buy `−amount`, sell and dividend
`+amount`, split/bonus/merger no cash. An opening is dated on
`OpeningDate`, else its ordering `Date` (flagged undated). Each holding's
series and its currency bucket (`CurrencyOf`, so only INR/EUR) get the same
flows; the series closes with `+marketValue` on today when positive. The
existing gold `xirr()` (ACT/365, Newton–Raphson, bisection fallback)
solves each series; no rate when it cannot.

A failed quote values the position at 0, exactly as `Summary` does, so the
rate agrees with the Current Value card. Legacy `RealizedSeed` on openings
carries no date and is ignored.

## 4. Frontend

`api.getStockXirr(userId)` via `xirrPath` (act-as aware). `useHoldings`
fetches it beside prices with its own `catch`, indexes it (`indexXirr`) and
exposes `xirr`. `HoldingsByCurrency` adds an XIRR stat per group;
`HoldingsTable` adds an XIRR column and the bucket rate in TOTAL.
`formatRate` moves from the gold panel to `lib/rate.ts` and serves both.

## 5. Testing

Pure: flow mapping, a held position (10%), sold-out realised cash, dividend
effect, currency pooling and order, timing sensitivity, skipped
currencies/orphans. Handlers: caller scoping, act-as target scoping,
out-of-region 404, route tier table. Frontend: index/caveat helpers, the
formatter, hook wiring and failure isolation, rendered stat/column/TOTAL.

## 6. Risks

Short windows annualise into large numbers (starred, not hidden). Undated
openings shift the rate until dated (the dashboard already prompts). One
extra request per dashboard refresh, served from the price cache.
