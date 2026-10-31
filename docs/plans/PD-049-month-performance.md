# PD-049: Rollout plan — month performance card on History

* **Status**: Draft v1, owner decisions of 2026-10-31 applied
* **Owner**: project owner
* **Goal**: The History page shows, for the selected month, a card with each
  currency's (and gold's) opening P/L, closing P/L, P/L change in pp and an
  approximate flow-adjusted investment performance. The figures match the
  owner's hand-made October 2026 table to two decimals.
* **Architecture**: frontend-only. `monthRange` already loads the previous
  month's last row, which is the opening baseline. A pure
  `periodPerformance(rows, monthStart)` in `historyShared.ts` reuses `pnlPct`
  and the Daily volatlity flow adjustment (exported as
  `flowAdjustedReturnPct`). A presentational `PeriodPerformanceCard` renders
  it above the table.
* **Tech stack**: React 18, TypeScript 5.4, Vite, vitest 4 + Testing Library,
  ESLint 9 (`id-length`). No new dependencies, no API change.
* **Spec**: [PRD-006](../prds/PRD-006-month-performance.md) ·
  [DD-006](../designs/DD-006-month-performance.md) ·
  [visual spec](../visuals/PD-049-month-performance.html)
  ([published](https://claude.ai/artifact/UFs22YQtmgsJYMcQXCoGkD))

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | `pnlPct`, the Daily volatlity flow adjustment, `REGIONS`, `formatDayMonth`, `th`/`td` reused; nothing re-implemented |
| Branch → PR, never `main` | CLAUDE.md | one branch per PR, created from `main` in the task that opens it |
| Frontend and backend never in one PR | CLAUDE.md | no backend change at all |
| Every slice passes the three gates | `task-breakdown` skill | §PR sequence |
| PR body < 200 words: What / How to test / No regression | `task-breakdown` skill | §PR bodies |
| Behaviour tests only | CLAUDE.md | tests assert the owner's figures and visible card states |
| Descriptive names, ESLint on changed files | CLAUDE.md, #230 | Task 1 clears the 61 legacy short names in the three touched files first |
| Gitmoji, subject ≤ 50 chars, no attribution | CLAUDE.md | every commit and PR below |
| Edit tool for source | CLAUDE.md | every Modify step is an Edit (current → replacement), never sed/perl |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `docs/prds/PRD-006-month-performance.md` | what and why |
| Create | `docs/designs/DD-006-month-performance.md` | how |
| Create | `docs/plans/PD-049-month-performance.md` | this plan |
| Create | `docs/visuals/PD-049-month-performance.html` | mockup frames |
| Modify | `docs/visuals/README.md` | index row |
| Modify | `frontend/src/features/history/historyShared.ts` | Task 1 renames; export `flowAdjustedReturnPct`; `periodPerformance` |
| Modify | `frontend/src/features/history/HistoryPage.tsx` | Task 1 renames; render the card |
| Modify | `frontend/src/features/history/HistoryPage.page.test.tsx` | Task 1 renames; card render tests |
| Create | `frontend/src/features/history/PeriodPerformanceCard.tsx` | the card |
| Create | `frontend/src/features/history/periodPerformance.test.ts` | pure-function tests on the owner's data |
| Modify | `docs/history-and-snapshots.md` | user-facing description |

## PR sequence (each slice passes the three gates)

| # | Branch | Tasks | Value (gate 2) | Test that fails without it (gate 3) | No regression (gate 1) |
|---|---|---|---|---|---|
| PR1 | `docs/PD-049-month-performance` | 0 | agreed design on record | — (docs) | docs only |
| PR2 | `refactor/history-descriptive-names` | 1 | the three History files meet the naming rule, so any later History PR passes the lint gate | `npx eslint` on the three files (61 errors before, 0 after); CI `lint changed files` | renames only; 151 History tests unchanged and green |
| PR3 | `feat/PD-049-month-performance` | 2–5 | the month performance card | `periodPerformance.test.ts` (6), 2 new page tests | additive card; Daily volatlity uses the same function under a new name, and its tests stay green |
| — | — | 6 | end-to-end on the local stack | scenarios 1–4 | — |

Each PR branches from `main` after the previous one merges.

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

## Task 0: Land the docs (PR1)

**Files:**

* Create: `docs/prds/PRD-006-month-performance.md`, `docs/designs/DD-006-month-performance.md`, `docs/plans/PD-049-month-performance.md`, `docs/visuals/PD-049-month-performance.html`
* Modify: `docs/visuals/README.md`

* [ ] **Step 1: Commit on the docs branch**

WHY: the design has to be reviewable and on record before any code lands
(CLAUDE.md: PRD → DD → plan in a docs PR first).

```bash
git checkout -b docs/PD-049-month-performance main
git add docs/prds/PRD-006-month-performance.md docs/designs/DD-006-month-performance.md docs/plans/PD-049-month-performance.md docs/visuals/PD-049-month-performance.html docs/visuals/README.md
git commit -m "📝 PRD-006 / DD-006 / PD-049: month performance"
```

* [ ] **Step 2: Verify**

```bash
git show --stat HEAD | tail -6
```

Expected: five files; pre-commit `markdownlint-fix` Passed.

* [ ] **Step 3: Push and open the PR**

```bash
git push -u origin docs/PD-049-month-performance
gh pr create --title "📝 Add the PRD, design doc, plan and visual spec for the month performance card" --body-file pr1.md
```

Expected: PR URL printed; body follows §PR bodies.

---

## Task 1: Descriptive names in the History files (PR2)

**Files:**

* Modify: `frontend/src/features/history/historyShared.ts`, `frontend/src/features/history/HistoryPage.tsx`, `frontend/src/features/history/HistoryPage.page.test.tsx`

WHY: the `lint changed files` CI step (#230) lints every file a PR touches.
PR3 has to touch these three files, and they hold 61 legacy one-letter names
(33 / 22 / 6). Renaming them in their own PR keeps PR3's diff about the
feature, and leaves every later History PR lint-clean.

* [ ] **Step 1: Confirm the starting count**

```bash
cd frontend && npx eslint src/features/history/historyShared.ts src/features/history/HistoryPage.tsx src/features/history/HistoryPage.page.test.tsx | tail -1
```

Expected: `✖ 61 problems (61 errors, 0 warnings)`.

* [ ] **Step 2: Rename in `historyShared.ts`** (Edit tool, one function at a time)

WHY: each rename is scoped to the function named in the table. Rename the
binding and every use inside that function; nothing outside it changes.
Line numbers are from `main` at `acd1d30`.

| Line | Function | Current | Replacement |
|---|---|---|---|
| 124 | `monthRange` | `const fmt = (d: Date) => d.toISOString().slice(0, 10)` | `const fmt = (date: Date) => date.toISOString().slice(0, 10)` |
| 151 | `parseFormAmount` | `s` | `text` |
| 157 | `groupedInitial` | `v` | `value` |
| 163 | `sanitizeAmount` | `s` | `text` |
| 171 | `formError` | `for (const r of REGIONS)` | `for (const region of REGIONS)` |
| 186, 191 | `regroupHandler` | `(r: RegionKey, key…)`, `setForm(f => ({ ...f, [r]: { ...f[r], … } }))` | `(region: RegionKey, key…)`, `setForm(form => ({ ...form, [region]: { ...form[region], … } }))` |
| 201 | `formToBody` | `for (const r of REGIONS)` | `for (const region of REGIONS)` |
| 218–219 | `changedRegions` | `for (const [r, v] of …)`, `const o = original[r]` | `for (const [region, value] of …)`, `const originalValue = original[region]` |
| 261–262 | `goldChartData` | `.sort((a, b) => a.date.localeCompare(b.date))`, `.map(r => ({` | `.sort((left, right) => left.date.localeCompare(right.date))`, `.map(row => ({` |
| 285, 293 | `perCurrencyChartData` | same sort, `.map(r => {` | same sort replacement, `.map(row => {` |
| 315 | `niceDomain` | `(v): v is number => … Number.isFinite(v)` | `(value): value is number => … Number.isFinite(value)` |
| 336, 342 | `symmetricDomain` | `(v): v is number => …`, `const m = Math.ceil(…)` | `(value): value is number => …`, `const bound = Math.ceil(…)` |
| 350 | `regionHasData` | `data.some(d => …)` | `data.some(point => …)` |
| 365 | `fmtAxisAmount` | `v` | `value` |
| 374 | `fmt` | `n` | `amount` |
| 429 | `regionPnLPct` | `r: HistoryRow` | `row: HistoryRow` |
| 491 | `holdingRegion` | `h: Pick<…>` | `holding: Pick<…>` |
| 555 | `buildLiveRow` | `for (const h of holdings)` | `for (const holding of holdings)` |
| 600 | `latestGoldOverlay` | `for (const r of rows)` | `for (const row of rows)` |
| 655, 659 | `parseAmount` | `s`, `const n = Number(cleaned)` | `text`, `const amount = Number(cleaned)` |
| 664, 667 | `parsePasteText` | `.map(l => l.trim())`, `.map(c => c.trim())` | `.map(rawLine => rawLine.trim())`, `.map(cell => cell.trim())` |
| 673–674 | `parsePasteText` (`set`) | `const a = …`, `const b = …`, `{ invested: a, current: b }` | `const invested = …`, `const current = …`, `{ invested, current }` |

* [ ] **Step 3: Rename in `HistoryPage.tsx`**

| Line | Where | Current | Replacement |
|---|---|---|---|
| 90 | `toggleChartsOnTop` | `setChartsOnTop(v => { const next = !v` | `setChartsOnTop(onTop => { const next = !onTop` |
| 126 | clock effect | `const t = setTimeout(() => setClockTick(n => n + 1), …)`, `clearTimeout(t)` | `const timer = setTimeout(() => setClockTick(tick => tick + 1), …)`, `clearTimeout(timer)` |
| 137 | price effect | `setPriceTick(n => n + 1)` | `setPriceTick(tick => tick + 1)` |
| 164 | `hasTodaySnapshot` | `rows.some(r => r.date === todayStr)` | `rows.some(row => row.date === todayStr)` |
| 212 | `years` | `for (let y = start; y <= current; y++) out.push(y)` | `for (let yearOption = start; yearOption <= current; yearOption++) out.push(yearOption)` |
| 229 | `hasGoldChart` | `displayRows.some(r => r.gold)` | `displayRows.some(row => row.gold)` |
| 271 | `handlePasteSubmit` | `.sort((a, b) => a.date.localeCompare(b.date))` | `.sort((left, right) => left.date.localeCompare(right.date))` |
| 287, 292 | conflict handlers | `setConflictQueue(q => q.slice(1))` | `setConflictQueue(queue => queue.slice(1))` |
| 338 | year select | `years.map(y => <option key={y} value={y}>{y}</option>)` | `years.map(yearOption => <option key={yearOption} value={yearOption}>{yearOption}</option>)` |
| 344 | month select | `MONTHS.map((m, i) => … {m}</option>)` | `MONTHS.map((monthName, i) => … {monthName}</option>)` |
| 373 | `HistoryTable` props | `onEdit={r => setEditRow(r)}` | `onEdit={row => setEditRow(row)}` |
| 379 | charts | `REGIONS.filter(r => regionHasData(chartsByRegion[r])).map(r => (` … `key={r} region={r} data={chartsByRegion[r]}` | `REGIONS.filter(region => regionHasData(chartsByRegion[region])).map(region => (` … `key={region} region={region} data={chartsByRegion[region]}` |
| 436, 437, 439 | `ChartTriptych` | `data.flatMap(d => [d.invested, d.current])`, `data.map(d => d.pnl_pct)`, `data.map(d => d.daily_vol)` | `point` for `d` in all three |
| 467, 483, 498 | `ChartTriptych` tooltips | `formatter={(v) => …Number(v)…}` | `formatter={(value) => …Number(value)…}` |

* [ ] **Step 4: Rename in `HistoryPage.page.test.tsx`**

| Line | Current | Replacement |
|---|---|---|
| 67 | `.map(o => o.textContent)` | `.map(option => option.textContent)` |
| 69 | `for (let y = 2020; y <= 2026; y++) { expect(opts).toContain(String(y))` | `for (let yearOption = 2020; yearOption <= 2026; yearOption++) { expect(opts).toContain(String(yearOption))` |
| 116–118 | `getItem: (k: string) => store.get(k) ?? null`, `setItem: (k: string, v: string) => { store.set(k, v) }`, `removeItem: (k: string) => { store.delete(k) }` | `key` for `k`, `value` for `v` |

* [ ] **Step 5: Verify**

```bash
cd frontend && npx eslint src/features/history/historyShared.ts src/features/history/HistoryPage.tsx src/features/history/HistoryPage.page.test.tsx && npm run typecheck && npx vitest run src/features/history
```

Expected: ESLint prints nothing; `tsc --noEmit` clean; `Tests  151 passed (151)`.

* [ ] **Step 6: Commit, push, open PR2**

```bash
git checkout -b refactor/history-descriptive-names main
git add frontend/src/features/history/historyShared.ts frontend/src/features/history/HistoryPage.tsx frontend/src/features/history/HistoryPage.page.test.tsx
git commit -m "♻️ Use descriptive names in the History files"
git push -u origin refactor/history-descriptive-names
gh pr create --title "♻️ Use descriptive names in the History page files so they pass the naming lint" --body-file pr2.md
```

Expected: PR URL; CI `lint changed files` green.

---

## Task 2: `periodPerformance` (PR3)

**Files:**

* Modify: `frontend/src/features/history/historyShared.ts`
* Create: `frontend/src/features/history/periodPerformance.test.ts`

* [ ] **Step 1: Branch**

```bash
git checkout -b feat/PD-049-month-performance main
```

* [ ] **Step 2: Export the flow-adjusted return (Edit `historyShared.ts`)**

WHY: the month figure is the same market-move-net-of-flows maths as Daily
volatlity, applied to the opening and closing rows instead of two adjacent
days. Exporting it, rather than writing a second formula, keeps the two
from drifting, and the month figure gets the existing sale approximation
for free. The new name says what it computes now that it serves both.

Current:

```ts
  return flowAdjustedDailyVolatility(prevCur, today, prevInv, todayInv)
}

function flowAdjustedDailyVolatility(
```

Replacement:

```ts
  return flowAdjustedReturnPct(prevCur, today, prevInv, todayInv)
}

// flowAdjustedReturnPct is the % market move of a bucket between two rows,
// net of money added or withdrawn in between: Daily volatlity day over day,
// and the period performance card across a month (PD-049).
export function flowAdjustedReturnPct(
```

Current (in `perCurrencyChartData`):

```ts
      ? flowAdjustedDailyVolatility(prevCurrent, current, prevInvested, invested)
```

Replacement:

```ts
      ? flowAdjustedReturnPct(prevCurrent, current, prevInvested, invested)
```

* [ ] **Step 3: Add `periodPerformance` (Edit `historyShared.ts`)**

WHY: one pure function holds every rule in DD-006 §3 (baseline choice, the
first-row fallback, dropping thin columns, the displayed-value pp
difference), so the card stays presentational and the owner's figures are
asserted directly. It goes just above `regionInvestedWentUp`, next to the
other row-stat helpers.

Current:

```ts
// regionInvestedWentUp reports whether the region's invested amount on
// this row is strictly greater than the prior day's — the user-added-
// holdings highlight from PR7 design-review.
```

Replacement:

```ts
// ---- Period performance (PD-049) ----

// A performance card column: one currency bucket, or the gold overlay.
export type PerformanceColumn = RegionKey | 'GOLD'

export const PERFORMANCE_COLUMNS: readonly PerformanceColumn[] = [...REGIONS, 'GOLD']

export interface PeriodPerformance {
  column: PerformanceColumn
  openingDate: string
  closingDate: string
  closingTentative: boolean
  openingPnlPct: number
  closingPnlPct: number
  pnlChangePp: number
  performancePct: number | null
}

// columnPosition reads one column's invested/current off a row; null when
// the row has nothing invested there (no P/L % to measure).
function columnPosition(row: HistoryRow, column: PerformanceColumn): { invested: number; current: number } | null {
  const position = column === 'GOLD' ? row.gold : row.regions[column]
  return position && position.invested > 0 ? { invested: position.invested, current: position.current } : null
}

const round2 = (value: number) => Math.round(value * 100) / 100

// periodPerformance compares each column's opening and closing position for
// the month starting at monthStart (YYYY-MM-01). The opening row is the last
// row before the month (the page already loads the previous month's last day,
// see monthRange), falling back to the month's first row when there is none;
// the closing row is the month's last row (today's live row included). A
// column with fewer than two such rows is left out.
//
// P/L change is the difference of the two P/L %s *as displayed* (2 dp), so
// the card's arithmetic reads true: 31.05 % − 37.79 % shows −6.74 pp, not the
// unrounded −6.73. Performance is the flow-adjusted return, so money added
// during the month is not mistaken for gains.
export function periodPerformance(rows: HistoryRow[], monthStart: string): PeriodPerformance[] {
  const byDate = [...rows].sort((left, right) => left.date.localeCompare(right.date))
  const results: PeriodPerformance[] = []
  for (const column of PERFORMANCE_COLUMNS) {
    const carrying = byDate.filter(row => columnPosition(row, column))
    const before = carrying.filter(row => row.date < monthStart)
    const opening = before.length ? before[before.length - 1] : carrying[0]
    const closing = carrying[carrying.length - 1]
    if (!opening || opening === closing) continue
    const openingPosition = columnPosition(opening, column)!
    const closingPosition = columnPosition(closing, column)!
    const openingPnlPct = round2(pnlPct(openingPosition.invested, openingPosition.current)!)
    const closingPnlPct = round2(pnlPct(closingPosition.invested, closingPosition.current)!)
    const performance = flowAdjustedReturnPct(
      openingPosition.current, closingPosition.current, openingPosition.invested, closingPosition.invested)
    results.push({
      column,
      openingDate: opening.date,
      closingDate: closing.date,
      closingTentative: closing.tentative === true,
      openingPnlPct,
      closingPnlPct,
      pnlChangePp: round2(closingPnlPct - openingPnlPct),
      performancePct: performance === null ? null : round2(performance),
    })
  }
  return results
}

// regionInvestedWentUp reports whether the region's invested amount on
// this row is strictly greater than the prior day's — the user-added-
// holdings highlight from PR7 design-review.
```

* [ ] **Step 4: Tests (Create `periodPerformance.test.ts`)**

WHY: the owner's October table is the acceptance criterion (PRD-006 §6.1),
so the first test asserts it verbatim from their real rows. The rest pin
each rule of DD-006 §3.

```ts
import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../../lib/api/client'
import { periodPerformance } from './historyShared'

// historyRow builds a cron row from per-currency [invested, current] pairs
// and an optional gold [invested, current].
function historyRow(date: string, regions: Record<string, [number, number]>, gold?: [number, number]): HistoryRow {
  return {
    date,
    regions: Object.fromEntries(Object.entries(regions).map(([currency, [invested, current]]) =>
      [currency, { invested, current, source: 'cron' }])),
    totals: { invested_total: 0, current_total: 0, pnl_pct: null },
    gold: gold && { invested: gold[0], current: gold[1], volatility_pct: 0, pnl_pct: null },
  }
}

// The owner's October 2026 sheet: 30 Sep (the previous month's last row,
// which monthRange already loads), a mid-month row, and 30 Oct.
const october = [
  historyRow('2026-09-30', { INR: [880021.32, 1086274.39], EUR: [7064.13, 8459.51] }, [716420, 987120]),
  historyRow('2026-10-15', { INR: [885419.70, 1104496.26], EUR: [7308.82, 8726.46] }, [716420, 973080]),
  historyRow('2026-10-30', { INR: [898847.70, 1118139.13], EUR: [7540.05, 8722.36] }, [716420, 938880]),
]

describe('periodPerformance', () => {
  it("reproduces the owner's October table for every column", () => {
    expect(periodPerformance(october, '2026-10-01')).toEqual([
      { column: 'INR', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 23.44, closingPnlPct: 24.40, pnlChangePp: 0.96, performancePct: 1.20 },
      { column: 'EUR', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 19.75, closingPnlPct: 15.68, pnlChangePp: -4.07, performancePct: -2.52 },
      { column: 'GOLD', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 37.79, closingPnlPct: 31.05, pnlChangePp: -6.74, performancePct: -4.89 },
    ])
  })

  it('does not depend on the order the rows arrive in', () => {
    expect(periodPerformance([...october].reverse(), '2026-10-01'))
      .toEqual(periodPerformance(october, '2026-10-01'))
  })

  it("opens on the month's first row when nothing comes before it", () => {
    const [inr] = periodPerformance(october.slice(1), '2026-10-01')
    expect(inr).toMatchObject({ column: 'INR', openingDate: '2026-10-15', closingDate: '2026-10-30' })
  })

  it('leaves a column out when it has fewer than two rows with money invested', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 110], EUR: [0, 0] }),
      historyRow('2026-10-30', { INR: [100, 120], EUR: [50, 55] }),
    ]
    expect(periodPerformance(rows, '2026-10-01').map(perf => perf.column)).toEqual(['INR'])
    expect(periodPerformance(rows.slice(0, 1), '2026-10-01')).toEqual([])
  })

  it('reads a sale at an unchanged price as no performance', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 200] }),
      historyRow('2026-10-30', { INR: [50, 100] }),
    ]
    expect(periodPerformance(rows, '2026-10-01')[0].performancePct).toBe(0)
  })

  it('flags a closing row that is the live, unsnapshotted day', () => {
    const live = { ...historyRow('2026-10-31', { INR: [100, 120] }), tentative: true }
    const [inr] = periodPerformance([historyRow('2026-09-30', { INR: [100, 110] }), live], '2026-10-01')
    expect(inr.closingTentative).toBe(true)
  })
})
```

* [ ] **Step 5: Verify**

```bash
cd frontend && npx vitest run src/features/history
```

Expected: `Tests  157 passed (157)` (151 existing, Daily volatlity
unchanged, + 6 new).

* [ ] **Step 6: Commit**

```bash
git add frontend/src/features/history/historyShared.ts frontend/src/features/history/periodPerformance.test.ts
git commit -m "✨ Compute month performance per currency"
```

---

## Task 3: The card (PR3)

**Files:**

* Create: `frontend/src/features/history/PeriodPerformanceCard.tsx`

* [ ] **Step 1: Create the component**

WHY: presentational only. It formats what `periodPerformance` returns,
in the layout the owner drew: metrics as rows, columns per currency. Signs
use U+2212 like the owner's sheet. The table gets an accessible name so
tests (and screen readers) find it. Panel styles match the chart panels, so
every theme inherits them with no new tokens. Styling reuses History's own
colour language (visual spec frame 01): each column carries its currency
group's tint from the month table (`REGION_TINTS`, `GOLD_TINT`), P/L change
is a chip tinted by direction (`PRICE_DIR_TINT`) and coloured with
`--green` / `--red`, and the performance row, the bottom line, is larger,
bold and coloured under a heavier rule. The card takes `theme` because the
tints are per theme, exactly as `HistoryTable` takes it. The table fills the content
width like the month table below it (owner, 2026-10-31): `table-layout:
fixed` gives the metric column 26 % and splits the rest evenly between the
value columns. India, Europe and Gold are each drawn as their own rounded,
bordered block with a 10 px gap (`border-collapse: separate` +
`border-spacing: 10px 0`, a table inside the table), with the title, headers
and values centred (owner, 2026-10-31). `min-width: 580px` inside
`overflow-x: auto` keeps a narrow phone from scrolling the page.

```tsx
// The History page's month performance card (PD-049): per currency and gold,
// the P/L % the month opened and closed at, the change in percentage points,
// and the flow-adjusted investment performance.
import type { CSSProperties, ReactNode } from 'react'
import { formatDayMonth } from '../../lib/formDates'
import type { HistoryRow } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import {
  GOLD_TINT, PRICE_DIR_TINT, REGION_TINTS, periodPerformance,
  type PerformanceColumn, type PeriodPerformance,
} from './historyShared'

const COLUMN_LABELS: Record<PerformanceColumn, string> = {
  INR: '🇮🇳 India',
  EUR: '🇪🇺 Europe',
  GOLD: '🥇 Gold',
}

// Each column wears the same tint as its group in the month table below, so
// the card reads as a summary of those columns.
function columnTint(theme: ThemeName, column: PerformanceColumn): { header: string; cell: string } {
  return column === 'GOLD' ? { header: GOLD_TINT, cell: GOLD_TINT } : REGION_TINTS[theme][column]
}

// U+2212 minus, matching the owner's sheet ("−4.07 pp").
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`

const direction = (value: number) => value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
const DIRECTION_COLOUR = { up: 'var(--green)', down: 'var(--red)', flat: 'var(--text-secondary)' }
const DIRECTION_MARKER = { up: '🟢', down: '🔴', flat: '⚪' }

function ChangeChip({ changePp }: { changePp: number }) {
  const dir = direction(changePp)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
      background: PRICE_DIR_TINT[dir], color: DIRECTION_COLOUR[dir], fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {DIRECTION_MARKER[dir]} {signed(changePp)} pp
    </span>
  )
}

function Performance({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <span style={{ color: DIRECTION_COLOUR[direction(value)] }}>{signed(value)}%</span>
}

const METRICS: { label: string; emphasis?: boolean; cell: (perf: PeriodPerformance) => ReactNode }[] = [
  { label: 'Opening P/L', cell: perf => `${perf.openingPnlPct.toFixed(2)}%` },
  { label: 'Closing P/L', cell: perf => `${perf.closingPnlPct.toFixed(2)}%` },
  { label: 'P/L change', cell: perf => <ChangeChip changePp={perf.pnlChangePp} /> },
  { label: 'Approx. investment performance*', emphasis: true, cell: perf => <Performance value={perf.performancePct} /> },
]

const cellBase: CSSProperties = { padding: '10px 16px', borderBottom: '1px solid var(--border)' }
// The side borders that outline one currency column as its own block.
const blockEdges: CSSProperties = { borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }

export function PeriodPerformanceCard({ rows, monthStart, monthLabel, theme }: {
  rows: HistoryRow[]
  monthStart: string
  monthLabel: string
  theme: ThemeName
}) {
  const columns = periodPerformance(rows, monthStart)
  if (columns.length === 0) return null
  return (
    <section style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 16,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
        {monthLabel} performance
      </h2>
      <div style={{ overflowX: 'auto' }}>
        {/* `separate` + horizontal border-spacing turns each currency column
            into its own rounded block, a table inside the table. */}
        <table aria-label={`${monthLabel} performance`} style={{
          borderCollapse: 'separate', borderSpacing: '10px 0',
          fontSize: 13, width: '100%', minWidth: 580, tableLayout: 'fixed',
        }}>
          <thead>
            <tr>
              <th style={{ ...cellBase, width: '26%', textAlign: 'left', fontSize: 11, fontWeight: 500,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Metric</th>
              {columns.map(perf => (
                <th key={perf.column} style={{
                  ...cellBase, ...blockEdges, borderTop: '1px solid var(--border)', borderRadius: '8px 8px 0 0',
                  textAlign: 'center', background: columnTint(theme, perf.column).header,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{COLUMN_LABELS[perf.column]}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDayMonth(perf.openingDate)} → {formatDayMonth(perf.closingDate)}{perf.closingTentative ? ' (live)' : ''}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric, i) => {
              const last = i === METRICS.length - 1
              // The rule above the bottom line is drawn as the previous row's
              // bottom border: in the separate model a top border would stack.
              const rowBottom = i === METRICS.length - 2 ? '2px solid var(--border-light)' : '1px solid var(--border)'
              return (
                <tr key={metric.label}>
                  <th scope="row" style={{ ...cellBase, borderBottom: last ? '1px solid transparent' : rowBottom,
                    textAlign: 'left', fontWeight: metric.emphasis ? 600 : 500,
                    color: metric.emphasis ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {metric.label}
                  </th>
                  {columns.map(perf => (
                    <td key={perf.column} style={{
                      ...cellBase, ...blockEdges, borderBottom: last ? '1px solid var(--border)' : rowBottom,
                      ...(last ? { borderRadius: '0 0 8px 8px' } : {}),
                      textAlign: 'center', background: columnTint(theme, perf.column).cell,
                      fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)',
                      fontSize: metric.emphasis ? 16 : 13, fontWeight: metric.emphasis ? 700 : 400,
                    }}>
                      {metric.cell(perf)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
        * Approximate: money added during the month counts as added at its end, and a sale is
        valued at the bucket&apos;s current-to-cost ratio. Dividends are not included.
      </p>
    </section>
  )
}
```

* [ ] **Step 2: Verify**

```bash
cd frontend && npm run typecheck && npx eslint src/features/history/PeriodPerformanceCard.tsx
```

Expected: both print nothing beyond the `tsc --noEmit` banner.

* [ ] **Step 3: Commit**

```bash
git add frontend/src/features/history/PeriodPerformanceCard.tsx
git commit -m "✨ Add the month performance card"
```

---

## Task 4: Show the card on History (PR3)

**Files:**

* Modify: `frontend/src/features/history/HistoryPage.tsx`, `frontend/src/features/history/HistoryPage.page.test.tsx`

* [ ] **Step 1: Import (Edit `HistoryPage.tsx`)**

Current:

```tsx
import { HistoryTable } from './HistoryTable'
import {
```

Replacement:

```tsx
import { HistoryTable } from './HistoryTable'
import { PeriodPerformanceCard } from './PeriodPerformanceCard'
import {
```

* [ ] **Step 2: Render above the table/charts (Edit `HistoryPage.tsx`)**

WHY: placed before the block that orders table and charts, so the card stays
on top whichever way `chartsOnTop` is set. It is fed `displayRows`, so the
current month closes on today's live row exactly as the table does. It
renders nothing for an empty or single-row month, so no extra guard is needed.

Current:

```tsx
        {displayRows.length > 0 && (() => {
          const table = (
```

Replacement:

```tsx
        <PeriodPerformanceCard rows={displayRows}
          monthStart={`${year}-${String(month + 1).padStart(2, '0')}-01`}
          monthLabel={`${MONTHS[month]} ${year}`} theme={theme} />

        {displayRows.length > 0 && (() => {
          const table = (
```

* [ ] **Step 3: Page tests (Edit `HistoryPage.page.test.tsx`)**

WHY: proves the wiring end to end through the real page. It uses the owner's
INR figures moved to the frozen test month (June 2026): the previous month's
last row (31-05) is the baseline, so the page's own `monthRange` has to
deliver it. A single-row month shows no card.

Current:

```tsx
  it('uses the wide content container so the currency + gold columns fit', async () => {
```

Replacement:

```tsx
  it("shows the month performance card from the previous month's last row to the latest", async () => {
    const monthRow = (date: string, invested: number, current: number): HistoryRow => ({
      ...sampleRow, date,
      regions: { ...sampleRow.regions, INR: { invested, current, source: 'cron' } },
    })
    mockApi.listHistory.mockResolvedValue(list([
      monthRow('2026-05-31', 880021.32, 1086274.39),
      monthRow('2026-06-15', 898847.70, 1118139.13),
    ]))
    renderPage()
    const card = await screen.findByRole('table', { name: 'Jun 2026 performance' })
    expect(card).toHaveTextContent('🇮🇳 India')
    expect(card).toHaveTextContent('31-05 → 15-06')
    expect(card).toHaveTextContent('23.44%')
    expect(card).toHaveTextContent('24.40%')
    expect(card).toHaveTextContent('🟢 +0.96 pp')
    expect(card).toHaveTextContent('+1.20%')
    expect(card).not.toHaveTextContent('Europe')
  })

  it('shows no performance card for a month with a single row', async () => {
    mockApi.listHistory.mockResolvedValue(list([sampleRow]))
    renderPage()
    await screen.findByText('16-06-2026')
    expect(screen.queryByRole('table', { name: /performance/ })).not.toBeInTheDocument()
  })

  it('uses the wide content container so the currency + gold columns fit', async () => {
```

* [ ] **Step 4: Verify**

```bash
cd frontend && npm run typecheck && npx vitest run && npm run lint:changed
```

Expected: `Tests  404 passed (404)` (396 on `main` + 8 new); `lint:changed`
prints `5 file(s) vs origin/main` and no errors.

* [ ] **Step 5: Commit**

```bash
git add frontend/src/features/history/HistoryPage.tsx frontend/src/features/history/HistoryPage.page.test.tsx
git commit -m "✨ Show month performance on History"
```

---

## Task 5: User docs, then open PR3

**Files:**

* Modify: `docs/history-and-snapshots.md`

* [ ] **Step 1: Describe the card (Edit `docs/history-and-snapshots.md`)**

WHY: the user-facing page lists what History shows, so the new card goes in
that list, with the formula stated once.

Current:

```markdown
* lets you click a currency cell on a cron row to open a **Holdings** modal —
  the per-stock breakdown for that currency (script, yesterday price, current
  price, change value, daily change), positive positions only.
```

Replacement:

```markdown
* lets you click a currency cell on a cron row to open a **Holdings** modal —
  the per-stock breakdown for that currency (script, yesterday price, current
  price, change value, daily change), positive positions only;
* shows a **month performance** card above the table
  ([PRD-006](prds/PRD-006-month-performance.md)): per currency and gold, the
  P/L % on the previous month's last row and on the month's latest row, the
  change in pp, and an approximate investment performance = (closing value −
  opening value − money added) ÷ opening value, so new money is not counted
  as gains.
```

* [ ] **Step 2: Commit, push, open PR3**

```bash
git add docs/history-and-snapshots.md
git commit -m "📝 Document the month performance card"
git push -u origin feat/PD-049-month-performance
gh pr create --title "✨ Show each currency's month performance on the History page" --body-file pr3.md
```

Expected: PR URL; CI green (Frontend job incl. `lint changed files`,
markdownlint, Project rules).

---

## Task 6: End-to-end verification (local stack)

**Files:** none

* [ ] **Step 1: Run the stack** (`run-app` skill): `make dev-db`, `make backend`,
  `make frontend`, log in as the dev super admin.

* [ ] **Step 2: Seed the owner's two October rows**

```bash
B=http://localhost:8080/api; H='X-Requested-With: portfolio-dashboard'
curl -s -c j -H "$H" -H 'Content-Type: application/json' -d '{"username":"admin","password":"<dev password>"}' $B/auth/login
curl -s -b j -H "$H" -H 'Content-Type: application/json' -d '{"date":"2026-09-30","regions":{"INR":{"invested":880021.32,"current":1086274.39},"EUR":{"invested":7064.13,"current":8459.51}}}' $B/history   # 201
curl -s -b j -H "$H" -H 'Content-Type: application/json' -d '{"date":"2026-10-30","regions":{"INR":{"invested":898847.70,"current":1118139.13},"EUR":{"invested":7540.05,"current":8722.36}}}' $B/history   # 201
```

* [ ] **Step 3: Scenarios**

1. **October** — History → 2026 / Oct. Expected: "Oct 2026 performance";
   India 23.44% / 24.40% / 🟢 +0.96 pp / +1.20%; Europe 19.75% / 15.68% /
   🔴 −4.07 pp / −2.52%; headers `30-09 → 30-10`.
2. **Gold** — on a gold-enabled account with the owner's gold ledger and
   prices. Expected: Gold 37.79% / 31.05% / 🔴 −6.74 pp / −4.89%.
3. **Single row** — September (only 30-09 in range plus no earlier row).
   Expected: no card.
4. **Themes + phone** — dark / light / cyberpunk, and a 390 px window.
   Expected: legible in all three, matching the visual spec; the card
   scrolls inside itself, not the page.

* [ ] **Step 4: Record** — paste the results as a comment on PR3.

Expected: all four pass before PR3 merges.

## Done

* History shows a month performance card per currency and gold.
* October 2026 reproduces the owner's table exactly.
* Daily volatlity and the card share one flow-adjusted formula.
* The three History files meet the naming rule.
* All vitest suites green; `npm run build` succeeds.

Next: a custom from/to range, an optional dividend-inclusive figure, and a
USD column once History gains a USD bucket.
