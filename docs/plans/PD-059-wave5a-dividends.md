# PD-059: Wave 5a — Dividends page and dividend import (slices 18–19)

* **Status**: Amendment in progress (this doc).
* **Updated**: 2026-11-19
* **Owner**: Claude
* **Goal**: Render the per-currency dividend ledger and the CSV dividend import in the UI_2.0 shell, matching the handoff's Dividends frame 1:1, and create the shared `asset-*` page primitives that Gold (slices 20–21) reuses.
* **Architecture**: Dividends is the **first asset page**. The handoff builds Dividends and Gold from one shared vocabulary — `asset-root`, `asset-top`, `assetStats`, `asset-table`, `asset-search`, `asset-footer`, `asset-split`, `asset-contribution`, `assetBarChart`, `asset-import`. Slice 18 therefore lands those as `frontend/src/ui2/asset/*` and consumes them; slice 20 reuses them untouched. `DividendsPage` and `DividendImportModal` each become a pure `useUiMode()` dispatcher with the Classic body moved into a `ClassicXxx` component, exactly as `TransactionsPage.tsx:49-56` and `TradeImportModal.tsx:21-29` already do. Slice 19 extracts the dividend import state machine into `useDividendImport`, so Classic and UI_2.0 share one parser, one validation path and one server contract — the `useTradeImport` arrangement from slice 17.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library, existing typed API client. No new dependencies; the handoff's bar chart is hand-rolled SVG, not Recharts.
* **Spec links**: [PRD-015](../prds/PRD-015-ui-2.md), [DD-015](../designs/DD-015-ui-2.md), [handoff HTML](../visuals/PD-059-ui-2-reference.html) (frame 07), [handoff guide](../visuals/PD-059-ui-2-guide.md) §4, [parent plan](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Merged and relied on: slice 2 (`Ui2Shell`, `Ui2Dialog`, `Ui2PageIntro`, `primitives.css`), slice 16 (`Ui2TransactionsPage`, the dispatcher pattern, `Pager` reuse inside a UI_2.0 page), slice 17 (`useTradeImport` — the shared-import-hook precedent).

Reused without modification: `useDividends`, `parseDividendCsv`, `DividendModal`, `DeleteDividendDialog`, `DeleteAllDialog`, `ImportCounts`, `InvalidLines`, `NameConfirmDialog`, `usePagination`, `Pager`, `formatMoney`, `currencySymbol`, `canonicalCurrency`, `formatDate`, `todayIST`, `tabFrom`.

Not reused: `DividendsTable` and `DividendsAnalytics` are Classic-shaped (Recharts, Classic `td`/`th` style objects, different columns). The handoff specifies a different table and a hand-rolled SVG chart, so UI_2.0 renders its own — the same call slice 16 made for `TransactionsAllTable`.

Deploy through the per-account `ui_mode` flag. Classic and Glass routes are untouched.

---

## 2. Handoff fidelity reference

Owner decision (board, 2026-11-18): the handoff "is the single source of truth for layout and style: every screen matches it 1:1. Treat deviations as bugs to fix, not redesign opportunities." These are the facts read out of `dividendView()`, `dividendImport()`, `showAssetPage()`, `assetStats()`, `assetBarChart()` and the handoff stylesheet. Implementation must match them.

**Page intro** (`showAssetPage`): title `Income, one payment at a time.`, subtitle `Track received dividends in their original currency.`, breadcrumb `Dividends`. The intro's **actions are hidden** on asset pages (`.intro .actions` gets `history-hidden`) — the page's buttons live in `asset-top` instead.

**`asset-top`**: `asset-tabs` (`role="tablist"`, `aria-label="Dividend currency"`) with `₹ INR` / `€ EUR`, the active one `primary`; on the right, `Upload CSV` then `＋ Add dividend` (primary).

**Stat cards** (`assetStats`, first card gets `hero`), each `label / value / detail`:

| Label | Value | Detail |
| --- | --- | --- |
| `Total dividends · <CUR>` | tab total | `All payments in this currency` |
| `Payments` | row count | `Recorded dividends` |
| `Holdings paying` | distinct holdings | `Distinct holdings` |
| `Payment range` | first date, or `—` | `to <last date>`, or `No recorded payments` |

**Filter bar** (`asset-search`, always rendered): search input `aria-label="Search dividends"`, placeholder `Search holding or symbol`; a `compactselect` `aria-label="Dividend holding"` with `All holdings` then one option per paying holding; then `asset-note` reading `<visible> of <all> payments`.

**Table** (`asset-table` inside `asset-table-wrap`): columns `Date`, `Holding` (`left`), `Dividend`, `Currency cumulative`, `Holding cumulative`, `Actions`. There is **no row-number column**. The two cumulative headers carry `title` tooltips: "Running total for all payments in this currency, before holding and search filters." and "Running total for this holding through the payment date." The holding cell is `<strong>{script}</strong><small>{symbol}</small>` — **no stock icon**. Currency cumulative is `positive`-toned. Actions are `Edit` and an `asset-danger` `Delete` with an `aria-label`. When a filter matches nothing the body is one row: `No payments match this search.` spanning 6 columns.

**Table footer** (`asset-footer`): `Chronological payments · <CUR>` on the left, paging on the right.

**`asset-split`** (two panels, `1.5fr 1fr`), rendered only when the tab has rows:

* `Income over time · <CUR>` with an `asset-period` group (`aria-label="Dividend chart period"`) toggling `Monthly` / `Yearly`, then the SVG bar chart, then a years table (`Year` / `Payments` / `Total`, newest year first).
* `Income by holding` with `asset-note` `<CUR> · all payments`, then one `asset-contribution` per holding: name and amount on one line, an `asset-track` bar, and `<pct>% of dividend income`.

**Empty tab** (`asset-empty`): eyebrow `<CUR> DIVIDENDS`, `h2` `Your income story starts here.`, then `No <CUR> payments recorded.` / `Add a dividend or upload your dividend CSV.`

**Page footer** (`asset-footer`): the `asset-danger` `Delete all <CUR>` button — **not** in the filter bar.

**Import dialog** (`dividendImport`): title `Upload dividend CSV · <CUR>`; an `asset-note` reading the expected header and `Match holdings within <CUR>.`; an `asset-toolbar` with the file input (`aria-label="Dividend CSV file"`) and a `Load example` button; a `textarea` (`aria-label="Dividend CSV contents"`, placeholder `Paste your dividend CSV`); a primary `Validate and preview` button; then the results area. Choosing a file **fills the textarea and stops** — it does not auto-validate. `Load example` sets the textarea to the header line only, per guide §4 ("Load example supplies only the header and format hint").

`assetBarChart(data, currency)`: `viewBox="0 0 700 240"`, `role="img"`; three dashed gridlines at `y = 195 - t*160` for `t ∈ {0, .5, 1}` from `x=75` to `x=680`, each with a right-anchored money label at `x=65, y=199-t*160`, font-size 10; `step = 600 / max(data.length, 1)`; bar `i` at `x = 80 + i*step + step*0.2`, `y = 195 - value/max*160`, `width = max(8, step*0.55)`, `height = value/max*160`, `fill=var(--accent)`, `rx=4`, carrying a `<title>` of `<label>: <money>`; the bar's label at `x = 80 + i*step + step*0.47`, `y=220`, middle-anchored, font-size 10. `max = Math.max(...values, 1)`.

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/ui2/asset/asset.css` | Shared asset-page CSS ported from the handoff, scoped `:root[data-ui="ui2"]`, on `--u2-*` tokens. Used by Dividends now, Gold in slices 20–21 |
| Create | `frontend/src/ui2/asset/AssetStats.tsx` | Shared `assetStats` stat grid (`AssetStat`, hero first card) |
| Create | `frontend/src/ui2/asset/AssetBarChart.tsx` | Shared hand-rolled SVG bar chart (`BarDatum`) |
| Create | `frontend/src/ui2/asset/AssetStats.test.tsx` | Stat grid: hero card, optional detail, tone class |
| Create | `frontend/src/ui2/asset/AssetBarChart.test.tsx` | Bar geometry, `<title>` tooltips, zero-data guard |
| Create | `frontend/src/ui2/dividends/Ui2DividendsPage.tsx` | The UI_2.0 Dividends page per §2 |
| Create | `frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx` | Tabs, filters, cumulative stability, chart toggle, modals |
| Modify | `frontend/src/features/dividends/DividendsPage.tsx` | Pure `useUiMode()` dispatcher; Classic body → `ClassicDividendsPage` |
| Create | `frontend/src/features/dividends/useDividendImport.ts` | Shared dividend-import state machine (slice 19) |
| Modify | `frontend/src/features/dividends/DividendImportModal.tsx` | Dispatcher; Classic body → `ClassicDividendImportModal`, rewired onto the hook |
| Create | `frontend/src/ui2/dividends/Ui2DividendImport.tsx` | UI_2.0 import: file + paste + Load example + Validate and preview |
| Create | `frontend/src/ui2/dividends/Ui2DividendImport.test.tsx` | Paste, Load example, validate, names, import, close-on-result |

No `dividends.css`: every rule the page needs is shared asset chrome and belongs in `asset.css`, which Gold reuses.

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `docs/PD-059-wave5a-dividends` | This amendment + board update | Docs only | Reviewable, handoff-checked plan for slices 18–19 | `markdownlint` |
| `feat/PD-059-dividends-page` | Slice 18: `ui2/asset/*`, `Ui2DividendsPage`, `DividendsPage` dispatcher | Classic and Glass untouched — the dispatcher only diverts `ui_mode === 'ui2'`; `DividendsPage.test.tsx` and `DividendCrud.test.tsx` pass unchanged | UI_2.0 accounts get the full Dividends page: tabs, stats, table, chart, breakdown, CRUD | `Ui2DividendsPage.test.tsx`, `AssetStats.test.tsx`, `AssetBarChart.test.tsx` |
| `feat/PD-059-dividend-import` | Slice 19: `useDividendImport`, `DividendImportModal` dispatcher + rewire, `Ui2DividendImport` | `DividendImport.test.tsx` passes unchanged against the rewired Classic modal | UI_2.0 accounts import dividends by file **or paste**, with Load example, in the handoff dialog | `Ui2DividendImport.test.tsx` |

Both slices are frontend-only, so no backend PR pairs with them.

---

## 5. Owner decisions and open questions

### Standing decisions this plan applies

From the board's decisions log (2026-11-18) and the handoff guide, quoted, not re-interpreted:

* The handoff is the 1:1 source of truth; deviations are bugs.
* "Imports (UI_2.0 only): upload + paste + Load example (header + hint)."
* Guide §4: "Trade/dividend upload and paste retain their original parsers, limits, matching decisions and server validation. Load example supplies only the header and format hint. Keep dividend currency/cumulative semantics."
* "Act-as persists only across its supported Overview/Transactions/Dividends paths" — so `Ui2DividendsPage` takes `actAsUserId` and threads it through every call, as `Ui2TransactionsPage` does.

### Decisions taken in this plan (reversible, no owner input needed)

* The `?currency=` tab stays in the URL and keeps using the exported `tabFrom`, so a UI_2.0 deep link behaves like a Classic one and switching interface mid-session keeps the tab.
* `view.by_year` / `view.by_month` / `view.by_holding` feed the chart, years table and breakdown. The server already computes them; recomputing from `rows` would duplicate server logic.
* `view.rows` is rendered in server order and never re-sorted — `cumulative` is a running total over that exact order, so re-sorting would desync it.
* `DividendModal`, `DeleteDividendDialog` and `DeleteAllDialog` are reused as-is. They carry Classic modal chrome; the handoff's `asset-form` restyling of them is tracked as a follow-up, not smuggled into this slice.
* `ImportCounts` / `InvalidLines` render inside the handoff's `asset-import` chrome. The handoff's own counts come from a fictional client-side validator; production must keep the **server** preview's `ready` / `duplicate` / `invalid` counts, which those two components already present.

### Open questions — awaiting owner

```text
ID: PD-059-Q-5a-1
Raised by / date: Claude / 2026-11-19
Affected slice and files: 18 — frontend/src/ui2/dividends/Ui2DividendsPage.tsx
Existing behaviour and evidence: The handoff's dividend table footer is
  "← {page} / {pages} →" (dividendView, #div-prev / #div-next). The repo's
  shared control is components/Pager.tsx, a Gmail-style "1–15 of 230 ‹ ›",
  and merged slice 16 (Ui2TransactionsPage.tsx:255) uses it inside a UI_2.0
  page.
What is missing or ambiguous: Whether 1:1 fidelity outranks reuse here.
Options and consequences:
  (a) Reuse Pager — consistent with Transactions, no new component, but the
      footer differs from the handoff.
  (b) Build the handoff's ← n / m → footer — 1:1, but a second pager in the
      codebase and Transactions then looks inconsistent until retrofitted.
Independent work that can continue: everything else in slices 18 and 19.
Owner response (exact):
Status: awaiting owner
```

```text
ID: PD-059-Q-5a-2
Raised by / date: Claude / 2026-11-19
Affected slice and files: 19 — ui2/transactions/Ui2TradeImport.tsx (merged)
Existing behaviour and evidence: The board's import decision reads "upload +
  paste + Load example (header + hint)" for UI_2.0 imports, and guide §4
  repeats it for trade AND dividend imports. Merged slice 17's
  Ui2TradeImport.tsx has a file input only: no textarea, no Load example.
What is missing or ambiguous: Whether slice 17 should be retrofitted to
  match, and whether that retrofit belongs to slice 19 or a later fix PR.
Options and consequences:
  (a) Slice 19 does dividends only; file a follow-up for trades — smaller PR,
      but the two imports behave differently until the follow-up lands.
  (b) Slice 19 also adds paste + Load example to Ui2TradeImport — one
      consistent import story, larger PR touching merged work.
Independent work that can continue: all of slice 18, and the dividend half
  of slice 19 regardless of the answer.
Owner response (exact):
Status: awaiting owner
```

Slice 18 does not depend on either answer. Implement slice 18 assuming (a) in both — the cheapest reversible choice — and revisit if the owner says otherwise.

---

## 6. Task list

### Task 1 — Create the shared asset-page stylesheet

**Files:**

* `frontend/src/ui2/asset/asset.css` (create)

This is the handoff's asset-page stylesheet ported onto the `--u2-*` palette, so Gold (slices 20–21) inherits the whole vocabulary rather than re-deriving it. Every selector is scoped under `:root[data-ui="ui2"]`, which is why Classic and Glass cannot see it. `.eyebrow` is **not** defined anywhere in the app today, so it is declared here, nested under `.asset-stat` to keep it from becoming a new global.

* [ ] Create `frontend/src/ui2/asset/asset.css`:

```css
/* Shared UI_2.0 asset-page chrome (PD-059 slices 18–21). Ported 1:1 from the
 * handoff's .asset-* rules (docs/visuals/PD-059-ui-2-reference.html) onto the
 * --u2-* palette. Dividends uses it first; Gold reuses it unchanged. */

:root[data-ui="ui2"] .asset-root { display: grid; gap: 20px; }

:root[data-ui="ui2"] .asset-top,
:root[data-ui="ui2"] .asset-toolbar,
:root[data-ui="ui2"] .asset-tabs,
:root[data-ui="ui2"] .asset-period,
:root[data-ui="ui2"] .asset-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

:root[data-ui="ui2"] .asset-top h2,
:root[data-ui="ui2"] .asset-panel h2 {
  font: 700 15px var(--u2-font-display);
  margin: 0;
}

:root[data-ui="ui2"] .asset-tabs { justify-content: flex-start; gap: 6px; }

:root[data-ui="ui2"] .asset-stat-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1.2fr;
  gap: 16px;
}

:root[data-ui="ui2"] .asset-stat {
  padding: 22px;
  border: 1px solid var(--u2-border);
  border-radius: 14px;
  background: var(--u2-panel);
  box-shadow: var(--u2-shadow);
  min-width: 0;
}

:root[data-ui="ui2"] .asset-stat.hero {
  background: linear-gradient(130deg, var(--u2-accentsoft), var(--u2-panel));
  border-color: var(--u2-accent);
}

:root[data-ui="ui2"] .asset-stat .eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--u2-muted);
}

:root[data-ui="ui2"] .asset-stat strong {
  display: block;
  font: 800 25px var(--u2-font-display);
  margin-top: 13px;
  letter-spacing: -.7px;
}

:root[data-ui="ui2"] .asset-stat .stat-detail {
  color: var(--u2-muted);
  font-size: 11px;
  margin-top: 10px;
  display: block;
}

:root[data-ui="ui2"] .asset-panel { padding: 22px; }

:root[data-ui="ui2"] .asset-split {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 20px;
}

:root[data-ui="ui2"] .asset-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

:root[data-ui="ui2"] .asset-table-wrap { overflow-x: auto; }

:root[data-ui="ui2"] .asset-table {
  border-collapse: collapse;
  width: 100%;
  white-space: nowrap;
  font-size: 12px;
}

:root[data-ui="ui2"] .asset-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--u2-muted);
  background: var(--u2-bg);
  padding: 14px 16px;
  text-align: right;
}

:root[data-ui="ui2"] .asset-table td {
  padding: 16px;
  border-bottom: 1px solid var(--u2-border);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

:root[data-ui="ui2"] .asset-table th:first-child,
:root[data-ui="ui2"] .asset-table td:first-child,
:root[data-ui="ui2"] .asset-table .left { text-align: left; }

:root[data-ui="ui2"] .asset-table small {
  display: block;
  color: var(--u2-muted);
  font-size: 10px;
  margin-top: 5px;
}

:root[data-ui="ui2"] .asset-table .ui2-btn { padding: 7px 10px; }

:root[data-ui="ui2"] .asset-table .empty {
  text-align: center;
  color: var(--u2-muted);
  padding: 34px 16px;
}

:root[data-ui="ui2"] .asset-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 16px;
}

:root[data-ui="ui2"] .asset-search input,
:root[data-ui="ui2"] .asset-input {
  border: 1px solid var(--u2-border);
  background: var(--u2-bg);
  color: var(--u2-text);
  padding: 10px 12px;
  border-radius: 7px;
  min-width: 0;
}

:root[data-ui="ui2"] .asset-search input { min-width: 210px; flex: 1; }

:root[data-ui="ui2"] .compactselect {
  border: 1px solid var(--u2-border);
  background: var(--u2-panel);
  color: var(--u2-muted);
  padding: 8px;
  border-radius: 7px;
  font-size: 11px;
  max-width: 140px;
}

:root[data-ui="ui2"] .asset-footer {
  padding: 15px 18px;
  color: var(--u2-muted);
  font-size: 11px;
}

:root[data-ui="ui2"] .asset-chart { height: 240px; width: 100%; display: block; }

:root[data-ui="ui2"] .asset-contribution {
  padding: 15px 0;
  border-bottom: 1px solid var(--u2-border);
}

:root[data-ui="ui2"] .asset-contribution-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}

:root[data-ui="ui2"] .asset-track {
  height: 6px;
  border-radius: 5px;
  background: var(--u2-accentsoft);
  overflow: hidden;
}

:root[data-ui="ui2"] .asset-track div {
  height: 100%;
  border-radius: 5px;
  background: var(--u2-accent);
}

:root[data-ui="ui2"] .asset-note {
  color: var(--u2-muted);
  font-size: 11px;
  line-height: 1.6;
  margin: 0;
}

:root[data-ui="ui2"] .asset-empty { text-align: center; padding: 55px 20px; }
:root[data-ui="ui2"] .asset-empty h2 { font: 700 20px var(--u2-font-display); }
:root[data-ui="ui2"] .asset-empty p { color: var(--u2-muted); line-height: 1.7; }

:root[data-ui="ui2"] .asset-danger { color: var(--u2-red); border-color: var(--u2-red); }

:root[data-ui="ui2"] .asset-import textarea {
  width: 100%;
  height: 160px;
  resize: vertical;
  background: var(--u2-bg);
  color: var(--u2-text);
  padding: 12px;
  border: 1px solid var(--u2-border);
  border-radius: 8px;
  margin: 16px 0;
}

:root[data-ui="ui2"] .asset-error { color: var(--u2-red); font-size: 12px; }
:root[data-ui="ui2"] .asset-period .ui2-btn { padding: 7px 10px; }

@media (max-width: 900px) {
  :root[data-ui="ui2"] .asset-stat-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  :root[data-ui="ui2"] .asset-split { grid-template-columns: 1fr; }
  :root[data-ui="ui2"] .asset-stat { padding: 16px; }
  :root[data-ui="ui2"] .asset-stat strong { font-size: 21px; }
  :root[data-ui="ui2"] .asset-panel { padding: 16px; }
  :root[data-ui="ui2"] .asset-top { align-items: flex-start; }
  :root[data-ui="ui2"] .asset-chart { height: 210px; }
}
```

* [ ] Verify the file is picked up and nothing leaks outside UI_2.0:

```bash
cd frontend && /usr/bin/grep -c 'data-ui="ui2"' src/ui2/asset/asset.css && /usr/bin/grep -c '^[^:@ }/]' src/ui2/asset/asset.css
```

Expected: the first count equals the number of selector lines; the second is `0` — every rule is scoped.

* [ ] Commit: `git add frontend/src/ui2/asset/asset.css`

---

### Task 2 — Create `AssetStats`

**Files:**

* `frontend/src/ui2/asset/AssetStats.tsx` (create)

The handoff's `assetStats(items)` takes positional tuples `[label, value, detail, valueClass]`. A named object reads better in TypeScript and makes the Gold call sites (eight metric surfaces) legible. The first card is the hero, matching `${i===0?'hero':''}`.

* [ ] Create `frontend/src/ui2/asset/AssetStats.tsx`:

```tsx
// The handoff's asset-page stat grid (PD-059 slices 18–21): four cards, the
// first one the hero. Shared by Dividends and Gold.
import './asset.css'

export interface AssetStat {
  label: string
  value: string
  detail?: string
  tone?: 'positive' | 'negative'
}

export function AssetStats({ stats }: { stats: AssetStat[] }) {
  return (
    <div className="asset-stat-grid">
      {stats.map((stat, index) => (
        <section
          key={stat.label}
          className={index === 0 ? 'asset-stat hero' : 'asset-stat'}
          aria-label={stat.label}
        >
          <div className="eyebrow">{stat.label}</div>
          <strong className={stat.tone === 'positive' ? 'u2-positive' : stat.tone === 'negative' ? 'u2-negative' : undefined}>
            {stat.value}
          </strong>
          {stat.detail && <span className="stat-detail">{stat.detail}</span>}
        </section>
      ))}
    </div>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | /usr/bin/grep AssetStats; echo "exit=$?"`

Expected: `exit=1` — grep found nothing, so there are no `AssetStats` type errors.

* [ ] Commit: `git add frontend/src/ui2/asset/AssetStats.tsx`

---

### Task 3 — Create `AssetBarChart`

**Files:**

* `frontend/src/ui2/asset/AssetBarChart.tsx` (create)

Every constant below is the handoff's `assetBarChart` geometry, kept literally so the rendered chart is the mockup's. The `<title>` child of each `<rect>` is what gives the bars their native hover tooltip, and `max(…, 1)` is what keeps an all-zero series from dividing by zero.

* [ ] Create `frontend/src/ui2/asset/AssetBarChart.tsx`:

```tsx
// The handoff's hand-rolled SVG bar chart (PD-059 slices 18–21). Geometry is
// copied from assetBarChart() in the reference HTML; no chart library.
import { formatMoney } from '../../lib/currency'
import './asset.css'

export interface BarDatum { label: string; value: number }

const BASE_Y = 195
const PLOT_HEIGHT = 160
const GRID = [0, 0.5, 1]

export function AssetBarChart({ data, currency, label }: {
  data: BarDatum[]
  currency: string
  label: string
}) {
  const max = Math.max(...data.map(datum => datum.value), 1)
  const step = 600 / Math.max(data.length, 1)

  return (
    <svg className="asset-chart" viewBox="0 0 700 240" role="img" aria-label={label}>
      {GRID.map(tick => (
        <g key={tick}>
          <line
            x1="75" x2="680"
            y1={BASE_Y - tick * PLOT_HEIGHT} y2={BASE_Y - tick * PLOT_HEIGHT}
            stroke="var(--u2-border)" strokeDasharray="3 4"
          />
          <text x="65" y={BASE_Y + 4 - tick * PLOT_HEIGHT} fill="var(--u2-muted)" textAnchor="end" fontSize="10">
            {formatMoney(max * tick, currency)}
          </text>
        </g>
      ))}
      {data.map((datum, index) => (
        <g key={datum.label}>
          <rect
            x={80 + index * step + step * 0.2}
            y={BASE_Y - (datum.value / max) * PLOT_HEIGHT}
            width={Math.max(8, step * 0.55)}
            height={(datum.value / max) * PLOT_HEIGHT}
            fill="var(--u2-accent)"
            rx="4"
          >
            <title>{`${datum.label}: ${formatMoney(datum.value, currency)}`}</title>
          </rect>
          <text
            x={80 + index * step + step * 0.47}
            y="220"
            fill="var(--u2-muted)"
            textAnchor="middle"
            fontSize="10"
          >
            {datum.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | /usr/bin/grep AssetBarChart; echo "exit=$?"`

Expected: `exit=1`.

* [ ] Commit: `git add frontend/src/ui2/asset/AssetBarChart.tsx`

---

### Task 4 — Test the shared primitives

**Files:**

* `frontend/src/ui2/asset/AssetStats.test.tsx` (create)
* `frontend/src/ui2/asset/AssetBarChart.test.tsx` (create)

These are the tests that fail without Tasks 2 and 3. They assert the contract Gold will depend on: the hero card is the first one, a card without a detail renders none, and the chart survives an empty or all-zero series without producing `NaN` geometry.

* [ ] Create `frontend/src/ui2/asset/AssetStats.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssetStats } from './AssetStats'

describe('AssetStats', () => {
  it('makes the first card the hero and the rest plain', () => {
    render(<AssetStats stats={[
      { label: 'Total dividends · INR', value: '₹900.00', detail: 'All payments in this currency' },
      { label: 'Payments', value: '2', detail: 'Recorded dividends' },
    ]} />)
    expect(screen.getByRole('region', { name: 'Total dividends · INR' })).toHaveClass('hero')
    expect(screen.getByRole('region', { name: 'Payments' })).not.toHaveClass('hero')
  })

  it('renders the detail line only when given one', () => {
    render(<AssetStats stats={[
      { label: 'Payment range', value: '—', detail: 'No recorded payments' },
      { label: 'Holdings paying', value: '0' },
    ]} />)
    expect(screen.getByText('No recorded payments')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Holdings paying' }).querySelector('.stat-detail')).toBeNull()
  })

  it('applies the tone class to the value', () => {
    render(<AssetStats stats={[{ label: 'Net P/L', value: '−₹10.00', tone: 'negative' }]} />)
    expect(screen.getByText('−₹10.00')).toHaveClass('u2-negative')
  })
})
```

* [ ] Create `frontend/src/ui2/asset/AssetBarChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssetBarChart } from './AssetBarChart'

describe('AssetBarChart', () => {
  it('draws one bar per datum with a money tooltip and a label', () => {
    const { container } = render(
      <AssetBarChart currency="INR" label="Dividend income by month in INR"
        data={[{ label: 'Oct 26', value: 500 }, { label: 'Nov 26', value: 300 }]} />)
    expect(screen.getByRole('img', { name: 'Dividend income by month in INR' })).toBeInTheDocument()
    const bars = container.querySelectorAll('rect')
    expect(bars).toHaveLength(2)
    // The tallest value fills the 160px plot; the other scales against it.
    expect(bars[0].getAttribute('height')).toBe('160')
    expect(bars[1].getAttribute('height')).toBe('96')
    expect(container.querySelectorAll('title')[0].textContent).toContain('Oct 26')
  })

  it('produces finite geometry for an all-zero series', () => {
    const { container } = render(
      <AssetBarChart currency="EUR" label="Dividend income by year in EUR"
        data={[{ label: '2026', value: 0 }]} />)
    const bar = container.querySelector('rect')!
    expect(Number(bar.getAttribute('height'))).toBe(0)
    expect(Number(bar.getAttribute('y'))).toBe(195)
  })

  it('renders no bars for an empty series', () => {
    const { container } = render(
      <AssetBarChart currency="INR" label="Dividend income by year in INR" data={[]} />)
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/asset/ 2>&1 | tail -8
```

Expected: 6 tests pass across 2 files.

* [ ] Commit: `git add frontend/src/ui2/asset/AssetStats.test.tsx frontend/src/ui2/asset/AssetBarChart.test.tsx`

---

### Task 5 — Create `Ui2DividendsPage`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendsPage.tsx` (create)

Every string, column and panel here is §2's fidelity reference. Three points deserve explanation. The tab lives in `?currency=` through the exported `tabFrom`, so a UI_2.0 deep link and a Classic one behave the same and switching interface keeps the tab; changing tab also clears the holding filter, as the handoff's `divHolding='all'` does. `view.rows` is rendered in server order and never re-sorted, because `cumulative` is a running total over that order — re-sorting would silently desync the column from its own tooltip. And the chart, years table and breakdown read `view.by_month` / `view.by_year` / `view.by_holding` rather than recomputing from `rows`: the server already derives them, and `by_holding.share` is already the fraction the handoff renders as a percentage.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendsPage.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SUPPORTED_CURRENCIES, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import type { DividendCurrency, DividendRow } from '../../types'
import { useDividends } from '../../features/dividends/useDividends'
import { tabFrom } from '../../features/dividends/DividendsPage'
import { usePagination, PAGE_SIZE } from '../../lib/usePagination'
import { Pager } from '../../components/Pager'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { AssetStats, type AssetStat } from '../asset/AssetStats'
import { AssetBarChart } from '../asset/AssetBarChart'
import DividendModal, { DeleteDividendDialog } from '../../features/dividends/DividendModal'
import DeleteAllDialog from '../../features/dividends/DeleteAllDialog'
import DividendImportModal from '../../features/dividends/DividendImportModal'
import '../asset/asset.css'

const CURRENCY_CUMULATIVE_HELP =
  'Running total for all payments in this currency, before holding and search filters.'
const HOLDING_CUMULATIVE_HELP =
  'Running total for this holding through the payment date.'

// monthLabel renders a YYYY-MM bucket the way the handoff's chart does.
function monthLabel(period: string): string {
  return new Date(`${period}-01T12:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

export function Ui2DividendsPage({ actAsUserId }: { actAsUserId?: string }) {
  const [params, setParams] = useSearchParams()
  const currency = tabFrom(params.get('currency'))
  const { view, ready, holdings, loading, error, refresh } = useDividends(currency, actAsUserId)
  const [holdingId, setHoldingId] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [editor, setEditor] = useState<{ row: DividendRow | null } | null>(null)
  const [deleting, setDeleting] = useState<DividendRow | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [importing, setImporting] = useState(false)

  // after closes the dialog and refetches the tab.
  const after = (close: () => void) => () => { close(); void refresh() }

  // Changing tab clears the holding filter: its options belong to the tab
  // that is leaving (handoff: divHolding='all').
  const selectCurrency = (next: DividendCurrency) => {
    setHoldingId('')
    setParams(previous => {
      const updated = new URLSearchParams(previous)
      updated.set('currency', next)
      return updated
    })
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return view.rows.filter(row =>
      (!holdingId || row.holding_id === holdingId) &&
      (!query || row.script.toLowerCase().includes(query) || row.symbol.toLowerCase().includes(query)))
  }, [view.rows, holdingId, search])

  const pagination = usePagination(visible, JSON.stringify([currency, holdingId, search]), PAGE_SIZE)

  const stats: AssetStat[] = [
    {
      label: `Total dividends · ${currency}`,
      value: formatMoney(view.summary.total, currency),
      detail: 'All payments in this currency',
    },
    { label: 'Payments', value: String(view.summary.count), detail: 'Recorded dividends' },
    { label: 'Holdings paying', value: String(view.summary.holdings), detail: 'Distinct holdings' },
    {
      label: 'Payment range',
      value: view.summary.first_date ? formatDate(view.summary.first_date) : '—',
      detail: view.summary.last_date ? `to ${formatDate(view.summary.last_date)}` : 'No recorded payments',
    },
  ]

  const chartData = (period === 'month' ? view.by_month : view.by_year)
    .map(bucket => ({
      label: period === 'month' ? monthLabel(bucket.period) : bucket.period,
      value: bucket.total,
    }))
  const years = [...view.by_year].sort((first, second) => second.period.localeCompare(first.period))

  if (error) return <p className="ui2-note" role="alert">{error}</p>

  return (
    <>
      <Ui2PageIntro
        title="Income, one payment at a time."
        subtitle="Track received dividends in their original currency."
      />

      <section className="asset-root" aria-label="Dividends">
        <div className="asset-top">
          <div className="asset-tabs" role="tablist" aria-label="Dividend currency">
            {SUPPORTED_CURRENCIES.map(tab => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={tab === currency}
                className={tab === currency ? 'ui2-btn ui2-btn-primary' : 'ui2-btn'}
                onClick={() => selectCurrency(tab as DividendCurrency)}
              >
                {currencySymbol(tab)} {tab}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ui2-btn" onClick={() => setImporting(true)}>Upload CSV</button>
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setEditor({ row: null })}>
              ＋ Add dividend
            </button>
          </div>
        </div>

        {loading && <p className="ui2-note" aria-live="polite">Loading…</p>}

        <AssetStats stats={stats} />

        <section className="ui2-panel">
          <div className="asset-search">
            <input
              type="search"
              aria-label="Search dividends"
              placeholder="Search holding or symbol"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <select
              className="compactselect"
              aria-label="Dividend holding"
              value={holdingId}
              onChange={event => setHoldingId(event.target.value)}
            >
              <option value="">All holdings</option>
              {view.by_holding.map(holding => (
                <option key={holding.holding_id} value={holding.holding_id}>
                  {holding.script || holding.symbol}
                </option>
              ))}
            </select>
            <span className="asset-note">{visible.length} of {view.rows.length} payments</span>
          </div>

          {ready && view.summary.count === 0 ? (
            <div className="asset-empty">
              <div className="eyebrow">{currency} DIVIDENDS</div>
              <h2>Your income story starts here.</h2>
              <p>
                No {currency} payments recorded.<br />
                Add a dividend or upload your dividend CSV.
              </p>
            </div>
          ) : (
            <>
              <div className="asset-table-wrap">
                <table className="asset-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col" className="left">Holding</th>
                      <th scope="col">Dividend</th>
                      <th scope="col"><span title={CURRENCY_CUMULATIVE_HELP}>Currency cumulative</span></th>
                      <th scope="col"><span title={HOLDING_CUMULATIVE_HELP}>Holding cumulative</span></th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagination.pageItems.length === 0 ? (
                      <tr><td colSpan={6} className="empty">No payments match this search.</td></tr>
                    ) : pagination.pageItems.map(row => (
                      <tr key={row.id}>
                        <td>{formatDate(row.date)}</td>
                        <td className="left">
                          <strong>{row.script}</strong>
                          <small>{row.symbol}</small>
                        </td>
                        <td><strong>{formatMoney(row.amount, currency)}</strong></td>
                        <td className="u2-positive">{formatMoney(row.cumulative, currency)}</td>
                        <td>{formatMoney(row.holding_cumulative, currency)}</td>
                        <td>
                          <button
                            type="button"
                            className="ui2-btn"
                            aria-label={`Edit dividend of ${formatDate(row.date)}`}
                            onClick={() => setEditor({ row })}
                          >
                            Edit
                          </button>{' '}
                          <button
                            type="button"
                            className="ui2-btn asset-danger"
                            aria-label={`Delete dividend of ${formatDate(row.date)}`}
                            onClick={() => setDeleting(row)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="asset-footer">
                <span>Chronological payments · {currency}</span>
                <Pager pagination={pagination} label="Dividends" />
              </div>
            </>
          )}
        </section>

        {view.summary.count > 0 && (
          <div className="asset-split">
            <section className="ui2-panel asset-panel">
              <div className="asset-panel-head">
                <h2>Income over time · {currency}</h2>
                <div className="asset-period" role="group" aria-label="Dividend chart period">
                  <button
                    type="button"
                    className={period === 'month' ? 'ui2-btn ui2-btn-primary' : 'ui2-btn'}
                    aria-pressed={period === 'month'}
                    onClick={() => setPeriod('month')}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    className={period === 'year' ? 'ui2-btn ui2-btn-primary' : 'ui2-btn'}
                    aria-pressed={period === 'year'}
                    onClick={() => setPeriod('year')}
                  >
                    Yearly
                  </button>
                </div>
              </div>
              <AssetBarChart
                data={chartData}
                currency={currency}
                label={`Dividend income by ${period === 'month' ? 'month' : 'year'} in ${currency}`}
              />
              <table className="asset-table">
                <thead>
                  <tr>
                    <th scope="col">Year</th>
                    <th scope="col">Payments</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map(year => (
                    <tr key={year.period}>
                      <td>{year.period}</td>
                      <td>{year.count}</td>
                      <td>{formatMoney(year.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="ui2-panel asset-panel">
              <div className="asset-panel-head">
                <h2>Income by holding</h2>
                <span className="asset-note">{currency} · all payments</span>
              </div>
              {view.by_holding.map(holding => (
                <div key={holding.holding_id} className="asset-contribution">
                  <div className="asset-contribution-line">
                    <strong>{holding.script || holding.symbol}</strong>
                    <strong>{formatMoney(holding.total, currency)}</strong>
                  </div>
                  <div className="asset-track">
                    <div style={{ width: `${holding.share * 100}%` }} />
                  </div>
                  <p className="asset-note" style={{ marginTop: 8 }}>
                    {(holding.share * 100).toFixed(1)}% of dividend income
                  </p>
                </div>
              ))}
            </section>
          </div>
        )}

        {view.summary.count > 0 && (
          <div className="asset-footer">
            <span>All recorded payments · {currency}</span>
            <button type="button" className="ui2-btn asset-danger" onClick={() => setDeletingAll(true)}>
              Delete all {currency}
            </button>
          </div>
        )}
      </section>

      {importing && (
        <DividendImportModal
          currency={currency}
          holdings={holdings}
          userId={actAsUserId}
          onClose={() => setImporting(false)}
          onImported={() => void refresh()}
        />
      )}
      {editor && (
        <DividendModal
          currency={currency}
          holdings={holdings}
          editing={editor.row}
          userId={actAsUserId}
          onClose={() => setEditor(null)}
          onSaved={after(() => setEditor(null))}
        />
      )}
      {deleting && (
        <DeleteDividendDialog
          row={deleting}
          currency={currency}
          userId={actAsUserId}
          onClose={() => setDeleting(null)}
          onDeleted={after(() => setDeleting(null))}
        />
      )}
      {deletingAll && (
        <DeleteAllDialog
          currency={currency}
          count={view.summary.count}
          userId={actAsUserId}
          onClose={() => setDeletingAll(false)}
          onDeleted={after(() => setDeletingAll(false))}
        />
      )}
    </>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | /usr/bin/grep Ui2Dividends; echo "exit=$?"`

Expected: `exit=1`. `tabFrom` is already exported from `DividendsPage.tsx:33`, so this compiles before Task 6 runs.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendsPage.tsx`

---

### Task 6 — Make `DividendsPage` a dispatcher

**Files:**

* `frontend/src/features/dividends/DividendsPage.tsx` (modify)

Only `useUiMode()` may run in the dispatcher. If the Classic hooks stayed beside a conditional return, React would see the hook count change the moment the account's mode flipped while the page was mounted, and throw. `TransactionsPage.tsx:49-56` is the shape to copy, comment included.

* [ ] Add the two imports. Current code (`DividendsPage.tsx:5-6`):

```tsx
import { formatDate } from '../../lib/formDates'
import { useAuthOptional } from '../auth/AuthContext'
```

Replacement:

```tsx
import { formatDate } from '../../lib/formDates'
import { useUiMode } from '../../lib/uiMode'
import { Ui2DividendsPage } from '../../ui2/dividends/Ui2DividendsPage'
import { useAuthOptional } from '../auth/AuthContext'
```

* [ ] Split the component. Current code (`DividendsPage.tsx:37-38`):

```tsx
export default function DividendsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
```

Replacement:

```tsx
// DividendsPage is a pure dispatcher: only useUiMode() lives here. All
// Classic hooks live in ClassicDividendsPage so the hook count is stable
// across mode changes.
export default function DividendsPage({ actAsUserId, actAsLabel }: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2DividendsPage actAsUserId={actAsUserId} />
  return <ClassicDividendsPage actAsUserId={actAsUserId} actAsLabel={actAsLabel} />
}

function ClassicDividendsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
```

The Classic body already closes with its own `)` and `}` at the end of the file, so no brace is added or removed — the `export default` line simply becomes the `function ClassicDividendsPage` line, with the new dispatcher inserted above it.

* [ ] Verify the Classic page is unchanged in behaviour:

```bash
cd frontend && npx vitest run src/features/dividends/ 2>&1 | tail -8
```

Expected: every test in `DividendsPage.test.tsx`, `DividendCrud.test.tsx`, `DividendImport.test.tsx` and `dividendCsv.test.ts` passes, unmodified. `useUiMode` falls back to `'classic'` without an `AuthProvider`, which is why these tests need no new mock.

* [ ] Commit: `git add frontend/src/features/dividends/DividendsPage.tsx`

---

### Task 7 — Test `Ui2DividendsPage`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx` (create)

Mock factories hold their fixtures inline, the way `Ui2TransactionsPage.test.tsx:6-33` does. A fixture declared with a bare `const` outside the factory would be read before its initialiser runs, because Vitest hoists `vi.mock` above the module body — `vi.hoisted` is what makes a fixture safe to reference, and the tab cases below use it to record which currency the hook was asked for.

The page needs a router because it reads `?currency=`, so each render is wrapped in `MemoryRouter`.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Ui2DividendsPage } from './Ui2DividendsPage'

// Hoisted so the vi.mock factory may read it: Vitest lifts vi.mock above the
// module body, where a plain const is still uninitialised.
const fixture = vi.hoisted(() => ({ seen: [] as string[] }))

vi.mock('../../features/dividends/useDividends', () => ({
  useDividends: (currency: string) => {
    fixture.seen.push(currency)
    const inr = {
      rows: [
        { id: 'd1', holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: '2026-10-01',
          amount: 500, currency: 'INR', cumulative: 500, holding_cumulative: 500 },
        { id: 'd2', holding_id: 'h2', script: 'Infosys', symbol: 'INFY.NS', date: '2026-11-01',
          amount: 300, currency: 'INR', cumulative: 800, holding_cumulative: 300 },
      ],
      summary: { total: 800, count: 2, holdings: 2, first_date: '2026-10-01', last_date: '2026-11-01' },
      by_year: [{ period: '2026', total: 800, count: 2 }],
      by_month: [
        { period: '2026-10', total: 500, count: 1 },
        { period: '2026-11', total: 300, count: 1 },
      ],
      by_holding: [
        { holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 500, count: 1, share: 0.625 },
        { holding_id: 'h2', script: 'Infosys', symbol: 'INFY.NS', total: 300, count: 1, share: 0.375 },
      ],
    }
    const empty = {
      rows: [], summary: { total: 0, count: 0, holdings: 0 },
      by_year: [], by_month: [], by_holding: [],
    }
    return {
      view: currency === 'INR' ? inr : empty,
      ready: true,
      holdings: [
        { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
          stocks_owned: 10, avg_cost_price: 1000 },
        { id: 'h2', script: 'Infosys', symbol: 'INFY.NS', currency: 'INR', exchange: 'NSE',
          stocks_owned: 20, avg_cost_price: 1500 },
      ],
      loading: false,
      error: '',
      refresh: vi.fn(),
    }
  },
}))

vi.mock('../../features/dividends/DividendModal', () => ({
  default: ({ editing, onClose }: { editing: unknown; onClose: () => void }) => (
    <div role="dialog" aria-label={editing ? 'Edit dividend' : 'Add dividend'}>
      <button onClick={onClose}>Close</button>
    </div>
  ),
  DeleteDividendDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Delete dividend"><button onClick={onClose}>Close</button></div>
  ),
}))

vi.mock('../../features/dividends/DeleteAllDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Delete all dividends"><button onClick={onClose}>Close</button></div>
  ),
}))

vi.mock('../../features/dividends/DividendImportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Import dividends"><button onClick={onClose}>Close</button></div>
  ),
}))

const show = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/dividends${search}`]}>
      <Ui2DividendsPage />
    </MemoryRouter>)

beforeEach(() => { fixture.seen = [] })

describe('Ui2DividendsPage', () => {
  it('renders the handoff intro and the four stat cards', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Income, one payment at a time.' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Total dividends · INR' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Payments' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Holdings paying' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Payment range' })).toBeInTheDocument()
  })

  it('renders every payment with no row-number column', () => {
    show()
    expect(screen.getByText('Currency cumulative')).toBeInTheDocument()
    // Six columns, per handoff frame 07: no "#" column.
    expect(screen.getAllByRole('columnheader', { hidden: false }).slice(0, 6)).toHaveLength(6)
    expect(screen.getByText('2 of 2 payments')).toBeInTheDocument()
  })

  it('reads the tab from the URL and asks the hook for it', () => {
    show('?currency=EUR')
    expect(fixture.seen).toContain('EUR')
    expect(screen.getByRole('tab', { name: '€ EUR' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the empty state for a currency with no payments', () => {
    show('?currency=EUR')
    expect(screen.getByRole('heading', { name: 'Your income story starts here.' })).toBeInTheDocument()
    expect(screen.queryByText('Currency cumulative')).not.toBeInTheDocument()
  })

  it('switches tab through the URL when a tab is clicked', async () => {
    show()
    await userEvent.click(screen.getByRole('tab', { name: '€ EUR' }))
    expect(fixture.seen).toContain('EUR')
  })

  it('filters by holding but keeps the full-tab cumulative', async () => {
    show()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dividend holding' }), 'h2')
    expect(screen.getByText('1 of 2 payments')).toBeInTheDocument()
    // 800 is the tab-wide running total: filtering must not recompute it.
    // Scope to the one visible data row — the stat card and yearly table also
    // show ₹800.00, so getByText without within throws "Found multiple elements".
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(2) // header + 1 Infosys row
    expect(within(rows[1]).getByText('₹800.00')).toBeInTheDocument()
    expect(screen.queryByText('TCS.NS')).not.toBeInTheDocument()
  })

  it('tells the user when a search matches nothing', async () => {
    show()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search dividends' }), 'zzz')
    expect(screen.getByText('No payments match this search.')).toBeInTheDocument()
  })

  it('switches the chart between monthly and yearly buckets', async () => {
    show()
    expect(screen.getByRole('img', { name: 'Dividend income by month in INR' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Yearly' }))
    expect(screen.getByRole('img', { name: 'Dividend income by year in INR' })).toBeInTheDocument()
  })

  it('shows each holding’s share of income', () => {
    show()
    expect(screen.getByText('62.5% of dividend income')).toBeInTheDocument()
    expect(screen.getByText('37.5% of dividend income')).toBeInTheDocument()
  })

  it('opens the add, import and delete-all dialogs', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: '＋ Add dividend' }))
    expect(screen.getByRole('dialog', { name: 'Add dividend' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Upload CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import dividends' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Delete all INR' }))
    expect(screen.getByRole('dialog', { name: 'Delete all dividends' })).toBeInTheDocument()
  })

  it('opens the edit dialog for a row', async () => {
    show()
    const [edit] = screen.getAllByRole('button', { name: /^Edit dividend of / })
    await userEvent.click(edit)
    expect(screen.getByRole('dialog', { name: 'Edit dividend' })).toBeInTheDocument()
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/dividends/Ui2DividendsPage.test.tsx 2>&1 | tail -10
```

Expected: 11 tests pass.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx`

---

### Task 8 — Slice 18 gate: full suite, lint, build

* [ ] Run the whole frontend suite, not just the touched folders — the dispatcher is imported by the router:

```bash
cd frontend && npx vitest run 2>&1 | tail -12
```

Expected: all files pass; no new failures versus `main`.

* [ ] Lint the changed files:

```bash
cd frontend && npm run lint:changed 2>&1 | tail -10
```

Expected: no errors. `id-length` is the rule to watch; every local above is a full word.

* [ ] Typecheck and build:

```bash
cd frontend && npx tsc --noEmit && npm run build 2>&1 | tail -6
```

Expected: no type errors; build succeeds.

* [ ] Open the slice 18 PR from `feat/PD-059-dividends-page` to `main`, label `ui-2.0`, gitmoji title, the three sections, no attribution trailers.

---

### Task 9 — Extract `useDividendImport` (slice 19)

**Files:**

* `frontend/src/features/dividends/useDividendImport.ts` (create)

Slice 17 put the trade-import machine in `useTradeImport` so `TradeImportModal` and `Ui2TradeImport` share one parser and one server contract; the dividend import is the same shape and gets the same treatment. Duplicating it would mean two copies of the 422 recovery, the 1 MB limit and the name-resolution loop, and CLAUDE.md forbids that.

The hook adds three things Classic does not use, because the board's import decision is UI_2.0-only: `text` (the paste buffer), `loadExample`, and a `validate` that is separate from choosing a file. Classic's `pick` keeps its old meaning — read the file, then validate immediately — so its behaviour is byte-identical. `readFile` returns the text instead of relying on the `text` state, because a state write is not visible to the same tick that validates.

* [ ] Create `frontend/src/features/dividends/useDividendImport.ts`:

```ts
// The dividend CSV import, shared by the Classic modal and the UI_2.0 dialog
// (PD-059 slice 19), mirroring useTradeImport. Classic drives it with pick();
// UI_2.0 drives it with loadFile / loadExample / validate, because its import
// accepts a pasted sheet as well as a file (owner, 2026-11-18).
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type {
  DividendCurrency, DividendImportPreview, DividendImportResult, DividendImportRow, Holding,
} from '../../types'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
import type { Answers } from '../imports/NameConfirmDialog'

export type DividendStep = 'pick' | 'names' | 'preview' | 'result'

export const EXAMPLE_CSV = 'Date,Share Name,Dividend,CUMULATIVE'
const MAX_BYTES = 1024 * 1024

// openNames are the sheet names the server could not resolve and the user has
// not answered yet.
export const openNames = (preview: DividendImportPreview, answers: Answers) =>
  preview.names.filter(name =>
    (name.status === 'needs_confirmation' || name.status === 'ambiguous') && !(name.sheet_name in answers))

export function useDividendImport(currency: DividendCurrency, holdings: Holding[], userId?: string) {
  const [step, setStep] = useState<DividendStep>('pick')
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<DividendImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<DividendCsvError[]>([])
  const [total, setTotal] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [preview, setPreview] = useState<DividendImportPreview | null>(null)
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const inTab = useMemo(
    () => holdings.filter(holding => canonicalCurrency(holding.currency) === currency),
    [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`

  const runPreview = async (sheetRows: DividendImportRow[], mappings: Answers) => {
    setBusy(true)
    setErr('')
    try {
      const evaluated = await api.previewDividendImport({ currency, rows: sheetRows, mappings }, userId)
      setPreview(evaluated)
      setStep(openNames(evaluated, mappings).length > 0 ? 'names' : 'preview')
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // validate parses the sheet and asks the server to evaluate it. source lets
  // a caller validate text it has only just read, before React commits it.
  const validate = async (source?: string) => {
    const parsed = parseDividendCsv(source ?? text, todayIST())
    setRows(parsed.rows)
    setLocalErrors(parsed.errors)
    setTotal(parsed.total)
    setAnswers({})
    if (parsed.rows.length === 0) {
      setPreview({ counts: { ready: 0, duplicate: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] })
      setStep('preview')
      return
    }
    await runPreview(parsed.rows, {})
  }

  const readFile = async (file: File): Promise<string | null> => {
    if (file.size > MAX_BYTES) { setErr('The file is larger than 1 MB — split it.'); return null }
    setFileName(file.name)
    const content = await file.text()
    setText(content)
    return content
  }

  // loadFile fills the buffer and stops: the UI_2.0 dialog validates on its
  // own button, so the user can edit a pasted sheet before sending it.
  const loadFile = async (file: File | undefined) => {
    if (file) await readFile(file)
  }

  // pick is the Classic flow: choose a file and validate it at once.
  const pick = async (file: File | undefined) => {
    if (!file) return
    const content = await readFile(file)
    if (content !== null) await validate(content)
  }

  const loadExample = () => {
    setText(EXAMPLE_CSV)
    setFileName('')
    setErr('')
  }

  const counts = preview && {
    ready: preview.counts.ready,
    duplicate: preview.counts.duplicate,
    invalid: preview.counts.invalid + localErrors.length,
    total: Math.max(total, preview.counts.total + localErrors.length),
  }

  const invalidLines = [
    ...localErrors.map(localError => ({ line: localError.line, reason: localError.reason })),
    ...(preview?.rows.filter(row => row.status === 'invalid').map(row => ({ line: row.line, reason: row.reason ?? '' })) ?? []),
  ].sort((first, second) => first.line - second.line)

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      setResult(await api.importDividends({ currency, rows, mappings: answers }, userId))
      setStep('result')
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.body) {
        setPreview(error.body as DividendImportPreview)
        setErr('The data changed since the preview — review it again.')
      } else {
        setErr(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setBusy(false)
    }
  }

  // confirmNames records the user's answers and re-asks the server, so the
  // preview the user confirms is the one the mappings produced.
  const confirmNames = (confirmed: Answers) => {
    const next = { ...answers, ...confirmed }
    setAnswers(next)
    void runPreview(rows, next)
  }

  const changeNames = () => {
    setAnswers({})
    void runPreview(rows, {})
  }

  return {
    step, setStep, fileName, text, setText, rows, answers, preview, result, busy, err,
    inTab, label, counts, invalidLines,
    pick, loadFile, loadExample, validate, runPreview, confirm, confirmNames, changeNames,
  }
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | /usr/bin/grep useDividendImport; echo "exit=$?"`

Expected: `exit=1`.

* [ ] Commit: `git add frontend/src/features/dividends/useDividendImport.ts`

---

### Task 10 — Rewire Classic `DividendImportModal` and add the dispatcher

**Files:**

* `frontend/src/features/dividends/DividendImportModal.tsx` (modify — full replacement)

The Classic markup is untouched; only its data source moves from local state to `ctrl`. `DividendImport.test.tsx` is the gate that proves this.

* [ ] Replace the whole file with:

```tsx
import { useRef } from 'react'
import { formatDate } from '../../lib/formDates'
import { formatMoney } from '../../lib/currency'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useUiMode } from '../../lib/uiMode'
import { Ui2DividendImport } from '../../ui2/dividends/Ui2DividendImport'
import type { DividendCurrency, Holding } from '../../types'
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { ImportCounts, InvalidLines } from '../imports/ImportTables'
import NameConfirmDialog from '../imports/NameConfirmDialog'
import { useDividendImport, openNames } from './useDividendImport'

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

// Pure dispatcher — only useUiMode() lives here so the hook count is stable
// if the account's UI mode changes while the modal is open.
export default function DividendImportModal(props: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) {
    return (
      <Ui2DividendImport
        currency={props.currency}
        holdings={props.holdings}
        userId={props.userId}
        onClose={props.onClose}
        onImported={props.onImported}
      />
    )
  }
  return <ClassicDividendImportModal {...props} />
}

function ClassicDividendImportModal({ currency, holdings, userId, onClose, onImported }: Props) {
  const ctrl = useDividendImport(currency, holdings, userId)
  const root = useRef<HTMLDivElement>(null)
  // Escape on the result step behaves like Done so the page refreshes. The
  // names step renders its own dialog, which owns the keys meanwhile.
  useDialogFocus(root, () => {
    if (ctrl.busy) return
    if (ctrl.step === 'result') onImported()
    onClose()
  }, ctrl.step !== 'names' || !ctrl.preview)

  if (ctrl.step === 'names' && ctrl.preview) {
    return (
      <NameConfirmDialog
        names={openNames(ctrl.preview, ctrl.answers)}
        holdings={ctrl.inTab}
        heading="Confirm share names"
        context={ctrl.label}
        intro="These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time."
        onBack={() => ctrl.setStep('pick')}
        onConfirm={ctrl.confirmNames}
      />
    )
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import dividends">
      <div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{ctrl.step === 'result' ? 'Import complete' : ctrl.step === 'preview' ? 'Preview import' : 'Import dividends'}</h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Importing into <strong>{ctrl.label}</strong> · dates read as <strong>DD/MM/YYYY</strong> (1/2/2020 = 1 Feb 2020){ctrl.fileName && ` · ${ctrl.fileName}`}
        </p>
        {ctrl.err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{ctrl.err}</p>}

        {ctrl.step === 'pick' && (
          <>
            <label htmlFor="dividend-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="dividend-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => void ctrl.pick(e.target.files?.[0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Expected header (any order, any case; CUMULATIVE optional): <code>Date,Share Name,Dividend,CUMULATIVE</code>. Nothing is saved until you confirm.</p>
            {ctrl.busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
          <>
            <ImportCounts total={ctrl.counts.total}
              counts={[['Ready to import', ctrl.counts.ready], ['Already exists', ctrl.counts.duplicate], ['Invalid', ctrl.counts.invalid]]} />
            <InvalidLines lines={ctrl.invalidLines} />
            {ctrl.preview.warnings.map(warning => (
              <p key={warning.line} style={{ color: 'var(--yellow)', fontSize: 12, margin: 0 }}>⚠ Line {warning.line}: {warning.message}. Import is still allowed.</p>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {Object.keys(ctrl.answers).length > 0 && <button className="btn" onClick={ctrl.changeNames}>Change names</button>}
              <button className="btn" onClick={() => ctrl.setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={ctrl.counts.invalid > 0 || ctrl.busy} onClick={ctrl.confirm}>Confirm import</button>
            </div>
          </>
        )}

        {ctrl.step === 'result' && ctrl.result && (
          <>
            <p style={{ color: 'var(--green)', margin: 0 }}><strong>{ctrl.result.imported} imported</strong> into {ctrl.label}.</p>
            {ctrl.result.duplicates.length > 0 && (
              <>
                <p role="status" style={{ color: 'var(--yellow)', margin: 0 }}>⚠ <strong>{ctrl.result.duplicates.length} duplicates are discarded</strong> — already saved.</p>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th scope="col" style={th}>Line</th><th scope="col" style={th}>Date</th><th scope="col" style={th}>Share</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Dividend</th></tr></thead>
                  <tbody>{ctrl.result.duplicates.map(duplicate => (
                    <tr key={duplicate.line}><td style={td}>{duplicate.line}</td><td style={td}>{formatDate(duplicate.date)}</td><td style={td}>{duplicate.share_name}</td><td style={{ ...td, textAlign: 'right' }}>{formatMoney(duplicate.amount, currency)}</td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => { onImported(); onClose() }}>Done</button>
            </div>
          </>
        )}

        {ctrl.step !== 'result' && (
          <div>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
```

* [ ] Verify the Classic import is unchanged:

```bash
cd frontend && npx vitest run src/features/dividends/DividendImport.test.tsx 2>&1 | tail -8
```

Expected: all tests pass, the test file unmodified.

* [ ] Commit: `git add frontend/src/features/dividends/DividendImportModal.tsx`

---

### Task 11 — Create `Ui2DividendImport`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendImport.tsx` (create)

This is §2's import dialog: file **or** paste **or** Load example, then an explicit *Validate and preview*. `NameConfirmDialog` is returned bare, never wrapped — it renders its own dialog, and nesting it inside `Ui2Dialog` would give two dialog landmarks and two focus traps (`Ui2TradeImport.tsx:26-41` is the precedent). `handleClose` fires `onImported` on the result step so closing with ×, Escape or the backdrop still refreshes the table, which is the behaviour Classic gets from `useDialogFocus`.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendImport.tsx`:

```tsx
// The UI_2.0 dividend CSV import (PD-059 slice 19). Upload, paste or load the
// header example, then validate — the handoff's asset-import dialog. Parsing,
// matching and server validation come from useDividendImport, shared with the
// Classic modal.
import type { DividendCurrency, Holding } from '../../types'
import { ImportCounts, InvalidLines } from '../../features/imports/ImportTables'
import NameConfirmDialog from '../../features/imports/NameConfirmDialog'
import { useDividendImport, openNames } from '../../features/dividends/useDividendImport'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

export function Ui2DividendImport({ currency, holdings, userId, onClose, onImported }: Props) {
  const ctrl = useDividendImport(currency, holdings, userId)

  // × / Escape / backdrop on the result step must refresh the page, same as
  // the Classic modal's useDialogFocus handler.
  const handleClose = () => {
    if (ctrl.step === 'result') onImported()
    onClose()
  }

  if (ctrl.step === 'names' && ctrl.preview) {
    return (
      <NameConfirmDialog
        names={openNames(ctrl.preview, ctrl.answers)}
        holdings={ctrl.inTab}
        heading="Confirm share names"
        context={ctrl.label}
        intro="These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time."
        onBack={() => ctrl.setStep('pick')}
        onConfirm={ctrl.confirmNames}
      />
    )
  }

  const title = ctrl.step === 'result' ? 'Import complete'
    : ctrl.step === 'preview' ? 'Preview import'
    : `Upload dividend CSV · ${currency}`

  return (
    <Ui2Dialog title={title} onClose={handleClose} busy={ctrl.busy}>
      <div className="asset-import">
        {ctrl.err && <p className="asset-error" role="alert">{ctrl.err}</p>}

        {ctrl.step === 'pick' && (
          <>
            <p className="asset-note">
              Date,Share Name,Dividend,CUMULATIVE · cumulative is optional.
              Match holdings within {ctrl.label}. Dates read as DD/MM/YYYY.
            </p>
            <div className="asset-toolbar" style={{ marginTop: 20 }}>
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Dividend CSV file"
                onChange={event => void ctrl.loadFile(event.target.files?.[0])}
              />
              <button type="button" className="ui2-btn" onClick={ctrl.loadExample}>Load example</button>
            </div>
            <textarea
              aria-label="Dividend CSV contents"
              placeholder="Paste your dividend CSV"
              value={ctrl.text}
              onChange={event => ctrl.setText(event.target.value)}
            />
            <div className="ui2-dialog-actions">
              <button type="button" className="ui2-btn" onClick={handleClose}>Cancel</button>
              <button
                type="button"
                className="ui2-btn ui2-btn-primary"
                disabled={ctrl.busy || ctrl.text.trim() === ''}
                onClick={() => void ctrl.validate()}
              >
                {ctrl.busy ? 'Validating…' : 'Validate and preview'}
              </button>
            </div>
          </>
        )}

        {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
          <>
            <ImportCounts
              total={ctrl.counts.total}
              counts={[
                ['Ready to import', ctrl.counts.ready],
                ['Already exists', ctrl.counts.duplicate],
                ['Invalid', ctrl.counts.invalid],
              ]}
            />
            <InvalidLines lines={ctrl.invalidLines} />
            {ctrl.preview.warnings.map(warning => (
              <p key={warning.line} className="asset-note" role="alert">
                ⚠ Line {warning.line}: {warning.message}. Import is still allowed.
              </p>
            ))}
            <div className="ui2-dialog-actions">
              {Object.keys(ctrl.answers).length > 0 && (
                <button type="button" className="ui2-btn" onClick={ctrl.changeNames}>Change names</button>
              )}
              <button type="button" className="ui2-btn" onClick={() => ctrl.setStep('pick')}>Edit the sheet</button>
              <button
                type="button"
                className="ui2-btn ui2-btn-primary"
                disabled={ctrl.busy || ctrl.counts.invalid > 0}
                onClick={ctrl.confirm}
              >
                {ctrl.busy ? 'Importing…' : 'Confirm import'}
              </button>
            </div>
          </>
        )}

        {ctrl.step === 'result' && ctrl.result && (
          <>
            <p role="status"><strong>{ctrl.result.imported} imported</strong> into {ctrl.label}.</p>
            {ctrl.result.duplicates.length > 0 && (
              <p className="asset-note">
                ⚠ {ctrl.result.duplicates.length} duplicate
                {ctrl.result.duplicates.length === 1 ? '' : 's'} discarded — already saved.
              </p>
            )}
            <div className="ui2-dialog-actions">
              <button
                type="button"
                className="ui2-btn ui2-btn-primary"
                onClick={() => { onImported(); onClose() }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Ui2Dialog>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | /usr/bin/grep Ui2DividendImport; echo "exit=$?"`

Expected: `exit=1`.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendImport.tsx`

---

### Task 12 — Test `Ui2DividendImport`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendImport.test.tsx` (create)

These are the cases that fail without Tasks 9 and 11, and they cover each thing the handoff adds over Classic: paste, Load example, the separate validate step, and the close-on-result refresh. The real `useDividendImport`, `parseDividendCsv` and `Ui2Dialog` run; only the network is mocked, so a regression in the hook is caught here too.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendImport.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Holding } from '../../types'
import { Ui2DividendImport } from './Ui2DividendImport'

const mockApi = vi.hoisted(() => ({ previewDividendImport: vi.fn(), importDividends: vi.fn() }))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const holdings: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
    stocks_owned: 10, avg_cost_price: 1000 },
]

const SHEET = 'Date,Share Name,Dividend,CUMULATIVE\n01/10/2026,TCS,500,500\n01/11/2026,TCS,300,800'

const names = [{ sheet_name: 'TCS', rows: 2, status: 'auto', holding_id: 'h1', matched_by: 'name', suggestions: [] }]
const ready = { counts: { ready: 2, duplicate: 0, invalid: 0, total: 2 }, names, rows: [], warnings: [] }

const show = (onImported = vi.fn(), onClose = vi.fn()) => {
  render(<Ui2DividendImport currency="INR" holdings={holdings} onClose={onClose} onImported={onImported} />)
  return { onImported, onClose }
}

const paste = async (text: string) => {
  await userEvent.click(screen.getByLabelText('Dividend CSV contents'))
  await userEvent.paste(text)
  await userEvent.click(screen.getByRole('button', { name: 'Validate and preview' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.previewDividendImport.mockResolvedValue(ready)
  mockApi.importDividends.mockResolvedValue({ imported: 2, duplicates: [] })
})

describe('Ui2DividendImport', () => {
  it('offers a file input, a paste area and Load example', () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Upload dividend CSV · INR' })).toBeInTheDocument()
    expect(screen.getByLabelText('Dividend CSV file')).toBeInTheDocument()
    expect(screen.getByLabelText('Dividend CSV contents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load example' })).toBeInTheDocument()
  })

  it('cannot validate an empty buffer', () => {
    show()
    expect(screen.getByRole('button', { name: 'Validate and preview' })).toBeDisabled()
  })

  it('Load example fills the buffer with the header only', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Load example' }))
    expect(screen.getByLabelText('Dividend CSV contents'))
      .toHaveValue('Date,Share Name,Dividend,CUMULATIVE')
  })

  it('validates a pasted sheet and previews the server counts', async () => {
    show()
    await paste(SHEET)
    await waitFor(() => expect(mockApi.previewDividendImport).toHaveBeenCalledTimes(1))
    // Day-first dates reach the server as ISO days.
    expect(mockApi.previewDividendImport.mock.calls[0][0].rows.map((row: { date: string }) => row.date))
      .toEqual(['2026-10-01', '2026-11-01'])
    expect(await screen.findByText('Ready to import')).toBeInTheDocument()
  })

  it('fills the buffer from a file without validating it', async () => {
    show()
    await userEvent.upload(
      screen.getByLabelText('Dividend CSV file'),
      new File([SHEET], 'dividends.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByLabelText('Dividend CSV contents')).toHaveValue(SHEET))
    expect(mockApi.previewDividendImport).not.toHaveBeenCalled()
  })

  it('blocks the import while a line is invalid', async () => {
    mockApi.previewDividendImport.mockResolvedValue({
      ...ready,
      counts: { ready: 1, duplicate: 0, invalid: 1, total: 2 },
      rows: [{ line: 3, status: 'invalid', reason: 'No matching holding' }],
    })
    show()
    await paste(SHEET)
    expect(await screen.findByText('No matching holding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })

  it('imports and refreshes on Done', async () => {
    const { onImported } = show()
    await paste(SHEET)
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('status')).toHaveTextContent('2 imported')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalledOnce()
  })

  it('refreshes when the result step is dismissed instead of confirmed', async () => {
    const { onImported, onClose } = show()
    await paste(SHEET)
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    await screen.findByRole('status')
    await userEvent.click(screen.getByRole('button', { name: 'Close Import complete' }))
    expect(onImported).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/dividends/Ui2DividendImport.test.tsx 2>&1 | tail -10
```

Expected: 8 tests pass.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendImport.test.tsx`

---

### Task 13 — Slice 19 gate

* [ ] Full suite, lint, typecheck, build — the same four commands as Task 8.

Expected: no new failures; `DividendImport.test.tsx` passes against the rewired Classic modal.

* [ ] Open the slice 19 PR from `feat/PD-059-dividend-import` to `main`, label `ui-2.0`.

---

### Task 14 — Close the board rows

**Files:**

* `docs/plans/PD-059-ui-2-status.md` (modify)

* [ ] Set slice 18's and slice 19's **PR** column to the merged numbers and **State** to `merged ([wave 5a](PD-059-wave5a-dividends.md))`, and slice 28's to `merged` with this docs PR's number.

* [ ] Add the shared primitives to the components registry so Gold reuses rather than rebuilds:

```
| `AssetStats` | `frontend/src/ui2/asset/AssetStats.tsx` | handoff asset-page stat grid; `stats: AssetStat[]`, first card hero | slice 18 |
| `AssetBarChart` | `frontend/src/ui2/asset/AssetBarChart.tsx` | handoff SVG bar chart; `data: BarDatum[]`, `currency`, `label` | slice 18 |
| `asset.css` | `frontend/src/ui2/asset/asset.css` | shared `.asset-root/-top/-stat/-table/-search/-footer/-split/-contribution/-import` chrome for Dividends and Gold | slice 18 |
| `useDividendImport` | `frontend/src/features/dividends/useDividendImport.ts` | dividend CSV import state machine for both interfaces; adds paste + Load example | slice 19 |
```

* [ ] Add `useDividendImport` to the "Reused as is (do not copy)" list.

* [ ] Commit: `git add docs/plans/PD-059-ui-2-status.md`

---

## 7. End-to-end verification scenarios

Run against a real stack (`make dev-db`, `make backend`, `make frontend`) on an account with `ui_mode = ui2`.

1. `/dividends` shows the intro "Income, one payment at a time.", the INR tab selected, four stat cards with their detail lines, the table, the two chart panels and the Delete-all footer.
2. Click `€ EUR`. The URL becomes `?currency=EUR`, the holding filter resets to All holdings, and a currency with no payments shows "Your income story starts here."
3. Reload on `?currency=EUR`. The EUR tab is still selected — the deep link survives.
4. Filter to one holding. The row count and the "N of M payments" note shrink; the **Currency cumulative** column still shows tab-wide running totals.
5. Search for a string that matches nothing. The body shows the single "No payments match this search." row.
6. Toggle Yearly. The chart's accessible name and bars change to year buckets; the years table is unchanged.
7. Add a dividend, edit it, delete it. Each dialog closes and the table, stats and both chart panels refresh.
8. Upload CSV → paste a sheet → Validate and preview → Confirm import → Done. The table refreshes. Repeat and dismiss the result with × instead of Done: the table still refreshes.
9. Click Load example. The textarea holds only `Date,Share Name,Dividend,CUMULATIVE`; validating it reports no importable rows rather than erroring.
10. Import a sheet with a name that matches no holding. The Confirm-share-names dialog appears as one dialog (not nested), and confirming returns a preview whose counts reflect the mapping.
11. Delete all INR, typing DELETE. The tab empties and shows the empty state.
12. As an admin, act as a user and repeat 1, 4 and 8 — every call targets the viewed account.
13. Switch the account to Classic. `/dividends` is the original page, with its nav header, ThemePicker and Recharts analytics intact. Switch to Glass: likewise.

---

## Done

* [ ] `feat/PD-059-dividends-page` merged → slice 18 live, `ui2/asset/*` available to Gold
* [ ] `feat/PD-059-dividend-import` merged → slice 19 live, one import machine for both interfaces
* [ ] Board rows 18, 19, 28 set to merged; registry lists `AssetStats`, `AssetBarChart`, `asset.css`, `useDividendImport`
* [ ] PD-059-Q-5a-1 and PD-059-Q-5a-2 answered, or carried forward to the Wave 5b amendment

**Next:** Wave 5b — slices 20–21 (Gold table, Details, metrics, prices, missing-price prompt), building on `ui2/asset/*` from slice 18.
