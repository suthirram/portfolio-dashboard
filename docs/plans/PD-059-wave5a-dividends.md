# PD-059: Wave 5a — Dividends page and dividend import (slices 18–19)

* **Status**: Amendment in progress (this doc).
* **Updated**: 2026-11-19
* **Owner**: Claude
* **Goal**: Render the per-currency dividend ledger and the CSV dividend import in the UI_2.0 shell, reusing all existing pure logic (CSV parsing, analytics data, CRUD API calls) and replacing only the shell and styling layer.
* **Architecture**: `DividendsPage` gains a `useUiMode()` dispatcher that renders `Ui2DividendsPage` for UI_2.0 accounts, leaving every Classic and Glass path unchanged. The new page uses `useDividends`, `usePagination`, `DividendModal`, `DeleteDividendDialog`, `DeleteAllDialog`, and `stockIconStyle` without modification. `DividendImportModal` gains the same guard: when `ui2`, it delegates to `Ui2DividendImport`, which wraps the same `parseDividendCsv` / `api.importDividends` flow in a `Ui2Dialog`.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library, existing typed API client.
* **Spec links**: [PRD-015](../prds/PRD-015-ui-2.md), [DD-015](../designs/DD-015-ui-2.md), [handoff](../visuals/PD-059-ui-2-reference.html), [parent plan](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Slices 16–17 (Transactions page and trade import) are merged; the dispatcher + `ClassicXxx` extraction pattern is established.
Slice 2 (shell) is merged; `Ui2Shell`, `Ui2Dialog`, `Ui2PageIntro` and `primitives.css` are live.
`useDividends`, `dividendCsv.ts`, `DividendModal`, `DeleteDividendDialog`, `DeleteAllDialog`, `DividendsAnalytics`, `stockIconStyle`, `usePagination` and `Pager` are all live and must not be modified.
`DividendImportModal` and its test cover the Classic import flow; the modification in slice 19 is strictly additive (a dispatcher at the top).

Deploy through the per-account `ui_mode` flag. Classic and Glass routes are unchanged.

---

## 2. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/ui2/dividends/Ui2DividendsPage.tsx` | UI_2.0 dividends page: currency tabs, summary cards, table with pagination, analytics, modals |
| Create | `frontend/src/ui2/dividends/dividends.css` | Scoped `:root[data-ui="ui2"]` styles for the dividends page |
| Create | `frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx` | Render + filter + tab-switch + modal interaction tests |
| Create | `frontend/src/ui2/dividends/Ui2DividendImport.tsx` | Dividend import in a `Ui2Dialog`: file, validate, confirm names, preview, result |
| Create | `frontend/src/ui2/dividends/Ui2DividendImport.test.tsx` | Validation and import flow tests |
| Modify | `frontend/src/features/dividends/DividendsPage.tsx` | Dispatcher guard: `useUiMode() === 'ui2'` → render `Ui2DividendsPage` |
| Modify | `frontend/src/features/dividends/DividendImportModal.tsx` | Dispatcher guard: `useUiMode() === 'ui2'` → render `Ui2DividendImport` |

---

## 3. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `docs/PD-059-wave5a-dividends` | This amendment + board update | Docs only | Reviewable implementation plan for slices 18–19 | Markdown lint |
| `feat/PD-059-dividends-page` | Slice 18: `Ui2DividendsPage`, `dividends.css`, `DividendsPage` guard | Classic/Glass unchanged (guard only activates for `ui2`); existing tests pass | UI_2.0 accounts see dividends in the new shell | Render/interaction tests in `Ui2DividendsPage.test.tsx` |
| `feat/PD-059-dividend-import` | Slice 19: `Ui2DividendImport`, `DividendImportModal` guard | Classic/Glass import path unchanged; `DividendImport.test.tsx` passes | UI_2.0 accounts import dividends in a `Ui2Dialog` | Validation and flow tests in `Ui2DividendImport.test.tsx` |

---

## 4. Owner decisions

Resolved (owner, 2026-11-19):

* Currency tab is managed with local state in `Ui2DividendsPage` (not URL params); URL params are a Classic navigation detail. Switching currency resets the holding filter.
* `DividendModal`, `DeleteDividendDialog`, and `DeleteAllDialog` are reused as-is in `Ui2DividendsPage`. Their Classic modal chrome is acceptable for the initial slice; visual polish comes in a later pass.
* `DividendsAnalytics` (Recharts bar chart) is replaced by a lightweight by-holding breakdown table in `Ui2DividendsPage`. Recharts is not loaded on the dividends page in UI_2.0 — the bar chart is out of scope for slice 18.
* The `actAsLabel` banner is out of scope for slice 18 (the act-as banner in UI_2.0 is handled at the shell level in slice 22).
* Pagination keeps the existing `PAGE_SIZE = 15` from `usePagination.ts`.

---

## 5. Task list

### Task 1 — Create `dividends.css`

**Files:**

* `frontend/src/ui2/dividends/dividends.css` (create)

All rules scoped to `:root[data-ui="ui2"]` so they cannot leak into Classic or Glass.

* [ ] Create `frontend/src/ui2/dividends/dividends.css`:

```css
/* UI_2.0 Dividends page (PD-059 slice 18). */

:root[data-ui="ui2"] .u2-div-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .u2-div-summaries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .u2-div-summary { padding: 20px; }

:root[data-ui="ui2"] .u2-div-eyebrow {
  color: var(--u2-muted);
  font: 700 9px var(--u2-font);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 10px;
}

:root[data-ui="ui2"] .u2-div-value {
  font: 700 18px var(--u2-font-display);
  letter-spacing: -.3px;
  font-variant-numeric: tabular-nums;
}

:root[data-ui="ui2"] .u2-div-range { font: 600 13px var(--u2-font); }

:root[data-ui="ui2"] .u2-div-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--u2-border);
}

:root[data-ui="ui2"] .u2-div-filters input[type="search"],
:root[data-ui="ui2"] .u2-div-filters select {
  background: var(--u2-bg);
  color: var(--u2-text);
  border: 1px solid var(--u2-border);
  border-radius: 7px;
  padding: 8px 10px;
  font: 12px var(--u2-font);
}

:root[data-ui="ui2"] .u2-div-search { flex: 1; min-width: 200px; }

:root[data-ui="ui2"] .u2-div-filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--u2-muted);
  font-size: 11px;
  white-space: nowrap;
}

:root[data-ui="ui2"] .u2-div-delete-all {
  margin-left: auto;
  color: var(--u2-red, hsl(0,70%,55%));
  border-color: var(--u2-red, hsl(0,70%,55%));
}

:root[data-ui="ui2"] .u2-div-scroll { overflow-x: auto; }

:root[data-ui="ui2"] .u2-div-num {
  color: var(--u2-muted);
  font-size: 11px;
}

:root[data-ui="ui2"] .u2-div-amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

:root[data-ui="ui2"] .u2-div-cumulative {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--u2-green);
}

:root[data-ui="ui2"] .u2-div-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-size: 11px;
  color: var(--u2-muted);
  border-top: 1px solid var(--u2-border);
  flex-wrap: wrap;
  gap: 8px;
}

:root[data-ui="ui2"] .u2-div-analytics { padding: 20px; }

:root[data-ui="ui2"] .u2-div-analytics-title {
  font: 700 11px var(--u2-font);
  letter-spacing: .5px;
  text-transform: uppercase;
  color: var(--u2-muted);
  margin-bottom: 16px;
}

:root[data-ui="ui2"] .u2-div-empty {
  padding: 48px;
  text-align: center;
  color: var(--u2-muted);
}

@media (max-width: 760px) {
  :root[data-ui="ui2"] .u2-div-filter-label span { display: none; }
  :root[data-ui="ui2"] .u2-div-summaries { grid-template-columns: 1fr 1fr; }
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | grep dividends` → no errors (CSS has no types).

* [ ] Commit: `git add frontend/src/ui2/dividends/dividends.css`

---

### Task 2 — Create `Ui2DividendsPage.tsx`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendsPage.tsx` (create)

The page owns the currency tab state, filters, pagination, and all modal open/close state. It delegates data fetching to `useDividends` and CRUD to the existing `DividendModal`/`DeleteDividendDialog`/`DeleteAllDialog` (which render their own Classic backdrop — acceptable for slice 18). The import button opens `DividendImportModal`, which will gain its own UI_2.0 guard in slice 19.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendsPage.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { SUPPORTED_CURRENCIES, canonicalCurrency, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import type { DividendCurrency, DividendRow } from '../../types'
import { useDividends } from '../../features/dividends/useDividends'
import { usePagination, PAGE_SIZE } from '../../lib/usePagination'
import { Pager } from '../../components/Pager'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import DividendModal, { DeleteDividendDialog } from '../../features/dividends/DividendModal'
import DeleteAllDialog from '../../features/dividends/DeleteAllDialog'
import DividendImportModal from '../../features/dividends/DividendImportModal'
import { stockIconStyle } from '../overview/holdingIcon'
import './dividends.css'

interface Props { actAsUserId?: string }

export function Ui2DividendsPage({ actAsUserId }: Props) {
  const [currency, setCurrency] = useState<DividendCurrency>('INR')
  const { view, ready, holdings, loading, error, refresh } = useDividends(currency, actAsUserId)
  const [holdingId, setHoldingId] = useState('')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ row: DividendRow | null } | null>(null)
  const [deleting, setDeleting] = useState<DividendRow | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [importing, setImporting] = useState(false)

  const after = (close: () => void) => () => { close(); void refresh() }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return view.rows.filter(row =>
      (!holdingId || row.holding_id === holdingId) &&
      (!query || row.script.toLowerCase().includes(query) || row.symbol.toLowerCase().includes(query)))
  }, [view.rows, holdingId, search])

  const resetKey = useMemo(() => JSON.stringify([currency, holdingId, search]), [currency, holdingId, search])
  const pagination = usePagination(visible, resetKey, PAGE_SIZE)

  if (error) return <p className="ui2-note" role="alert">{error}</p>

  return (
    <div className="u2-div-page">
      <Ui2PageIntro
        title="Income, tracked."
        subtitle="Every dividend across your portfolio, in one place."
        actions={
          <>
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setEditor({ row: null })}>
              Add dividend
            </button>
            <button type="button" className="ui2-btn" onClick={() => setImporting(true)}>
              Import CSV
            </button>
          </>
        }
      />

      <div role="tablist" aria-label="Currency" className="u2-div-tabs">
        {SUPPORTED_CURRENCIES.map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === currency}
            className={`ui2-btn${tab === currency ? ' ui2-btn-primary' : ''}`}
            onClick={() => { setCurrency(tab as DividendCurrency); setHoldingId('') }}
          >
            {currencySymbol(tab)} {tab}
          </button>
        ))}
      </div>

      {loading && <p className="ui2-note" aria-live="polite">Loading…</p>}

      {ready && view.summary.count === 0 && (
        <section className="ui2-panel u2-div-empty" aria-label={`${currency} dividends`}>
          <p>No {currency} dividends yet.</p>
          <p className="ui2-note">Upload a CSV or add one by hand. Expected header: <code>Date,Share Name,Dividend,CUMULATIVE</code></p>
        </section>
      )}

      {ready && view.summary.count > 0 && (
        <>
          <div className="u2-div-summaries">
            <section className="ui2-panel u2-div-summary" aria-label="Total dividends">
              <div className="u2-div-eyebrow">Total · {currency}</div>
              <div className="u2-div-value">{formatMoney(view.summary.total, currency)}</div>
            </section>
            <section className="ui2-panel u2-div-summary" aria-label="Dividend count">
              <div className="u2-div-eyebrow">Payments</div>
              <div className="u2-div-value">{view.summary.count}</div>
            </section>
            <section className="ui2-panel u2-div-summary" aria-label="Holdings paying">
              <div className="u2-div-eyebrow">Holdings paying</div>
              <div className="u2-div-value">{view.summary.holdings}</div>
            </section>
            <section className="ui2-panel u2-div-summary" aria-label="Date range">
              <div className="u2-div-eyebrow">Date range</div>
              <div className="u2-div-range">{formatDate(view.summary.first_date ?? '')} → {formatDate(view.summary.last_date ?? '')}</div>
            </section>
          </div>

          <section className="ui2-panel">
            <div className="u2-div-filters" role="search" aria-label="Filter dividends">
              <input
                type="search"
                className="u2-div-search"
                placeholder="Search holding…"
                aria-label="Search dividends"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <label className="u2-div-filter-label">
                <span>Holding</span>
                <select
                  aria-label="Filter by holding"
                  value={holdingId}
                  onChange={e => setHoldingId(e.target.value)}
                >
                  <option value="">All holdings</option>
                  {view.by_holding.map(h => (
                    <option key={h.holding_id} value={h.holding_id}>{h.script || h.symbol}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="ui2-btn u2-div-delete-all"
                onClick={() => setDeletingAll(true)}
              >
                Delete all {currency}
              </button>
            </div>

            {visible.length !== view.rows.length && (
              <p className="ui2-note">{visible.length} of {view.rows.length} dividends</p>
            )}

            <div className="u2-div-scroll">
              <table className="ui2-table" aria-label="Dividends">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Date</th>
                    <th scope="col">Holding</th>
                    <th scope="col">Dividend</th>
                    <th scope="col">Cumulative</th>
                    <th scope="col">Holding cumulative</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((row, index) => {
                    const sym = row.symbol ?? ''
                    const icon = sym.split('.')[0].slice(0, 4)
                    return (
                      <tr key={row.id}>
                        <td className="u2-div-num">{pagination.from + index}</td>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <div className="u2-holding">
                            <div className="u2-stock-icon" style={stockIconStyle(sym)} aria-hidden="true">{icon}</div>
                            <div>
                              <strong style={{ fontSize: 11, fontWeight: 700 }}>{row.script}</strong>
                              <small style={{ display: 'block', fontSize: 10, color: 'var(--u2-muted)', marginTop: 2 }}>{sym}</small>
                            </div>
                          </div>
                        </td>
                        <td className="u2-div-amount">{formatMoney(row.amount, currency)}</td>
                        <td className="u2-div-cumulative">{formatMoney(row.cumulative, currency)}</td>
                        <td>{formatMoney(row.holding_cumulative, currency)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="ui2-btn"
                              aria-label={`Edit dividend of ${formatDate(row.date)}`}
                              onClick={() => setEditor({ row })}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ui2-btn"
                              aria-label={`Delete dividend of ${formatDate(row.date)}`}
                              onClick={() => setDeleting(row)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="u2-div-footer">
              <span>{view.summary.count} dividend{view.summary.count !== 1 ? 's' : ''}</span>
              <Pager pagination={pagination} label="Dividends" />
            </div>
          </section>

          <section className="ui2-panel u2-div-analytics" aria-label="Dividend analytics">
            <div className="u2-div-analytics-title">By holding · {currency}</div>
            <table className="ui2-table">
              <thead>
                <tr>
                  <th scope="col">Holding</th>
                  <th scope="col">Share</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {view.by_holding.map(h => (
                  <tr key={h.holding_id}>
                    <td>{h.script || h.symbol}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--u2-accent)', width: `${Math.max(2, h.share * 100)}%`, maxWidth: 120 }} />
                        <span style={{ fontSize: 11, color: 'var(--u2-muted)' }}>{(h.share * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>{formatMoney(h.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

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
    </div>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | grep Ui2DividendsPage` → no errors.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendsPage.tsx frontend/src/ui2/dividends/dividends.css`

---

### Task 3 — Wire `DividendsPage` to dispatch for UI_2.0

**Files:**

* `frontend/src/features/dividends/DividendsPage.tsx` (modify)

The Classic and Glass pages must be untouched. Only `useUiMode()` lives in the dispatcher; all Classic hooks go in `ClassicDividendsPage`.

* [ ] In `frontend/src/features/dividends/DividendsPage.tsx`, replace the existing default export with a dispatcher + renamed Classic body:

After the existing imports, add:

```tsx
import { useUiMode } from '../../lib/uiMode'
import { Ui2DividendsPage } from '../../ui2/dividends/Ui2DividendsPage'
```

Replace:

```tsx
export default function DividendsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
```

With:

```tsx
export default function DividendsPage({ actAsUserId, actAsLabel }: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2DividendsPage actAsUserId={actAsUserId} />
  return <ClassicDividendsPage actAsUserId={actAsUserId} actAsLabel={actAsLabel} />
}

function ClassicDividendsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
```

Add a closing `}` at the end of the file (after the last `}` of `DividendsPage`) to close `ClassicDividendsPage`.

* [ ] Verify existing Classic tests still pass:

```bash
cd frontend && npx vitest run src/features/dividends/DividendsPage.test.tsx 2>&1 | tail -8
```

Expected: all tests pass, no regressions.

* [ ] Commit: `git add frontend/src/features/dividends/DividendsPage.tsx`

---

### Task 4 — Write `Ui2DividendsPage.test.tsx`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx` (create)

Tests must cover: renders all dividends by default, filters by holding, switches currency tab, opens add-dividend modal, opens import modal. Each test verifies a behavior that would fail before slice 18 is applied.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2DividendsPage } from './Ui2DividendsPage'
import type { DividendView } from '../../types'

const EMPTY_VIEW: DividendView = {
  rows: [], by_year: [], by_month: [], by_holding: [],
  summary: { total: 0, count: 0, holdings: 0 },
}

const inrView: DividendView = {
  rows: [
    { id: 'd1', holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: '2026-10-01',
      amount: 500, currency: 'INR', cumulative: 500, holding_cumulative: 500 },
    { id: 'd2', holding_id: 'h2', script: 'Infosys', symbol: 'INFY.NS', date: '2026-11-01',
      amount: 300, currency: 'INR', cumulative: 800, holding_cumulative: 300 },
  ],
  by_year: [{ period: '2026', total: 800, count: 2 }],
  by_month: [{ period: '2026-10', total: 500, count: 1 }, { period: '2026-11', total: 300, count: 1 }],
  by_holding: [
    { holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 500, count: 1, share: 0.625 },
    { holding_id: 'h2', script: 'Infosys', symbol: 'INFY.NS', total: 300, count: 1, share: 0.375 },
  ],
  summary: { total: 800, count: 2, holdings: 2, first_date: '2026-10-01', last_date: '2026-11-01' },
}

const mockRefresh = vi.fn()
const mockDividends = vi.hoisted(() => ({ currency: 'INR' as string, view: inrView as DividendView }))

vi.mock('../../features/dividends/useDividends', () => ({
  useDividends: (currency: string) => ({
    view: mockDividends.currency === currency ? mockDividends.view : EMPTY_VIEW,
    ready: true,
    holdings: [
      { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR' },
      { id: 'h2', script: 'Infosys', symbol: 'INFY.NS', currency: 'INR' },
    ],
    loading: false,
    error: null,
    refresh: mockRefresh,
  }),
}))

vi.mock('../../features/dividends/DividendModal', () => ({
  default: ({ editing, onClose }: { editing: unknown; onClose: () => void }) =>
    <div role="dialog" aria-label={editing ? 'Edit dividend' : 'Add dividend'}><button onClick={onClose}>Close</button></div>,
  DeleteDividendDialog: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Delete dividend"><button onClick={onClose}>Close</button></div>,
}))

vi.mock('../../features/dividends/DeleteAllDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Delete all INR dividends"><button onClick={onClose}>Close</button></div>,
}))

vi.mock('../../features/dividends/DividendImportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Import dividends"><button onClick={onClose}>Close</button></div>,
}))

vi.mock('../shell/Ui2PageIntro', () => ({
  Ui2PageIntro: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
    <header><h1>{title}</h1>{actions}</header>,
}))

describe('Ui2DividendsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDividends.currency = 'INR'
    mockDividends.view = inrView
    document.documentElement.setAttribute('data-ui', 'ui2')
  })

  it('renders the dividends table with all rows', () => {
    render(<Ui2DividendsPage />)
    expect(screen.getByRole('table', { name: 'Dividends' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 rows
  })

  it('shows summary cards with totals', () => {
    render(<Ui2DividendsPage />)
    expect(screen.getByRole('region', { name: 'Total dividends' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Dividend count' })).toBeInTheDocument()
  })

  it('filters rows by holding', async () => {
    render(<Ui2DividendsPage />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by holding' }), 'h1')
    expect(screen.getAllByRole('row')).toHaveLength(2) // header + 1 TCS row
  })

  it('filters rows by search text', async () => {
    render(<Ui2DividendsPage />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search dividends' }), 'TCS')
    expect(screen.getAllByRole('row')).toHaveLength(2) // header + 1 TCS row
  })

  it('opens the add-dividend modal', async () => {
    render(<Ui2DividendsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Add dividend' }))
    expect(screen.getByRole('dialog', { name: 'Add dividend' })).toBeInTheDocument()
  })

  it('opens the import modal', async () => {
    render(<Ui2DividendsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import dividends' })).toBeInTheDocument()
  })

  it('shows empty state when currency has no dividends', () => {
    mockDividends.currency = 'EUR'
    render(<Ui2DividendsPage />)
    // Switch to EUR tab
    // The mock returns EMPTY_VIEW for EUR (currency mismatch)
    expect(screen.queryByRole('table', { name: 'Dividends' })).not.toBeInTheDocument()
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/dividends/Ui2DividendsPage.test.tsx 2>&1 | tail -8
```

Expected: 7 tests pass.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendsPage.test.tsx`

---

### Task 5 — Create `Ui2DividendImport.tsx` (slice 19)

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendImport.tsx` (create)

The Classic `DividendImportModal` wraps the whole import flow in `modalBackdrop`/`modalCard`. For UI_2.0 the outer chrome is `Ui2Dialog` and buttons use `ui2-btn`. The pure logic — `parseDividendCsv`, `NameConfirmDialog`, `ImportCounts`, `api.importDividends`, the step state machine — is reused unchanged. Only the shell and styling differ.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendImport.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { DividendCurrency, DividendImportPreview, DividendImportResult, Holding } from '../../types'
import { ImportCounts, InvalidLines } from '../../features/imports/ImportTables'
import NameConfirmDialog, { type Answers } from '../../features/imports/NameConfirmDialog'
import { parseDividendCsv } from '../../features/dividends/dividendCsv'
import { Ui2Dialog } from '../shell/Ui2Dialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const openNames = (preview: DividendImportPreview, answers: Answers) =>
  preview.names.filter(name =>
    (name.status === 'needs_confirmation' || name.status === 'ambiguous') && !(name.sheet_name in answers))

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

export function Ui2DividendImport({ currency, holdings, userId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<DividendImportPreview | null>(null)
  const [localErrors, setLocalErrors] = useState<{ line: number; reason: string }[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inTab = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === currency), [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`

  const runPreview = async (file: File) => {
    if (file.size > MAX_BYTES) { setError('File is too large (max 1 MB).'); return }
    setBusy(true)
    setError(null)
    try {
      const text = await file.text()
      setFileName(file.name)
      const parsed = parseDividendCsv(text, todayIST())
      setLocalErrors(parsed.errors)
      if (parsed.rows.length === 0) {
        setPreview({ counts: { ready: 0, duplicate: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] })
        setStep('preview')
        return
      }
      const evaluated = await api.previewDividendImport({ currency, rows: parsed.rows, mappings: answers }, userId)
      setPreview(evaluated)
      setStep(openNames(evaluated, answers).length > 0 ? 'names' : 'preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      setResult(await api.importDividends({ currency, rows: preview.rows.filter(row => row.status !== 'invalid'), mappings: answers }, userId))
      setStep('result')
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.body) {
        setPreview(err.body as DividendImportPreview)
        setError('The data changed since the preview — review it again.')
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'names' ? 'Confirm share names'
    : step === 'preview' ? 'Preview import'
    : step === 'result' ? 'Import complete'
    : 'Import dividends'

  if (step === 'names' && preview) {
    return (
      <Ui2Dialog title={title} onClose={onClose}>
        <NameConfirmDialog
          names={openNames(preview, answers)}
          holdings={inTab}
          heading="Confirm share names"
          context={label}
          intro="These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time."
          onBack={() => setStep('pick')}
          onConfirm={confirmed => {
            const nextAnswers = { ...answers, ...confirmed }
            setAnswers(nextAnswers)
            setStep('preview')
          }}
        />
      </Ui2Dialog>
    )
  }

  return (
    <Ui2Dialog title={title} onClose={onClose} busy={busy}>
      {step === 'pick' && (
        <div>
          <p className="ui2-note">
            Importing into <strong>{label}</strong> · dates read as <strong>DD/MM/YYYY</strong>
          </p>
          <p className="ui2-note">Expected header (any order, any case): <code>Date,Share Name,Dividend,CUMULATIVE</code></p>
          <div style={{ margin: '16px 0' }}>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose CSV file"
              onChange={event => { const file = event.target.files?.[0]; if (file) void runPreview(file) }}
            />
          </div>
          {error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{error}</p>}
          {busy && <p className="ui2-note" aria-live="polite">Validating…</p>}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div>
          <ImportCounts
            total={Math.max(preview.counts.total, preview.counts.ready + preview.counts.duplicate + preview.counts.invalid + localErrors.length)}
            counts={[
              ['Ready to import', preview.counts.ready],
              ['Already exists', preview.counts.duplicate],
              ['Invalid', preview.counts.invalid + localErrors.length],
            ]}
          />
          <InvalidLines lines={[
            ...localErrors,
            ...preview.rows.filter(row => row.status === 'invalid').map(row => ({ line: row.line, reason: row.reason ?? '' })),
          ].sort((first, second) => first.line - second.line)} />
          {preview.warnings.map((warning, index) => (
            <p key={index} className="ui2-note" role="alert">⚠ Line {warning.line}: {warning.message}</p>
          ))}
          {error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{error}</p>}
          <div className="ui2-dialog-actions">
            {Object.keys(answers).length > 0 && (
              <button type="button" className="ui2-btn" onClick={() => { setAnswers({}); setStep('pick') }}>Change names</button>
            )}
            <button type="button" className="ui2-btn" onClick={() => setStep('pick')}>Choose another file{fileName && ` (${fileName})`}</button>
            <button
              type="button"
              className="ui2-btn ui2-btn-primary"
              disabled={busy || (preview.counts.invalid + localErrors.length) > 0}
              onClick={confirm}
            >
              {busy ? 'Importing…' : 'Confirm import'}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div>
          <p><strong>{result.imported} imported</strong> into {label}.</p>
          {result.duplicates.length > 0 && (
            <p className="ui2-note">⚠ {result.duplicates.length} duplicate{result.duplicates.length !== 1 ? 's' : ''} discarded.</p>
          )}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => { onImported(); onClose() }}>Done</button>
          </div>
        </div>
      )}
    </Ui2Dialog>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | grep Ui2DividendImport` → no errors.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendImport.tsx`

---

### Task 6 — Wire `DividendImportModal` to dispatch for UI_2.0

**Files:**

* `frontend/src/features/dividends/DividendImportModal.tsx` (modify)

The Classic and Glass import paths must be untouched. Only `useUiMode()` lives in the dispatcher; all Classic state goes in `ClassicDividendImportModal`.

* [ ] In `frontend/src/features/dividends/DividendImportModal.tsx`, add at the top after existing imports:

```tsx
import { useUiMode } from '../../lib/uiMode'
import { Ui2DividendImport } from '../../ui2/dividends/Ui2DividendImport'
```

Replace the opening of the default export:

Current:

```tsx
export default function DividendImportModal({ currency, holdings, userId, onClose, onImported }: {
  currency: DividendCurrency; holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
```

Replacement:

```tsx
export default function DividendImportModal({ currency, holdings, userId, onClose, onImported }: {
  currency: DividendCurrency; holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2DividendImport currency={currency} holdings={holdings} userId={userId} onClose={onClose} onImported={onImported} />
  return <ClassicDividendImportModal currency={currency} holdings={holdings} userId={userId} onClose={onClose} onImported={onImported} />
}

function ClassicDividendImportModal({ currency, holdings, userId, onClose, onImported }: {
  currency: DividendCurrency; holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
```

Add a closing `}` at the end of the file to close `ClassicDividendImportModal`.

* [ ] Verify Classic test is unaffected:

```bash
cd frontend && npx vitest run src/features/dividends/DividendImport.test.tsx 2>&1 | tail -6
```

Expected: all tests pass.

* [ ] Commit: `git add frontend/src/features/dividends/DividendImportModal.tsx`

---

### Task 7 — Write `Ui2DividendImport.test.tsx`

**Files:**

* `frontend/src/ui2/dividends/Ui2DividendImport.test.tsx` (create)

Tests confirm: file input is present on pick step, a valid file advances to preview, the Confirm button imports and shows the result, Done calls `onImported`.

* [ ] Create `frontend/src/ui2/dividends/Ui2DividendImport.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2DividendImport } from './Ui2DividendImport'
import type { Holding } from '../../types'

const HOLDINGS: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
    stocks_owned: 10, avg_cost_price: 1000 },
]

const PARSED_PREVIEW = {
  counts: { ready: 2, duplicate: 0, invalid: 0, total: 2 },
  names: [],
  rows: [
    { line: 2, status: 'ready', holding_id: 'h1', date: '2026-10-01', amount: 500 },
    { line: 3, status: 'ready', holding_id: 'h1', date: '2026-11-01', amount: 300 },
  ],
  warnings: [],
}

vi.mock('../../features/dividends/dividendCsv', () => ({
  parseDividendCsv: () => ({
    rows: [{ date: '2026-10-01', share_name: 'TCS', amount: 500 }, { date: '2026-11-01', share_name: 'TCS', amount: 300 }],
    errors: [],
    total: 2,
  }),
}))

vi.mock('../../lib/api/client', () => ({
  api: {
    previewDividendImport: vi.fn().mockResolvedValue(PARSED_PREVIEW),
    importDividends: vi.fn().mockResolvedValue({ imported: 2, duplicates: [] }),
  },
  ApiError: class ApiError extends Error { constructor(public status: number, msg: string, public body?: unknown) { super(msg) } },
}))

vi.mock('../shell/Ui2Dialog', () => ({
  Ui2Dialog: ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) =>
    <div role="dialog" aria-label={title}><h2>{title}</h2>{children}<button onClick={onClose}>Dismiss</button></div>,
}))

vi.mock('../../features/imports/ImportTables', () => ({
  ImportCounts: ({ counts }: { counts: { ready: number } }) => <p>{counts.ready} ready</p>,
  InvalidLines: () => null,
}))

vi.mock('../../features/imports/NameConfirmDialog', () => ({
  default: () => <div>NameConfirmDialog</div>,
}))

describe('Ui2DividendImport', () => {
  const onClose = vi.fn()
  const onImported = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })

  it('shows file input on pick step', () => {
    render(<Ui2DividendImport currency="INR" holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    expect(screen.getByRole('dialog', { name: 'Import dividends' })).toBeInTheDocument()
    expect(screen.getByLabelText('Choose CSV file')).toBeInTheDocument()
  })

  it('advances to preview after file upload', async () => {
    render(<Ui2DividendImport currency="INR" holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['Date,Share Name,Dividend\n01/10/2026,TCS,500'], 'dividends.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('Choose CSV file'), file)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Preview import' })).toBeInTheDocument())
    expect(screen.getByText('2 ready')).toBeInTheDocument()
  })

  it('calls onImported after successful import', async () => {
    render(<Ui2DividendImport currency="INR" holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['Date,Share Name,Dividend\n01/10/2026,TCS,500'], 'dividends.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText('Choose CSV file'), file)
    await waitFor(() => screen.getByRole('button', { name: 'Confirm import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    await waitFor(() => screen.getByRole('dialog', { name: 'Import complete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalledOnce()
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/dividends/Ui2DividendImport.test.tsx 2>&1 | tail -6
```

Expected: 3 tests pass.

* [ ] Commit: `git add frontend/src/ui2/dividends/Ui2DividendImport.test.tsx`

---

### Task 8 — Full test run and lint

* [ ] Run all dividend-related tests:

```bash
cd frontend && npx vitest run src/features/dividends/ src/ui2/dividends/ 2>&1 | tail -10
```

Expected: all tests pass, no regressions in `DividendsPage.test.tsx` or `DividendImport.test.tsx`.

* [ ] Run lint on changed files:

```bash
cd frontend && npm run lint:changed 2>&1
```

Expected: no `id-length` or other ESLint errors.

* [ ] Run typecheck:

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

---

### Task 9 — Update the status board

**Files:**

* `docs/plans/PD-059-ui-2-status.md` (modify)

* [ ] Add slice 18 row (after slice 17):

```
| 18 | 5 | FE | Dividends page | 2 | Claude | `feat/PD-059-dividends-page` | | in progress ([wave 5a](PD-059-wave5a-dividends.md)) |
```

* [ ] Add slice 19 row:

```
| 19 | 5 | FE | Dividend import: upload, paste, example | 18 | Claude | `feat/PD-059-dividend-import` | | plan merged; not started ([wave 5a](PD-059-wave5a-dividends.md)) |
```

* [ ] Commit: `git add docs/plans/PD-059-ui-2-status.md docs/plans/PD-059-wave5a-dividends.md`

---

## 6. End-to-end verification scenarios

After both slices merge, an account with `ui_mode = ui2` should:

1. Navigate to `/dividends` → see `Ui2DividendsPage` with currency tabs, summary cards, and paginated table.
2. Click "EUR" tab → empty state shows "No EUR dividends yet." (if no EUR dividends exist).
3. Type in the search box → table filters to matching holdings only.
4. Click "Edit" on a row → `DividendModal` opens; save updates the row; dialog closes and table refreshes.
5. Click "Delete" on a row → `DeleteDividendDialog` opens; confirm removes the row.
6. Click "Import CSV" → `Ui2DividendImport` dialog opens; upload a valid CSV → Preview shows counts → Confirm → "Done" refreshes the page.
7. Click "Delete all INR" → `DeleteAllDialog` opens; type DELETE to confirm.
8. Switch to Classic (settings) → `/dividends` shows the original `DividendsPage` unchanged.

Classic and Glass accounts never see `Ui2DividendsPage` or `Ui2DividendImport`.

---

## Done

* [ ] `feat/PD-059-dividends-page` merged → slice 18 live
* [ ] `feat/PD-059-dividend-import` merged → slice 19 live
* [ ] Status board updated with PR numbers and "merged" state

**Next:** slice 20 — Gold table, Details, metrics, prices, missing-price prompt (depends on this docs PR merging).
