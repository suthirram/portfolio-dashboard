# PD-059: Wave 3b amendment — UI_2.0 History page (slice 13)

* **Status**: Draft amendment; implementation starts after this docs PR merges
* **Owner**: Claude; product decisions remain with the project owner
* **Updated**: 2026-11-19
* **Goal**: UI_2.0 accounts get the handoff's History page — intro, month toolbar, Month in review, Daily records with an asset filter, and per-asset mini charts — with every figure and action of today's page.
* **Architecture**: `HistoryPage` stays the data owner. Its state and handlers move unchanged into a `useHistoryMonth` hook; the page renders `Ui2History` when `ui_mode === 'ui2'` (the same page-owns-data pattern as the wave 2 Overview amendment). UI_2.0 components only render, reuse the classic helpers for every number, and reuse the classic dialogs (restyled in slice 14).
* **Tech stack**: React 18 + TypeScript, plain SVG charts ported from the handoff (no Recharts in UI_2.0 History), CSS scoped under `:root[data-ui="ui2"]`, Vitest + Testing Library.
* **Spec links**: [PRD-015 §4.5](../prds/PRD-015-ui-2.md#45-history), [DD-015](../designs/DD-015-ui-2.md), [parent plan PD-059](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md), visual authority `docs/visuals/PD-059-ui-2-reference.html` (History view).

## 1. Scope and owner decisions

Wave 3 splits three ways: slice 10 (Overview overall chart) is Codex's,
this amendment unlocks slice 13, and slice 14 (History dialogs restyle,
Full-history charts dialog, full-history chart page) gets its own
amendment once 13 merges, as slice 3 did in wave 2a.

Owner answers (2026-11-19) this slice implements:

| # | Decision |
| --- | --- |
| W2 | Daily records gets the handoff's **All assets / INR / EUR / Gold** filter (display only; Gold appears only when the month has a gold overlay). |
| W3 | Keep the column name **Daily volatility** (same flow-adjusted number); use the handoff's tint placement — the P/L cell tinted up / down / unchanged with a text cue, the Invested cell purple on a new investment. Today's tints already sit there. |
| W4 | Clicking an Invested-vs-current chart still opens `/history/chart/:region`. The **Full-history charts** button opens a dialog — slice 14. |
| W7 | Title **Your portfolio through time**, subtitle **Daily snapshots, monthly perspective, and the details behind every day.** |
| Row delete | A row shows only **Edit**; **Delete** moves inside the Edit dialog under today's rule (all-manual row, or any row for a super admin). |
| Gold value | Plain text; a gold-day dialog is a later slice. |
| Gold tint | The day gold first appears is a new investment (purple), as for a currency: a prior row without gold counts as zero. One shared rule (`goldInvestedWentUp`) in both tables, so Classic/Glass gain it too (owner review on #343, option a). |
| Gold filter | In a month without gold the table shows All assets; the Gold choice is kept and returns with a gold month (Codex review on #343). |

Not in this slice: the fx re-fetch banner (slice 12), the Full-history
charts dialog and the dialogs' restyle (slice 14), the mock's
"SAMPLE SNAPSHOTS" badge and "Interactive sample" note (preview-only).

Kept exactly: month data (`include_previous`), the live today row and its
cut-over handling, the charts-on-top preference (`pd_history_charts_top`),
add / edit / paste / conflict queue, per-stock breakdown, delete rules and
confirm, the period-performance maths, dividends cells. Classic and Glass
render the classic page unchanged apart from the approved Gold tint fix
(the first gold purchase is now purple, Task 2 Step 3).

## 2. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/features/history/useHistoryMonth.ts` | The page's month state, rows, chart series and handlers, moved out of `HistoryPage` unchanged; `handleDelete` now resolves whether it deleted |
| Modify | `frontend/src/features/history/HistoryPage.tsx` | Calls `useHistoryMonth`; renders `Ui2History` for `ui2` |
| Modify | `frontend/src/features/history/historyShared.ts` | Shared `isAllManual` and `goldInvestedWentUp` |
| Modify | `frontend/src/features/history/HistoryTable.tsx` | Uses the shared `isAllManual` and `goldInvestedWentUp` |
| Modify | `frontend/src/features/history/HistoryPage.test.tsx` | First gold purchase is tinted in the classic table |
| Modify | `frontend/src/features/history/HistoryModals.tsx` | Optional `onDelete` on `EditRowModal` |
| Create | `frontend/src/ui2/primitives.css` | Shared UI_2.0 intro, panel, button, table and tone classes (registry) |
| Create | `frontend/src/ui2/shell/Ui2PageIntro.tsx` | Shared page intro: h1, subtitle, actions (registry) |
| Create | `frontend/src/ui2/history/historyCells.ts` | Pure cell model over the classic helpers; labels, month options, formatting |
| Create | `frontend/src/ui2/history/Ui2MiniChart.tsx` | The handoff's SVG mini chart (`snapshotGraph`) |
| Create | `frontend/src/ui2/history/Ui2AssetCharts.tsx` | Per-asset panels with three mini charts |
| Create | `frontend/src/ui2/history/Ui2MonthReview.tsx` | Month in review over `periodPerformance` |
| Create | `frontend/src/ui2/history/Ui2DailyRecords.tsx` | Daily records table, filter, legend |
| Create | `frontend/src/ui2/history/Ui2History.tsx` | Page composition and dialog wiring |
| Create | `frontend/src/ui2/history/history.css` | History layout ported from the handoff |
| Create | `frontend/src/ui2/history/historyCells.test.ts` | Cell model, formatting, chart gaps |
| Create | `frontend/src/ui2/history/Ui2History.test.tsx` | Page behaviour in `ui2` and fallback |
| Modify | `docs/plans/PD-059-ui-2-status.md` | Slice 13 state, registry rows |

## 3. PR sequence

| Order | Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- | --- |
| Amendment | `docs/PD-059-wave3-history` | This plan, board claim | Docs only | Unlocks slice 13 | markdownlint |
| Slice 13 | `feat/PD-059-history` | Tasks 1–7 | Classic/Glass take the classic branch; the hook is a verbatim move (existing 176 History tests pass untouched); `EditRowModal.onDelete` is optional; the one classic change is the first gold purchase gaining the purple tint (owner-approved fix) | UI_2.0 accounts get the handoff History page with all of today's data and actions | `Ui2History.test.tsx`, `historyCells.test.ts` |

One frontend-only PR, label `ui-2.0`, branched from `main`.

## 4. Tasks

### Task 1: Move the page state into `useHistoryMonth`

**Files:** `frontend/src/features/history/useHistoryMonth.ts` (create), `frontend/src/features/history/HistoryPage.tsx` (modify)

Both interfaces must run one implementation of the month loading, live
row, cut-over refetch and every handler, so the state moves out of the
page verbatim. The only behaviour addition: `handleDelete` resolves `true`
once the row is gone, so UI_2.0's Edit dialog knows to close (callers that
ignore the result are unaffected).

* [ ] **Step 1: create the hook.** Lines from `const now = new Date()` to
  `const headConflict = conflictQueue[0]` move unchanged from
  `HistoryPage`, except `handleDelete`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  type DateConflict,
  type HistoryRow,
  type PasteHistoryReport,
} from '../../lib/api/client'
import { formatDate } from '../../lib/formDates'
import { useAuthOptional } from '../auth/AuthContext'
import {
  goldChartData, monthRange, perCurrencyChartData, tradingDateIST, yearMonth0,
  type RegionKey,
} from './historyShared'
import { useLiveHistoryRows, useTradingClock } from './useLiveHistoryRows'

const CHARTS_ON_TOP_KEY = 'pd_history_charts_top'

// useHistoryMonth is the /history page's data and actions — the selected
// month, its rows (with today's live row), chart series, the charts-on-top
// preference, and the add / edit / paste / conflict / delete handlers. The
// classic page and the UI_2.0 page (PD-059) render it, so both share one
// implementation; it was moved out of HistoryPage unchanged.
export function useHistoryMonth() {
  const auth = useAuthOptional()
  const now = new Date()
  // The month picker defaults to the IST trading day's month/year, not the
  // raw UTC calendar one — between 00:00–02:30 UTC those can differ by a
  // day (see tradingDateIST), which would otherwise default the picker to
  // tomorrow's month while the snapshot job is still writing today's.
  const initial = yearMonth0(tradingDateIST(now))
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month0)
  const [rows, setRows] = useState<HistoryRow[]>([])
  // The month (YYYY-MM-01) `rows` were loaded for. A reload keeps the old
  // rows until the new ones land (and keeps them if it fails), so anything
  // labelled with the picker's month must check this first.
  const [rowsMonthStart, setRowsMonthStart] = useState<string | null>(null)
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [editRow, setEditRow] = useState<HistoryRow | null>(null)
  // Per-currency Holdings modal: the clicked row, the prior trading day's row
  // (for yesterday's price), and the currency clicked. null = closed.
  const [holdingsView, setHoldingsView] = useState<{ row: HistoryRow; prev: HistoryRow | null; region: RegionKey } | null>(null)
  // Sequential conflict queue: head opens as a modal.
  const [conflictQueue, setConflictQueue] = useState<DateConflict[]>([])
  // Layout preference: charts above the table. Persisted per browser.
  const [chartsOnTop, setChartsOnTop] = useState(() => {
    try { return window.localStorage?.getItem(CHARTS_ON_TOP_KEY) === '1' } catch { return false }
  })
  const toggleChartsOnTop = () => {
    setChartsOnTop(onTop => {
      const next = !onTop
      try { window.localStorage?.setItem(CHARTS_ON_TOP_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { from, to } = monthRange(year, month)
      const list = await api.listHistory(from, to, true)
      setRows(list.rows)
      setRowsMonthStart(from)
      setCurrency(list.currency || 'INR')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { void reload() }, [reload])

  // The IST trading day and the live window, recomputed at each boundary.
  const { todayStr, liveWindowOpen } = useTradingClock()
  const today = yearMonth0(todayStr)
  const isCurrentMonth = year === today.year && month === today.month0
  const selectedMonthStart = monthRange(year, month).from

  // At each cut-over, refetch so the day that just closed picks up its real
  // snapshot. If the roll-over also crossed a month *and* the user was still
  // parked on the month that was current until a moment ago, follow the
  // clock into the new month — but never yank them out of a month they
  // deliberately navigated to.
  const prevTodayRef = useRef(todayStr)
  useEffect(() => {
    const prev = prevTodayRef.current
    if (prev === todayStr) return
    prevTodayRef.current = todayStr
    const was = yearMonth0(prev)
    const nowYM = yearMonth0(todayStr)
    const crossedMonth = nowYM.year !== was.year || nowYM.month0 !== was.month0
    if (crossedMonth && year === was.year && month === was.month0) {
      // Changing the picker re-runs `reload` through its own effect.
      setYear(nowYM.year)
      setMonth(nowYM.month0)
    } else {
      void reload()
    }
  }, [todayStr, year, month, reload])
  // Today's live row is appended only while the current month is shown.
  const displayRows = useLiveHistoryRows(rows, {
    active: isCurrentMonth, todayStr, liveWindowOpen, goldEnabled: Boolean(auth?.user?.gold_enabled),
  })

  // One chart per currency. Compute series per bucket.
  //
  // Charts plot `displayRows`, the same array the table renders: on `rows`
  // the table's last row was today while every mini chart stopped at
  // yesterday, and a gold-enabled user whose only gold-bearing row was the
  // live one got the table's gold column with no gold panel beside it.
  const chartsByRegion = useMemo(() => ({
    INR: perCurrencyChartData(displayRows, 'INR'),
    EUR: perCurrencyChartData(displayRows, 'EUR'),
  }), [displayRows])
  // Gold gets its own panel (INR-denominated) from the per-row overlay,
  // shown only when at least one row carries gold data.
  const goldChart = useMemo(() => goldChartData(displayRows), [displayRows])
  const hasGoldChart = useMemo(() => displayRows.some(row => row.gold), [displayRows])

  const handleAddSaved = async (input: { date: string; regions: Record<string, { invested: number; current: number }> }) => {
    try {
      await api.addHistoryRow(input)
      setAddOpen(false)
      await reload()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Server returned conflicts. Surface via a single-date conflict.
        // The error body is the *ErrConflict shape stringified; refetch the row
        // to drive the modal instead.
        try {
          const list = await api.listHistory(input.date, input.date)
          if (list.rows[0]) {
            setConflictQueue([{
              date: input.date,
              existing: list.rows[0].regions,
              incoming: input.regions,
            }])
            setAddOpen(false)
          } else {
            // 409 said the row exists, but list returned nothing —
            // possible race between the POST and the refetch. Tell the
            // user instead of silently swallowing.
            alert('Conflict reported but row no longer exists. Try again.')
          }
        } catch {
          alert('Conflict, but failed to load existing row.')
        }
      } else {
        alert('Add failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
  }

  const handlePasteSubmit = async (input: { month: string; rows: { date: string; regions: Record<string, { invested: number; current: number }> }[] }): Promise<PasteHistoryReport> => {
    const report = await api.pasteHistory(input)
    if (report.conflicts.length) {
      // PRD-002 §7.3: dialogs open in date order. Backend may return
      // conflicts in non-deterministic order because the per-row map
      // iteration order is undefined; sort here.
      const sorted = report.conflicts.toSorted((left, right) => left.date.localeCompare(right.date))
      setConflictQueue(sorted)
    }
    if (report.applied.length) await reload()
    return report
  }

  const handleConflictResolve = async (date: string, chosen: Record<string, { invested: number; current: number }>) => {
    if (Object.keys(chosen).length > 0) {
      try {
        await api.patchHistoryRegions(date, { regions: chosen })
      } catch (e) {
        alert('Save failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
    // Advance queue
    setConflictQueue(queue => queue.slice(1))
    await reload()
  }

  const handleConflictSkip = () => {
    setConflictQueue(queue => queue.slice(1))
  }

  const handleEditSaved = async (date: string, regions: Record<string, { invested: number; current: number }>) => {
    try {
      await api.patchHistoryRegions(date, { regions })
      setEditRow(null)
      await reload()
    } catch (e) {
      alert('Edit failed: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // Resolves true once the row is gone, so a caller that opened the delete
  // from a dialog (UI_2.0's Edit dialog) knows to close it.
  const handleDelete = async (date: string): Promise<boolean> => {
    if (!confirm(`Delete row for ${formatDate(date)}?`)) return false
    try {
      await api.deleteHistoryRow(date)
      await reload()
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert('Cannot delete a cron-written row. Override individual regions instead.')
      } else {
        alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)))
      }
      return false
    }
  }

  const headConflict = conflictQueue[0]

  return {
    year, setYear, month, setMonth, today, isCurrentMonth, selectedMonthStart,
    rows, rowsMonthStart, displayRows, currency, loading, error,
    chartsByRegion, goldChart, hasGoldChart,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    reload, handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  }
}
```

* [ ] **Step 2: trim `HistoryPage` imports.** Current:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  api,
  type DateConflict,
  type HistoryRow,
  type PasteHistoryReport,
} from '../../lib/api/client'
import { ApiError } from '../../lib/api/client'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import { formatDate } from '../../lib/formDates'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { useAuthOptional } from '../auth/AuthContext'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, GOLD_PALETTE, MIN_YEAR, MONTHS,
  PNL_LINE_COLOUR, REGIONS, REGION_COLOURS, REGION_LABELS, VOL_LINE_COLOUR,
  chartTooltipProps, fmtAxisAmount, fmtCurrency, goldChartData, monthRange,
  niceDomain, perCurrencyChartData,
  regionHasData, symmetricDomain, tradingDateIST, yearMonth0,
  type RegionKey,
} from './historyShared'
import { HistoryTable } from './HistoryTable'
import { MonthNavigator } from './MonthNavigator'
import { PeriodPerformanceCard } from './PeriodPerformanceCard'
import { useLiveHistoryRows, useTradingClock } from './useLiveHistoryRows'
```

Replace with:

```tsx
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { useAuthOptional } from '../auth/AuthContext'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, GOLD_PALETTE, MIN_YEAR, MONTHS,
  PNL_LINE_COLOUR, REGIONS, REGION_COLOURS, REGION_LABELS, VOL_LINE_COLOUR,
  chartTooltipProps, fmtAxisAmount, fmtCurrency,
  niceDomain, regionHasData, symmetricDomain, type RegionKey,
} from './historyShared'
import { HistoryTable } from './HistoryTable'
import { MonthNavigator } from './MonthNavigator'
import { PeriodPerformanceCard } from './PeriodPerformanceCard'
import { useHistoryMonth } from './useHistoryMonth'
```

* [ ] **Step 3: call the hook.** Current (start of the component; the body
  continues with the state that Step 1 moved):

```tsx
export default function HistoryPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const canForceDelete = auth?.user?.role === 'superadmin'
  const now = new Date()
  // … through `const headConflict = conflictQueue[0]` (moved to the hook)
```

Delete the module-level `const CHARTS_ON_TOP_KEY = 'pd_history_charts_top'`
(now in the hook), delete the moved block, and replace the head with:

```tsx
export default function HistoryPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const canForceDelete = auth?.user?.role === 'superadmin'
  const history = useHistoryMonth()
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, currency, loading, error,
    chartsByRegion, goldChart, hasGoldChart,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  } = history

  return (
```

The JSX below is unchanged.

* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run src/features/history`
  Expected: no type errors; `5 passed` files, `176 passed` tests.
* [ ] **Commit:** `git add frontend/src/features/history/useHistoryMonth.ts frontend/src/features/history/HistoryPage.tsx && git commit -m "♻️ Move History page state into a hook"`

### Task 2: Shared delete and gold-tint rules; Delete inside the Edit dialog

**Files:** `historyShared.ts`, `HistoryTable.tsx`, `HistoryModals.tsx`, `HistoryPage.test.tsx` (modify)

The delete rule is needed by both tables, so it moves from a
`HistoryTable` local into `historyShared`. UI_2.0 rows carry only Edit
(owner), so `EditRowModal` gains an optional `onDelete`; the classic table
omits it and keeps its row button.

* [ ] **Step 1: `historyShared.ts`** — after `changedRegions`, add:

```ts
// isAllManual reports whether every currency on the row was entered by hand.
// Only such a row may be deleted, except by a super admin (ErrCronProtected).
export function isAllManual(regions: Record<string, RegionSnapshot>): boolean {
  return Object.values(regions).every(snapshot => snapshot.source === 'manual')
}
```

* [ ] **Step 2: `HistoryTable.tsx`** — current:

```tsx
  const [sortAsc, setSortAsc] = useState(true)

  const isAllManual = (regions: Record<string, RegionSnapshot>) =>
    Object.values(regions).every(snapshot => snapshot.source === 'manual')

```

Replace with:

```tsx
  const [sortAsc, setSortAsc] = useState(true)

```

Drop `RegionSnapshot,` from the `../../lib/api/client` type import and
change `holdingRegion,` to `holdingRegion, isAllManual,` in the
`./historyShared` import.

* [ ] **Step 3: one gold new-investment rule (owner review, option a).**
  Today's gold group needs a previous gold value, so the day gold first
  appears is never purple, while a currency treats a missing prior bucket
  as zero. One shared rule fixes both tables (Classic/Glass gain the tint
  on the first gold purchase). In `historyShared.ts`, after
  `goldCurrentDirection`, add:

```ts
// goldInvestedWentUp mirrors regionInvestedWentUp for the gold overlay: the
// purple "new investment" tint when gold invested rose versus the prior row.
// Rows newest-first. A prior row without an overlay (before the first
// purchase) counts as zero invested, so the day gold first appears is
// marked, as a currency's first investment is; no prior row at all is not.
export function goldInvestedWentUp(rows: HistoryRow[], i: number): boolean {
  const prev = rows[i + 1]
  const gold = rows[i].gold
  if (!prev || !gold) return false
  return gold.invested > (prev.gold?.invested ?? 0)
}
```

In `HistoryTable.tsx` add `goldInvestedWentUp` to the `./historyShared`
import, pass it at the call site — current
`{hasGold && <GoldRowCells gold={row.gold} prevGold={prev?.gold} />}`,
replacement
`{hasGold && <GoldRowCells gold={row.gold} prevGold={prev?.gold} wentUp={goldInvestedWentUp(byDateDesc, i)} />}`
— and take it as a prop. Current:

```tsx
function GoldRowCells({ gold, prevGold }: { gold?: GoldHistoryOverlay; prevGold?: GoldHistoryOverlay }) {
  const base: React.CSSProperties = { ...td, background: GOLD_TINT }
  const first: React.CSSProperties = { ...base, borderLeft: '2px solid var(--border)' }
  // Rows before the first purchase (or before any price existed) carry no
  // overlay — the whole group reads em dashes rather than fake zeros.
  if (!gold) {
    return (
      <>
        <td style={first}>—</td><td style={base}>—</td><td style={base}>—</td><td style={base}>—</td>
      </>
    )
  }
  const volColor = gold.volatility_pct === 0 ? undefined
    : gold.volatility_pct > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  // Match the currency columns: a day the gold invested rose (a new
  // purchase) gets the purple "new investment" tint; the P/L% cell tints
  // by the day-over-day value move (green up / red down / blue flat).
  const wentUp = !!prevGold && gold.invested > prevGold.invested
```

Replace with:

```tsx
function GoldRowCells({ gold, prevGold, wentUp }: { gold?: GoldHistoryOverlay; prevGold?: GoldHistoryOverlay; wentUp: boolean }) {
  const base: React.CSSProperties = { ...td, background: GOLD_TINT }
  const first: React.CSSProperties = { ...base, borderLeft: '2px solid var(--border)' }
  // Rows before the first purchase (or before any price existed) carry no
  // overlay — the whole group reads em dashes rather than fake zeros.
  if (!gold) {
    return (
      <>
        <td style={first}>—</td><td style={base}>—</td><td style={base}>—</td><td style={base}>—</td>
      </>
    )
  }
  const volColor = gold.volatility_pct === 0 ? undefined
    : gold.volatility_pct > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  // Match the currency columns: a day the gold invested rose (a new
  // purchase, including the first) gets the purple "new investment" tint
  // (goldInvestedWentUp); the P/L% cell tints by the day-over-day value
  // move (green up / red down / blue flat).
```

In `HistoryPage.test.tsx`, `describe('HistoryTable gold cell tints')`,
before `'gold cells keep the plain gold tint when nothing changed / no prior'`
add (fails before this step):

```tsx
  it('gold invested cell is purple on the day gold first appears', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={[
      row({ date: '2026-06-17', regions: { INR: region(100, 200, 'cron') }, gold: gold(7200, 7300, 1) }),
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }), // before the first purchase
    ]} />)
    expect(norm(goldCells('2026-06-17')[11].style.background)).toBe('rgba(168,85,247,0.18)') // purple
  })
```

* [ ] **Step 4: `HistoryModals.tsx`** — current signature:

```tsx
export function EditRowModal({ row, onSubmit, onCancel }: {
  row: HistoryRow
  onSubmit: (date: string, regions: Record<string, { invested: number; current: number }>) => Promise<void>
  onCancel: () => void
}) {
```

Replace with:

```tsx
// onDelete, when given, adds a Delete button to the dialog. UI_2.0 passes it
// (its rows carry only Edit, PD-059); the classic table keeps its own
// per-row Delete and omits it.
export function EditRowModal({ row, onSubmit, onCancel, onDelete }: {
  row: HistoryRow
  onSubmit: (date: string, regions: Record<string, { invested: number; current: number }>) => Promise<void>
  onCancel: () => void
  onDelete?: (date: string) => void
}) {
```

Current footer:

```tsx
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} disabled={busy} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
        </div>
```

Replace with:

```tsx
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          {onDelete && (
            <button onClick={() => onDelete(row.date)} disabled={busy} className="btn btn-danger"
              style={{ marginRight: 'auto' }}>Delete row</button>
          )}
          <button onClick={onCancel} disabled={busy} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
        </div>
```

* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run src/features/history`
  Expected: `177 passed` (the new first-gold test; classic delete tests unchanged).
* [ ] **Commit:** `git add frontend/src/features/history/historyShared.ts frontend/src/features/history/HistoryTable.tsx frontend/src/features/history/HistoryModals.tsx frontend/src/features/history/HistoryPage.test.tsx && git commit -m "✨ Share delete and gold tint rules"`

### Task 3: Shared UI_2.0 primitives

**Files:** `frontend/src/ui2/primitives.css`, `frontend/src/ui2/shell/Ui2PageIntro.tsx` (create)

Every handoff page opens with the same intro and uses the same panel,
button and table look. They are shared once and registered so the Overview
slices reuse them instead of copying. Values are the handoff's `.intro`,
`h1`, `.subtitle`, `.panel`, `.btn`, `table` rules on the `--u2-*`
palette; type follows Branding.

```css
/* Shared UI_2.0 building blocks (PD-059), ported 1:1 from the handoff's
 * .intro, h1, .subtitle, .panel, .btn, table and tone rules. Every UI_2.0
 * page uses these classes instead of its own copy; page files keep only
 * their own layout. Scoped under :root[data-ui="ui2"] like ui2.css. */

:root[data-ui="ui2"] .ui2-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 28px 0 22px;
  gap: 18px;
}

:root[data-ui="ui2"] .ui2-intro h1 {
  font: 800 27px var(--u2-font-display);
  letter-spacing: -1px;
  margin: 0 0 7px;
  color: var(--u2-text);
}

:root[data-ui="ui2"] .ui2-subtitle {
  margin: 0;
  color: var(--u2-muted);
  font-size: 12px;
}

:root[data-ui="ui2"] .ui2-intro-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

:root[data-ui="ui2"] .ui2-panel {
  background: var(--u2-panel);
  border: 1px solid var(--u2-border);
  border-radius: 13px;
  box-shadow: var(--u2-shadow);
  overflow: hidden;
  color: var(--u2-text);
}

:root[data-ui="ui2"] .ui2-panel h2 {
  font: 700 15px var(--u2-font-display);
  margin: 0;
}

:root[data-ui="ui2"] .ui2-btn {
  border: 1px solid var(--u2-border);
  background: var(--u2-panel);
  color: var(--u2-text);
  border-radius: 8px;
  padding: 10px 13px;
  font: 600 12px var(--u2-font);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  white-space: nowrap;
  cursor: pointer;
}

:root[data-ui="ui2"] .ui2-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

:root[data-ui="ui2"] .ui2-btn:focus-visible {
  outline: 3px solid var(--u2-accent);
  outline-offset: 2px;
}

:root[data-ui="ui2"] .ui2-btn-primary {
  background: #5265d8;
  color: white;
  border-color: #5265d8;
  box-shadow: 0 4px 10px #5265d81a;
}

:root[data-ui="ui2"][data-theme="cyberpunk"] .ui2-btn-primary {
  background: #6ee7ef;
  border-color: #6ee7ef;
  color: #172238;
}

:root[data-ui="ui2"] .ui2-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

:root[data-ui="ui2"] .ui2-table th {
  text-align: right;
  font-size: 9px;
  letter-spacing: 0.4px;
  color: var(--u2-muted);
  font-weight: 500;
  padding: 10px 12px;
  background: var(--u2-bg);
  white-space: nowrap;
}

:root[data-ui="ui2"] .ui2-table td {
  text-align: right;
  padding: 15px 12px;
  border-bottom: 1px solid var(--u2-border);
  white-space: nowrap;
}

:root[data-ui="ui2"] .ui2-table tr:last-child td {
  border-bottom: 0;
}

:root[data-ui="ui2"] .u2-positive { color: var(--u2-green); }
:root[data-ui="ui2"] .u2-negative { color: var(--u2-red); }
:root[data-ui="ui2"] .u2-muted { color: var(--u2-muted); }

@media (min-width: 1500px) {
  :root[data-ui="ui2"] .ui2-table td {
    padding-top: 19px;
    padding-bottom: 19px;
  }
}

@media (max-width: 760px) {
  :root[data-ui="ui2"] .ui2-intro {
    margin: 23px 0 18px;
    align-items: flex-start;
  }

  :root[data-ui="ui2"] .ui2-intro h1 { font-size: 23px; }

  :root[data-ui="ui2"] .ui2-subtitle {
    font-size: 10px;
    line-height: 1.7;
  }
}
```

```tsx
// The handoff's page intro: the page's h1 and subtitle on the left, its
// primary actions on the right. Every UI_2.0 page opens with one (PD-059).
import type { ReactNode } from 'react'
import '../primitives.css'

export function Ui2PageIntro({ title, subtitle, actions }: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <section className="ui2-intro">
      <div>
        <h1>{title}</h1>
        <p className="ui2-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="ui2-intro-actions">{actions}</div>}
    </section>
  )
}
```

* [ ] **Verify:** `cd frontend && npx tsc -b` — Expected: no output.
* [ ] **Commit:** `git add frontend/src/ui2/primitives.css frontend/src/ui2/shell/Ui2PageIntro.tsx && git commit -m "✨ Add shared UI_2.0 page primitives"`

### Task 4: Cell model

**Files:** `frontend/src/ui2/history/historyCells.ts`, `frontend/src/ui2/history/historyCells.test.ts` (create)

The UI_2.0 table must show the classic numbers, so a pure model wraps
the classic helpers (`regionDailyVolatility`, `regionPnLPct`,
`regionCurrentDirection`, `regionInvestedWentUp`, `goldCurrentDirection`)
per asset group. It also owns labels, the filter's visible groups, the
row-source label, the handoff's dates ("09 Nov") and the month select's
options (January 2020 → the current trading month, long names).

```ts
// The UI_2.0 History table's cell model (PD-059 slice 13). Every figure comes
// from the classic History helpers, so both interfaces show the same numbers;
// this module only shapes them per asset group for the handoff's layout.
import type { HistoryRow } from '../../lib/api/client'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, MIN_YEAR, MONTHS, goldCurrentDirection, goldInvestedWentUp, holdingRegion,
  regionCurrentDirection, regionDailyVolatility, regionInvestedWentUp, regionPnLPct,
  type RegionKey,
} from '../../features/history/historyShared'

export type HistoryAsset = RegionKey | 'GOLD'
export type AssetFilter = 'ALL' | HistoryAsset
export type Direction = 'up' | 'down' | 'flat'

export const ASSET_LABELS: Record<HistoryAsset, string> = {
  INR: 'India · INR',
  EUR: 'Europe · EUR',
  GOLD: 'Gold · INR',
}

export const FILTER_LABELS: Record<AssetFilter, string> = {
  ALL: 'All assets',
  INR: 'INR',
  EUR: 'EUR',
  GOLD: 'Gold',
}

// Gold is valued in rupees, like the classic table's gold group.
export const ASSET_SYMBOL: Record<HistoryAsset, string> = {
  INR: CURRENCY_SYMBOL.INR,
  EUR: CURRENCY_SYMBOL.EUR,
  GOLD: CURRENCY_SYMBOL.INR,
}

// The legend wording for each P/L tint, read by screen readers as well.
export const DIRECTION_CUE: Record<Direction | 'none', string> = {
  up: '↑ Up',
  down: '↓ Down',
  flat: '＝ Unchanged',
  none: 'No baseline',
}

export const DIRECTION_TITLE: Record<Direction | 'none', string> = {
  up: 'Value increased versus prior day',
  down: 'Value decreased versus prior day',
  flat: 'Value unchanged versus prior day',
  none: 'No prior record to compare',
}

export interface AssetCells {
  // null = no gold position that day; a currency without a bucket reads 0,
  // exactly as the classic table shows it.
  invested: number | null
  current: number | null
  volatility: number | null
  pnlPct: number | null
  direction: Direction | null
  newInvestment: boolean
  // Dividends exist on the currency groups only (null for gold).
  dividendsToDate: number | null
  dividendsOnDay: number
  // The value opens the per-stock breakdown only when the day holds stock.
  hasHoldings: boolean
}

// assetCells computes one asset group's cells for newestFirst[index]; the
// row after it is the prior day, as every classic helper expects.
export function assetCells(newestFirst: HistoryRow[], index: number, asset: HistoryAsset): AssetCells {
  const row = newestFirst[index]
  const prev = newestFirst[index + 1]
  if (asset === 'GOLD') {
    const gold = row.gold
    return {
      invested: gold ? gold.invested : null,
      current: gold ? gold.current : null,
      volatility: gold ? gold.volatility_pct : null,
      pnlPct: gold ? gold.pnl_pct : null,
      direction: goldCurrentDirection(gold, prev?.gold),
      newInvestment: goldInvestedWentUp(newestFirst, index),
      dividendsToDate: null,
      dividendsOnDay: 0,
      hasHoldings: false,
    }
  }
  const bucket = row.regions[asset]
  const dividends = row.dividends?.[CURRENCY_BY_REGION[asset]]
  return {
    invested: bucket?.invested ?? 0,
    current: bucket?.current ?? 0,
    volatility: regionDailyVolatility(newestFirst, index, asset),
    pnlPct: regionPnLPct(row, asset),
    direction: regionCurrentDirection(newestFirst, index, asset),
    newInvestment: regionInvestedWentUp(newestFirst, index, asset),
    dividendsToDate: dividends ? dividends.to_date : null,
    dividendsOnDay: dividends ? dividends.on_day : 0,
    hasHoldings: !!row.holdings?.some(holding => holdingRegion(holding) === asset && holding.quantity > 0),
  }
}

// visibleAssets is the asset groups the table and charts show: the filter's
// one, or every group, gold only for a row set that carries a gold overlay.
export function visibleAssets(filter: AssetFilter, hasGold: boolean): HistoryAsset[] {
  const all: HistoryAsset[] = hasGold ? ['INR', 'EUR', 'GOLD'] : ['INR', 'EUR']
  return filter === 'ALL' ? all : all.filter(asset => asset === filter)
}

// rowSource labels the date cell the way the handoff does.
export function rowSource(row: HistoryRow): string {
  if (row.tentative) return 'Not yet snapshotted'
  const sources = new Set(Object.values(row.regions).map(snapshot => snapshot.source))
  if (sources.size === 1 && sources.has('manual')) return 'Manual record'
  if (sources.has('manual')) return 'Partly manual'
  return 'Daily snapshot'
}

// shortDate renders YYYY-MM-DD as the handoff's day-first "16 Nov" / "09 Nov".
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day} ${MONTHS[Number(month) - 1]}`
}

// signedPercent renders "+1.24%" / "−1.01%" (U+2212, like the handoff).
export function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

export interface MonthOption {
  year: number
  month0: number
  label: string
}

// The handoff's select spells the month out ("November 2026").
const LONG_MONTH = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })

export function longMonthLabel(year: number, month0: number): string {
  return `${LONG_MONTH.format(new Date(Date.UTC(year, month0, 1)))} ${year}`
}

// monthOptions lists every month from January of MIN_YEAR to `latest`,
// oldest first, for the handoff's month select.
export function monthOptions(latest: { year: number; month0: number }): MonthOption[] {
  const options: MonthOption[] = []
  for (let year = MIN_YEAR; year <= latest.year; year++) {
    const lastMonth = year === latest.year ? latest.month0 : MONTHS.length - 1
    for (let month0 = 0; month0 <= lastMonth; month0++) {
      options.push({ year, month0, label: longMonthLabel(year, month0) })
    }
  }
  return options
}
```

The tests pin the model to the classic helpers and check the chart path
breaks over a gap (the `linePath` test needs Task 5's file; run after it):

```ts
import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../../lib/api/client'
import {
  regionDailyVolatility, regionPnLPct,
} from '../../features/history/historyShared'
import {
  assetCells, longMonthLabel, monthOptions, rowSource, shortDate, signedPercent, visibleAssets,
} from './historyCells'
import { linePath } from './Ui2MiniChart'

const row = (date: string, inr: { invested: number; current: number }, extra: Partial<HistoryRow> = {}): HistoryRow => ({
  date,
  regions: { INR: { ...inr, source: 'cron' } },
  totals: { invested_total: inr.invested, current_total: inr.current, pnl_pct: 0 },
  ...extra,
})

// Newest first, as the table and every classic helper read them.
const rows: HistoryRow[] = [
  row('2026-11-16', { invested: 1200, current: 1300 }, {
    holdings: [{ symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 650, price_date: '2026-11-16', current: 1300 }],
    dividends: { INR: { to_date: 40, on_day: 15 } },
    gold: { invested: 500, current: 520, pnl_pct: 4, volatility_pct: 1 },
  }),
  row('2026-11-15', { invested: 1000, current: 1350 }, {
    gold: { invested: 500, current: 515, pnl_pct: 3, volatility_pct: 0 },
  }),
]

describe('assetCells', () => {
  it('reuses the classic helpers for a currency group', () => {
    const cells = assetCells(rows, 0, 'INR')
    expect(cells.invested).toBe(1200)
    expect(cells.current).toBe(1300)
    expect(cells.volatility).toBe(regionDailyVolatility(rows, 0, 'INR'))
    expect(cells.pnlPct).toBe(regionPnLPct(rows[0], 'INR'))
    expect(cells.direction).toBe('down')
    expect(cells.newInvestment).toBe(true)
    expect(cells.dividendsToDate).toBe(40)
    expect(cells.dividendsOnDay).toBe(15)
    expect(cells.hasHoldings).toBe(true)
  })

  it('has no baseline on the oldest row', () => {
    const cells = assetCells(rows, 1, 'INR')
    expect(cells.direction).toBeNull()
    expect(cells.newInvestment).toBe(false)
    expect(cells.volatility).toBeNull()
    expect(cells.hasHoldings).toBe(false)
  })

  it('reads a currency missing from the row as zero, like the classic table', () => {
    const cells = assetCells(rows, 0, 'EUR')
    expect(cells.invested).toBe(0)
    expect(cells.current).toBe(0)
    expect(cells.dividendsToDate).toBeNull()
  })

  it('takes gold from the overlay, with no dividends and no breakdown', () => {
    const cells = assetCells(rows, 0, 'GOLD')
    expect(cells).toMatchObject({
      invested: 500, current: 520, volatility: 1, pnlPct: 4,
      direction: 'up', newInvestment: false, dividendsToDate: null, hasHoldings: false,
    })
  })

  it('marks the day gold first appears as a new investment, like a currency', () => {
    const firstGold = [
      row('2026-11-16', { invested: 1, current: 1 }, { gold: { invested: 500, current: 510, pnl_pct: 2, volatility_pct: 0 } }),
      row('2026-11-15', { invested: 1, current: 1 }),
    ]
    expect(assetCells(firstGold, 0, 'GOLD').newInvestment).toBe(true)
    // The oldest row has no prior row at all: no baseline, no tint.
    expect(assetCells(firstGold.slice(0, 1), 0, 'GOLD').newInvestment).toBe(false)
  })

  it('shows dashes for a day without gold', () => {
    const noGold = [row('2026-11-16', { invested: 1, current: 1 })]
    expect(assetCells(noGold, 0, 'GOLD')).toMatchObject({ invested: null, current: null, pnlPct: null, direction: null })
  })
})

describe('visibleAssets', () => {
  it('shows every group for All, gold only when present', () => {
    expect(visibleAssets('ALL', true)).toEqual(['INR', 'EUR', 'GOLD'])
    expect(visibleAssets('ALL', false)).toEqual(['INR', 'EUR'])
  })

  it('narrows to the chosen group', () => {
    expect(visibleAssets('EUR', true)).toEqual(['EUR'])
    expect(visibleAssets('GOLD', true)).toEqual(['GOLD'])
  })
})

describe('rowSource', () => {
  it('labels live, manual, mixed and cron rows', () => {
    expect(rowSource({ ...rows[0], tentative: true })).toBe('Not yet snapshotted')
    expect(rowSource(row('2026-11-01', { invested: 1, current: 1 }))).toBe('Daily snapshot')
    expect(rowSource({ ...rows[0], regions: { INR: { invested: 1, current: 1, source: 'manual' } } })).toBe('Manual record')
    expect(rowSource({
      ...rows[0],
      regions: { INR: { invested: 1, current: 1, source: 'manual' }, EUR: { invested: 1, current: 1, source: 'cron' } },
    })).toBe('Partly manual')
  })
})

describe('formatting', () => {
  it('writes the handoff short date and signed percentages', () => {
    expect(shortDate('2026-11-06')).toBe('06 Nov')
    expect(signedPercent(1.236)).toBe('+1.24%')
    expect(signedPercent(-1.01)).toBe('−1.01%')
    expect(signedPercent(0)).toBe('0.00%')
  })

  it('lists every month from January 2020 to the current month', () => {
    const options = monthOptions({ year: 2026, month0: 10 })
    expect(options[0]).toEqual({ year: 2020, month0: 0, label: 'January 2020' })
    expect(options[options.length - 1]).toEqual({ year: 2026, month0: 10, label: 'November 2026' })
    expect(options).toHaveLength(6 * 12 + 11)
    expect(longMonthLabel(2026, 1)).toBe('February 2026')
  })
})

describe('linePath', () => {
  it('lifts the pen over a missing day instead of drawing to zero', () => {
    const path = linePath([1, null, 3, 4], index => index * 10, value => value)
    expect(path).toBe('M0.0,1.0 M20.0,3.0 L30.0,4.0')
  })
})
```

* [ ] **Verify** (after Task 5): `cd frontend && npx vitest run src/ui2/history/historyCells.test.ts`
  Expected: `12 passed`.
* [ ] **Commit:** `git add frontend/src/ui2/history/historyCells.ts frontend/src/ui2/history/historyCells.test.ts && git commit -m "✨ Add the UI_2.0 History cell model"`

### Task 5: Charts, Month in review, Daily records

**Files:** `Ui2MiniChart.tsx`, `Ui2AssetCharts.tsx`, `Ui2MonthReview.tsx`, `Ui2DailyRecords.tsx`, `history.css` under `frontend/src/ui2/history/` (create)

The handoff draws History charts as its own SVG (`snapshotGraph`), so
the mini chart ports that geometry (460×175 viewBox, three grid lines,
dashed invested line, zero line on volatility, point markers with a
tooltip). Series come from `perCurrencyChartData` / `goldChartData`, so
values equal the classic charts; a missing day lifts the pen. The value
chart stays a button to `/history/chart/:region` (W4); inside it the
markers are not tab stops (no focusable element inside a button).

```tsx
// One History mini chart, drawn as the handoff's SVG (snapshotGraph) rather
// than Recharts so it matches the reference 1:1. The series come from the
// classic chart helpers (perCurrencyChartData / goldChartData), so the
// plotted numbers equal the classic charts'.
export type MiniChartKind = 'value' | 'pl' | 'volatility'

export interface MiniChartPoint {
  date: string
  invested: number | null
  current: number | null
  pnl_pct: number | null
  daily_vol: number | null
}

const TITLES: Record<MiniChartKind, string> = {
  value: 'Invested vs current',
  pl: 'P/L %',
  volatility: 'Daily volatility %',
}

const NOTES: Record<MiniChartKind, (unit: string) => string> = {
  value: unit => `Both series share the same ${unit} scale and snapshot dates.`,
  pl: () => 'Gain or loss relative to the recorded invested amount.',
  volatility: () => 'Daily change net of money added or withdrawn, versus the preceding snapshot. The first record has no baseline.',
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

// Plot area of the 460 × 175 viewBox, as in the reference.
const LEFT = 48
const RIGHT = 413
const WIDTH = RIGHT - LEFT
const BOTTOM = 140
const HEIGHT = 110

function seriesOf(points: MiniChartPoint[], kind: MiniChartKind): (number | null)[] {
  if (kind === 'value') return points.map(point => point.current)
  if (kind === 'pl') return points.map(point => point.pnl_pct)
  return points.map(point => point.daily_vol)
}

// linePath joins consecutive values and lifts the pen over a gap, so a day
// without data reads as a break rather than a fall to zero.
export function linePath(values: (number | null)[], xAt: (index: number) => number, yAt: (value: number) => number): string {
  let drawing = false
  return values.map((value, index) => {
    if (value === null) { drawing = false; return '' }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return `${command}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`
  }).filter(Boolean).join(' ')
}

export function Ui2MiniChart({ points, kind, unit, label, markers = true, onExpand }: {
  points: MiniChartPoint[]
  kind: MiniChartKind
  // The amount currency ("INR" / "EUR"); the % charts ignore it.
  unit: string
  // Names the asset and period for the accessible chart label.
  label: string
  // Focusable point markers with a tooltip; off for long full-history series.
  markers?: boolean
  // Makes the chart a button that opens the zoomable full-history page.
  onExpand?: () => void
}) {
  const values = seriesOf(points, kind)
  const invested = kind === 'value' ? points.map(point => point.invested) : []
  const finite = [...values, ...invested].filter((value): value is number => value !== null && Number.isFinite(value))
  const title = TITLES[kind]
  const format = (value: number) => kind === 'value' ? COMPACT.format(value) : `${value.toFixed(2)}%`
  const last = values.length ? values[values.length - 1] : null

  let chart: JSX.Element
  if (finite.length === 0) {
    chart = <p className="u2h-graph-empty">No data for this period.</p>
  } else {
    let min = Math.min(...finite)
    let max = Math.max(...finite)
    if (kind === 'volatility') { min = Math.min(min, 0); max = Math.max(max, 0) }
    const pad = Math.max((max - min) * 0.15, kind === 'value' ? 1 : 0.05)
    min -= pad
    max += pad
    const xAt = (index: number) => LEFT + index * WIDTH / Math.max(points.length - 1, 1)
    const yAt = (value: number) => BOTTOM - (value - min) / (max - min) * HEIGHT
    const amountSuffix = kind === 'value' ? ` ${unit}` : ''
    chart = (
      <svg viewBox="0 0 460 175" role="img" aria-label={`${title} for ${label}`}>
        {[0, 0.5, 1].map(step => {
          const value = min + (max - min) * step
          return (
            <g key={step}>
              <path d={`M${LEFT} ${yAt(value)}H${RIGHT}`} stroke="var(--u2-border)" strokeDasharray="3 5" />
              <text x={LEFT - 5} y={yAt(value) + 3} textAnchor="end" fill="var(--u2-muted)" fontSize="9">{format(value)}</text>
            </g>
          )
        })}
        {kind === 'volatility' && (
          <path d={`M${LEFT} ${yAt(0)}H${RIGHT}`} stroke="var(--u2-muted)" strokeDasharray="4 4" opacity=".7" />
        )}
        {kind === 'value' && (
          <path className="u2h-invested-line" d={linePath(invested, xAt, yAt)} />
        )}
        <path className={kind === 'volatility' ? 'u2h-move-line' : 'u2h-current-line'} d={linePath(values, xAt, yAt)} />
        {markers && values.map((value, index) => value === null ? null : (
          // Inside the expand button the markers stay out of the tab order:
          // a focusable element inside a button is invalid nesting.
          <circle key={index} cx={xAt(index)} cy={yAt(value)} r="3" fill="var(--u2-accent)" tabIndex={onExpand ? undefined : 0}>
            <title>{`${points[index].date} · ${format(value)}${amountSuffix}`}</title>
          </circle>
        ))}
        <text x={LEFT} y="165" fill="var(--u2-muted)" fontSize="9">{points[0]?.date ?? ''}</text>
        <text x={RIGHT} y="165" textAnchor="end" fill="var(--u2-muted)" fontSize="9">{points[points.length - 1]?.date ?? ''}</text>
      </svg>
    )
  }

  const tone = kind === 'value' || last === null ? '' : last < 0 ? 'u2-negative' : 'u2-positive'
  return (
    <section className="u2h-graph">
      <div className="u2h-graph-title">
        <h3>{title}</h3>
        <span className={tone}>{last === null ? '—' : format(last)}{kind === 'value' && last !== null ? ` ${unit}` : ''}</span>
      </div>
      {onExpand
        ? (
          <button type="button" className="u2h-graph-expand" onClick={onExpand}
            aria-label={`Open the full ${label} invested vs current history`}>
            {chart}
          </button>
        )
        : chart}
      {kind === 'value' && (
        <div className="u2h-legend-lines">
          <span><i className="u2h-legend-line" />Current value</span>
          <span><i className="u2h-legend-line u2h-legend-invested" />Invested amount</span>
        </div>
      )}
      <p>{NOTES[kind](unit)}</p>
    </section>
  )
}
```

```tsx
// The per-asset chart panels below (or above) Daily records: India, Europe
// and Gold, each with the three mini charts. Series reuse the classic chart
// helpers; only the date labels switch to the handoff's "16 Nov".
import type { HistoryRow } from '../../lib/api/client'
import {
  goldChartData, perCurrencyChartData, regionHasData,
} from '../../features/history/historyShared'
import { ASSET_LABELS, shortDate, type HistoryAsset } from './historyCells'
import { Ui2MiniChart, type MiniChartKind, type MiniChartPoint } from './Ui2MiniChart'

const KINDS: MiniChartKind[] = ['value', 'pl', 'volatility']

// assetSeries is one asset's oldest-first chart points with handoff dates.
// Both classic helpers sort oldest first, so index i is sorted row i.
export function assetSeries(rows: HistoryRow[], asset: HistoryAsset): MiniChartPoint[] {
  const oldestFirst = rows.toSorted((left, right) => left.date.localeCompare(right.date))
  const series = asset === 'GOLD' ? goldChartData(rows) : perCurrencyChartData(rows, asset)
  return series.map((point, index) => ({ ...point, date: shortDate(oldestFirst[index].date) }))
}

// chartedAssets keeps the assets that have something to plot, as the classic
// page shows a currency panel only with data and gold only with an overlay.
export function chartedAssets(rows: HistoryRow[], assets: HistoryAsset[]): HistoryAsset[] {
  return assets.filter(asset => asset === 'GOLD'
    ? rows.some(row => row.gold)
    : regionHasData(perCurrencyChartData(rows, asset)))
}

export function Ui2AssetCharts({ rows, assets, periodLabel, markers = true, onExpand }: {
  rows: HistoryRow[]
  assets: HistoryAsset[]
  // "November 2026", or "Full history" in the dialog.
  periodLabel: string
  markers?: boolean
  // Opens the zoomable full-history page for an asset's value chart.
  onExpand?: (asset: HistoryAsset) => void
}) {
  const shown = chartedAssets(rows, assets)
  if (shown.length === 0) return null
  return (
    <section className="u2h-chart-grid" aria-label="Supporting history charts">
      {shown.map(asset => {
        const points = assetSeries(rows, asset)
        const unit = asset === 'EUR' ? 'EUR' : 'INR'
        return (
          <section key={asset} className="ui2-panel u2h-asset-charts" aria-labelledby={`u2h-charts-${asset}`}>
            <div className="u2h-intro">
              <div>
                <h2 id={`u2h-charts-${asset}`}>{ASSET_LABELS[asset]}</h2>
                <p>{periodLabel}</p>
              </div>
            </div>
            <div className="u2h-asset-chart-grid">
              {KINDS.map(kind => (
                <Ui2MiniChart key={kind} points={points} kind={kind} unit={unit} markers={markers}
                  label={`${ASSET_LABELS[asset]}, ${periodLabel}`}
                  onExpand={kind === 'value' && onExpand ? () => onExpand(asset) : undefined} />
              ))}
            </div>
          </section>
        )
      })}
    </section>
  )
}
```

Month in review shows `periodPerformance` (opening row = latest before the
month) per asset; the method note is today's card footnote, since the
mock's note describes sample data.

```tsx
// "Month in review" (handoff): the classic period performance card's figures
// (periodPerformance, PD-049) in the reference's layout.
import type { HistoryRow } from '../../lib/api/client'
import {
  PERFORMANCE_COLUMN_SYMBOL, fmtSignedCurrency, periodPerformance, type PeriodPerformance,
} from '../../features/history/historyShared'
import { ASSET_LABELS, shortDate, signedPercent } from './historyCells'

const tone = (value: number | null) => value === null ? '' : value > 0 ? 'u2-positive' : value < 0 ? 'u2-negative' : ''

// A metric row: its label, the column's value (null renders "—") and how a
// present value reads.
const METRICS: {
  label: string
  value: (perf: PeriodPerformance) => number | null
  text: (value: number, perf: PeriodPerformance) => string
}[] = [
  { label: 'Opening P/L', value: perf => perf.openingPnlPct, text: signedPercent },
  { label: 'Closing P/L', value: perf => perf.closingPnlPct, text: signedPercent },
  { label: 'P/L change', value: perf => perf.pnlChangePp, text: value => signedPercent(value).replace('%', ' pp') },
  {
    label: 'Investment delta',
    value: perf => perf.moneyInvested,
    text: (value, perf) => fmtSignedCurrency(value, PERFORMANCE_COLUMN_SYMBOL[perf.column]),
  },
  { label: 'Approx. performance', value: perf => perf.performancePct, text: signedPercent },
]

export function Ui2MonthReview({ rows, monthStart, monthLabel }: {
  rows: HistoryRow[]
  monthStart: string
  monthLabel: string
}) {
  const columns = periodPerformance(rows, monthStart)
  if (columns.length === 0) return null
  const { openingDate, closingDate, closingTentative } = columns[0]
  return (
    <section className="ui2-panel u2h-month-summary" aria-labelledby="u2h-month-review">
      <div className="u2h-intro">
        <div>
          <h2 id="u2h-month-review">Month in review</h2>
          <p>
            {shortDate(openingDate)} – {shortDate(closingDate)}{closingTentative ? ' (live)' : ''} · {monthLabel}
          </p>
        </div>
      </div>
      <table className="ui2-table" aria-label="Monthly performance summary">
        <thead>
          <tr>
            <th scope="col">PERFORMANCE</th>
            {columns.map(perf => <th key={perf.column} scope="col">{ASSET_LABELS[perf.column]}</th>)}
          </tr>
        </thead>
        <tbody>
          {METRICS.map(metric => (
            <tr key={metric.label}>
              <th scope="row">{metric.label}</th>
              {columns.map(perf => {
                const value = metric.value(perf)
                return <td key={perf.column} className={tone(value)}>{value === null ? '—' : metric.text(value, perf)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="u2h-method-note">
        Approximate performance: money added during the month counts as added at its end, and a sale
        is valued at the bucket&apos;s current-to-cost ratio. Dividends are not included.
      </p>
    </section>
  )
}
```

Daily records: newest first (the handoff's `Date ↓`), group headers per
asset, Gold without a Dividends column, value buttons to the per-stock
breakdown only when that day holds stock, LIVE label on today's row,
Edit only (no Edit on the live row).

```tsx
// "Daily records" (handoff snapshotTable): the month's rows per asset group,
// with the classic table's tints in the reference's placement — the P/L cell
// by the day-over-day value move, the Invested cell purple on a new
// investment. Figures come from assetCells, so they equal the classic table.
import { useMemo, useState } from 'react'
import type { HistoryRow } from '../../lib/api/client'
import { fmtCurrency, type RegionKey } from '../../features/history/historyShared'
import {
  ASSET_LABELS, ASSET_SYMBOL, DIRECTION_CUE, DIRECTION_TITLE, FILTER_LABELS,
  assetCells, rowSource, shortDate, signedPercent, visibleAssets,
  type AssetFilter, type HistoryAsset,
} from './historyCells'

const FILTERS: AssetFilter[] = ['ALL', 'INR', 'EUR', 'GOLD']

export function Ui2DailyRecords({ rows, filter, onFilter, onEdit, onSelectRegion }: {
  rows: HistoryRow[]
  filter: AssetFilter
  onFilter: (filter: AssetFilter) => void
  onEdit: (row: HistoryRow) => void
  // Opens the per-stock breakdown (HoldingsModal) for a currency group.
  onSelectRegion: (row: HistoryRow, prev: HistoryRow | null, region: RegionKey) => void
}) {
  // Newest first by default, like the handoff; the classic helpers read
  // newestFirst[i + 1] as the prior day whatever the display order.
  const [newestFirst, setNewestFirst] = useState(true)
  const byDateDesc = useMemo(() => rows.toSorted((left, right) => right.date.localeCompare(left.date)), [rows])
  const hasGold = useMemo(() => rows.some(row => row.gold), [rows])
  const filters = hasGold ? FILTERS : FILTERS.filter(option => option !== 'GOLD')
  const assets = visibleAssets(filter, hasGold)
  const indexes = byDateDesc.map((_, index) => index)
  const display = newestFirst ? indexes : indexes.toReversed()

  return (
    <section className="ui2-panel u2h-snapshot-panel" aria-labelledby="u2h-daily-records">
      <div className="u2h-snapshot-top">
        <div>
          <h2 id="u2h-daily-records">Daily records <span className="u2h-count">{rows.length}</span></h2>
          <p className="ui2-subtitle">Select a value to inspect that day’s holdings.</p>
        </div>
        <div className="u2h-filters" role="group" aria-label="Filter snapshot currencies">
          {filters.map(option => (
            <button key={option} type="button" className={filter === option ? 'active' : undefined}
              aria-pressed={filter === option} onClick={() => onFilter(option)}>
              {FILTER_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <div className="u2h-snap-scroll">
        <table className="ui2-table u2h-snapshots" data-single={assets.length === 1 ? 'true' : undefined}
          aria-label="Daily portfolio snapshots">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" aria-sort={newestFirst ? 'descending' : 'ascending'}>
                <button type="button" className="u2h-day-link" onClick={() => setNewestFirst(order => !order)}>
                  Date {newestFirst ? '↓' : '↑'}
                </button>
              </th>
              {assets.map(asset => (
                <th key={asset} scope="colgroup" colSpan={asset === 'GOLD' ? 4 : 5} className="u2h-group-border">
                  {ASSET_LABELS[asset]}
                </th>
              ))}
              <th rowSpan={2} scope="col">Actions</th>
            </tr>
            <tr>
              {assets.map(asset => (
                <AssetHeaders key={asset} asset={asset} />
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map(index => {
              const row = byDateDesc[index]
              const prev = byDateDesc[index + 1] ?? null
              return (
                <tr key={row.date}>
                  <td>
                    <strong>{shortDate(row.date)}</strong>
                    {row.tentative && <span className="u2h-live-label">LIVE</span>}
                    <span className="u2h-source">{rowSource(row)}</span>
                  </td>
                  {assets.map(asset => (
                    <AssetRowCells key={asset} rows={byDateDesc} index={index} asset={asset}
                      onSelect={asset === 'GOLD' ? undefined : () => onSelectRegion(row, prev, asset)} />
                  ))}
                  <td>
                    {row.tentative
                      ? <span className="u2-muted">—</span>
                      : (
                        <button type="button" className="ui2-btn u2h-edit" onClick={() => onEdit(row)}
                          aria-label={`Edit snapshot ${row.date}`}>Edit</button>
                      )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="u2h-legend" aria-label="History colour legend">
        <span className="u2h-up">↑ Value moved up</span>
        <span className="u2h-down">↓ Value moved down</span>
        <span className="u2h-flat">＝ Unchanged</span>
        <span className="u2h-new">＋ New investment</span>
        <small>P/L cell tint compares value with the previous day; purple marks increased invested amount.</small>
      </div>
      <div className="u2h-overflow-note">
        {assets.length > 1 ? 'Scroll horizontally for all currency groups, or select a single asset group. ' : ''}
        Daily volatility is the day’s change net of money added or withdrawn; “—” means no baseline is available.
      </div>
    </section>
  )
}

function AssetHeaders({ asset }: { asset: HistoryAsset }) {
  return (
    <>
      <th scope="col" className="u2h-group-border">INVESTED</th>
      <th scope="col">VALUE</th>
      <th scope="col">DAILY VOLATILITY</th>
      <th scope="col">P/L</th>
      {asset !== 'GOLD' && <th scope="col">DIVIDENDS</th>}
    </>
  )
}

function AssetRowCells({ rows, index, asset, onSelect }: {
  rows: HistoryRow[]
  index: number
  asset: HistoryAsset
  onSelect?: () => void
}) {
  const cells = assetCells(rows, index, asset)
  const sym = ASSET_SYMBOL[asset]
  const money = (amount: number | null) => amount === null ? '—' : fmtCurrency(amount, sym)
  const direction = cells.direction ?? 'none'
  const date = rows[index].date
  return (
    <>
      <td className={`u2h-group-border${cells.newInvestment ? ' u2h-new' : ''}`}
        title={cells.newInvestment ? 'New investment — invested amount increased versus prior day' : 'Invested amount'}>
        {money(cells.invested)}
        {cells.newInvestment && <span className="u2h-cue">＋ New investment</span>}
      </td>
      <td>
        {onSelect && cells.hasHoldings
          ? (
            <button type="button" className="u2h-day-link" onClick={onSelect}
              aria-label={`View ${asset} holdings on ${date}`}>{money(cells.current)}</button>
          )
          : money(cells.current)}
      </td>
      <td className={cells.volatility === null ? '' : cells.volatility < 0 ? 'u2-negative' : cells.volatility > 0 ? 'u2-positive' : ''}>
        {cells.volatility === null ? '—' : signedPercent(cells.volatility)}
      </td>
      <td className={`u2h-move u2h-${direction}`} title={DIRECTION_TITLE[direction]}>
        {cells.pnlPct === null ? '—' : signedPercent(cells.pnlPct)}
        <span className="u2h-cue">{DIRECTION_CUE[direction]}</span>
      </td>
      {asset !== 'GOLD' && (
        <td className={cells.dividendsOnDay > 0 ? 'u2h-dividend-day' : undefined}
          title={cells.dividendsOnDay > 0 ? `+${fmtCurrency(cells.dividendsOnDay, sym)} received this day` : undefined}>
          {money(cells.dividendsToDate)}
          {cells.dividendsOnDay > 0 && <span className="u2h-cue">+{fmtCurrency(cells.dividendsOnDay, sym)} today</span>}
        </td>
      )}
    </>
  )
}
```

```css
/* UI_2.0 History (PD-059 slice 13), ported 1:1 from the handoff's
 * .history-*, .month-summary, .snapshot-* and .snapshot-graph rules onto the
 * --u2-* palette. Class names carry a u2h- prefix; shared pieces (panel,
 * button, table, tones) live in ../primitives.css. */

:root[data-ui="ui2"] .u2h-page { color: var(--u2-text); }

:root[data-ui="ui2"] .u2h-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 25px 0 20px;
  flex-wrap: wrap;
}

:root[data-ui="ui2"] .u2h-month-nav {
  display: flex;
  gap: 8px;
  align-items: center;
}

:root[data-ui="ui2"] .u2h-month-select {
  border: 1px solid var(--u2-border);
  background: var(--u2-panel);
  color: var(--u2-text);
  border-radius: 6px;
  font: 700 15px var(--u2-font);
  padding: 10px 15px;
}

:root[data-ui="ui2"] .u2h-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

:root[data-ui="ui2"] .u2h-controls label {
  font-size: 11px;
  color: var(--u2-muted);
  display: flex;
  align-items: center;
  gap: 7px;
}

:root[data-ui="ui2"] .u2h-alert {
  border: 1px solid var(--u2-red);
  background: var(--u2-redsoft);
  color: var(--u2-red);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 20px;
  font-size: 12px;
}

:root[data-ui="ui2"] .u2h-empty {
  padding: 32px;
  text-align: center;
  color: var(--u2-muted);
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .u2h-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

:root[data-ui="ui2"] .u2h-intro p {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--u2-muted);
}

/* ---------- Month in review ---------- */

:root[data-ui="ui2"] .u2h-month-summary {
  padding: 20px 23px;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .u2h-month-summary table { margin-top: 18px; }

:root[data-ui="ui2"] .u2h-month-summary th,
:root[data-ui="ui2"] .u2h-month-summary td { padding: 11px 16px; }

:root[data-ui="ui2"] .u2h-month-summary th:first-child,
:root[data-ui="ui2"] .u2h-month-summary td:first-child {
  width: 29%;
  padding-left: 0;
  text-align: left;
}

:root[data-ui="ui2"] .u2h-month-summary thead th { background: transparent; }

/* The metric names are row headers: body text, not column-header type. */
:root[data-ui="ui2"] .u2h-month-summary tbody th {
  font-size: 11px;
  letter-spacing: 0;
  color: var(--u2-text);
  background: transparent;
  border-bottom: 1px solid var(--u2-border);
}

:root[data-ui="ui2"] .u2h-month-summary tr:last-child th { border-bottom: 0; }

:root[data-ui="ui2"] .u2h-month-summary td:last-child { padding-right: 0; }

:root[data-ui="ui2"] .u2h-method-note {
  color: var(--u2-muted);
  font-size: 10px;
  line-height: 1.7;
  margin: 13px 0 0;
}

/* ---------- Daily records ---------- */

:root[data-ui="ui2"] .u2h-snapshot-panel { margin-bottom: 20px; }

:root[data-ui="ui2"] .u2h-snapshot-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 19px 22px;
  border-bottom: 1px solid var(--u2-border);
  gap: 10px;
}

:root[data-ui="ui2"] .u2h-snapshot-top .ui2-subtitle { margin-top: 6px; }

:root[data-ui="ui2"] .u2h-filters {
  display: flex;
  gap: 5px;
}

:root[data-ui="ui2"] .u2h-filters button {
  font: 11px var(--u2-font);
  padding: 7px 11px;
  border: 1px solid var(--u2-border);
  background: none;
  border-radius: 7px;
  color: var(--u2-muted);
  cursor: pointer;
}

:root[data-ui="ui2"] .u2h-filters button.active {
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  border-color: var(--u2-accent);
}

:root[data-ui="ui2"] .u2h-count {
  display: inline-grid;
  place-items: center;
  min-width: 19px;
  height: 18px;
  font-size: 10px;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  border-radius: 5px;
  margin-left: 6px;
}

:root[data-ui="ui2"] .u2h-snap-scroll { overflow-x: auto; }

:root[data-ui="ui2"] .u2h-snapshots { min-width: 1050px; }

:root[data-ui="ui2"] .u2h-snapshots[data-single="true"] { min-width: 650px; }

:root[data-ui="ui2"] .u2h-snapshots thead tr:first-child th {
  padding: 13px 12px;
  font-weight: 700;
  font-size: 11px;
  text-align: center;
  border-bottom: 1px solid var(--u2-border);
}

:root[data-ui="ui2"] .u2h-snapshots th {
  font-size: 9px;
  padding: 10px 12px;
}

:root[data-ui="ui2"] .u2h-snapshots td { padding: 14px 12px; }

:root[data-ui="ui2"] .u2h-snapshots th:first-child,
:root[data-ui="ui2"] .u2h-snapshots td:first-child {
  position: sticky;
  left: 0;
  background: var(--u2-panel);
  z-index: 1;
  text-align: left;
  min-width: 125px;
}

:root[data-ui="ui2"] .u2h-snapshots .u2h-group-border { border-left: 1px solid var(--u2-border); }

:root[data-ui="ui2"] .u2h-day-link {
  border: 0;
  background: none;
  color: var(--u2-accent);
  padding: 0;
  font: inherit;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 4px;
  cursor: pointer;
}

:root[data-ui="ui2"] .u2h-source {
  display: block;
  font-size: 8px;
  margin-top: 5px;
  color: var(--u2-muted);
}

:root[data-ui="ui2"] .u2h-live-label {
  font-size: 8px;
  padding: 3px 5px;
  border-radius: 4px;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  margin-left: 4px;
}

:root[data-ui="ui2"] .u2h-edit {
  padding: 5px 8px;
  font-size: 10px;
}

:root[data-ui="ui2"] .u2h-up { background: rgba(34, 197, 94, 0.18); }
:root[data-ui="ui2"] .u2h-down { background: rgba(239, 68, 68, 0.18); }
:root[data-ui="ui2"] .u2h-flat { background: rgba(59, 130, 246, 0.18); }

:root[data-ui="ui2"] .u2h-new {
  background: rgba(168, 85, 247, 0.18);
  font-weight: 600;
}

:root[data-ui="ui2"] .u2h-dividend-day { background: var(--u2-greensoft); }

:root[data-ui="ui2"] .u2h-move { color: var(--u2-text); }

:root[data-ui="ui2"] .u2h-cue {
  display: block;
  font-size: 8px;
  font-weight: 500;
  margin-top: 5px;
  white-space: nowrap;
}

:root[data-ui="ui2"] .u2h-none .u2h-cue { color: var(--u2-muted); }

:root[data-ui="ui2"] .u2h-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 13px 20px;
  border-bottom: 1px solid var(--u2-border);
  font-size: 10px;
}

:root[data-ui="ui2"] .u2h-legend > span {
  border-radius: 5px;
  padding: 6px 9px;
}

:root[data-ui="ui2"] .u2h-legend small {
  width: 100%;
  font-size: 10px;
  color: var(--u2-muted);
  line-height: 1.6;
}

:root[data-ui="ui2"] .u2h-overflow-note {
  font-size: 10px;
  color: var(--u2-muted);
  padding: 12px 20px;
}

/* ---------- per-asset charts ---------- */

:root[data-ui="ui2"] .u2h-chart-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .u2h-asset-charts { padding: 20px; }

:root[data-ui="ui2"] .u2h-asset-charts .u2h-intro {
  border-bottom: 1px solid var(--u2-border);
  padding-bottom: 15px;
}

:root[data-ui="ui2"] .u2h-asset-chart-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

:root[data-ui="ui2"] .u2h-graph {
  padding: 0;
  min-width: 0;
}

:root[data-ui="ui2"] .u2h-graph svg {
  width: 100%;
  height: auto;
  min-height: 125px;
  margin-top: 12px;
  display: block;
}

:root[data-ui="ui2"] .u2h-graph p {
  font-size: 10px;
  line-height: 1.7;
  color: var(--u2-muted);
  margin: 6px 0 0;
}

:root[data-ui="ui2"] .u2h-graph circle:focus { outline: 2px solid var(--u2-accent); }

:root[data-ui="ui2"] .u2h-graph-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

:root[data-ui="ui2"] .u2h-graph-title h3 {
  font-size: 11px;
  margin: 0;
  color: var(--u2-muted);
  font-weight: 500;
}

:root[data-ui="ui2"] .u2h-graph-title span {
  font-size: 11px;
  font-weight: 700;
}

:root[data-ui="ui2"] .u2h-graph-expand {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  background: none;
  cursor: pointer;
  border-radius: 6px;
}

:root[data-ui="ui2"] .u2h-graph-expand:focus-visible {
  outline: 3px solid var(--u2-accent);
  outline-offset: 2px;
}

:root[data-ui="ui2"] .u2h-graph-empty {
  min-height: 125px;
  display: grid;
  place-content: center;
}

:root[data-ui="ui2"] .u2h-current-line {
  fill: none;
  stroke: var(--u2-accent);
  stroke-width: 2.2;
}

:root[data-ui="ui2"] .u2h-move-line {
  fill: none;
  stroke: var(--u2-muted);
  stroke-width: 2.2;
}

:root[data-ui="ui2"] .u2h-invested-line {
  fill: none;
  stroke: var(--u2-muted);
  stroke-width: 2.2;
  stroke-dasharray: 6 4;
}

:root[data-ui="ui2"] .u2h-legend-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 10px;
  color: var(--u2-muted);
  margin: 2px 0 10px;
}

:root[data-ui="ui2"] .u2h-legend-lines span {
  display: flex;
  align-items: center;
  gap: 6px;
}

:root[data-ui="ui2"] .u2h-legend-line {
  width: 17px;
  border-top: 2px solid var(--u2-accent);
}

:root[data-ui="ui2"] .u2h-legend-invested {
  border-color: var(--u2-muted);
  border-top-style: dashed;
}

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2h-asset-chart-grid { grid-template-columns: 1fr; }

  :root[data-ui="ui2"] .u2h-graph {
    padding-bottom: 18px;
    border-bottom: 1px solid var(--u2-border);
  }

  :root[data-ui="ui2"] .u2h-graph:last-child { border: 0; }

  :root[data-ui="ui2"] .u2h-graph svg { max-height: 220px; }
}

@media (max-width: 760px) {
  :root[data-ui="ui2"] .u2h-toolbar {
    align-items: flex-start;
    gap: 15px;
  }

  :root[data-ui="ui2"] .u2h-controls { flex-wrap: wrap; }

  :root[data-ui="ui2"] .u2h-controls label {
    width: 100%;
    margin-bottom: 4px;
  }

  :root[data-ui="ui2"] .u2h-month-summary { padding: 17px; }

  :root[data-ui="ui2"] .u2h-month-summary th,
  :root[data-ui="ui2"] .u2h-month-summary td {
    padding: 10px 7px;
    font-size: 10px;
  }

  :root[data-ui="ui2"] .u2h-month-summary th:first-child,
  :root[data-ui="ui2"] .u2h-month-summary td:first-child { width: 31%; }

  :root[data-ui="ui2"] .u2h-snapshot-top {
    padding: 17px;
    align-items: flex-start;
    flex-direction: column;
  }

  :root[data-ui="ui2"] .u2h-intro { align-items: flex-start; }
}
```

* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run src/ui2/history/historyCells.test.ts && npx eslint src/ui2`
  Expected: no type errors; `12 passed`; no lint output.
* [ ] **Commit:** `git add frontend/src/ui2/history/Ui2MiniChart.tsx frontend/src/ui2/history/Ui2AssetCharts.tsx frontend/src/ui2/history/Ui2MonthReview.tsx frontend/src/ui2/history/Ui2DailyRecords.tsx frontend/src/ui2/history/history.css && git commit -m "✨ Add UI_2.0 History tables and charts"`

### Task 6: Compose the page and switch it on for UI_2.0

**Files:** `frontend/src/ui2/history/Ui2History.tsx`, `frontend/src/ui2/history/Ui2History.test.tsx` (create); `HistoryPage.tsx` (modify)

`Ui2History` renders the hook's state in the handoff order: intro,
toolbar (‹ month select ›, Charts on top checkbox, Paste month, Add
record), error, empty state, Month in review (only when the loaded rows
are the selected month's, as today), then table and charts in the chosen
order. The ‹ › buttons reuse `shiftMonth`. A Gold filter in a month without
gold shows All assets without forgetting the choice. Dialogs are today's
components; Edit passes `onDelete` only under the delete rule and closes
after a confirmed delete.

```tsx
// The UI_2.0 History page (PD-059 slice 13), laid out 1:1 from the handoff:
// intro, month toolbar, Month in review, Daily records and the per-asset
// charts. HistoryPage owns the data and every action (useHistoryMonth); this
// component only renders them, and reuses the classic dialogs.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MIN_YEAR, isAllManual } from '../../features/history/historyShared'
import { shiftMonth } from '../../features/history/MonthNavigator'
import type { useHistoryMonth } from '../../features/history/useHistoryMonth'
import {
  AddRowModal, ConflictDialog, EditRowModal, HoldingsModal, PasteModal,
} from '../../features/history/HistoryModals'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { longMonthLabel, monthOptions, visibleAssets, type AssetFilter, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'
import { Ui2DailyRecords } from './Ui2DailyRecords'
import { Ui2MonthReview } from './Ui2MonthReview'
import './history.css'

type HistoryMonth = ReturnType<typeof useHistoryMonth>

export function Ui2History({ history, canForceDelete }: {
  history: HistoryMonth
  canForceDelete: boolean
}) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<AssetFilter>('ALL')
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, loading, error,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  } = history

  const min = { year: MIN_YEAR, month0: 0 }
  const selected = { year, month0: month }
  const choose = (next: { year: number; month0: number }) => { setYear(next.year); setMonth(next.month0) }
  const atMin = year === min.year && month === min.month0
  const atMax = year === today.year && month === today.month0
  const monthLabel = longMonthLabel(year, month)
  const hasGold = displayRows.some(row => row.gold)
  // A month without gold has no Gold filter: show All assets, but keep the
  // choice so returning to a gold month restores it.
  const effectiveFilter: AssetFilter = filter === 'GOLD' && !hasGold ? 'ALL' : filter
  const assets = visibleAssets(effectiveFilter, hasGold)
  const expand = (asset: HistoryAsset) => navigate(`/history/chart/${asset === 'GOLD' ? 'gold' : asset}`)

  const table = (
    <Ui2DailyRecords rows={displayRows} filter={effectiveFilter} onFilter={setFilter}
      onEdit={row => setEditRow(row)}
      onSelectRegion={(row, prev, region) => setHoldingsView({ row, prev, region })} />
  )
  const charts = <Ui2AssetCharts rows={displayRows} assets={assets} periodLabel={monthLabel} onExpand={expand} />

  return (
    <div className="u2h-page">
      <Ui2PageIntro title="Your portfolio through time"
        subtitle="Daily snapshots, monthly perspective, and the details behind every day." />

      <div className="u2h-toolbar">
        <div className="u2h-month-nav">
          <button type="button" className="ui2-btn" aria-label="Previous month" disabled={atMin}
            onClick={() => choose(shiftMonth(selected, -1, min, today))}>‹</button>
          <select className="u2h-month-select" aria-label="Snapshot month" value={`${year}-${month}`}
            onChange={e => {
              const [nextYear, nextMonth] = e.target.value.split('-').map(Number)
              choose({ year: nextYear, month0: nextMonth })
            }}>
            {monthOptions(today).map(option => (
              <option key={`${option.year}-${option.month0}`} value={`${option.year}-${option.month0}`}>{option.label}</option>
            ))}
          </select>
          <button type="button" className="ui2-btn" aria-label="Next month" disabled={atMax}
            onClick={() => choose(shiftMonth(selected, 1, min, today))}>›</button>
        </div>
        <div className="u2h-controls">
          <label><input type="checkbox" checked={chartsOnTop} onChange={toggleChartsOnTop} /> Charts on top</label>
          <button type="button" className="ui2-btn" onClick={() => setPasteOpen(true)}>Paste month</button>
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setAddOpen(true)}>＋ Add record</button>
        </div>
      </div>

      {error && <div className="u2h-alert" role="alert">Error: {error}</div>}

      {!loading && displayRows.length === 0 && (
        <div className="ui2-panel u2h-empty">
          No data for {monthLabel} yet. Your first snapshot will be taken at the next daily run, or you can add records manually.
        </div>
      )}

      {/* Only when the loaded rows are the selected month's: mid-reload, or
          after a failed one, the rows still hold the previous month. */}
      {rowsMonthStart === selectedMonthStart && (
        <Ui2MonthReview rows={displayRows} monthStart={selectedMonthStart} monthLabel={monthLabel} />
      )}

      {displayRows.length > 0 && (chartsOnTop ? <>{charts}{table}</> : <>{table}{charts}</>)}

      {addOpen && <AddRowModal onSubmit={handleAddSaved} onCancel={() => setAddOpen(false)} />}
      {editRow && <EditRowModal row={editRow} onSubmit={handleEditSaved} onCancel={() => setEditRow(null)}
        onDelete={isAllManual(editRow.regions) || canForceDelete
          ? async date => { if (await handleDelete(date)) setEditRow(null) }
          : undefined} />}
      {pasteOpen && <PasteModal monthLabel={`${year}-${String(month + 1).padStart(2, '0')}`}
        onSubmit={async input => {
          const report = await handlePasteSubmit(input)
          if (report.conflicts.length === 0 && report.rejected.length === 0) setPasteOpen(false)
          return report
        }}
        onCancel={() => setPasteOpen(false)} />}
      {headConflict && <ConflictDialog conflict={headConflict} onResolve={handleConflictResolve} onSkip={handleConflictSkip} />}
      {holdingsView && <HoldingsModal row={holdingsView.row} prev={holdingsView.prev} region={holdingsView.region}
        onClose={() => setHoldingsView(null)} />}
    </div>
  )
}
```

Behaviour tests: ui2 renders the handoff page and other modes the classic
one; the filter narrows groups and falls back to All in a month without
gold; tints and new-investment cue; Delete in
Edit only for an all-manual row (or a super admin); breakdown opens;
Charts on top reorders; month arrows load the month.

```tsx
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { HistoryList, HistoryRow, User } from '../../lib/api/client'

const mockApi = vi.hoisted(() => ({
  listHistory: vi.fn(),
  addHistoryRow: vi.fn(),
  patchHistoryRegions: vi.fn(),
  deleteHistoryRow: vi.fn(),
  pasteHistory: vi.fn(),
  getPrices: vi.fn(),
  getGoldMetrics: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const mockAuth = vi.hoisted(() => ({ user: null as Partial<User> | null }))

vi.mock('../../features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../features/auth/AuthContext')>('../../features/auth/AuthContext')
  return { ...actual, useAuthOptional: () => (mockAuth.user ? { user: mockAuth.user } : null) }
})

import HistoryPage from '../../features/history/HistoryPage'

// Outside the live window (03:30–20:30 UTC), so only stored rows render.
const FROZEN_NOW = new Date('2026-11-16T22:00:00Z')

const row = (date: string, invested: number, current: number, source: 'cron' | 'manual' = 'cron', extra: Partial<HistoryRow> = {}): HistoryRow => ({
  date,
  regions: {
    INR: { invested, current, source },
    EUR: { invested: 100, current: 110, source },
  },
  totals: { invested_total: invested, current_total: current, pnl_pct: 0 },
  ...extra,
})

const novemberRows: HistoryRow[] = [
  row('2026-10-30', 1000, 1100),
  row('2026-11-13', 1000, 1150, 'manual'),
  row('2026-11-16', 1200, 1300, 'cron', {
    holdings: [{ symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 650, price_date: '2026-11-16', current: 1300 }],
  }),
]

const list = (rows: HistoryRow[]): HistoryList => ({ currency: 'INR', rows })

const renderPage = () => render(<MemoryRouter><HistoryPage /></MemoryRouter>)

describe('UI_2.0 History page', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FROZEN_NOW)
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'ui2', premium: false, gold_enabled: false }
    mockApi.listHistory.mockResolvedValue(list(novemberRows))
    mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
    try { window.localStorage.removeItem('pd_history_charts_top') } catch { /* private mode */ }
  })

  it('renders the handoff layout instead of the classic page', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Your portfolio through time' })).toBeInTheDocument()
    expect(screen.queryByText('Historical data')).not.toBeInTheDocument()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    expect(screen.getByRole('table', { name: 'Monthly performance summary' })).toBeInTheDocument()
    expect((screen.getByRole('combobox', { name: 'Snapshot month' }) as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe('November 2026')
  })

  it('keeps the classic page for other interfaces', async () => {
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'glass', premium: false, gold_enabled: false }
    renderPage()
    expect(screen.getByText('Historical data')).toBeInTheDocument()
    expect(screen.queryByText('Your portfolio through time')).not.toBeInTheDocument()
  })

  it('narrows Daily records to one asset group', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    expect(within(table).getByRole('columnheader', { name: 'Europe · EUR' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'INR' }))
    expect(screen.getByRole('button', { name: 'INR' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(table).queryByRole('columnheader', { name: 'Europe · EUR' })).not.toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'India · INR' })).toBeInTheDocument()
    // No gold overlay, so no Gold filter.
    expect(screen.queryByRole('button', { name: 'Gold' })).not.toBeInTheDocument()
  })

  it('tints the P/L cell by direction and marks a new investment', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    const latest = within(table).getAllByRole('row').find(tableRow => tableRow.textContent?.startsWith('16 Nov'))!
    expect(within(latest).getAllByText('＋ New investment')).toHaveLength(1)
    expect(within(latest).getByText('↑ Up')).toBeInTheDocument()
  })

  it('offers Delete inside the Edit dialog only for an all-manual row', async () => {
    mockApi.deleteHistoryRow.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.queryByRole('button', { name: 'Delete row' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-13' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete row' }))
    await waitFor(() => expect(mockApi.deleteHistoryRow).toHaveBeenCalledWith('2026-11-13'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets a super admin delete a cron row from the Edit dialog', async () => {
    mockAuth.user = { id: 'u1', role: 'superadmin', ui_mode: 'ui2', premium: false, gold_enabled: false }
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.getByRole('button', { name: 'Delete row' })).toBeInTheDocument()
  })

  it('opens the per-stock breakdown from a value', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'View INR holdings on 2026-11-16' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('TCS')
  })

  it('moves the charts above the table when Charts on top is checked', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    const charts = screen.getByRole('region', { name: 'Supporting history charts' })
    expect(table.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Charts on top' }))
    const movedTable = screen.getByRole('table', { name: 'Daily portfolio snapshots' })
    const movedCharts = screen.getByRole('region', { name: 'Supporting history charts' })
    expect(movedTable.compareDocumentPosition(movedCharts) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('shows All assets in a month without gold and restores Gold on return', async () => {
    const withGold = (date: string): HistoryRow =>
      row(date, 1000, 1100, 'cron', { gold: { invested: 500, current: 520, pnl_pct: 4, volatility_pct: 0 } })
    mockApi.listHistory.mockImplementation(async (from: string) =>
      list(from === '2026-11-01' ? [withGold('2026-11-13'), withGold('2026-11-16')] : [row('2026-10-15', 1000, 1100)]))
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    await within(table).findByRole('columnheader', { name: 'Gold · INR' })
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }))
    expect(within(table).queryByRole('columnheader', { name: 'India · INR' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(screen.getAllByText('15 Oct').length).toBeGreaterThan(0))
    const october = screen.getByRole('table', { name: 'Daily portfolio snapshots' })
    expect(within(october).getByRole('columnheader', { name: 'India · INR' })).toBeInTheDocument()
    expect(within(october).getByRole('columnheader', { name: 'Europe · EUR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All assets' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Gold' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() => expect(screen.getAllByText('16 Nov').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: 'Gold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('steps months with the arrows and loads that month', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31', true))
  })
})
```

* [ ] **Switch it on in `HistoryPage.tsx`.** After `import { useAuthOptional } from '../auth/AuthContext'` add:

```tsx
import { useUiMode } from '../../lib/uiMode'
import { Ui2History } from '../../ui2/history/Ui2History'
```

Current component head (from Task 1):

```tsx
export default function HistoryPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const canForceDelete = auth?.user?.role === 'superadmin'
  const history = useHistoryMonth()
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, currency, loading, error,
    chartsByRegion, goldChart, hasGoldChart,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  } = history
```

Replace with:

```tsx
export default function HistoryPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const canForceDelete = auth?.user?.role === 'superadmin'
  const uiMode = useUiMode()
  const history = useHistoryMonth()
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, currency, loading, error,
    chartsByRegion, goldChart, hasGoldChart,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  } = history

  // UI_2.0 renders the same month and actions in the handoff layout (PD-059).
  if (uiMode === 'ui2') return <Ui2History history={history} canForceDelete={canForceDelete} />
```

* [ ] **Verify:** `cd frontend && npx tsc -b && npx vitest run src/ui2/history src/features/history && npm run lint:changed`
  Expected: `7 passed` files, `199 passed` tests; lint clean.
* [ ] **Verify full suite:** `cd frontend && npx vitest run` — Expected: all files pass (`86 passed` files, `776 passed` tests at time of writing).
* [ ] **Commit:** `git add frontend/src/ui2/history/Ui2History.tsx frontend/src/ui2/history/Ui2History.test.tsx && git commit -m "✨ Add the UI_2.0 History page"`

### Task 7: Board and registry

**Files:** `docs/plans/PD-059-ui-2-status.md` (modify)

* [ ] Row 13: owner Claude, branch `feat/PD-059-history`, PR number, `in review` (→ `merged` on merge).
* [ ] Registry rows: `Ui2PageIntro` (`ui2/shell/Ui2PageIntro.tsx`, title/subtitle/actions), `primitives.css` (`.ui2-intro`, `.ui2-panel`, `.ui2-btn`, `.ui2-btn-primary`, `.ui2-table`, `.u2-positive/-negative/-muted`), `useHistoryMonth` (History data + actions for both interfaces), `Ui2MiniChart` (handoff SVG mini chart; slice 14 reuses it).
* [ ] **Verify:** `npx markdownlint-cli2 docs/plans/PD-059-ui-2-status.md` — Expected: `0 error(s)`.
* [ ] **Commit:** `git add docs/plans/PD-059-ui-2-status.md && git commit -m "📝 Record slice 13 on the status board"`

### Task 8: End-to-end verification

**Files:** none (throwaway stack)

Run a throwaway backend (`PORT=8091 MONGODB_DATABASE=portfolio_s13check`)
and Vite on another port proxied to it; never the owner's :8080/:3000.
Sign up a user, set `ui_mode: "ui2"` in Mongo, seed a month of snapshots
(INR + EUR, one all-manual day, per-stock lines, an invested increase).

* [ ] UI_2.0 `/history`: intro text, month select shows the current month, ‹ disabled at Jan 2020, › disabled at the current month. Expected: matches the handoff History frame at 1280 px in Light, Dark, Cyber.
* [ ] Month in review values equal the classic card for the same account switched to Glass.
* [ ] Filter INR / EUR / All: groups hide and return; Gold chip only for a gold-enabled account with an overlay.
* [ ] A cron row's Edit has no Delete; an all-manual row's Edit deletes after the confirm and closes; as super admin a cron row offers Delete.
* [ ] A value opens the per-stock breakdown; a value chart opens `/history/chart/INR`.
* [ ] Charts on top reorders and persists across reload.
* [ ] 390 px: no horizontal page scroll; the table scrolls inside its panel.
* [ ] Switch the account to Glass: the classic page renders as before, except the first gold purchase is now purple.
* [ ] Drop the throwaway database and stop both servers.

## 5. Done

* [ ] UI_2.0 History renders the handoff page with all of today's data and actions.
* [ ] Classic and Glass History unchanged apart from the Gold tint fix; existing History tests pass untouched, plus the new first-gold test.
* [ ] Shared primitives and `useHistoryMonth` registered for reuse.

**Next:** slice 14 amendment (History dialogs restyle, Full-history charts
dialog reusing `Ui2AssetCharts` with `markers={false}`, full-history chart
page restyle), then slice 12 after slice 11.
