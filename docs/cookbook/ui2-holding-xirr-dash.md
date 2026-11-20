# UI_2.0 holding details always show XIRR as "—"

* Status: Resolved
* Last verified: 2026-11-20
* Environment: frontend, UI_2.0 Overview (`/`), any account with stock XIRR available
* Related: PD-055 stock XIRR, PD-059 slice 6 (holding details dialog)

## Problem and trigger

On the UI_2.0 Overview, opening any holding showed `XIRR —`, even though
Classic's holdings table showed a rate for the same holding.

## Reproduction and diagnostic aids

1. With `ui_mode = ui2`, open `/` and select a holding.
2. Compare the dialog's XIRR with Classic's XIRR column, or with
   `GET /api/xirr` for that holding id.

Observed before the fix: every dialog showed `—`; `/api/xirr` returned a rate.

## Cause and evidence

`DashboardPage` rendered `Ui2HoldingDetailsDialog` without its `xirr` prop.
The dialog formats a missing rate as `—`, so it always did. The XIRR index
(`useHoldings().xirr`) was loaded and used by the Classic table only.

## Solution

Frontend only, no data impact. `DashboardPage` passes the selected holding's
rate from `xirr.byHolding[id]`, plus the same caveat text Classic shows on
hover (`xirrNote`: under a year, undated opening); the dialog marks a caveated
rate with `*` and prints the note.

## Verification

```bash
cd frontend && npx vitest run src/features/dashboard/DashboardPage.test.tsx
```

Observed: the UI_2.0 case shows `12.34%*` and the "less than a year" note.
In the browser on a real portfolio, holdings show their rates (e.g. 89.61%,
-1.68%), and short-history holdings carry the `*` note.

## Follow-up

None.
