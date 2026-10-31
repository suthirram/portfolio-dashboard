# DD-006: Month performance card — technical design

* **Status**: Draft v1 (DD), owner decisions of 2026-10-31 ([PRD-006 §7](../prds/PRD-006-month-performance.md#7-owner-decisions-2026-10-31))
* **Owner**: project owner
* **Implements**: [PRD-006](../prds/PRD-006-month-performance.md)
* **Rollout plan**: [PD-049](../plans/PD-049-month-performance.md)
* **Visuals**: [PD-049 visual spec](../visuals/PD-049-month-performance.html) ([published](https://claude.ai/artifact/UFs22YQtmgsJYMcQXCoGkD))

## 1. Approach: frontend-only, computed from loaded rows

`HistoryPage` already fetches `monthRange(year, month)`, which starts one day
**before** the month so the first day's Daily volatlity has a prior row. That
extra row is the opening baseline PRD-006 §4 asks for. Every input
(per-currency `invested` / `current`, the `gold` overlay, today's tentative
live row) is already in `displayRows`. So:

* no API, spec, backend or snapshot change;
* one pure function in `historyShared.ts`, one presentational component,
  and one line of wiring in `HistoryPage`.

## 2. Reuse

| Need | Existing code | Change |
|---|---|---|
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
3. Opening = last kept row dated before `monthStart`, else the first kept row.
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

The ESLint `id-length` gate (#230) lints every file a PR changes. The feature
touches `historyShared.ts`, `HistoryPage.tsx` and `HistoryPage.page.test.tsx`,
which hold 61 legacy short names (33 / 22 / 6). They are renamed in a
preceding rename-only PR (PD-049 Task 1), so the feature PR's diff stays
readable and its lint step passes.

## 6. Testing

* `periodPerformance.test.ts`: the owner's October rows give the §3 table
  exactly; order independence; the first-row fallback; a column with < 2
  invested rows dropped; a sale at an unchanged price gives 0; a live
  closing row is flagged.
* `HistoryPage.page.test.tsx`: the card renders through the real page with
  the previous month's last row as opening; a single-row month shows no card.

## 7. Risks

| Risk | Mitigation |
|---|---|
| A gap leaves no row before the month | falls back to the month's first row; the header dates show which rows were used |
| Large sales skew the approximation | same approximation as Daily volatlity; footnoted as approximate |
| A manual History edit changes a baseline | intended: the card reads the rows exactly as the table shows them |
