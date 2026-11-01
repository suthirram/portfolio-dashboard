# DD-006: Month performance card — technical design

* **Status**: Draft v1 (DD), owner decisions of 2026-10-31 ([PRD-006 §7](../prds/PRD-006-month-performance.md#7-owner-decisions-2026-10-31))
* **Owner**: project owner
* **Implements**: [PRD-006](../prds/PRD-006-month-performance.md)
* **Rollout plan**: [PD-049](../plans/PD-049-month-performance.md)
* **Visuals**: [PD-049 visual spec](../visuals/PD-049-month-performance.html) ([published](https://claude.ai/artifact/UFs22YQtmgsJYMcQXCoGkD))

## 1. Approach: one backend flag, the rest computed in the page

Today `monthRange(year, month)` starts one calendar day before the month,
and `SnapshotStore.List` filters strictly to `[from, to]`. When that day has
no snapshot, no earlier row reaches the page: with rows on 29-09, 01-10 and
30-10, October would open on 01-10 and lose the 29-09 → 01-10 move (the same
gap leaves 01-10 without a Daily volatlity today).

So the baseline comes from the backend:

* `GET /history` gains an optional `include_previous` (default false).
  `HistoryService.List` then appends the latest row before `from` using the
  existing `SnapshotStore.LatestBefore`; `ErrNotFound` (no earlier history)
  appends nothing. The appended row passes through the same gold and
  dividend overlays as every other row, so gold's baseline is right too.
* The page requests the month's own bounds (`monthRange` stops reaching back
  a day) with `include_previous=true`. The table keeps showing one earlier
  row first, as today.
* Every other input (per-currency `invested` / `current`, the `gold`
  overlay, today's tentative live row) is already in `displayRows`: one pure
  function in `historyShared.ts`, one presentational component, one line of
  wiring in `HistoryPage`.

Other callers of the list (the dashboard's previous-close lookup, the
full-history chart) don't pass the flag and are unchanged.

## 2. Reuse

| Need | Existing code | Change |
|---|---|---|
| Latest row before a date | `SnapshotStore.LatestBefore` (snapshot job, previous-close summary) | none; called from `HistoryService.List` when asked |
| Snapshot → API row mapping | inline in `HistoryService.List` | extracted to `historyRowFromSnapshot`, shared by the range rows and the earlier row |
| P/L % with a zero-invested guard | `pnlPct` (historyShared) | none |
| Flow-adjusted return incl. the sale approximation | private `flowAdjustedDailyVolatility` (historyShared), behind Daily volatlity | exported and renamed `flowAdjustedReturnPct`, since it now serves a month as well as a day; its two callers updated |
| Currency buckets | `REGIONS` | none; the card iterates `[...REGIONS, 'GOLD']` |
| Date label | `formatDayMonth` (lib/formDates) | none |
| Column tints, direction tints | `REGION_TINTS`, `GOLD_TINT`, `PRICE_DIR_TINT` (historyShared) | none |
| Live row | `displayRows` (HistoryPage) | none; a `tentative` closing row is flagged `(live)` |

No logic is duplicated: the month figure is the same function as the daily
one, applied to a different pair of rows.

## 3. `periodPerformance(rows, monthStart)`

Pure; returns one `PeriodPerformance` per qualifying column, in
`PERFORMANCE_COLUMNS` order.

1. Sort rows oldest first (the API order is not relied on).
2. Per column, keep the rows with `invested > 0` there (`columnPosition`).
3. Opening = last kept row dated before `monthStart` (the server's
   `include_previous` row, however far back), else the first kept row,
   which only happens with no earlier history.
   Closing = last kept row. Skip the column if opening is missing or is the
   closing row.
4. `openingPnlPct` / `closingPnlPct` = `round2(pnlPct(...))`.
5. `pnlChangePp` = `round2(closingPnlPct − openingPnlPct)`, the difference
   **of the displayed values**. On the owner's gold column the unrounded
   difference is −6.7335 (shows −6.73), but the card reads 37.79 → 31.05,
   so it must say −6.74. The owner's example is binding.
6. `performancePct` = `round2(flowAdjustedReturnPct(openCur, closeCur,
   openInv, closeInv))`, or null when that returns null (a full sale).

Verified against the owner's sheet (PRD-006 §1):

| | Opening (30-09) inv / cur | Closing (30-10) inv / cur | Open P/L | Close P/L | Δ pp | Perf |
|---|---|---|---|---|---|---|
| INR | 8,80,021.32 / 10,86,274.39 | 8,98,847.70 / 11,18,139.13 | 23.44 | 24.40 | +0.96 | +1.20 |
| EUR | 7,064.13 / 8,459.51 | 7,540.05 / 8,722.36 | 19.75 | 15.68 | −4.07 | −2.52 |
| Gold | 7,16,420 / 9,87,120 | 7,16,420 / 9,38,880 | 37.79 | 31.05 | −6.74 | −4.89 |

## 4. `PeriodPerformanceCard`

New file `features/history/PeriodPerformanceCard.tsx`, presentational. It
takes `{ rows, monthStart, monthLabel }`, calls `periodPerformance`, and
returns `null` when the result is empty.

* A `<table aria-label="‹Mon YYYY› performance">`: a header row with the
  column labels (`🇮🇳 India`, `🇪🇺 Europe`, `🥇 Gold`) and their
  `dd-MM → dd-MM` dates, then four metric rows (`<th scope="row">`).
* Signs use U+2212 (−) like the owner's sheet; pp cells carry 🟢 / 🔴 / ⚪.
* Panel styling matches the chart panels (`--bg-secondary`, `--border`,
  radius 8), so all three themes inherit it with no new tokens.
* History's colour language, reused rather than invented: each column takes
  its currency group's tint from the month table (`REGION_TINTS` header and
  cell tints, `GOLD_TINT`), so the card reads as the summary of those
  columns; P/L change is a pill tinted with `PRICE_DIR_TINT` and coloured
  `--green` / `--red`; the performance row is the bottom line, set at 16 px
  bold in green or red under a 2 px rule. The card takes `theme` for the
  per-theme tints, as `HistoryTable` does.
* Fills the content width like the month table and chart panels:
  `width: 100%` with `table-layout: fixed`. The metric column takes 26 %
  and the value columns split the rest evenly, so one, two or three columns
  all span the card.
* Each currency column is its own rounded, bordered block with a 10 px gap
  (`border-collapse: separate`, `border-spacing: 10px 0`): a table inside
  the table. The title, column headers and values are centred; metric
  labels stay left-aligned so they read as row labels.
* `min-width: 580px` inside an `overflow-x: auto` wrapper, so a phone
  scrolls inside the card, not the page.

`HistoryPage` renders it once, before the table/charts block, so it stays on
top in either layout (`chartsOnTop`).

## 5. Lint convergence

The ESLint `id-length` gate (#230) lints every file a PR changes. The
frontend PR touches `historyShared.ts`, `HistoryPage.tsx`,
`HistoryPage.page.test.tsx`, `HistoryPage.test.tsx` and `client.ts`, which
hold 84 legacy short names (33 / 22 / 6 / 22 / 1). They are renamed in a
preceding rename-only PR (PD-049 Task 1), so the feature PR's diff stays
readable and its lint step passes.

## 6. Testing

* `TestHistoryService_List_IncludePrevious` (mtest): rows on 29-09, 01-10
  and 30-10 return 29-09 as the earlier row; no earlier history appends
  nothing; without the flag no lookup is made.
* `periodPerformance.test.ts`: the owner's October rows give the §3 table
  exactly; order independence; the first-row fallback; a column with < 2
  invested rows dropped; a sale at an unchanged price gives 0; a live
  closing row is flagged.
* `HistoryPage.page.test.tsx`: the page requests the month's bounds with
  `include_previous`; the card opens on a 29 May row when 31 May has none;
  a single-row month shows no card.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A gap before the month | the server returns the latest earlier row however far back; the header dates show which rows were used |
| No history before the month at all | opens on the month's first row (PRD-006 §4) |
| Large sales skew the approximation | same approximation as Daily volatlity; footnoted as approximate |
| A manual History edit changes a baseline | intended: the card reads the rows exactly as the table shows them |
