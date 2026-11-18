# PD-059 Wave 3a: Overall performance chart

* **Status:** In implementation (#342)
* **Owner:** Codex
* **Parent plan:** [PD-059 UI_2.0 rollout](PD-059-ui-2.md)
* **Product requirements:** [PRD-015 §4.2](../prds/PRD-015-ui-2.md)
* **Design decisions:** [PD-059 status board](PD-059-ui-2-status.md)

## 1. Goal

Build slice 10 as a standalone UI_2.0 `OverallPerformance` component. The
Overview slices 4–7 will mount it after the Overview layout lands. The
component reads the signed-in user's read-only `/history/overall` data and
does not accept an act-as user id.

## 2. Locked decisions

* Match the handoff styling and labels, including **Daily movement**.
* Keep the `INR` / `EUR` display control and the 1W, 1M, 3M, 1Y and All
  periods.
* Keep **View chart data** with the app's day-first `dd-MM-yyyy` dates
  (such as `16-11-2026`) in its table and day/month labels such as
  `16 Nov` on the chart axis.
* Omit the preview-state selector.
* If the rate or Gold valuation is unavailable, show a gap and its status;
  never display zero or a stock-only total. When Gold cannot be read, do not
  render an overall series.
* Compute Daily movement from daily points before thinning 1Y and All to
  weekly points, using `flowAdjustedReturnPct`.
* Hide the chart during act-as. Do not fetch the signed-in user's chart data
  while acting as another account.

## 3. Scope and reuse

`frontend/src/ui2/overview/OverallPerformance.tsx` owns period, currency and
metric controls, chart rendering and the data table. Its styles live in
`overallPerformance.css`; behavioral coverage lives in
`OverallPerformance.test.tsx`. It consumes the generated `OverallPoint` and
`api.getOverallHistory` client, and reuses `weekKey` from
`features/history/HistoryChartPage.tsx`, plus `pnlPct` and
`flowAdjustedReturnPct` from `historyShared.ts`.

This slice adds no endpoint or write path. It does not mount the component;
the Overview integration is part of slices 4–7. Classic and Glass remain
unchanged.

## 4. PR sequence

| PR | Layer | Scope | No regression | Adds value | Test anchor |
|---|---|---|---|---|---|
| [#342](https://github.com/suthirram/portfolio-dashboard/pull/342) | FE | Standalone OverallPerformance chart, handoff styling, controls, gap states and data table | Component is unmounted; act-as suppresses fetch and render | Inspect portfolio-wide daily value and movement before Overview integration | `OverallPerformance.test.tsx`; `formDates.test.ts` |

## 5. Verification and completion

Run `cd frontend && npm run test:run -- src/lib/formDates.test.ts
src/ui2/overview/OverallPerformance.test.tsx`, `npx tsc -b` and
`npm run lint:changed` before merge. Confirm the chart axis uses `16 Nov`
labels and the table uses the app's day-first date format.

Slice 10 is complete when #342 is merged, its checks pass, and the component
is ready for the Overview slices to mount. The Overview integration remains
gated on slices 4–7.
