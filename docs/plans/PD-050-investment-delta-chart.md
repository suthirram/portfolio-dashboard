# PD-050: Rollout plan — investment delta chart on Transactions

* **Status**: Draft v1, owner decisions of 2026-11-02 applied
* **Owner**: project owner
* **Goal**: The Transactions page has a bottom panel the user pulls up to see
  a Jan–Dec bar + line chart for one year: each month's investment delta
  (the History card's figure, PRD-006) as a green / red bar, and invested at
  each month end as a line. ‹ › change the year; an INR / EUR / Gold switch
  picks the column. October 2026 (INR) reads +₹18,826.38 and ₹8,98,847.70.
* **Architecture**: frontend only. The panel fetches the year with the
  existing `api.listHistory(1 Jan, 31 Dec, true)`. A pure
  `monthlyInvestment(rows, year, column)` in `historyShared.ts` calls the
  card's `periodPerformance` once per month on the rows up to that month's
  end, so each bar equals that month's card. A presentational
  `InvestmentDeltaChart` (Recharts `ComposedChart`) draws it; an
  `InvestmentDeltaPanel` owns open / year / column state and the fetch, and
  `TransactionsPage` renders it only outside admin act-as.
* **Tech stack**: React 18, TypeScript 5.4, Vite, Recharts 2, vitest 4 +
  Testing Library, ESLint 9 (`id-length`). No new dependencies, no API
  change.
* **Spec**: [PRD-007](../prds/PRD-007-investment-delta-chart.md) ·
  [DD-007](../designs/DD-007-investment-delta-chart.md) ·
  [visual spec](../visuals/PD-050-investment-delta-chart.html)
  ([published](https://claude.ai/artifact/Q4prvDBoa4Woq55Nu4ndM3))

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | `periodPerformance`, `columnPosition`, `monthRange`, `MONTHS`, `MIN_YEAR`, `tradingDateIST`, `listHistory(…, true)`, the chart tooltip and palettes reused; the card's labels, symbols and signed-amount formatter moved to `historyShared` and shared; the test row fixture moved and shared |
| Branch → PR, never `main` | CLAUDE.md | one branch per PR, created from `main` in the task that opens it |
| Frontend and backend never in one PR | CLAUDE.md | no backend change |
| Every slice passes the three gates | `task-breakdown` skill | §PR sequence |
| PR body < 200 words: What / How to test / No regression | `task-breakdown` skill | §PR bodies |
| Behaviour tests only | CLAUDE.md | the owner's figures, panel states and the act-as rule |
| Descriptive names, ESLint on changed files | CLAUDE.md | Task 1 clears the 8 short names in `TransactionsPage.tsx` |
| Gitmoji, subject ≤ 50 chars, no attribution | CLAUDE.md | every commit and PR below |
| Edit tool for source | CLAUDE.md | every Modify step is an Edit (current → replacement) |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `docs/prds/PRD-007-investment-delta-chart.md` | what and why |
| Create | `docs/designs/DD-007-investment-delta-chart.md` | how |
| Create | `docs/plans/PD-050-investment-delta-chart.md` | this plan |
| Create | `docs/visuals/PD-050-investment-delta-chart.html` | mockup frames |
| Modify | `docs/visuals/README.md` | index row |
| Modify | `frontend/src/features/transactions/TransactionsPage.tsx` | Task 1 renames; render the panel outside act-as |
| Modify | `frontend/src/features/history/historyShared.ts` | export `columnPosition`; shared column labels / symbols and `fmtSignedCurrency`; `monthlyInvestment` |
| Modify | `frontend/src/features/history/PeriodPerformanceCard.tsx` | import the moved labels, symbols and formatter |
| Create | `frontend/src/features/history/historyTestRows.ts` | the shared `historyRow` test fixture |
| Modify | `frontend/src/features/history/periodPerformance.test.ts` | import the fixture; `monthlyInvestment` tests |
| Create | `frontend/src/features/transactions/InvestmentDeltaChart.tsx` | the bar + line chart |
| Create | `frontend/src/features/transactions/InvestmentDeltaPanel.tsx` | the bottom panel |
| Create | `frontend/src/features/transactions/InvestmentDeltaPanel.test.tsx` | panel behaviour |
| Modify | `frontend/src/features/transactions/TransactionsPage.test.tsx` | panel shown / hidden in act-as |
| Modify | `docs/portfolio-model.md` | user-facing description (new "Investment delta chart" subsection) |

## PR sequence (each slice passes the three gates)

| # | Branch | Tasks | Value (gate 2) | Test that fails without it (gate 3) | No regression (gate 1) |
|---|---|---|---|---|---|
| PR1 | `docs/PD-050-investment-delta-chart` | 0 | agreed design on record | — (docs) | docs only |
| PR2 | `refactor/transactions-descriptive-names` | 1 | `TransactionsPage.tsx` meets the naming rule, so PR3 passes the lint gate | `npx eslint` on the file (8 errors before, 0 after); CI `lint changed files` | renames only; the Transactions tests unchanged and green |
| PR3 | `feat/PD-050-investment-delta-chart` | 2–5 | the Transactions page shows the year's investment delta chart | `periodPerformance.test.ts` (+5), `InvestmentDeltaPanel.test.tsx` (6), 2 new page tests | panel collapsed by default and fetches nothing until opened; not rendered in act-as; the card's output unchanged (its tests stay green) |
| — | — | 6 | end-to-end on the local stack | scenarios 1–5 | — |

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

* Create: `docs/prds/PRD-007-investment-delta-chart.md`, `docs/designs/DD-007-investment-delta-chart.md`, `docs/plans/PD-050-investment-delta-chart.md`, `docs/visuals/PD-050-investment-delta-chart.html`
* Modify: `docs/visuals/README.md`

* [ ] **Step 1: Branch**

```bash
git checkout -b docs/PD-050-investment-delta-chart main
```

* [ ] **Step 2: Lint the markdown**

```bash
npx markdownlint-cli docs/prds/PRD-007-investment-delta-chart.md docs/designs/DD-007-investment-delta-chart.md docs/plans/PD-050-investment-delta-chart.md docs/visuals/README.md
```

Expected: no output.

* [ ] **Step 3: Commit, push, open PR1**

```bash
git add docs/prds/PRD-007-investment-delta-chart.md docs/designs/DD-007-investment-delta-chart.md docs/plans/PD-050-investment-delta-chart.md docs/visuals/PD-050-investment-delta-chart.html docs/visuals/README.md
git commit -m "📝 Plan the investment delta chart"
git push -u origin docs/PD-050-investment-delta-chart
gh pr create --title "📝 Add the PRD, design doc, plan and visual spec for the investment delta chart" --body-file pr1.md
```

Expected: PR URL; CI markdownlint green.

---

## Task 1: Descriptive names in `TransactionsPage.tsx` (PR2)

**Files:**

* Modify: `frontend/src/features/transactions/TransactionsPage.tsx`

WHY: `lint:changed` lints every file a PR touches, and PR3 touches this
file, which holds 8 short names. Renaming them in their own PR keeps PR3's
diff about the feature, as PD-049 Task 1 did for History.

* [ ] **Step 1: Branch**

```bash
git checkout -b refactor/transactions-descriptive-names main
```

* [ ] **Step 2: Rename (one Edit per row)**

`current` is used where the natural name would shadow the state variable
the setter belongs to (`filters`, `sort`).

| Line | Current | Replacement |
|---|---|---|
| 51 | `setFilters(f => ({ ...f, ...next }))` | `setFilters(current => ({ ...current, ...next }))` |
| 54 | `list.filter(v => v !== value)` | `list.filter(item => item !== value)` |
| 69 | `holdings.map(h => [h.id, h])` | `holdings.map(holding => [holding.id, holding])` |
| 123 | `holdings.map(h => <option key={h.id} value={h.id}>{h.script}</option>)` | `holdings.map(holding => <option key={holding.id} value={holding.id}>{holding.script}</option>)` |
| 131–134 | `types.map(t => (` … `key={t}`, `includes(t)`, `toggleIn<TransactionType>(filters.types, t)`, `TYPE_LABEL[t] \|\| t` | `types.map(txnType => (` … `key={txnType}`, `includes(txnType)`, `toggleIn<TransactionType>(filters.types, txnType)`, `TYPE_LABEL[txnType] \|\| txnType` |
| 145–148 | `currencies.map(c => (` … `key={c}`, `includes(c)`, `toggleIn(filters.currencies, c)`, `{c}` | `currencies.map(currency => (` … `key={currency}`, `includes(currency)`, `toggleIn(filters.currencies, currency)`, `{currency}` |
| 184–191 | `subtotals.map(s => (` … `s.currency` ×3, `s.bought`, `s.sold`, `s.dividends` | `subtotals.map(subtotal => (` … `subtotal.currency` ×3, `subtotal.bought`, `subtotal.sold`, `subtotal.dividends` |
| 220 | `setSort(s => toggleSort(s, key))` | `setSort(current => toggleSort(current, key))` |

* [ ] **Step 3: Verify**

```bash
cd frontend && npx eslint src/features/transactions/TransactionsPage.tsx && npm run typecheck && npx vitest run src/features/transactions
```

Expected: eslint prints nothing; `tsc --noEmit` clean; all Transactions
tests pass (same count as on `main`).

* [ ] **Step 4: Commit, push, open PR2**

```bash
git add frontend/src/features/transactions/TransactionsPage.tsx
git commit -m "♻️ Use descriptive names in TransactionsPage"
git push -u origin refactor/transactions-descriptive-names
gh pr create --title "♻️ Use descriptive names in the Transactions page" --body-file pr2.md
```

---

## Task 2: `monthlyInvestment` and the shared pieces (PR3)

**Files:**

* Modify: `frontend/src/features/history/historyShared.ts`, `frontend/src/features/history/PeriodPerformanceCard.tsx`, `frontend/src/features/history/periodPerformance.test.ts`
* Create: `frontend/src/features/history/historyTestRows.ts`

* [ ] **Step 1: Branch**

```bash
git checkout -b feat/PD-050-investment-delta-chart main
```

* [ ] **Step 2: Export `columnPosition` (Edit `historyShared.ts`)**

WHY: the chart's line is the closing row's invested for the column, read
exactly as the card reads it (an absent or empty bucket is 0).

Current:

```ts
function columnPosition(row: HistoryRow, column: PerformanceColumn): { invested: number; current: number } {
```

Replacement:

```ts
export function columnPosition(row: HistoryRow, column: PerformanceColumn): { invested: number; current: number } {
```

* [ ] **Step 3: Move the column labels, symbols and signed formatter (Edit `historyShared.ts`)**

WHY: the chart needs the card's column labels, its gold-in-rupees symbol
rule and its "+₹18,826.38" formatting. Moving them, rather than copying,
keeps one definition.

Current:

```ts
export const PERFORMANCE_COLUMNS: readonly PerformanceColumn[] = [...REGIONS, 'GOLD']
```

Replacement:

```ts
export const PERFORMANCE_COLUMNS: readonly PerformanceColumn[] = [...REGIONS, 'GOLD']

export const PERFORMANCE_COLUMN_LABELS: Record<PerformanceColumn, string> = {
  INR: '🇮🇳 India',
  EUR: '🇪🇺 Europe',
  GOLD: '🥇 Gold',
}

// Gold is valued in rupees, like its table column.
export const PERFORMANCE_COLUMN_SYMBOL: Record<PerformanceColumn, string> = { ...CURRENCY_SYMBOL, GOLD: CURRENCY_SYMBOL.INR }

// fmtSignedCurrency renders a money change with an explicit sign and a
// U+2212 minus, e.g. "+₹18,826.38" / "−€475.92" (the PD-049 card and the
// PD-050 chart).
export function fmtSignedCurrency(amount: number, sym: string): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : ''
  return sign + fmtCurrency(Math.abs(amount), sym)
}
```

* [ ] **Step 4: The card imports them (Edit `PeriodPerformanceCard.tsx`)**

Current:

```tsx
import {
  CURRENCY_SYMBOL, GOLD_TINT, PRICE_DIR_TINT, REGION_TINTS, fmtCurrency, periodPerformance,
  type PerformanceColumn, type PeriodPerformance,
} from './historyShared'

const COLUMN_LABELS: Record<PerformanceColumn, string> = {
  INR: '🇮🇳 India',
  EUR: '🇪🇺 Europe',
  GOLD: '🥇 Gold',
}
```

Replacement:

```tsx
import {
  GOLD_TINT, PERFORMANCE_COLUMN_LABELS, PERFORMANCE_COLUMN_SYMBOL, PRICE_DIR_TINT, REGION_TINTS,
  fmtSignedCurrency, periodPerformance, type PerformanceColumn, type PeriodPerformance,
} from './historyShared'
```

Current:

```tsx
// Gold is valued in rupees, like its table column.
const COLUMN_SYMBOL: Record<PerformanceColumn, string> = { ...CURRENCY_SYMBOL, GOLD: CURRENCY_SYMBOL.INR }

// signedAmount renders a money delta as "+₹18,826.38" / "−€475.92".
const signedAmount = (value: number, symbol: string) => `${sign(value)}${fmtCurrency(Math.abs(value), symbol)}`

```

Replacement: delete these five lines (nothing replaces them).

Current:

```tsx
      {signedAmount(perf.moneyInvested, COLUMN_SYMBOL[perf.column])}
```

Replacement:

```tsx
      {fmtSignedCurrency(perf.moneyInvested, PERFORMANCE_COLUMN_SYMBOL[perf.column])}
```

Current:

```tsx
{COLUMN_LABELS[perf.column]}</div>
```

Replacement:

```tsx
{PERFORMANCE_COLUMN_LABELS[perf.column]}</div>
```

* [ ] **Step 5: Add `monthlyInvestment` (Edit `historyShared.ts`)**

WHY: one pure function holds every rule in DD-007 §3, and it is the card's
`periodPerformance` applied to each month, so a bar can never disagree with
that month's card. It goes right after `periodPerformance`.

Current:

```ts
// regionInvestedWentUp reports whether the region's invested amount on
// this row is strictly greater than the prior day's — the user-added-
// holdings highlight from PR7 design-review.
```

Replacement:

```ts
// ---- Monthly investment (PD-050) ----

export interface MonthlyInvestment {
  month0: number
  // The month's investment delta (the History card's figure); null = no bar.
  delta: number | null
  // Invested on the month's closing row; null = no line point.
  invested: number | null
}

// monthlyInvestment is, for one column and each month of `year` (Jan
// first), the History card's investment delta and the invested amount at
// the month end. rows are the year's History rows plus the latest row
// before 1 Jan (include_previous). Each month runs periodPerformance on the
// rows up to its last day, so the latest row before the month opens it and
// its last row closes it, exactly as on the card. A month with no row of
// its own (future, gap) has neither value; one with nothing to compare
// against (a single-row first month) has a line point but no bar.
export function monthlyInvestment(rows: HistoryRow[], year: number, column: PerformanceColumn): MonthlyInvestment[] {
  return MONTHS.map((_, month0) => {
    const { from, to } = monthRange(year, month0)
    const upToMonthEnd = rows.filter(row => row.date <= to)
    const closing = upToMonthEnd.reduce<HistoryRow | null>(
      (latest, row) => (latest === null || row.date > latest.date ? row : latest), null)
    if (!closing || closing.date < from) return { month0, delta: null, invested: null }
    const performance = periodPerformance(upToMonthEnd, from).find(perf => perf.column === column)
    return {
      month0,
      delta: performance ? performance.moneyInvested : null,
      invested: columnPosition(closing, column).invested,
    }
  })
}

// regionInvestedWentUp reports whether the region's invested amount on
// this row is strictly greater than the prior day's — the user-added-
// holdings highlight from PR7 design-review.
```

* [ ] **Step 6: Share the test fixture (Create `historyTestRows.ts`)**

WHY: the card tests and the new panel test both build History rows from
`[invested, current]` pairs; one fixture, not two.

```ts
import type { HistoryRow } from '../../lib/api/client'

// historyRow builds a cron row from per-currency [invested, current] pairs
// and an optional gold [invested, current].
export function historyRow(date: string, regions: Record<string, [number, number]>, gold?: [number, number]): HistoryRow {
  return {
    date,
    regions: Object.fromEntries(Object.entries(regions).map(([currency, [invested, current]]) =>
      [currency, { invested, current, source: 'cron' }])),
    totals: { invested_total: 0, current_total: 0, pnl_pct: null },
    gold: gold && { invested: gold[0], current: gold[1], volatility_pct: 0, pnl_pct: null },
  }
}
```

* [ ] **Step 7: Tests (Edit `periodPerformance.test.ts`)**

WHY: October 2026 is the acceptance figure (PRD-007 §6.1), from the same
owner rows the card test uses. The rest pin DD-007 §3.

Current:

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
```

Replacement:

```ts
import { describe, expect, it } from 'vitest'
import { monthlyInvestment, periodPerformance } from './historyShared'
import { historyRow } from './historyTestRows'
```

Then append at the end of the file:

```ts
describe('monthlyInvestment', () => {
  it("gives October 2026 the History card's investment delta and closing invested", () => {
    const months = monthlyInvestment(october, 2026, 'INR')
    expect(months).toHaveLength(12)
    expect(months[9]).toEqual({ month0: 9, delta: 18826.38, invested: 898847.70 })
  })

  it('shows a single-row first month as a line point only, and nothing without a row', () => {
    const months = monthlyInvestment(october, 2026, 'INR')
    expect(months[8]).toEqual({ month0: 8, delta: null, invested: 880021.32 }) // 30-09 only
    expect(months[0]).toEqual({ month0: 0, delta: null, invested: null })
    expect(months[10]).toEqual({ month0: 10, delta: null, invested: null })
  })

  it("chains each month's opening to the previous month's closing row", () => {
    const rows = [
      historyRow('2025-12-31', { INR: [100, 110] }), // the include_previous row
      historyRow('2026-01-31', { INR: [150, 160] }),
      historyRow('2026-03-15', { INR: [120, 150] }), // nothing in February
    ]
    const deltas = monthlyInvestment(rows, 2026, 'INR').map(month => month.delta)
    expect(deltas.slice(0, 3)).toEqual([50, null, -30])
  })

  // The owner's June 2025: EUR first invested on 30-06 (PRD-006 §5).
  it('opens a currency from zero in the month it is first bought', () => {
    const rows = [
      historyRow('2025-06-01', { INR: [564361.86, 717252.59] }),
      historyRow('2025-06-30', { INR: [565721.16, 733476.39], EUR: [599.58, 626.95] }),
    ]
    expect(monthlyInvestment(rows, 2025, 'EUR')[5]).toEqual({ month0: 5, delta: 599.58, invested: 599.58 })
  })

  it('reads gold off the overlay', () => {
    expect(monthlyInvestment(october, 2026, 'GOLD')[9]).toEqual({ month0: 9, delta: 0, invested: 716420 })
  })
})
```

* [ ] **Step 8: Verify**

```bash
cd frontend && npm run typecheck && npx vitest run src/features/history
```

Expected: clean typecheck; every History test passes, 5 more than on
`main` (the card's tests unchanged).

* [ ] **Step 9: Commit**

```bash
git add frontend/src/features/history/historyShared.ts frontend/src/features/history/PeriodPerformanceCard.tsx frontend/src/features/history/historyTestRows.ts frontend/src/features/history/periodPerformance.test.ts
git commit -m "✨ Compute the investment delta per month"
```

---

## Task 3: The chart (PR3)

**Files:**

* Create: `frontend/src/features/transactions/InvestmentDeltaChart.tsx`

* [ ] **Step 1: Create the component**

WHY: presentational only, in History's chart idiom (`ComposedChart`,
`chartTooltipProps`, `fmtAxisAmount`, the column's invested colour). Bars
and the line sit on their own axes because a month's delta is a small
fraction of the total invested. A bar is green for money in and red for
money out, the same colours as the card's delta pill.

```tsx
// The Transactions page's investment delta chart (PD-050): one bar per month
// for the money added (green) or sold (red), and a line for the invested
// amount at each month end, on its own axis.
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { ThemeName } from '../../lib/useTheme'
import {
  GOLD_PALETTE, MONTHS, PERFORMANCE_COLUMN_SYMBOL, REGION_COLOURS, chartTooltipProps, fmtAxisAmount,
  fmtCurrency, fmtSignedCurrency, type MonthlyInvestment, type PerformanceColumn,
} from '../history/historyShared'

const DELTA = 'Investment delta'

export function InvestmentDeltaChart({ months, column, theme }: {
  months: MonthlyInvestment[]
  column: PerformanceColumn
  theme: ThemeName
}) {
  const symbol = PERFORMANCE_COLUMN_SYMBOL[column]
  const lineColour = column === 'GOLD' ? GOLD_PALETTE[theme].invested : REGION_COLOURS[theme][column].invested
  const data = months.map(month => ({ ...month, label: MONTHS[month.month0] }))
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="delta" tick={{ fontSize: 11 }} tickFormatter={fmtAxisAmount} width={64} />
        <YAxis yAxisId="invested" orientation="right" tick={{ fontSize: 11 }} tickFormatter={fmtAxisAmount}
          width={64} domain={['auto', 'auto']} />
        <Tooltip {...chartTooltipProps}
          formatter={(value, name) => name === DELTA
            ? fmtSignedCurrency(Number(value), symbol)
            : fmtCurrency(Number(value), symbol)} />
        <ReferenceLine yAxisId="delta" y={0} stroke="var(--text-muted)" strokeDasharray="2 2" />
        <Bar yAxisId="delta" dataKey="delta" name={DELTA} radius={[3, 3, 0, 0]}>
          {data.map(month => (
            <Cell key={month.month0} fill={(month.delta ?? 0) < 0 ? 'var(--red)' : 'var(--green)'} />
          ))}
        </Bar>
        <Line yAxisId="invested" dataKey="invested" name={`Invested (${symbol})`} stroke={lineColour}
          strokeWidth={2} dot connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
```

* [ ] **Step 2: Verify**

```bash
cd frontend && npm run typecheck && npx eslint src/features/transactions/InvestmentDeltaChart.tsx
```

Expected: both clean.

* [ ] **Step 3: Commit**

```bash
git add frontend/src/features/transactions/InvestmentDeltaChart.tsx
git commit -m "✨ Add the investment delta chart"
```

---

## Task 4: The bottom panel (PR3)

**Files:**

* Create: `frontend/src/features/transactions/InvestmentDeltaPanel.tsx`, `frontend/src/features/transactions/InvestmentDeltaPanel.test.tsx`

* [ ] **Step 1: Create the panel**

WHY: the panel owns everything stateful (open, year, column, fetch) so the
chart stays presentational. It fetches only while open, which keeps the
collapsed page free of the year-long History request (PRD-007 §6.5), and
drops a late response for a year the user has already left. The open state
uses History's localStorage pattern. Sticky at the bottom of `<main>`, it
sits on the bottom edge while keeping its own space, so the table's last
rows are reachable.

```tsx
// The Transactions page's bottom panel (PD-050): pulled up from a handle bar,
// it charts each month's investment delta for one year and one column.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, type HistoryRow } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import {
  MIN_YEAR, PERFORMANCE_COLUMNS, PERFORMANCE_COLUMN_LABELS, columnPosition, monthRange, monthlyInvestment,
  tradingDateIST, yearMonth0, type PerformanceColumn,
} from '../history/historyShared'
import { InvestmentDeltaChart } from './InvestmentDeltaChart'

const OPEN_KEY = 'pd_txn_delta_open'

export function InvestmentDeltaPanel({ theme }: { theme: ThemeName }) {
  const currentYear = yearMonth0(tradingDateIST(new Date())).year
  const [open, setOpen] = useState(() => {
    try { return window.localStorage?.getItem(OPEN_KEY) === '1' } catch { return false }
  })
  const [year, setYear] = useState(currentYear)
  // null = not loaded yet for this year.
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PerformanceColumn | null>(null)

  const toggle = () => {
    setOpen(wasOpen => {
      const next = !wasOpen
      try { window.localStorage?.setItem(OPEN_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRows(null)
    setError(null)
    void (async () => {
      try {
        // 1 Jan → 31 Dec, plus the latest row before 1 Jan as January's baseline.
        const list = await api.listHistory(monthRange(year, 0).from, monthRange(year, 11).to, true)
        if (!cancelled) setRows(list.rows)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [open, year])

  // Only columns with money invested on some loaded row are offered.
  const columns = useMemo(
    () => PERFORMANCE_COLUMNS.filter(column => (rows ?? []).some(row => columnPosition(row, column).invested > 0)),
    [rows],
  )
  const column = picked && columns.includes(picked) ? picked : columns[0] ?? null
  const months = useMemo(
    () => (rows && column ? monthlyInvestment(rows, year, column) : []),
    [rows, year, column],
  )

  return (
    <section style={dock}>
      <button type="button" onClick={toggle} aria-expanded={open} style={handle}>
        {open ? '▼' : '▲'} Investment delta · {year}
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={toolbar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="btn btn-sm" aria-label="Previous year"
                disabled={year <= MIN_YEAR} onClick={() => setYear(shown => shown - 1)}>‹</button>
              <span className="mono" style={{ fontWeight: 600 }}>{year}</span>
              <button type="button" className="btn btn-sm" aria-label="Next year"
                disabled={year >= currentYear} onClick={() => setYear(shown => shown + 1)}>›</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {columns.map(option => (
                <button key={option} type="button" className="btn btn-sm" style={{ borderRadius: 999 }}
                  aria-pressed={option === column} onClick={() => setPicked(option)}>
                  {PERFORMANCE_COLUMN_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
          {error ? (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>
          ) : rows === null ? (
            <div style={centred}><span className="spinner" /></div>
          ) : !column ? (
            <div style={centred}>No History rows for {year}</div>
          ) : (
            <div role="img" aria-label={`Investment delta ${year}, ${PERFORMANCE_COLUMN_LABELS[column]}`}
              style={{ height: 260 }}>
              <InvestmentDeltaChart months={months} column={column} theme={theme} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const dock: CSSProperties = {
  position: 'sticky', bottom: 0, zIndex: 5,
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: '8px 8px 0 0', boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
}
const handle: CSSProperties = {
  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
  padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
}
const toolbar: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  flexWrap: 'wrap', gap: 10, marginBottom: 8,
}
const centred: CSSProperties = { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }
```

* [ ] **Step 2: Tests (Create `InvestmentDeltaPanel.test.tsx`)**

WHY: the panel's contract is behaviour a user sees: collapsed and silent by
default, the right year fetched with its baseline, the state remembered,
the year arrows and their bounds, and only invested columns offered. The
clock is frozen so "the current year" is fixed.

```tsx
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HistoryList, HistoryRow } from '../../lib/api/client'
import { historyRow } from '../history/historyTestRows'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn() }))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import { InvestmentDeltaPanel } from './InvestmentDeltaPanel'

const list = (rows: HistoryRow[]): HistoryList => ({ currency: 'INR', rows })
const handleButton = () => screen.getByRole('button', { name: /Investment delta/ })
const renderPanel = () => render(<InvestmentDeltaPanel theme="dark" />)

describe('InvestmentDeltaPanel', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-16T22:00:00Z')) // trading year 2026
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    // This jsdom has no localStorage (hence `window.localStorage?.` in app
    // code); a fresh stub per test, as History's charts-on-top test does.
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) },
      },
    })
    mockApi.listHistory.mockResolvedValue(list([
      historyRow('2025-12-31', { INR: [100, 110] }),
      historyRow('2026-01-31', { INR: [150, 160], EUR: [0, 0] }),
    ]))
  })

  it('starts collapsed and fetches nothing', () => {
    renderPanel()
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
    expect(handleButton()).toHaveTextContent('▲ Investment delta · 2026')
    expect(mockApi.listHistory).not.toHaveBeenCalled()
  })

  it('opens on the year with its baseline row, and stays open after a reload', async () => {
    const { unmount } = renderPanel()
    fireEvent.click(handleButton())
    expect(handleButton()).toHaveAttribute('aria-expanded', 'true')
    expect(mockApi.listHistory).toHaveBeenCalledWith('2026-01-01', '2026-12-31', true)
    expect(await screen.findByRole('img', { name: 'Investment delta 2026, 🇮🇳 India' })).toBeInTheDocument()

    unmount()
    renderPanel()
    expect(handleButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves between years, with next disabled on the current year', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledWith('2025-01-01', '2025-12-31', true))
    expect(handleButton()).toHaveTextContent('Investment delta · 2025')
    expect(screen.getByRole('button', { name: 'Next year' })).toBeEnabled()
  })

  it('offers only the columns with money invested', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByRole('button', { name: '🇮🇳 India' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '🇪🇺 Europe' })).not.toBeInTheDocument()
  })

  it('says so when the year has no History rows', async () => {
    mockApi.listHistory.mockResolvedValue(list([]))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText('No History rows for 2026')).toBeInTheDocument()
  })

  it('shows the error when the year fails to load', async () => {
    mockApi.listHistory.mockRejectedValue(new Error('boom'))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
```

* [ ] **Step 3: Verify**

```bash
cd frontend && npm run typecheck && npx vitest run src/features/transactions/InvestmentDeltaPanel.test.tsx
```

Expected: `Tests  6 passed (6)`.

* [ ] **Step 4: Commit**

```bash
git add frontend/src/features/transactions/InvestmentDeltaPanel.tsx frontend/src/features/transactions/InvestmentDeltaPanel.test.tsx
git commit -m "✨ Add the investment delta panel"
```

---

## Task 5: Show it on Transactions, then open PR3

**Files:**

* Modify: `frontend/src/features/transactions/TransactionsPage.tsx`, `frontend/src/features/transactions/TransactionsPage.test.tsx`, `docs/portfolio-model.md`

* [ ] **Step 1: Import (Edit `TransactionsPage.tsx`)**

Current:

```tsx
import TransactionsAllTable from './TransactionsAllTable'
```

Replacement:

```tsx
import TransactionsAllTable from './TransactionsAllTable'
import { InvestmentDeltaPanel } from './InvestmentDeltaPanel'
```

* [ ] **Step 2: Render at the bottom of `<main>`, own portfolio only (Edit `TransactionsPage.tsx`)**

WHY: the last child of `<main>`, so sticky docks it to the bottom edge.
Not in act-as: History has no act-as endpoint, and the owner wants the
chart for the user's own portfolio only (PRD-007 §3).

Current:

```tsx
            onEdit={openEditor}
          />
        )}
      </main>
```

Replacement:

```tsx
            onEdit={openEditor}
          />
        )}

        {/* The user's own portfolio only: History has no act-as read (PRD-007 §3). */}
        {!actAsUserId && <InvestmentDeltaPanel theme={theme} />}
      </main>
```

* [ ] **Step 3: Page tests (Edit `TransactionsPage.test.tsx`)**

WHY: proves the wiring and the act-as rule through the real page.
`listHistory` joins the mocked API so a test that opens the panel cannot
reach the network; the panel starts collapsed, so the existing tests make
no History call.

Current:

```ts
const mockApi = vi.hoisted(() => ({
  listAllTransactions: vi.fn(),
  listHoldings: vi.fn(),
  listTransactions: vi.fn(),
}))
```

Replacement:

```ts
const mockApi = vi.hoisted(() => ({
  listAllTransactions: vi.fn(),
  listHoldings: vi.fn(),
  listTransactions: vi.fn(),
  listHistory: vi.fn(),
}))
```

Current:

```ts
describe('TransactionsPage', () => {
```

Replacement:

```ts
describe('TransactionsPage', () => {
  it('shows the investment delta panel on the user’s own page', async () => {
    renderPage()
    await screen.findByText('SIP tranche')
    expect(screen.getByRole('button', { name: /Investment delta/ })).toBeInTheDocument()
  })

  it('does not show the investment delta panel in admin act-as', async () => {
    renderPage({ actAsUserId: 'u2', actAsLabel: "bob's transactions" })
    await screen.findByText('SIP tranche')
    expect(screen.queryByRole('button', { name: /Investment delta/ })).not.toBeInTheDocument()
  })

```

* [ ] **Step 4: User doc (Edit `docs/portfolio-model.md`)**

WHY: no user doc describes the Transactions page yet; the ledger section is
where a reader looks for it.

Current:

```markdown
date keeps the historical snapshots valuing that holding from the right day.

## Symbol format (Yahoo Finance)
```

Replacement:

```markdown
date keeps the historical snapshots valuing that holding from the right day.

### Investment delta chart

The **All transactions** page has an **Investment delta** panel docked at
the bottom (your own portfolio only; not in admin act-as). Pull it up for a
Jan–Dec chart: each month's bar is the money added (green) or the cost
basis sold (red), the same figure as the History month card, and the line
is the invested amount at each month end. ‹ › change the year, and the
INR / EUR / Gold buttons switch the currency
([PRD-007](prds/PRD-007-investment-delta-chart.md)). The panel remembers
whether you left it open.

## Symbol format (Yahoo Finance)
```

* [ ] **Step 5: Verify**

```bash
cd frontend && npm run typecheck && npx vitest run && npm run lint:changed
```

Expected: every suite passes, 13 more tests than on `main` (5 + 6 + 2);
`lint:changed` reports no errors.

* [ ] **Step 6: Commit, push, open PR3**

```bash
git add frontend/src/features/transactions/TransactionsPage.tsx frontend/src/features/transactions/TransactionsPage.test.tsx docs/portfolio-model.md
git commit -m "✨ Show the investment delta chart on Transactions"
git push -u origin feat/PD-050-investment-delta-chart
gh pr create --title "✨ Chart each month's investment delta on the Transactions page" --body-file pr3.md
```

Expected: PR URL; CI green (Frontend job incl. `lint changed files`).

---

## Task 6: End-to-end verification (local stack)

**Files:** none

* [ ] **Step 1: Run the stack** (`run-app` skill): `make dev-db`,
  `make backend`, `make frontend`, log in as yourself (not act-as).

* [ ] **Step 2: Scenarios**

1. **October 2026** — Transactions → pull up the panel → 2026, India.
   Expected: the Oct bar reads +₹18,826.38 in the tooltip and the line
   ₹8,98,847.70, the same as History → Oct 2026's card.
2. **Years** — ‹ to 2025: the chart reloads; › returns to 2026 and is then
   disabled.
3. **Currencies** — Europe and Gold buttons appear only where invested; June
   2025 Europe shows +€599.58.
4. **Remembered** — reload the page: the panel is still open; close it,
   reload: collapsed, and the network tab shows no `/history` request.
5. **Act-as + themes** — as an admin open a user's Transactions: no panel.
   Dark / light / cyberpunk and a 390 px window: legible, the panel docked
   to the bottom.

* [ ] **Step 3: Record** — paste the results as a comment on PR3.

Expected: all five pass before PR3 merges.

## Done

* The Transactions page has a pull-up Jan–Dec investment delta chart.
* Each bar equals that month's History card investment delta.
* ‹ › change the year; INR / EUR / Gold switch the column.
* Not shown in admin act-as; no History request while collapsed.
* `TransactionsPage.tsx` meets the naming rule.
* All vitest suites green; `npm run build` succeeds.

Next: a per-month breakdown on bar click (the month's transactions), and an
admin act-as view if History gains an act-as read.
