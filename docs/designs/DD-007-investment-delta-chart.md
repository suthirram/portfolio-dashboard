# DD-007: Investment delta chart — technical design

* **Status**: Draft v2 (DD; v2 adds the live row and the in-year column check), owner decisions of 2026-11-02 ([PRD-007 §7](../prds/PRD-007-investment-delta-chart.md#7-owner-decisions-2026-11-02))
* **Owner**: project owner
* **Implements**: [PRD-007](../prds/PRD-007-investment-delta-chart.md)
* **Rollout plan**: [PD-050](../plans/PD-050-investment-delta-chart.md)
* **Visuals**: [PD-050 visual spec](../visuals/PD-050-investment-delta-chart.html) ([published](https://claude.ai/artifact/Q4prvDBoa4Woq55Nu4ndM3))

## 1. Approach: the History card's maths, twelve times

Each bar is the History card's investment delta for one month, so the chart
calls the card's own function rather than a second formula:

* The panel fetches the year with the existing
  `api.listHistory(from, to, true)`: `from` = 1 Jan, `to` = 31 Dec (both from
  `monthRange`), and `include_previous` adds the latest row before 1 Jan, so
  January has its baseline (PRD-006 §4).
* A pure `monthlyInvestment(rows, year, column)` in `historyShared.ts`
  returns twelve points. For month *m* it keeps the rows up to *m*'s last day
  and calls `periodPerformance(thoseRows, monthStart)`: that function already
  takes the latest row before the month as the opening and the last row as
  the closing, so the result's `moneyInvested` is the card's figure. The
  line value is the closing row's invested for the column.
* During the live window, before today's snapshot lands, the History card
  reads a tentative row built from live prices (`displayRows`). The panel
  appends the same row: History's live-row code moves from `HistoryPage`
  into a shared `useLiveHistoryRows` hook (§4), which both call, so the
  current month matches the card intraday too.
* A presentational `InvestmentDeltaChart` (Recharts `ComposedChart`: `Bar` +
  `Line`) draws the points; `InvestmentDeltaPanel` owns the open / year /
  column state and the fetch, and is rendered by `TransactionsPage` only
  when it is not in act-as.

No backend change: `/history` already returns what is needed, and the
act-as view is out of scope (PRD-007 §3).

## 2. Reuse

| Need | Existing code | Change |
|---|---|---|
| A month's investment delta | `periodPerformance` (historyShared, PD-049) | none; called once per month |
| Reading a column off a row (empty = 0) | `columnPosition` (historyShared, private) | exported, for the line value |
| Column list, labels, symbols | `PERFORMANCE_COLUMNS` (historyShared); `COLUMN_LABELS`, `COLUMN_SYMBOL` (PeriodPerformanceCard) | labels and symbols moved to historyShared as `PERFORMANCE_COLUMN_LABELS` / `PERFORMANCE_COLUMN_SYMBOL`; the card imports them |
| Month bounds | `monthRange` | none |
| Month names, first year | `MONTHS`, `MIN_YEAR` | none |
| Current year (IST trading day) | `tradingDateIST`, `yearMonth0` | none |
| Year of History rows + earlier row | `api.listHistory(from, to, true)` | none |
| Money format | `fmtCurrency`, `fmtAxisAmount`; the card's private `signedAmount` ("+₹18,826.38") | `signedAmount` moved to historyShared as `fmtSignedCurrency` for the tooltip; the card imports it |
| Chart look | `chartTooltipProps`, `REGION_COLOURS`, `GOLD_PALETTE` | none |
| Remembered panel state | the `CHARTS_ON_TOP_KEY` localStorage pattern (HistoryPage) | same pattern, own key `pd_txn_delta_open` |
| Today's live row (the boundary clock, eligibility, 5-min price cadence, gold overlay) | inline in `HistoryPage` (`buildLiveRow`, `buildLiveGoldOverlay`, `isLiveWindowOpen`, `msUntilNextLiveBoundary`) | moved unchanged into `useTradingClock` + `useLiveHistoryRows`; History and the panel call them |

## 3. `monthlyInvestment(rows, year, column)`

Pure; returns `MonthlyInvestment[]`, always twelve entries, Jan first:

```ts
interface MonthlyInvestment {
  month0: number        // 0 = Jan
  delta: number | null  // investment delta, 2 dp; null = no bar
  invested: number | null // closing invested; null = no line point
}
```

For each `month0`:

1. `{ from, to } = monthRange(year, month0)`; keep rows with
   `date <= to`.
2. No kept row dated on or after `from` → `{ delta: null, invested: null }`
   (a future month or a gap).
3. `invested` = `columnPosition(lastKeptRow, column).invested`.
4. `delta` = the `moneyInvested` of `periodPerformance(kept, from)`'s entry
   for `column`, or null when there is none (a single-row first month, or
   the column empty at both ends).

Consecutive months telescope: October's closing row is November's opening
row, so the year's bars add up to the change in invested over the year.

## 4. Components

`features/history/useLiveHistoryRows.ts` (moved from `HistoryPage`):

* `useTradingClock()` → `{ todayStr, liveWindowOpen }`, recomputed at each
  live-window boundary and trading-day roll-over.
* `useLiveHistoryRows(rows, { active, todayStr, liveWindowOpen, goldEnabled })`
  returns `rows` plus today's live row when all hold: `active` (History:
  the current month is shown; the panel: open on the current year with its
  rows loaded), no row dated today, and the window open. It fetches
  `/prices` (and `/gold/metrics` for gold users) and refreshes every
  5 minutes while the window is open; a failed fetch just means no live
  row. The render-time guard checks `active` too, so a stale row never
  shows after the caller leaves the range.

`features/transactions/InvestmentDeltaPanel.tsx`:

* Rendered in `<main>` straight after the filters section, above the
  subtotals and the table; the same `--bg-secondary` surface, border and
  `--radius` as the filters (owner, 2026-11-03; it was a sticky bottom dock).
* Collapsed: one full-width button, `aria-expanded="false"`, label
  "▼ Investment delta · ‹year›".
* Open: the same button (▲, `aria-expanded="true"`), then a toolbar (‹ year ›
  with `aria-label`s "Previous year" / "Next year", and the column switch as
  `aria-pressed` buttons), then the chart at 260 px.
* Opens: reads `pd_txn_delta_open` on mount; writes it on toggle (try/catch
  for private mode, like History).
* Fetches when open and on year change, with a `cancelled` flag so a late
  response for an earlier year is dropped.
* `theme` comes in as a prop, as on History.
* `refreshKey`: `TransactionsPage` bumps a `ledgerVersion` counter in the
  ledger editor's `onChanged`, next to the table's `refresh()`. The key is
  in the fetch effect's deps (an open panel reloads the year; the effect
  still returns early while collapsed) and is passed to
  `useLiveHistoryRows` (today's live row refetches `/prices`). The rows are
  held with the year they belong to, so a refresh keeps the chart on screen
  until the new rows land, while a year change shows the spinner.
* Column switch: a column is offered only when a row **dated inside the
  selected year** (the live row included) has money invested in it.
  `include_previous` returns the latest earlier row even for a year with
  no rows of its own; that baseline alone shows "No History rows for
  ‹year›". All rows, the baseline included, still go to
  `monthlyInvestment`, so January keeps its opening.

`features/transactions/InvestmentDeltaChart.tsx`:

* `ComposedChart` over the twelve points, `XAxis` = `MONTHS[month0]`.
* `Bar dataKey="delta" yAxisId="delta"` with a `Cell` per bar:
  `var(--green)` ≥ 0, `var(--red)` < 0; `ReferenceLine y={0}`.
* `Line dataKey="invested" yAxisId="invested"` on a right-hand axis,
  `connectNulls`, colour = the column's invested colour
  (`REGION_COLOURS[theme][column].invested`, `GOLD_PALETTE[theme].invested`).
* Tooltip and axis ticks through `fmtCurrency` / `fmtAxisAmount` with the
  column's symbol.

`TransactionsPage` renders `{!actAsUserId && <InvestmentDeltaPanel theme={theme} />}`
as the last child of `<main>`.

## 5. Lint convergence

`lint:changed` checks every file a PR touches. `TransactionsPage.tsx` holds
8 short names (`f`, `v`, `h` ×2, `t`, `c`, `s` ×2); a rename-only PR
(PD-050 Task 1) clears them first, as PD-049 did for History.

## 6. Testing

* `periodPerformance.test.ts` (beside the card's tests, sharing their
  `historyRow` fixture, which moves to `historyTestRows.ts` so the panel
  test reuses it too): the owner's September / October 2026 rows
  give October +18,826.38 and invested 8,98,847.70; September (one row, no
  earlier history) has a line point and no bar; November / December are
  null; months telescope; EUR opening from zero; Gold read from the overlay.
* `InvestmentDeltaPanel.test.tsx`: collapsed by default and no fetch;
  opening fetches 1 Jan → 31 Dec with `include_previous`; the state is
  remembered; ‹ refetches the previous year; › disabled on the current
  year; the column switch lists only invested columns; error and empty
  states; a response holding only the 31 Dec baseline row is an empty
  year; inside the live window, a position bought after yesterday's
  snapshot is in the current month's bar and line (the chart is stubbed to
  record the points the panel hands it).
* History's live-window page tests pass unchanged after the move: the
  proof the hook kept History's behaviour.
* `TransactionsPage.test.tsx`: the panel shows on the user's page and not in
  act-as.
* Bars themselves are not asserted: Recharts draws nothing at jsdom's zero
  size, so the maths is tested in the pure function.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A year of rows is a large payload (≈365 rows with per-stock lines) | fetched only when the panel is open, once per year change; the full-history chart already loads more |
| A late response overwrites a newer year | the effect's `cancelled` flag drops it |
| The panel adds `/prices` calls | only while open on the current year inside the live window, every 5 minutes, as History does; the prices are cached server-side for 5 minutes |
| Bad source data (e.g. placeholder gold prices) | the chart shows invested, not value, so placeholder prices do not affect it |
| The open panel pushes the table down | collapsed by default to one bar, and the state is remembered |
| A ledger edit leaves the chart stale | the `refreshKey` reload above; snapshot healing runs inside the mutation request, so the reload sees the healed rows |
