# PD-059: Wave 2 amendment — Overview (slices 4–7)

* **Status**: PR #347 in review. Implementation patches are specified and verified in isolation.
* **Owner**: Codex. Product decisions belong to the project owner.
* **Updated**: 2026-11-19
* **Implements**: [PRD-015 §4.3](../prds/PRD-015-ui-2.md#43-overview)
* **Design**: [DD-015](../designs/DD-015-ui-2.md)
* **Rollout**: [parent plan](PD-059-ui-2.md) and [status board](PD-059-ui-2-status.md)
* **Visual authority**: [owner reference](../visuals/PD-059-ui-2-reference.html) and [review frames](../visuals/PD-059-ui-2.html#frame-01)

## 1. Goal and architecture

Implement Overview inside the existing UI_2.0 shell. DashboardPage owns holdings,
prices, summary, gold metrics, dividends, XIRR, refresh and mutation callbacks.
New components render those values. Keep the original sidebar, mobile drawer,
branding font, Light, Dark and Cyber tokens. Use the reference for copy, layout,
control order and responsive behavior. Preserve the existing auth and act-as routes.

The Owners' chart decision is recorded on the status board. Slice 7 mounts the
standalone chart from #342 once the rest of Overview is present. Gold and the
owner's performance history stay out of act-as. The frontend uses the existing
React, TypeScript, Vitest and Playwright dependencies. No API, migration,
environment variable or infrastructure change is required.

## 2. Display and navigation contracts

* Total portfolio value includes the INR/EUR selector, converted equivalent and
  Total invested. Show Unrealised return, Today by currency (INR and EUR with
  the previous close date), Realised gains and Dividends in handoff order.
* One **Display currency** selector changes combined figures between INR and
  EUR. Native breakdown lines and daily movement keep their currencies. The
  single rate badge displays the inverse of `summary.eur_rate` (EUR per INR).
  Keep a missing quote, rate, prior close, Gold value or XIRR distinguishable
  from a measured zero. Gold has no prior-close movement series on this page.
* Currency groups own their sector groups. Search and the Active / Nil / All
  position view survive grouping changes. Keep classification badges, the
  review queue, renames, sector navigation and opening-date prompts. Display
  share price against previous close with an visible direction cue. Equal uses blue. An unavailable comparison inherits the default text color.
* From its first deployment, a row opens Holding details. Edit, Ledger and
  Delete use the existing dashboard handlers. Keep Ledger owner-only. Delete
  cancellation or failure leaves the dialog available. A selected ID is
  scoped to its owner and resolved against current data after refresh.
* All three allocation views use the same denominator: the sum of eligible
  active positions' INR-valued `current_value` fields. The prices endpoint has
  already converted EUR holdings. Native EUR value is `current_value_eur`.
  Count unsupported and unpriced positions separately. If a priced position
  lacks its usable INR valuation, show the unavailable state. Never substitute
  cost, total raw INR and EUR together, or report the remainder as 100%.
* Slice 7 adds Holdings / Performance and a separate Currency mix panel.
  Allocation view switches only change the displayed breakdown.

### Open question for the owner

Should selecting an allocation entry navigate to its holdings grouping?
Slice 7 leaves entries informational pending the owner's decision.

## 3. File map and PR sequence

| Area | Files under `frontend/src/` | Responsibility |
| --- | --- | --- |
| Dashboard | `features/dashboard/DashboardPage.tsx` | Presentation switch, native inputs, selection, permissions and callbacks |
| Cards | `ui2/overview/Ui2SummaryCards.tsx`, `overview.css` | Handoff metrics, native breakdowns, selected currency and responsive layout |
| Holdings | `features/holdings/HoldingsByCurrency.tsx`, `ui2/overview/Ui2Holdings.tsx` | Reuse existing groups and sector targets with an optional UI_2.0 row renderer |
| Dialog | `ui2/overview/Ui2HoldingDetailsDialog.tsx` | Working actions in slice 5, metrics in slice 6 |
| Allocation | `features/holdings/sectorAllocationData.ts`, `ui2/overview/Ui2Allocation.tsx` | Shared quote eligibility, INR shares, currency mix |
| Tests | `ui2/overview/{Ui2SummaryCards,OverviewDashboard,Ui2Allocation}.test.tsx`, `overview.browser.test.ts` | Values, permissions, end-to-end action routing and viewport checks |

Each branch starts from merged main, carries the `ui-2.0` label, and updates its
row and component registry on the [status board](PD-059-ui-2-status.md).
Slice 4 imports the shared `Ui2Dialog` and its styles from slice 14 (#348);
wait for that primitive to land before shipping its first Overview consumer.
Slice 5 uses the slice 4 formatter and stylesheet. Slice 7 ships last to mount
the performance chart as agreed. No slice depends on an unmerged branch.

| Slice and branch | Depends on | Independent value | Regression gate | Test anchor |
| --- | --- | --- | --- | --- |
| 4 · `feat/PD-059-overview-cards` | 2, 14 | Inspect summary in either currency | Legacy SummaryCards fallback | Handoff metrics, currency and native breakdown |
| 5 · `feat/PD-059-overview-holdings` | 4 | Search grouped holdings and act on a row | Edit, Ledger, Delete available immediately | Dashboard click through to target ID and act-as gate |
| 6 · `feat/PD-059-holding-details` | 5 | Inspect costs, income and XIRR | Same action dialog, forms and handlers | EUR metrics, missing XIRR, existing form tests |
| 7 · `feat/PD-059-overview-allocation` | 4–6, 10 | Compare allocations and open full performance | Shared exclusions and owner scoping | Mixed currencies, missing conversion, owner-only Performance, browser widths |

## 4. Executable implementation tasks

Use the registry’s Ui2PageIntro, Ui2Dialog (specified in #346), and primitives.css panel, button and table styles.

The fenced diffs are the complete frontend changes per slice. Removed lines
show the current code, added lines show the replacement, and context lines
identify the surrounding caller. Apply the corresponding fence from the repo
root on a clean branch after its dependencies merge. Each fence includes its
behavioral test. Register the new components on the board in the same PR.

### Task 1. Slice 4 — Portfolio summary

**Files:**

* `frontend/src/features/dashboard/DashboardPage.tsx`
* `frontend/src/ui2/overview/Ui2SummaryCards.test.tsx`
* `frontend/src/ui2/overview/Ui2SummaryCards.tsx`
* `frontend/src/ui2/overview/overview.css`

* [ ] Branch from current main with `git switch -c feat/PD-059-overview-cards origin/main`.
* [ ] Apply the implementation and test changes below.

Use the existing dashboard reads and the slice 14 dialog. A local display-currency selector changes combined totals. The breakdowns continue to use native currency. Keep the existing SummaryCards call as the fallback. The test switches currency, opens a breakdown and checks focus after Escape.

```diff
diff --git a/frontend/src/features/dashboard/DashboardPage.tsx b/frontend/src/features/dashboard/DashboardPage.tsx
index 9e48085..4a21bdb 100644
--- a/frontend/src/features/dashboard/DashboardPage.tsx
+++ b/frontend/src/features/dashboard/DashboardPage.tsx
@@ -1,8 +1,11 @@
 import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
 import { Link, useLocation, useNavigate } from 'react-router-dom'
+import { Ui2PageIntro } from '../../ui2/shell/Ui2PageIntro'
 import SummaryCards from '../../components/SummaryCards'
 import { PortfolioHero } from '../../components/PortfolioHero'
-import { useUiRevamp } from '../../lib/uiMode'
+import { useUiMode, useUiRevamp } from '../../lib/uiMode'
+import { Ui2SummaryCards, type AssetLine } from '../../ui2/overview/Ui2SummaryCards'
+import { nativeView } from '../holdings/currencyTotals'
 import { notify } from '../../lib/toast'
 import { type GoldMetrics } from '../../lib/api/client'
 import HoldingsByCurrency, { type HoldingsLayout } from '../holdings/HoldingsByCurrency'
@@ -90,6 +93,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
   const [regionLabel, setRegionLabel] = useState<string>('')
   const [openingPromptSkipped, setOpeningPromptSkipped] = useState(false)
   const revamp = useUiRevamp()
+  const ui2 = useUiMode() === 'ui2'
   const location = useLocation()
   const navigate = useNavigate()
   // In the glass shell (PD-054) the brand, page links and user menu live in
@@ -182,6 +186,31 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
   // tables and the pie, so a search or view filter never repaints sectors.
   const sectorColors = useMemo(() => sectorColorsByCurrency(enriched, theme), [enriched, theme])

+  const assets: AssetLine[] = []
+  if (ui2) {
+    for (const {currency, holdings: rows} of groupByCurrency(displayHoldings)) {
+      if (currency === 'OTHER') continue
+      const sum = (read: (holding: HoldingWithPrice) => number | undefined) => {
+        let total = 0
+        for (const holding of rows) {
+          const amount = read(holding)
+          if (amount == null) return null
+          total += amount
+        }
+        return total
+      }
+      assets.push({ label: currency + ' equities', currency,
+        invested: sum(holding => nativeView(currency, holding.cost_price, holding.cost_price_eur).primary),
+        current: sum(holding => nativeView(currency, holding.current_value, holding.current_value_eur).primary),
+        unrealised: sum(holding => nativeView(currency, holding.unrealized_pnl, holding.unrealized_pnl_eur).primary),
+        realised: sum(holding => holding.realized_pnl ?? 0),
+        income: currency === 'INR' ? income.inr : income.eur })
+    }
+    if (user?.gold_enabled && !actAsUserId) assets.push({ label: 'Physical gold', currency: 'INR',
+      invested: goldMetrics?.invested, current: goldMetrics?.current, income: 0, realised: 0,
+      unrealised: goldMetrics?.current == null ? null : goldMetrics.current - goldMetrics.invested })
+  }
+
   const TAB = (key: Tab, label: string) => (
     <button id={`dashboard-${key}-tab`} className="seg-btn" aria-pressed={tab === key} onClick={() => setTab(key)}>
       {label}
@@ -210,7 +239,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
             <div className="brand-tile" style={{ width: 32, height: 32 }}><ChartLineIcon size={18} /></div>
             <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Portfolio Dashboard</span>
           </Link>
-          <h1 className="shell-only page-title">{actAsLabel ? `${actAsLabel}'s portfolio` : 'Portfolio'}</h1>
+          {!ui2 && <h1 className="shell-only page-title">{actAsLabel ? `${actAsLabel}'s portfolio` : 'Portfolio'}</h1>}
           {roleBadge}
           {regionLabel && (
             <span style={{
@@ -293,6 +322,8 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
       </header>

       <main className="dash-main page-main" style={{ maxWidth: 1600, margin: '0 auto' }}>
+        {ui2 && <Ui2PageIntro title={actAsLabel ? actAsLabel + "'s portfolio" : 'Your portfolio, at a glance'}
+          subtitle="A little clarity for every investment decision." />}
         {actAsUserId && (
           <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
             <Link to="/admin" aria-label="Back to admin" title="Back to admin" style={{
@@ -320,7 +351,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
             dayChange={computedDayChangeByCurrency} />
         )}

-        <SummaryCards
+        {ui2 ? <Ui2SummaryCards summary={summary} assets={assets} daily={computedDayChangeByCurrency} /> : <SummaryCards
           summary={summary}
           loading={loadingPrices}
           goldCurrentInr={goldMetrics?.current ?? null}
@@ -336,7 +367,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
           stocksUnrealisedEur={enriched.filter(holding => holding.currency === 'EUR').reduce((sum, holding) => sum + (holding.unrealized_pnl_eur ?? 0), 0)}
           computedDayChangeInr={computedDayChangeByCurrency.INR}
           computedDayChangeEur={computedDayChangeByCurrency.EUR}
-        />
+        />}

         {needsReview.length > 0 && <aside className="classification-banner" aria-label="Classification review">
           <span>{needsReview.length} {needsReview.length === 1 ? 'holding needs' : 'holdings need'} review</span>
diff --git a/frontend/src/ui2/overview/Ui2SummaryCards.test.tsx b/frontend/src/ui2/overview/Ui2SummaryCards.test.tsx
new file mode 100644
index 0000000..b6f6fc2
--- /dev/null
+++ b/frontend/src/ui2/overview/Ui2SummaryCards.test.tsx
@@ -0,0 +1,26 @@
+import { fireEvent, render, screen, within } from '@testing-library/react'
+import { expect, it } from 'vitest'
+import { Ui2SummaryCards } from './Ui2SummaryCards'
+
+it('switches portfolio totals while preserving native breakdown values and dialog focus', () => {
+  render(<Ui2SummaryCards summary={{eur_rate: 0.01, previous_close_date: "2026-11-16"}} daily={{EUR: null}} assets={[
+    { label: 'EUR equities', currency: 'EUR', current: 100, invested: 80, unrealised: 20, realised: 0, income: 5 },
+    { label: 'Physical gold', currency: 'INR', current: 5000, invested: 4000, unrealised: 1000, realised: 0, income: 0 },
+  ]} />)
+  expect(screen.getAllByRole('heading').map(item => item.textContent)).toEqual([
+    'Total portfolio value', 'Unrealised return', 'Today by currency', 'Realised gains', 'Dividends',
+  ])
+  expect(screen.getByText('₹15,000.00')).toBeVisible()
+  expect(screen.getByText('≈ €150.00 converted equivalent')).toBeVisible()
+  expect(screen.getByText('vs 2026-11-16 close')).toBeVisible()
+  expect(screen.getByText('INR · — (—)')).toBeVisible()
+  expect(screen.getByText('EUR · — (—)')).toBeVisible()
+  fireEvent.change(screen.getByLabelText('Display currency'), { target: {value: 'EUR'} })
+  expect(screen.getByText('€150.00')).toBeVisible()
+  const button = screen.getByRole('button', {name: 'Total portfolio value breakdown'})
+  button.focus()
+  fireEvent.click(button)
+  expect(within(screen.getByRole('dialog')).getByText(/Current ₹5,000.00/)).toBeVisible()
+  fireEvent.keyDown(document, {key: 'Escape'})
+  expect(button).toHaveFocus()
+})
diff --git a/frontend/src/ui2/overview/Ui2SummaryCards.tsx b/frontend/src/ui2/overview/Ui2SummaryCards.tsx
new file mode 100644
index 0000000..3a62ed6
--- /dev/null
+++ b/frontend/src/ui2/overview/Ui2SummaryCards.tsx
@@ -0,0 +1,85 @@
+import { useState } from 'react'
+import type { Summary } from '../../types'
+import type { GroupDayChange } from '../../features/holdings/dashboardPriceMovement'
+import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../lib/currency'
+import { Ui2Dialog } from '../shell/Ui2Dialog'
+import './overview.css'
+
+type Amount = number | null | undefined
+export function money(value: Amount, currency: string) {
+  return value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', {
+    style: 'currency', currency, minimumFractionDigits: 2,
+  }).format(value)
+}
+
+export interface AssetLine {
+  label: string
+  currency: SupportedCurrency
+  invested: Amount
+  current: Amount
+  unrealised: Amount
+  realised: Amount
+  income: Amount
+}
+
+interface Props {
+  summary: Summary | null
+  assets: AssetLine[]
+  daily: Partial<Record<SupportedCurrency, GroupDayChange | null | undefined>>
+}
+
+const titles = ['Total portfolio value', 'Unrealised return', 'Today by currency', 'Realised gains', 'Dividends'] as const
+export function Ui2SummaryCards({ summary, assets, daily }: Props) {
+  const [currency, setCurrency] = useState<SupportedCurrency>('INR')
+  const [open, setOpen] = useState<typeof titles[number] | null>(null)
+  if (!summary) return null
+  const rate = summary.eur_rate
+  const validRate = rate != null && Number.isFinite(rate) && rate > 0
+  function total(field: keyof Pick<AssetLine, 'invested' | 'current' | 'unrealised' | 'realised' | 'income'>, display = currency) {
+    let sum = 0
+    for (const asset of assets) {
+      const amount = asset[field]
+      if (amount == null) return null
+      if (asset.currency === display || amount === 0) sum += amount
+      else if (validRate) sum += display === 'EUR' ? amount * rate! : amount / rate!
+      else return null
+    }
+    return sum
+  }
+  const unrealised = total('unrealised')
+  const realised = total('realised')
+  const invested = total('invested')
+  const movements = SUPPORTED_CURRENCIES.map(code => {
+    const bucket = summary.per_currency?.find(item => item.currency === code)
+    const change = daily[code]
+    return { code, gain: change === undefined ? bucket?.change_value : change?.gain,
+      pct: change === undefined ? bucket?.change_pct : change?.pct,
+      close: change === undefined ? bucket?.previous_close : change?.previousValue }
+  })
+  const equivalent = currency === 'INR' ? 'EUR' : 'INR'
+  const values = [
+    <><label>Display currency <select value={currency} onChange={event => setCurrency(event.target.value as SupportedCurrency)}>
+      {SUPPORTED_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label>
+      <strong>{money(total('current'), currency)}</strong>
+      <small>≈ {money(total('current', equivalent), equivalent)} converted equivalent</small>
+      <small>Total invested {money(invested, currency)}</small></>,
+    <>{money(unrealised, currency)}<small>{invested && unrealised != null ? (100 * unrealised / invested).toFixed(2) + '%' : '—'} since purchase</small></>,
+    <>{movements.map(({code, gain, pct}) => <small key={code}>{code} · {money(gain, code)} ({pct == null ? '—' : pct.toFixed(2) + '%'})</small>)}
+      <small>{summary.previous_close_date ? 'vs ' + summary.previous_close_date + ' close' : 'Previous close date unavailable'}</small></>,
+    money(realised, currency), money(total('income'), currency),
+  ]
+  return <section aria-label="Portfolio summary" className="u2-summary">
+    <p>{validRate ? '1 EUR = ' + money(1 / rate!, 'INR') : 'Conversion rate unavailable'}</p>
+    <div className="u2-summary-grid">{titles.map((title, index) => <article key={title} className="ui2-panel">
+      <h2>{title}</h2>{values[index]}<button className="ui2-btn" onClick={() => setOpen(title)}
+        aria-label={title + ' breakdown'}>View breakdown</button></article>)}</div>
+    {open && <Ui2Dialog title={open} onClose={() => setOpen(null)}>
+      {open === 'Today by currency' ? <>{movements.map(item => <p key={item.code}>{item.code} previous close {money(item.close, item.code)}</p>)}
+        <p>Gold daily movement —</p></> :
+        <dl>{assets.filter(asset => open !== 'Dividends' || asset.label !== 'Physical gold').map(asset =>
+          <div key={asset.label}><dt>{asset.label}</dt><dd>{open === 'Total portfolio value'
+            ? <>Invested {money(asset.invested, asset.currency)} · Current {money(asset.current, asset.currency)}</>
+            : money(open === 'Unrealised return' ? asset.unrealised : open === 'Realised gains' ? asset.realised : asset.income, asset.currency)}</dd></div>)}</dl>}
+    </Ui2Dialog>}
+  </section>
+}
diff --git a/frontend/src/ui2/overview/overview.css b/frontend/src/ui2/overview/overview.css
new file mode 100644
index 0000000..2807a11
--- /dev/null
+++ b/frontend/src/ui2/overview/overview.css
@@ -0,0 +1,9 @@
+:root[data-ui="ui2"] .u2-summary header,
+:root[data-ui="ui2"] .u2-summary-grid {
+  display: flex;
+  gap: 1rem;
+  justify-content: space-between;
+  flex-wrap: wrap;
+}
+:root[data-ui="ui2"] .u2-summary-grid article { flex: 1 1 13rem; min-width: 0; }
+:root[data-ui="ui2"] .u2-summary small { display: block; }
```

* [ ] Verify the slice from the repository root with the following command.

The focused suites exercise the new behavior and the existing callers.

```bash
(cd frontend && npx tsc -b && REQUIRE_BROWSER_TESTS=1 npm run test:run -- src/ui2/overview/Ui2SummaryCards.test.tsx src/features/dashboard/DashboardPage.test.tsx && npm run lint:changed)
```

Expected: typecheck and lint exit zero and all selected tests pass. Five headings in reference order. The example changes from ₹15,000 to €150 while the Gold breakdown still reads ₹5,000.

* [ ] Update the registry and slice row, then stage the named files and commit.

The explicit paths keep the PR scoped to this slice.

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx \
  frontend/src/ui2/overview/Ui2SummaryCards.test.tsx \
  frontend/src/ui2/overview/Ui2SummaryCards.tsx \
  frontend/src/ui2/overview/overview.css \
  docs/plans/PD-059-ui-2-status.md
git commit -m "✨ Add the Overview summary metrics"
```

### Task 2. Slice 5 — Grouped holdings and working row actions

**Files:**

* `frontend/src/features/dashboard/DashboardPage.tsx`
* `frontend/src/features/holdings/HoldingsByCurrency.tsx`
* `frontend/src/ui2/overview/OverviewDashboard.test.tsx`
* `frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx`
* `frontend/src/ui2/overview/Ui2Holdings.tsx`
* `frontend/src/ui2/overview/overview.css`

* [ ] Branch from current main with `git switch -c feat/PD-059-overview-holdings origin/main`.
* [ ] Apply the implementation and test changes below.

Give HoldingsByCurrency an optional row renderer. Its existing view, grouping, sector colours, subtotals and navigation continue to apply to the same rows. The dashboard owns the selection and resolves its ID against the displayed owner's current holdings. Ship the action dialog in this patch so the first selectable row can already edit, open its ledger or delete. The integration test starts at the actual dashboard and exercises each action.

```diff
diff --git a/frontend/src/features/dashboard/DashboardPage.tsx b/frontend/src/features/dashboard/DashboardPage.tsx
index 4a21bdb..972aad0 100644
--- a/frontend/src/features/dashboard/DashboardPage.tsx
+++ b/frontend/src/features/dashboard/DashboardPage.tsx
@@ -6,6 +6,8 @@ import { PortfolioHero } from '../../components/PortfolioHero'
 import { useUiMode, useUiRevamp } from '../../lib/uiMode'
 import { Ui2SummaryCards, type AssetLine } from '../../ui2/overview/Ui2SummaryCards'
 import { nativeView } from '../holdings/currencyTotals'
+import { Ui2HoldingDetailsDialog } from '../../ui2/overview/Ui2HoldingDetailsDialog'
+import { Ui2Holdings } from '../../ui2/overview/Ui2Holdings'
 import { notify } from '../../lib/toast'
 import { type GoldMetrics } from '../../lib/api/client'
 import HoldingsByCurrency, { type HoldingsLayout } from '../holdings/HoldingsByCurrency'
@@ -153,7 +155,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
   }
   const handleDelete = async (id: string) => {
     if (!confirm('Delete this holding?')) return
-    try { await remove(id) }
+    try { await remove(id); return true }
     catch (e) { notify('Delete failed: ' + (e instanceof Error ? e.message : String(e))) }
   }

@@ -163,6 +165,11 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
     cost_price: (holding.stocks_owned ?? 0) * (holding.avg_cost_price ?? 0),
   }))

+  const [selection, setSelection] = useState<{owner?: string; id: string} | null>(null)
+  const selected = ui2 && selection && selection.owner === actAsUserId
+    ? displayHoldings.find(holding => holding.id === selection.id) : undefined
+  const selectHolding = (id: string) => setSelection({owner: actAsUserId, id})
+
   const filtered = displayHoldings.filter(holding =>
     !filter || holding.script?.toLowerCase().includes(filter.toLowerCase()) || holding.symbol?.toLowerCase().includes(filter.toLowerCase())
   )
@@ -395,6 +402,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {

         {tab === 'table' && (
           <HoldingsByCurrency
+            renderRows={ui2 ? rows => <Ui2Holdings rows={rows} select={selectHolding} /> : undefined}
             holdings={filtered}
             searchActive={Boolean(filter)}
             view={positionView} onViewChange={setPositionView}
@@ -415,6 +423,10 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
         }} />}
       </main>

+      {selected && <Ui2HoldingDetailsDialog holding={selected} close={() => setSelection(null)}
+        edit={() => { setSelection(null); setModal(selected) }}
+        ledger={actAsUserId ? undefined : () => { setSelection(null); setTxnModal(selected) }}
+        remove={async () => { if (selected.id && await handleDelete(selected.id)) setSelection(null) }} />}
       {modal && (
         <AddEditModal
           holding={modal === 'add' ? null : modal}
@@ -447,7 +459,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
           if (last) requestAnimationFrame(() => document.getElementById(`dashboard-${tab}-tab`)?.focus())
         }} />}

-      {showOpeningPrompt && !modal && !reviewQueue && (
+      {showOpeningPrompt && !modal && !reviewQueue && !selected && !txnModal && (
         <OpeningDateModal
           holdings={needsOpeningDate}
           userId={actAsUserId}
diff --git a/frontend/src/features/holdings/HoldingsByCurrency.tsx b/frontend/src/features/holdings/HoldingsByCurrency.tsx
index aafa868..04ebb85 100644
--- a/frontend/src/features/holdings/HoldingsByCurrency.tsx
+++ b/frontend/src/features/holdings/HoldingsByCurrency.tsx
@@ -14,6 +14,7 @@ import { SectorColorsContext, type SectorColorMap } from './sectorColors'
 export type HoldingsLayout = 'holding' | 'sector'

 interface Props {
+  renderRows?: (rows: HoldingWithPrice[]) => React.ReactNode
   holdings: HoldingWithPreviousClose[]
   loading: boolean
   onEdit: (holding: HoldingWithPrice) => void
@@ -51,7 +52,7 @@ const fmt = (amount: number, sym: string) => {
 }


-export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions, xirr, searchActive = false,
+export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions, renderRows, xirr, searchActive = false,
   view: viewProp, onViewChange, layout: layoutProp, onLayoutChange, sectorTarget, onSectorTargetHandled, sectorColors }: Props) {
   const [internalView, setInternalView] = useState<HoldingView>('active')
   const [internalLayout, setInternalLayout] = useState<HoldingsLayout>('holding')
@@ -175,7 +176,7 @@ export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete
               )}
             </div>

-            {layout === 'holding' ? <HoldingsTable
+            {layout === 'holding' ? (renderRows ? renderRows(group.holdings) : <HoldingsTable
               holdings={group.holdings}
               loading={loading}
               onEdit={onEdit}
@@ -186,7 +187,7 @@ export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete
               xirr={xirr}
               totalXirr={bucket ?? null}
               totalLabel={searchActive ? 'VISIBLE TOTAL' : 'TOTAL'}
-            /> : groupBySector(group.holdings).map(sector => {
+            />) : groupBySector(group.holdings).map(sector => {
               const subtotal = sumTotals(sector.holdings)
               const current = nativeView(group.currency, subtotal.value, subtotal.valueEur).primary
               const sectionId = sectorSectionId(group.currency, sector.key)
@@ -195,9 +196,9 @@ export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete
                   <span><span aria-hidden="true" className="sector-dot" style={{ background: colors?.get(sector.key) ?? sector.color }} />{sector.label}</span>
                   <span className="sector-group-meta">{sector.holdings.length} {sector.holdings.length === 1 ? 'holding' : 'holdings'} · {fmt(current, nativeSym)} current value</span>
                 </h3>
-                <HoldingsTable holdings={sector.holdings} loading={loading} onEdit={onEdit} onDelete={onDelete}
+                {renderRows ? renderRows(sector.holdings) : <HoldingsTable holdings={sector.holdings} loading={loading} onEdit={onEdit} onDelete={onDelete}
                   onTransactions={onTransactions} view="all" nativeCurrency={group.currency === 'EUR' ? 'EUR' : 'INR'}
-                  xirr={xirr} totalXirr={null} totalLabel={`${sector.label} subtotal${searchActive ? ' (visible selection)' : ''}`} />
+                  xirr={xirr} totalXirr={null} totalLabel={`${sector.label} subtotal${searchActive ? ' (visible selection)' : ''}`} />}
               </div>
             })}
           </section>
diff --git a/frontend/src/ui2/overview/OverviewDashboard.test.tsx b/frontend/src/ui2/overview/OverviewDashboard.test.tsx
new file mode 100644
index 0000000..6c0f3cb
--- /dev/null
+++ b/frontend/src/ui2/overview/OverviewDashboard.test.tsx
@@ -0,0 +1,50 @@
+import { fireEvent, render, screen, within } from '@testing-library/react'
+import { MemoryRouter } from 'react-router-dom'
+import { beforeEach, expect, it, vi } from 'vitest'
+import DashboardPage from '../../features/dashboard/DashboardPage'
+
+const state = vi.hoisted(() => ({ mode: 'ui2', remove: vi.fn(), rows: [
+  {id: 'india', script: 'Twin', symbol: 'TWIN.NS', currency: 'INR', stocks_owned: 1, avg_cost_price: 10,
+    current_price: 10000, current_value: 10000, previous_close_price: 9900},
+  {id: 'europe', script: 'Twin', symbol: 'TWIN.DE', currency: 'EUR', stocks_owned: 1, avg_cost_price: 10,
+    current_price: 100, current_value_eur: 100, current_value: 10000, previous_close_price: 102},
+] }))
+vi.mock('../../features/auth/AuthContext', () => {
+  const session = () => ({user: {id: 'owner', role: 'user', ui_mode: state.mode}})
+  return {useAuth: session, useAuthOptional: session}
+})
+vi.mock('../../features/holdings/useHoldings', () => ({useHoldings: () => ({
+  holdings: state.rows, enriched: state.rows, summary: {eur_rate: 0.01}, remove: state.remove,
+})}))
+vi.mock('../../features/holdings/AddEditModal', () => ({default: ({holding}: {holding: {id: string}}) => <p>Edit {holding.id}</p>}))
+vi.mock('../../features/holdings/TransactionsModal', () => ({default: ({holding}: {holding: {id: string}}) => <p>Ledger {holding.id}</p>}))
+
+const mount = (owner?: string) => render(<MemoryRouter><DashboardPage actAsUserId={owner} /></MemoryRouter>)
+beforeEach(() => { state.mode = 'ui2'; state.remove.mockReset() })
+
+it.each(['Edit','Ledger','Delete'])('routes %s from the selected EUR row', async action => {
+  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
+  try {
+    mount()
+    fireEvent.click(screen.getAllByRole('button', {name: 'Twin'})[1])
+    const dialog = screen.getByRole('dialog')
+    expect(dialog).toHaveTextContent('TWIN.DE')
+    fireEvent.click(within(dialog).getByRole('button', {name: action}))
+    if (action === 'Delete') expect(state.remove).toHaveBeenCalledWith('europe')
+    else expect(await screen.findByText(action + ' europe')).toBeVisible()
+  } finally { confirm.mockRestore() }
+})
+it('omits ledger in act-as and returns focus to the selected holding', () => {
+  mount('target')
+  const opener = screen.getAllByRole('button', {name: 'Twin'})[0]
+  opener.focus()
+  fireEvent.click(opener)
+  expect(within(screen.getByRole('dialog')).queryByText('Ledger')).toBeNull()
+  fireEvent.keyDown(document, {key: 'Escape'})
+  expect(opener).toHaveFocus()
+})
+it.each(['classic','glass'])('keeps existing row actions in %s', mode => {
+  state.mode = mode
+  mount()
+  expect(screen.getAllByRole('button', {name: 'Edit Twin'})).toHaveLength(2)
+})
diff --git a/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx b/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx
new file mode 100644
index 0000000..c54a8dd
--- /dev/null
+++ b/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx
@@ -0,0 +1,21 @@
+import type { HoldingWithPrice } from '../../types'
+import { Ui2Dialog } from '../shell/Ui2Dialog'
+
+interface Props {
+  holding: HoldingWithPrice
+  close: () => void
+  edit: () => void
+  ledger?: () => void
+  remove: () => void
+}
+
+export function Ui2HoldingDetailsDialog({holding, close, edit, ledger, remove}: Props) {
+  return <Ui2Dialog title={holding.script || 'Holding details'} onClose={close}>
+    <p>{holding.symbol} · {holding.exchange}</p>
+    <div className="ui2-dialog-actions">
+      <button className="ui2-btn" onClick={edit}>Edit</button>
+      {ledger && <button className="ui2-btn" onClick={ledger}>Ledger</button>}
+      <button className="ui2-btn ui2-btn-danger" onClick={remove}>Delete</button>
+    </div>
+  </Ui2Dialog>
+}
diff --git a/frontend/src/ui2/overview/Ui2Holdings.tsx b/frontend/src/ui2/overview/Ui2Holdings.tsx
new file mode 100644
index 0000000..177472b
--- /dev/null
+++ b/frontend/src/ui2/overview/Ui2Holdings.tsx
@@ -0,0 +1,34 @@
+import type { HoldingWithPrice } from '../../types'
+import { canonicalCurrency, formatQuantity } from '../../lib/currency'
+import { holdingMovement, holdingDayGain } from '../../features/holdings/dashboardPriceMovement'
+import { nativeView } from '../../features/holdings/currencyTotals'
+import SectorBadge from '../../features/holdings/SectorBadge'
+import { money } from './Ui2SummaryCards'
+
+export function Ui2Holdings({ rows, select }: {rows: HoldingWithPrice[]; select: (id: string) => void}) {
+  return <div className="u2-holdings"><table className="ui2-table" aria-label="Holdings"><thead><tr>
+    {['Holding', 'Shares', 'Avg cost', 'Share price', 'Value', 'Today', 'Unrealised'].map(label =>
+      <th scope="col" key={label}>{label}</th>)}
+  </tr></thead><tbody>{rows.map(holding => {
+    const currency = canonicalCurrency(holding.currency)
+    const native = currency === 'EUR' ? 'EUR' : 'INR'
+    const movement = holdingMovement(holding)
+    const direction = movement ? movement.tone ?? 'neutral' : undefined
+    const selectRow = () => { if (holding.id) select(holding.id) }
+    return <tr key={holding.id} onClick={event => {
+      if ((event.target as HTMLElement).closest('button')) return
+      event.currentTarget.querySelector('button')?.focus()
+      selectRow()
+    }}>
+      <th scope="row"><button type="button" disabled={!holding.id} onClick={selectRow}>{holding.script}</button>
+        <small>{holding.symbol} · {holding.exchange}</small><SectorBadge holding={holding} /></th>
+      <td>{formatQuantity(holding.stocks_owned)}</td><td>{money(holding.avg_cost_price, currency)}</td>
+      <td className={direction}>{money(holding.current_price, currency)}
+        <small>{!movement ? 'Previous close unavailable' : movement.change === 0
+          ? 'Unchanged from previous close' : movement.change > 0 ? 'Above previous close' : 'Below previous close'}</small></td>
+      <td>{money(nativeView(native, holding.current_value, holding.current_value_eur).primary, native)}</td>
+      <td>{money(holdingDayGain(holding), currency)}</td>
+      <td>{money(nativeView(native, holding.unrealized_pnl, holding.unrealized_pnl_eur).primary, native)}</td>
+    </tr>
+  })}</tbody></table></div>
+}
diff --git a/frontend/src/ui2/overview/overview.css b/frontend/src/ui2/overview/overview.css
index 2807a11..c40dc54 100644
--- a/frontend/src/ui2/overview/overview.css
+++ b/frontend/src/ui2/overview/overview.css
@@ -7,3 +7,12 @@
 }
 :root[data-ui="ui2"] .u2-summary-grid article { flex: 1 1 13rem; min-width: 0; }
 :root[data-ui="ui2"] .u2-summary small { display: block; }
+:root[data-ui="ui2"] .u2-holdings { max-width: 100%; overflow-x: auto; }
+:root[data-ui="ui2"] .u2-holdings table { border-collapse: collapse; width: 100%; }
+:root[data-ui="ui2"] .u2-holdings :is(th, td) { padding: .7rem; text-align: end; }
+:root[data-ui="ui2"] .u2-holdings th:first-child { text-align: start; }
+:root[data-ui="ui2"] .u2-holdings small { display: block; }
+:root[data-ui="ui2"] .u2-holdings .neutral { color: var(--blue); }
+@media (max-width: 760px) {
+  :root[data-ui="ui2"] .u2-holdings :is(td, th):is(:nth-child(2), :nth-child(3), :nth-child(6)) { display: none; }
+}
```

* [ ] Verify the slice from the repository root with the following command.

The focused suites exercise the new behavior and the existing callers.

```bash
(cd frontend && npx tsc -b && REQUIRE_BROWSER_TESTS=1 npm run test:run -- src/ui2/overview/OverviewDashboard.test.tsx src/features/holdings/HoldingsByCurrency.test.tsx src/features/holdings/SectorNavigation.test.tsx && npm run lint:changed)
```

Expected: typecheck and lint exit zero and all selected tests pass. Each action reaches the EUR holding in the duplicate-name fixture. Escape restores the opener. The act-as dialog omits Ledger, and Classic and Glass keep their existing row controls.

* [ ] Update the registry and slice row, then stage the named files and commit.

The explicit paths keep the PR scoped to this slice.

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx \
  frontend/src/features/holdings/HoldingsByCurrency.tsx \
  frontend/src/ui2/overview/OverviewDashboard.test.tsx \
  frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx \
  frontend/src/ui2/overview/Ui2Holdings.tsx \
  frontend/src/ui2/overview/overview.css \
  docs/plans/PD-059-ui-2-status.md
git commit -m "✨ Open holding actions from grouped Overview rows"
```

### Task 3. Slice 6 — Holding metrics and existing forms

**Files:**

* `frontend/src/features/dashboard/DashboardPage.tsx`
* `frontend/src/ui2/overview/OverviewDashboard.test.tsx`
* `frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx`
* `frontend/src/ui2/overview/overview.css`

* [ ] Branch from current main with `git switch -c feat/PD-059-holding-details origin/main`.
* [ ] Apply the implementation and test changes below.

Extend the dialog shipped in slice 5 with the enriched holding and its indexed XIRR. Scope the styling to the existing classification, opening-date and holding forms. Their validation, review queue, owner scoping and save behavior stay in their original components. The added test opens the second row and reads its native amount and missing XIRR.

```diff
diff --git a/frontend/src/features/dashboard/DashboardPage.tsx b/frontend/src/features/dashboard/DashboardPage.tsx
index 972aad0..509a312 100644
--- a/frontend/src/features/dashboard/DashboardPage.tsx
+++ b/frontend/src/features/dashboard/DashboardPage.tsx
@@ -423,7 +423,8 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
         }} />}
       </main>

-      {selected && <Ui2HoldingDetailsDialog holding={selected} close={() => setSelection(null)}
+      {selected && <Ui2HoldingDetailsDialog holding={selected} xirr={selected.id ? xirr?.byHolding[selected.id]?.xirr : null}
+        close={() => setSelection(null)}
         edit={() => { setSelection(null); setModal(selected) }}
         ledger={actAsUserId ? undefined : () => { setSelection(null); setTxnModal(selected) }}
         remove={async () => { if (selected.id && await handleDelete(selected.id)) setSelection(null) }} />}
diff --git a/frontend/src/ui2/overview/OverviewDashboard.test.tsx b/frontend/src/ui2/overview/OverviewDashboard.test.tsx
index 6c0f3cb..2ff9079 100644
--- a/frontend/src/ui2/overview/OverviewDashboard.test.tsx
+++ b/frontend/src/ui2/overview/OverviewDashboard.test.tsx
@@ -43,6 +43,14 @@ it('omits ledger in act-as and returns focus to the selected holding', () => {
   fireEvent.keyDown(document, {key: 'Escape'})
   expect(opener).toHaveFocus()
 })
+it('shows native EUR amounts, current shares and unavailable XIRR for the selected row', () => {
+  mount()
+  fireEvent.click(screen.getAllByRole('button', {name: 'Twin'})[1])
+  const dialog = within(screen.getByRole('dialog'))
+  expect(dialog.getByText('Current value').nextElementSibling).toHaveTextContent('€100.00')
+  expect(dialog.getByText('Shares').nextElementSibling).toHaveTextContent('1')
+  expect(dialog.getByText('XIRR').nextElementSibling).toHaveTextContent('—')
+})
 it.each(['classic','glass'])('keeps existing row actions in %s', mode => {
   state.mode = mode
   mount()
diff --git a/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx b/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx
index c54a8dd..3954c45 100644
--- a/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx
+++ b/frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx
@@ -1,7 +1,13 @@
 import type { HoldingWithPrice } from '../../types'
 import { Ui2Dialog } from '../shell/Ui2Dialog'

+import { canonicalCurrency, formatQuantity } from '../../lib/currency'
+import { formatRate } from '../../lib/rate'
+import { money } from './Ui2SummaryCards'
+import SectorBadge from '../../features/holdings/SectorBadge'
+
 interface Props {
+  xirr?: number | null
   holding: HoldingWithPrice
   close: () => void
   edit: () => void
@@ -9,9 +15,25 @@ interface Props {
   remove: () => void
 }

-export function Ui2HoldingDetailsDialog({holding, close, edit, ledger, remove}: Props) {
+export function Ui2HoldingDetailsDialog({holding, xirr, close, edit, ledger, remove}: Props) {
+  const currency = canonicalCurrency(holding.currency)
+  const eur = currency === 'EUR'
+  const converted = eur ? 'EUR' : 'INR'
+  const metrics = [
+    ['Shares', formatQuantity(holding.stocks_owned)],
+    ['Average cost per share', money(holding.avg_cost_price, currency)],
+    ['Total cost', money(eur ? holding.cost_price_eur : holding.cost_price, converted)],
+    ['Current value', money(eur ? holding.current_value_eur : holding.current_value, converted)],
+    ['Unrealised return', money(eur ? holding.unrealized_pnl_eur : holding.unrealized_pnl, converted)],
+    ['Realised gain', money(holding.realized_pnl, currency)],
+    ['Dividends', money(holding.total_dividends, currency)],
+    ['XIRR', formatRate(xirr)],
+  ]
   return <Ui2Dialog title={holding.script || 'Holding details'} onClose={close}>
     <p>{holding.symbol} · {holding.exchange}</p>
+    <SectorBadge holding={holding} />
+    <dl className="ui2-detailgrid">{metrics.map(([label, value]) =>
+      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
     <div className="ui2-dialog-actions">
       <button className="ui2-btn" onClick={edit}>Edit</button>
       {ledger && <button className="ui2-btn" onClick={ledger}>Ledger</button>}
diff --git a/frontend/src/ui2/overview/overview.css b/frontend/src/ui2/overview/overview.css
index c40dc54..3c07c14 100644
--- a/frontend/src/ui2/overview/overview.css
+++ b/frontend/src/ui2/overview/overview.css
@@ -1,3 +1,8 @@
+:root[data-ui="ui2"] :is(.holding-form-card, .classification-card, [aria-label="Set opening dates"]) {
+  border-radius: 1rem !important;
+  box-shadow: 0 1rem 3rem #0004;
+}
+:root[data-ui="ui2"] .classification-banner { padding: .85rem 1rem; border-radius: .9rem; }
 :root[data-ui="ui2"] .u2-summary header,
 :root[data-ui="ui2"] .u2-summary-grid {
   display: flex;
```

* [ ] Verify the slice from the repository root with the following command.

The focused suites exercise the new behavior and the existing callers.

```bash
(cd frontend && npx tsc -b && REQUIRE_BROWSER_TESTS=1 npm run test:run -- src/ui2/overview/OverviewDashboard.test.tsx src/features/holdings/ClassificationReview.test.tsx src/features/holdings/AddEditModal.test.tsx src/features/holdings/TransactionsModal.test.tsx && npm run lint:changed)
```

Expected: typecheck and lint exit zero and all selected tests pass. The selected EUR position shows €100.00, one share and an em dash for unavailable XIRR. The existing workflow suites pass.

* [ ] Update the registry and slice row, then stage the named files and commit.

The explicit paths keep the PR scoped to this slice.

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx \
  frontend/src/ui2/overview/OverviewDashboard.test.tsx \
  frontend/src/ui2/overview/Ui2HoldingDetailsDialog.tsx \
  frontend/src/ui2/overview/overview.css \
  docs/plans/PD-059-ui-2-status.md
git commit -m "✨ Show holding metrics in the Overview dialog"
```

### Task 4. Slice 7 — Portfolio allocation and Performance

**Files:**

* `frontend/src/features/dashboard/DashboardPage.tsx`
* `frontend/src/features/holdings/sectorAllocationData.ts`
* `frontend/src/ui2/overview/OverviewDashboard.test.tsx`
* `frontend/src/ui2/overview/Ui2Allocation.test.tsx`
* `frontend/src/ui2/overview/Ui2Allocation.tsx`
* `frontend/src/ui2/overview/overview.browser.test.ts`
* `frontend/src/ui2/overview/overview.css`

* [ ] Branch from current main with `git switch -c feat/PD-059-overview-allocation origin/main`.
* [ ] Apply the implementation and test changes below.

Share the existing priced-position eligibility rule with allocation. Use the INR-valued field for every wedge. Group by holding ID, sector or currency. Show the currency mix independently of the active allocation view. Mount the already-merged OverallPerformance component on the owner's Performance tab when slices 4–6 are present. Test both market shares and the act-as permission gate.

```diff
diff --git a/frontend/src/features/dashboard/DashboardPage.tsx b/frontend/src/features/dashboard/DashboardPage.tsx
index 509a312..922f393 100644
--- a/frontend/src/features/dashboard/DashboardPage.tsx
+++ b/frontend/src/features/dashboard/DashboardPage.tsx
@@ -8,6 +8,8 @@ import { Ui2SummaryCards, type AssetLine } from '../../ui2/overview/Ui2SummaryCa
 import { nativeView } from '../holdings/currencyTotals'
 import { Ui2HoldingDetailsDialog } from '../../ui2/overview/Ui2HoldingDetailsDialog'
 import { Ui2Holdings } from '../../ui2/overview/Ui2Holdings'
+import { Ui2Allocation } from '../../ui2/overview/Ui2Allocation'
+import OverallPerformance from '../../ui2/overview/OverallPerformance'
 import { notify } from '../../lib/toast'
 import { type GoldMetrics } from '../../lib/api/client'
 import HoldingsByCurrency, { type HoldingsLayout } from '../holdings/HoldingsByCurrency'
@@ -218,6 +220,12 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
       unrealised: goldMetrics?.current == null ? null : goldMetrics.current - goldMetrics.invested })
   }

+  const navigateSector = (selection: SectorSelection) => {
+    setHoldingsLayout('sector')
+    setSectorTarget(selection)
+    setTab('table')
+  }
+
   const TAB = (key: Tab, label: string) => (
     <button id={`dashboard-${key}-tab`} className="seg-btn" aria-pressed={tab === key} onClick={() => setTab(key)}>
       {label}
@@ -384,7 +392,7 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 16px', flexWrap: 'wrap', gap: 10 }}>
           <div className="seg-group">
             {TAB('table', 'Holdings')}
-            {TAB('charts', 'Charts')}
+            {(!ui2 || !actAsUserId) && TAB('charts', ui2 ? 'Performance' : 'Charts')}
           </div>
           {tab === 'table' && (
             <input
@@ -400,7 +408,8 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
           )}
         </div>

-        {tab === 'table' && (
+        <div className={ui2 ? 'u2-workspace' : undefined}>
+        {(tab === 'table' || (ui2 && actAsUserId)) && (
           <HoldingsByCurrency
             renderRows={ui2 ? rows => <Ui2Holdings rows={rows} select={selectHolding} /> : undefined}
             holdings={filtered}
@@ -418,9 +427,10 @@ export default function DashboardPage({ actAsUserId, actAsLabel }: Props) {
             sectorColors={sectorColors}
           />
         )}
-        {tab === 'charts' && <Charts holdings={enriched} sectorColors={sectorColors} onSelectSector={selection => {
-          setHoldingsLayout('sector'); setSectorTarget(selection); setTab('table')
-        }} />}
+        {tab === 'charts' && (ui2 ? (!actAsUserId && <OverallPerformance />) :
+          <Charts holdings={enriched} sectorColors={sectorColors} onSelectSector={navigateSector} />)}
+        {ui2 && <Ui2Allocation holdings={enriched} />}
+        </div>
       </main>

       {selected && <Ui2HoldingDetailsDialog holding={selected} xirr={selected.id ? xirr?.byHolding[selected.id]?.xirr : null}
diff --git a/frontend/src/features/holdings/sectorAllocationData.ts b/frontend/src/features/holdings/sectorAllocationData.ts
index 0ce9ea4..604bf1f 100644
--- a/frontend/src/features/holdings/sectorAllocationData.ts
+++ b/frontend/src/features/holdings/sectorAllocationData.ts
@@ -12,15 +12,17 @@ export interface SectorAllocationBucket extends ClassificationBucket {
 }

 /** Native current values only; missing quotes never fall back to invested cost. */
+export function pricedNativeValue(holding: HoldingWithPrice, currency: SupportedCurrency) {
+  const value = nativeView(currency, holding.current_value, holding.current_value_eur).primary
+  if (holding.price_error || !Number.isFinite(holding.current_price) || (holding.current_price ?? 0) <= 0 ||
+      value == null || !Number.isFinite(value) || value < 0) return null
+  return value
+}
+
 export function sectorAllocation(holdings: HoldingWithPrice[], currency: SupportedCurrency) {
   const currencies = groupByCurrency(filterByView(holdings, 'active'))
   const rows = currencies.find(group => group.currency === currency)?.holdings ?? []
-  const currentValue = (holding: HoldingWithPrice) => {
-    const value = nativeView(currency, holding.current_value, holding.current_value_eur).primary
-    if (holding.price_error || !Number.isFinite(holding.current_price) || (holding.current_price ?? 0) <= 0 ||
-        value == null || !Number.isFinite(value) || value < 0) return null
-    return value
-  }
+  const currentValue = (holding: HoldingWithPrice) => pricedNativeValue(holding, currency)
   let unpriced = 0
   for (const holding of rows) if (currentValue(holding) === null) unpriced++
   const groups = groupBySector(rows).map(group => ({
diff --git a/frontend/src/ui2/overview/OverviewDashboard.test.tsx b/frontend/src/ui2/overview/OverviewDashboard.test.tsx
index 2ff9079..1b60196 100644
--- a/frontend/src/ui2/overview/OverviewDashboard.test.tsx
+++ b/frontend/src/ui2/overview/OverviewDashboard.test.tsx
@@ -51,6 +51,16 @@ it('shows native EUR amounts, current shares and unavailable XIRR for the select
   expect(dialog.getByText('Shares').nextElementSibling).toHaveTextContent('1')
   expect(dialog.getByText('XIRR').nextElementSibling).toHaveTextContent('—')
 })
+it('shows the currency mix alongside allocation and restricts Performance to the owner', () => {
+  const owner = mount()
+  const mix = within(screen.getByRole('region', {name: 'Currency mix'}))
+  expect(mix.getByText('EUR · 50.0%')).toBeVisible()
+  expect(mix.getByText('INR · 50.0%')).toBeVisible()
+  expect(screen.getByRole('button', {name: 'Performance'})).toBeVisible()
+  owner.unmount()
+  mount('target')
+  expect(screen.queryByRole('button', {name: 'Performance'})).toBeNull()
+})
 it.each(['classic','glass'])('keeps existing row actions in %s', mode => {
   state.mode = mode
   mount()
diff --git a/frontend/src/ui2/overview/Ui2Allocation.test.tsx b/frontend/src/ui2/overview/Ui2Allocation.test.tsx
new file mode 100644
index 0000000..dcaa346
--- /dev/null
+++ b/frontend/src/ui2/overview/Ui2Allocation.test.tsx
@@ -0,0 +1,12 @@
+import { render, screen } from '@testing-library/react'
+import { expect, it } from 'vitest'
+import { Ui2Allocation } from './Ui2Allocation'
+
+it('withholds percentages when a priced EUR holding lacks an INR valuation', () => {
+  render(<Ui2Allocation holdings={[
+    {currency: 'INR', id: 'one', stocks_owned: 1, current_price: 10000, current_value: 10000},
+    {currency: 'EUR', id: 'two', stocks_owned: 1, current_price: 100, current_value_eur: 100},
+  ]} />)
+  expect(screen.getByText(/missing INR valuation/)).toBeVisible()
+  expect(screen.queryByText(/100.0%/)).toBeNull()
+})
diff --git a/frontend/src/ui2/overview/Ui2Allocation.tsx b/frontend/src/ui2/overview/Ui2Allocation.tsx
new file mode 100644
index 0000000..1f67253
--- /dev/null
+++ b/frontend/src/ui2/overview/Ui2Allocation.tsx
@@ -0,0 +1,60 @@
+import { useState } from 'react'
+import type { HoldingWithPrice } from '../../types'
+import { classificationBucket } from '../../features/holdings/classification'
+import { groupByCurrency } from '../../features/holdings/groupByCurrency'
+import { filterByView } from '../../features/holdings/holdingViews'
+import { pricedNativeValue } from '../../features/holdings/sectorAllocationData'
+import type { SupportedCurrency } from '../../lib/currency'
+import { money } from './Ui2SummaryCards'
+
+type View = 'Holding' | 'Sector' | 'Currency'
+interface Bucket { key: string; label: string; value: number }
+interface Props {
+  holdings: HoldingWithPrice[]
+}
+const palette = ['var(--blue)', 'var(--purple)', 'var(--green)', 'var(--yellow)']
+
+export function Ui2Allocation({holdings}: Props) {
+  const [view, setView] = useState<View>('Holding')
+  const groups = new Map<string, Bucket>()
+  const mix: Record<SupportedCurrency, number> = { INR: 0, EUR: 0 }
+  let unsupported = 0
+  let unpriced = 0
+  let missingConversion = false
+  for (const {currency, holdings: rows} of groupByCurrency(filterByView(holdings, 'active'))) {
+    if (currency === 'OTHER') { unsupported += rows.length; continue }
+    for (const holding of rows) {
+      const native = pricedNativeValue(holding, currency)
+      if (native == null) { unpriced++; continue }
+      if (native <= 0) continue
+      const value = holding.current_value
+      if (value == null || !Number.isFinite(value) || value <= 0) { missingConversion = true; continue }
+      mix[currency] += value
+      const sector = classificationBucket(holding)
+      const key = view === 'Holding' ? holding.id : view === 'Sector' ? sector.key : currency
+      if (!key) continue
+      const label = view === 'Holding' ? holding.script || holding.symbol || key : view === 'Sector' ? sector.label : currency
+      const entry = groups.get(key) ?? {key, label, value: 0}
+      entry.value += value
+      groups.set(key, entry)
+    }
+  }
+  const entries = [...groups.values()].sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
+  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
+  let cumulative = 0
+  const stops = entries.map((entry, index) => {
+    const start = cumulative
+    cumulative += entry.value / total * 100
+    return palette[index % palette.length] + ' ' + start + '% ' + cumulative + '%'
+  })
+  return <aside><section className="ui2-panel" aria-label="Portfolio allocation"><h2>Portfolio allocation</h2>
+    <div role="group" aria-label="Allocation view">{(['Holding','Sector','Currency'] as const).map(choice =>
+      <button className="ui2-btn" key={choice} aria-pressed={choice === view} onClick={() => setView(choice)}>{choice}</button>)}</div>
+    {missingConversion ? <p>Portfolio allocation unavailable: missing INR valuation.</p> : !total ? <p>No priced positions.</p> :
+      <><div aria-hidden="true" className="u2-allocation-ring" style={{background: 'conic-gradient(' + stops.join(', ') + ')'}} />
+        <ul>{entries.map(entry => <li key={entry.key}>{entry.label} · {money(entry.value, 'INR')} · {(100 * entry.value / total).toFixed(1)}%</li>)}</ul></>}
+    {(unpriced > 0 || unsupported > 0) && <p>{unpriced} unpriced · {unsupported} unsupported</p>}
+  </section><section className="ui2-panel" aria-label="Currency mix"><h2>Currency mix</h2>
+    {(['INR', 'EUR'] as const).map(code => <p key={code}>{code} · {missingConversion || !total ? '—' : (100 * mix[code] / total).toFixed(1) + '%'}</p>)}
+  </section></aside>
+}
diff --git a/frontend/src/ui2/overview/overview.browser.test.ts b/frontend/src/ui2/overview/overview.browser.test.ts
new file mode 100644
index 0000000..fe74b17
--- /dev/null
+++ b/frontend/src/ui2/overview/overview.browser.test.ts
@@ -0,0 +1,38 @@
+// @vitest-environment node
+import { afterAll, beforeAll, describe, expect, it } from 'vitest'
+import { launchBrowser, startFixtureServer } from '../../test/browser/harness'
+
+const browser = await launchBrowser()
+describe.skipIf(!browser)('Overview at the handoff widths', () => {
+  let fixture: Awaited<ReturnType<typeof startFixtureServer>>
+  beforeAll(async () => { fixture = await startFixtureServer() })
+  afterAll(async () => { await browser?.close(); await fixture?.server.close() })
+  it.each([1280, 768, 390])('keeps selection accessible at %i px', async width => {
+    const page = await browser!.newPage({viewport: {width, height: 900}})
+    try {
+      const holdings = [{id: 'one', script: 'Example', symbol: 'EX.NS', currency: 'INR', current_price: 100,
+        stocks_owned: 1, current_value: 100, avg_cost_price: 50, cost_price: 50, unrealized_pnl: 50}]
+      await page.route(url => url.pathname.startsWith('/api/'), route => {
+        const path = new URL(route.request().url()).pathname
+        const replies: Record<string, unknown> = {
+          '/api/auth/me': {id: 'owner', username: 'owner', name: 'Owner', ui_mode: 'ui2', role: 'user'},
+          '/api/branding': {font: 'roboto', allowed_fonts: []},
+          '/api/holdings': holdings, '/api/prices': {holdings}, '/api/summary': {eur_rate: 0.01},
+          '/api/xirr': {as_of: '2026-11-16', holdings: [], currencies: []},
+        }
+        return route.fulfill({json: replies[path] ?? []})
+      })
+      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType: 'text/css', body: ''}))
+      await page.goto(fixture.baseUrl, {waitUntil: 'domcontentloaded'})
+      const opener = page.getByRole('table', {name: 'Holdings'}).getByRole('button', {name: 'Example'})
+      await opener.focus()
+      await opener.press('Enter')
+      const dialog = page.getByRole('dialog', {name: 'Example'})
+      await dialog.waitFor()
+      await dialog.getByRole('button', {name: 'Ledger'}).waitFor()
+      await page.keyboard.press('Escape')
+      await expect.poll(() => opener.evaluate(element => element === document.activeElement)).toBe(true)
+      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
+    } finally { await page.close() }
+  })
+})
diff --git a/frontend/src/ui2/overview/overview.css b/frontend/src/ui2/overview/overview.css
index 3c07c14..3e21f3d 100644
--- a/frontend/src/ui2/overview/overview.css
+++ b/frontend/src/ui2/overview/overview.css
@@ -3,6 +3,11 @@
   box-shadow: 0 1rem 3rem #0004;
 }
 :root[data-ui="ui2"] .classification-banner { padding: .85rem 1rem; border-radius: .9rem; }
+:root[data-ui="ui2"] .u2-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(15rem, 22rem); gap: 1rem; align-items: start; }
+:root[data-ui="ui2"] .u2-allocation-ring { width: 8rem; aspect-ratio: 1; margin: 1rem auto; border-radius: 50%; mask: radial-gradient(circle, transparent 48%, black 49%); }
+@media (max-width: 1200px) {
+  :root[data-ui="ui2"] .u2-workspace { grid-template-columns: minmax(0, 1fr); }
+}
 :root[data-ui="ui2"] .u2-summary header,
 :root[data-ui="ui2"] .u2-summary-grid {
   display: flex;
```

* [ ] Verify the slice from the repository root with the following command.

The focused suites exercise the new behavior and the existing callers.

```bash
(cd frontend && npx tsc -b && REQUIRE_BROWSER_TESTS=1 npm run test:run -- src/ui2/overview src/features/holdings/SectorAllocation.test.tsx src/features/holdings/SectorNavigation.test.tsx && npm run lint:changed)
```

Expected: typecheck and lint exit zero and all selected tests pass. The mixed-currency fixture displays two 50.0% shares. Missing INR valuation suppresses percentages. The Currency mix panel shows both shares. Act-as hides Performance. Chromium passes keyboard and page-width checks at 1280, 768 and 390 px.

* [ ] Update the registry and slice row, then stage the named files and commit.

The explicit paths keep the PR scoped to this slice.

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx \
  frontend/src/features/holdings/sectorAllocationData.ts \
  frontend/src/ui2/overview/OverviewDashboard.test.tsx \
  frontend/src/ui2/overview/Ui2Allocation.test.tsx \
  frontend/src/ui2/overview/Ui2Allocation.tsx \
  frontend/src/ui2/overview/overview.browser.test.ts \
  frontend/src/ui2/overview/overview.css \
  docs/plans/PD-059-ui-2-status.md
git commit -m "✨ Show allocation and performance on Overview"
```

## 5. End-to-end verification and rollout

* [ ] Using the [run-app flow](../../.claude/skills/run-app/SKILL.md), open the
  same mixed INR/EUR portfolio in UI_2.0 at 1280, 768 and 390 px. Compare it
  with the [owner reference](../visuals/PD-059-ui-2-reference.html) in Light,
  Dark and Cyber. Check page width, keyboard focus and drawer behavior.
* [ ] Switch display currency, inspect each native breakdown, dismiss by Escape,
  close control and backdrop, and verify focus returns to its trigger.
* [ ] Search, switch to sector grouping, open a row, edit and save it. Open
  its ledger, then cancel Delete. Check the selected holding throughout.
* [ ] Exercise classification Review later, confirm/rename, and opening-date
  save/skip. Verify the existing Add/Edit fields and validation in all modes.
* [ ] Compare the same priced positions across all allocation views. Test two
  equal INR-valued positions in different currencies and a missing conversion.
  Switch the allocation view and verify that Currency mix keeps the same shares.
* [ ] Open Performance as the owner. In act-as verify that editing targets the
  selected user and that no owner-only ledger, Gold or performance request runs.
* [ ] Run the complete frontend checks before opening the final implementation PR.

The full suite includes Chromium when the required flag is set.

```bash
(cd frontend && REQUIRE_BROWSER_TESTS=1 npm run test:run && npm run build && npm run lint:changed)
```

Expected: all tests, build and lint pass. Deploy each reviewed slice via the
usual protected-main flow. Roll back an affected slice with a revert PR;
revert dependent slices first. No stored data needs rollback.

## 6. Done and next

* [x] Defined the four slices and their executable implementation patches.
* [ ] Ship slices 4, 5, 6 and 7 in order after the shared dialog lands.
* [ ] Record implementation PRs and dev-stack acceptance on the status board.

**Next:** review this amendment, then implement slice 4 on its own branch.
