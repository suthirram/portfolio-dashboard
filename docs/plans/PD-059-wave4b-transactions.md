# PD-059: Wave 4b — Transactions page and trade import (slices 16–17)

* **Status**: Amendment merged as #362; implementation slices 16 and 17 merged as #364 and #366.
* **Updated**: 2026-11-19
* **Owner**: Claude
* **Goal**: Render the portfolio-wide ledger view and the Groww CSV trade import in the UI_2.0 shell, reusing all existing pure logic (filters, sort, pagination, CSV parsing) and replacing only the shell and styling layer.
* **Architecture**: `TransactionsPage` gains a `useUiMode()` guard that renders `Ui2TransactionsPage` for UI_2.0 accounts, leaving every Classic and Glass path unchanged. The new page uses `transactionFilters.ts`, `useAllTransactions`, `Pager`, `Ui2HoldingLedger`, and `InvestmentDeltaPanel` without modification. `TradeImportModal` gains the same guard: when `ui2`, it delegates to `Ui2TradeImport`, which wraps the same `parseTradeCsv` / `api.importTrades` flow in a `Ui2Dialog`.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library, existing typed API client.
* **Spec links**: [PRD-015](../prds/PRD-015-ui-2.md), [DD-015](../designs/DD-015-ui-2.md), [handoff (txRender, txDelta, txImport)](../visuals/PD-059-ui-2-reference.html), [parent plan](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Slice 15 (ledger dialog) is merged; `Ui2HoldingLedger` and `useHoldingLedger` are live.
Slice 2 (shell) is merged; `Ui2Shell`, `Ui2Dialog`, `Ui2PageIntro` and `primitives.css` are live.
`transactionFilters.ts`, `useAllTransactions`, `InvestmentDeltaPanel`, `InvestmentDeltaChart`, `tradeCsv.ts`, `Pager`, `usePagination` are all live and must not be modified.
`TradeImportModal` and its test cover the Classic import flow; the modification in slice 17 is strictly additive (a guard at the top).

Deploy through the per-account `ui_mode` flag. Classic and Glass routes are unchanged.

---

## 2. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/ui2/overview/holdingIcon.ts` | Exported `stockIconStyle(symbol)` — shared by Overview and Transactions |
| Modify | `frontend/src/ui2/overview/Ui2Holdings.tsx` | Import `stockIconStyle` from the new module instead of defining it inline |
| Create | `frontend/src/ui2/transactions/Ui2TransactionsPage.tsx` | UI_2.0 transactions page: summary panels, filters, paginated table, delta dialog |
| Create | `frontend/src/ui2/transactions/transactions.css` | Scoped `:root[data-ui="ui2"]` styles for the transactions page |
| Create | `frontend/src/ui2/transactions/Ui2TransactionsPage.test.tsx` | Render + filter + sort + open-ledger interaction tests |
| Create | `frontend/src/ui2/transactions/Ui2TradeImport.tsx` | Trade import in a `Ui2Dialog`: file, paste, validate, confirm |
| Create | `frontend/src/ui2/transactions/Ui2TradeImport.test.tsx` | Validation and import flow tests |
| Modify | `frontend/src/features/transactions/TransactionsPage.tsx` | Guard: `useUiMode() === 'ui2'` → render `Ui2TransactionsPage` |
| Modify | `frontend/src/features/transactions/TradeImportModal.tsx` | Guard: `useUiMode() === 'ui2'` → render `Ui2TradeImport` |

---

## 3. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `docs/PD-059-wave4b-transactions` | This amendment + board update | Docs only | Reviewable implementation plan for slices 16–17 | Markdown lint |
| `feat/PD-059-transactions-page` | Slice 16: `Ui2TransactionsPage`, `holdingIcon.ts` extraction, `TransactionsPage` guard, CSS | Classic/Glass unchanged (guard only activates for `ui2`); existing tests pass | UI_2.0 accounts see the ledger in the new shell | Render/interaction tests in `Ui2TransactionsPage.test.tsx` |
| `feat/PD-059-trade-import` | Slice 17: `Ui2TradeImport`, `TradeImportModal` guard | Classic/Glass import path unchanged; `TradeImportModal.test.tsx` passes | UI_2.0 accounts import trades in a `Ui2Dialog` | Validation and flow tests in `Ui2TradeImport.test.tsx` |

---

## 4. Owner decisions

Resolved (owner, 2026-11-19):

* The investment delta (R22) is tentative and gated on a future decision — do not add it to slice 16. The delta button is hidden in UI_2.0 until R22 is scoped. `InvestmentDeltaPanel` is not rendered in the UI_2.0 page.
* The UI_2.0 trade import uses the same validation rules and API call as the Classic import; the only difference is the dialog chrome.
* Pagination keeps the existing `PAGE_SIZE = 15` from `usePagination.ts`.
* The stock icon in the transaction table uses the same `stockIconStyle` as Overview; extract it to `holdingIcon.ts` in slice 16 to avoid duplication.

---

## 5. Task list

### Task 1 — Extract `stockIconStyle` to `holdingIcon.ts`

**Files:**

* `frontend/src/ui2/overview/holdingIcon.ts` (create)
* `frontend/src/ui2/overview/Ui2Holdings.tsx` (modify)

The `stockIconStyle` function in `Ui2Holdings.tsx` is a pure utility — a deterministic HSL color from the ticker symbol. The Transactions page needs the same function for its holding column. Defining it twice creates a silent divergence risk. Extract it once to a shared module.

* [ ] Create `frontend/src/ui2/overview/holdingIcon.ts`:

```typescript
// Derives a consistent, visually distinct color pair from the ticker symbol.
// Used by any UI_2.0 component that renders a holding's stock icon badge.
export function stockIconStyle(symbol: string): { background: string; color: string } {
  const ticker = (symbol ?? '').split('.')[0]
  let hash = 0
  for (const char of ticker.toUpperCase()) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return { background: `hsl(${hash},55%,92%)`, color: `hsl(${hash},60%,38%)` }
}
```

* [ ] In `frontend/src/ui2/overview/Ui2Holdings.tsx`, replace the inline function:

Current:

```tsx
function stockIconStyle(symbol: string): { background: string; color: string } {
  const ticker = symbol.split('.')[0]
  let hash = 0
  for (const char of ticker.toUpperCase()) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return { background: `hsl(${hash},55%,92%)`, color: `hsl(${hash},60%,38%)` }
}
```

Replacement (remove the function; add import at top):

```tsx
import { stockIconStyle } from './holdingIcon'
```

* [ ] Verify:

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep "holdingIcon\|Ui2Holdings"
npx vitest run src/ui2/overview/ 2>&1 | tail -6
```

Expected: no TypeScript errors; all overview tests pass.

* [ ] Commit: `git add frontend/src/ui2/overview/holdingIcon.ts frontend/src/ui2/overview/Ui2Holdings.tsx`

---

### Task 2 — Create `transactions.css`

**Files:**

* `frontend/src/ui2/transactions/transactions.css` (create)

The reference design defines the transactions table with `.tx-table`, `.tx-tag` and `.tx-summaries` patterns. All rules are scoped to `:root[data-ui="ui2"]` so they cannot leak into Classic or Glass.

* [ ] Create `frontend/src/ui2/transactions/transactions.css`:

```css
/* UI_2.0 Transactions page (PD-059 slice 16). */

:root[data-ui="ui2"] .u2-tx-summaries {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

:root[data-ui="ui2"] .u2-tx-summary { padding: 20px; }

:root[data-ui="ui2"] .u2-tx-summary-eyebrow {
  color: var(--u2-muted);
  font: 700 9px var(--u2-font);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 14px;
}

:root[data-ui="ui2"] .u2-tx-totals {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

:root[data-ui="ui2"] .u2-tx-totals > div { min-width: 0; }

:root[data-ui="ui2"] .u2-tx-totals span {
  display: block;
  color: var(--u2-muted);
  font-size: 11px;
  margin-bottom: 7px;
}

:root[data-ui="ui2"] .u2-tx-totals strong {
  display: block;
  font: 700 14px var(--u2-font-display);
  letter-spacing: -.3px;
  font-variant-numeric: tabular-nums;
}

/* Filters panel */
:root[data-ui="ui2"] .u2-tx-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--u2-border);
}

:root[data-ui="ui2"] .u2-tx-filters input[type="text"],
:root[data-ui="ui2"] .u2-tx-filters input[type="search"],
:root[data-ui="ui2"] .u2-tx-filters select {
  background: var(--u2-bg);
  color: var(--u2-text);
  border: 1px solid var(--u2-border);
  border-radius: 7px;
  padding: 8px 10px;
  font: 12px var(--u2-font);
}

:root[data-ui="ui2"] .u2-tx-search { flex: 1; min-width: 200px; }

:root[data-ui="ui2"] .u2-tx-filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--u2-muted);
  font-size: 11px;
  white-space: nowrap;
}

/* Transaction table */
:root[data-ui="ui2"] .u2-tx-scroll { overflow-x: auto; }

:root[data-ui="ui2"] .u2-tx-table { white-space: nowrap; }

:root[data-ui="ui2"] .u2-tx-table td small {
  display: block;
  margin-top: 4px;
  color: var(--u2-muted);
  font-size: 10px;
}

/* Event type chips */
:root[data-ui="ui2"] .u2-tx-tag {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
}

:root[data-ui="ui2"] .u2-tx-tag-sell {
  background: var(--u2-redsoft, hsl(0,80%,95%));
  color: var(--u2-red);
}

:root[data-ui="ui2"] .u2-tx-tag-dividend {
  background: var(--u2-greensoft, hsl(145,60%,92%));
  color: var(--u2-green);
}

:root[data-ui="ui2"] .u2-tx-tag-opening { color: #a46ad5; background: #f3eafd; }

/* Table footer with pagination */
:root[data-ui="ui2"] .u2-tx-footer {
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

@media (max-width: 760px) {
  :root[data-ui="ui2"] .u2-tx-filter-label span { display: none; }
  :root[data-ui="ui2"] .u2-tx-totals { gap: 8px; }
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | grep transactions` → no errors (CSS has no types).

* [ ] Commit: `git add frontend/src/ui2/transactions/transactions.css`

---

### Task 3 — Create `Ui2TransactionsPage.tsx`

**Files:**

* `frontend/src/ui2/transactions/Ui2TransactionsPage.tsx` (create)

The page owns the filter state, sort state, ledger-open state, and paginated rows. It delegates all pure logic to the existing `transactionFilters.ts` exports and renders using `primitives.css` table, panel, and button classes. The investment delta button is hidden (R22 is not in scope); the Import button opens the existing `TradeImportModal` (which will be ui2-guarded in task 5). `Ui2HoldingLedger` is opened inline as a dialog keyed to the selected holding.

* [ ] Create `frontend/src/ui2/transactions/Ui2TransactionsPage.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { HoldingWithPrice, TransactionWithHolding } from '../../types'
import { useAllTransactions } from '../../features/transactions/useAllTransactions'
import {
  applyFilters, currencyFacet, currencySubtotals, defaultSort,
  emptyFilters, impliedCostPerShare, sortRows, toggleSort, typeFacet, visibleColumns,
  type Filters, type Sort,
} from '../../features/transactions/transactionFilters'
import { usePagination, PAGE_SIZE } from '../../lib/usePagination'
import { Pager } from '../../components/Pager'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { Ui2HoldingLedger } from './Ui2HoldingLedger'
import TradeImportModal from '../../features/transactions/TradeImportModal'
import { stockIconStyle } from '../overview/holdingIcon'
import { money } from '../overview/Ui2SummaryCards'
import { formatDate } from '../../lib/formDates'
import { formatQuantity } from '../../lib/currency'
import './transactions.css'

const TYPE_TONE: Record<string, string> = {
  sell: 'u2-tx-tag u2-tx-tag-sell',
  dividend: 'u2-tx-tag u2-tx-tag-dividend',
  opening: 'u2-tx-tag u2-tx-tag-opening',
}

function txTagClass(type: string | undefined): string {
  return TYPE_TONE[type ?? ''] ?? 'u2-tx-tag'
}

interface Props { actAsUserId?: string }

export function Ui2TransactionsPage({ actAsUserId }: Props) {
  const { transactions, holdings, loading, error, refresh } = useAllTransactions(actAsUserId)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<Sort>(defaultSort)
  const [ledger, setLedger] = useState<HoldingWithPrice | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const rows = useMemo(() => sortRows(applyFilters(transactions, filters), sort), [transactions, filters, sort])
  const currencies = useMemo(() => currencyFacet(transactions), [transactions])
  const types = useMemo(() => typeFacet(transactions), [transactions])
  const subtotals = useMemo(() => currencySubtotals(rows), [rows])
  const cols = useMemo(() => visibleColumns(rows), [rows])
  const pagination = usePagination(rows, PAGE_SIZE)
  const { pageItems: pageRows } = pagination

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(previous => ({ ...previous, [key]: value }))
  }

  function handleSort(key: Sort['key']) {
    setSort(previous => toggleSort(previous, key))
  }

  function sortIndicator(key: Sort['key']): string {
    if (sort.key !== key) return ''
    return sort.dir === 'desc' ? ' ↓' : ' ↑'
  }

  const holdingMap = useMemo(() => {
    const result = new Map<string, HoldingWithPrice>()
    for (const holding of holdings) if (holding.id) result.set(holding.id, holding as HoldingWithPrice)
    return result
  }, [holdings])

  if (error) return <p className="ui2-note" role="alert">{error}</p>

  return (
    <div className="u2-tx-page">
      <Ui2PageIntro
        title="Every event. One ledger."
        subtitle="Follow purchases, sales and income across your portfolio."
        actions={
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setImportOpen(true)}>
            Import CSV
          </button>
        }
      />

      {/* Per-currency summary panels */}
      {subtotals.length > 0 && (
        <div className="u2-tx-summaries">
          {subtotals.map(sub => (
            <section key={sub.currency} className="ui2-panel u2-tx-summary" aria-label={`${sub.currency} transaction totals`}>
              <div className="u2-tx-summary-eyebrow">{sub.currency} · filtered totals</div>
              <div className="u2-tx-totals">
                <div><span>Bought</span><strong>{money(sub.bought, sub.currency)}</strong></div>
                <div><span>Sold</span><strong>{money(sub.sold, sub.currency)}</strong></div>
                <div><span>Dividends</span><strong>{money(sub.dividends, sub.currency)}</strong></div>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Filters + table */}
      <section className="ui2-panel">
        <div className="u2-tx-filters" role="search" aria-label="Filter transactions">
          <input
            type="search"
            className="u2-tx-search"
            placeholder="Search holding, symbol or notes"
            aria-label="Search transactions"
            value={filters.search}
            onChange={event => setFilter('search', event.target.value)}
          />
          <label className="u2-tx-filter-label">
            <span>Holding</span>
            <select
              aria-label="Filter by holding"
              value={filters.holdingIds[0] ?? ''}
              onChange={event => setFilter('holdingIds', event.target.value ? [event.target.value] : [])}
            >
              <option value="">All holdings</option>
              {holdings.map(holding => (
                <option key={holding.id} value={holding.id ?? ''}>{holding.script ?? holding.symbol}</option>
              ))}
            </select>
          </label>
          {currencies.length > 1 && (
            <label className="u2-tx-filter-label">
              <span>Currency</span>
              <select
                aria-label="Filter by currency"
                value={filters.currencies[0] ?? ''}
                onChange={event => setFilter('currencies', event.target.value ? [event.target.value] : [])}
              >
                <option value="">All currencies</option>
                {currencies.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
          )}
          <label className="u2-tx-filter-label">
            <span>Type</span>
            <select
              aria-label="Filter by event type"
              value={filters.types[0] ?? ''}
              onChange={event => setFilter('types', event.target.value ? [event.target.value as typeof filters.types[0]] : [])}
            >
              <option value="">All event types</option>
              {types.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="u2-tx-filter-label">
            <span>From</span>
            <input type="date" aria-label="From date" value={filters.from}
              onChange={event => setFilter('from', event.target.value)} />
          </label>
          <label className="u2-tx-filter-label">
            <span>To</span>
            <input type="date" aria-label="To date" value={filters.to}
              onChange={event => setFilter('to', event.target.value)} />
          </label>
          {(filters.search || filters.holdingIds.length || filters.types.length || filters.currencies.length || filters.from || filters.to) && (
            <button type="button" className="ui2-btn" onClick={() => setFilters(emptyFilters)}>
              Clear filters
            </button>
          )}
        </div>

        {loading && <p className="ui2-note" aria-live="polite">Loading transactions…</p>}

        {!loading && rows.length === 0 && (
          <p className="ui2-note">No transactions match the current filters.</p>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div className="u2-tx-scroll">
              <table className="ui2-table u2-tx-table" aria-label="Transactions">
                <thead>
                  <tr>
                    <th scope="col">
                      <button type="button" className="u2-sort-btn" onClick={() => handleSort('date')}>
                        Date{sortIndicator('date')}
                      </button>
                    </th>
                    <th scope="col">
                      <button type="button" className="u2-sort-btn" onClick={() => handleSort('holding')}>
                        Holding{sortIndicator('holding')}
                      </button>
                    </th>
                    <th scope="col">
                      <button type="button" className="u2-sort-btn" onClick={() => handleSort('type')}>
                        Event{sortIndicator('type')}
                      </button>
                    </th>
                    {cols.quantity && <th scope="col">Shares</th>}
                    <th scope="col">
                      <button type="button" className="u2-sort-btn" onClick={() => handleSort('amount')}>
                        Amount{sortIndicator('amount')}
                      </button>
                    </th>
                    {cols.impliedCost && <th scope="col">Implied price</th>}
                    {cols.ratio && <th scope="col">Ratio</th>}
                    {cols.realizedSeed && <th scope="col">Realised seed</th>}
                    {cols.openingDate && <th scope="col">Opening date</th>}
                    <th scope="col">Currency</th>
                    {cols.notes && <th scope="col">Notes</th>}
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(txn => {
                    const holding = holdingMap.get(txn.holding_id ?? '')
                    const sym = holding?.symbol ?? txn.symbol ?? ''
                    const icon = sym.split('.')[0].slice(0, 4)
                    const currency = txn.currency ?? holding?.currency ?? 'INR'
                    const implied = impliedCostPerShare(txn)
                    return (
                      <tr key={txn.id}>
                        <td>{txn.date ? formatDate(txn.date) : '—'}</td>
                        <td>
                          <div className="u2-holding">
                            <div className="u2-stock-icon" style={stockIconStyle(sym)} aria-hidden="true">{icon}</div>
                            <div>
                              <strong style={{ fontSize: 11, fontWeight: 700 }}>{txn.script ?? txn.symbol ?? '—'}</strong>
                              <small>{sym}{holding?.exchange ? ` · ${holding.exchange}` : ''}</small>
                            </div>
                          </div>
                        </td>
                        <td><span className={txTagClass(txn.type)}>{txn.type ?? '—'}</span></td>
                        {cols.quantity && <td>{txn.quantity != null && txn.quantity !== 0 ? formatQuantity(txn.quantity) : '—'}</td>}
                        <td><strong>{money(txn.amount, currency)}</strong></td>
                        {cols.impliedCost && <td>{implied != null ? money(implied, currency) : '—'}</td>}
                        {cols.ratio && <td>{txn.ratio != null && txn.ratio !== 0 ? txn.ratio : '—'}</td>}
                        {cols.realizedSeed && <td>{txn.realized_seed != null && txn.realized_seed !== 0 ? money(txn.realized_seed, currency) : '—'}</td>}
                        {cols.openingDate && <td>{txn.type === 'opening' ? (txn.opening_date ?? '—') : ''}</td>}
                        <td>{currency}</td>
                        {cols.notes && <td>{txn.notes || '—'}</td>}
                        <td>
                          {holding && (
                            <button
                              type="button"
                              className="ui2-btn"
                              aria-label={`Open ledger for ${txn.script ?? txn.symbol}`}
                              onClick={() => setLedger(holding)}
                            >
                              Open ledger
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="u2-tx-footer">
              <span>{rows.length} event{rows.length !== 1 ? 's' : ''} · newest first</span>
              <Pager pagination={pagination} label="Transactions" />
            </div>
          </>
        )}
      </section>

      {/* Per-holding ledger dialog */}
      {ledger && (
        <Ui2HoldingLedger
          holding={ledger}
          userId={actAsUserId}
          onClose={() => setLedger(null)}
          onChanged={() => { refresh(); setRefreshKey(k => k + 1) }}
        />
      )}

      {/* Trade import */}
      {importOpen && (
        <TradeImportModal
          holdings={holdings}
          userId={actAsUserId}
          onClose={() => setImportOpen(false)}
          onImported={() => { refresh(); setImportOpen(false) }}
        />
      )}
    </div>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | grep Ui2TransactionsPage` → no errors.

* [ ] Commit: `git add frontend/src/ui2/transactions/Ui2TransactionsPage.tsx frontend/src/ui2/transactions/transactions.css`

---

### Task 4 — Wire `TransactionsPage` to dispatch for UI_2.0

**Files:**

* `frontend/src/features/transactions/TransactionsPage.tsx` (modify)

The Classic and Glass pages must be untouched. The guard is a one-liner at the top of the render function, identical in shape to the `DashboardPage` pattern.

* [ ] In `frontend/src/features/transactions/TransactionsPage.tsx`, add import and guard:

After the existing imports, add:

```tsx
import { useUiMode } from '../../lib/uiMode'
import { Ui2TransactionsPage } from '../../ui2/transactions/Ui2TransactionsPage'
```

At the start of the `TransactionsPage` function body, before all existing state:

```tsx
export default function TransactionsPage({ actAsUserId, actAsLabel }: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2TransactionsPage actAsUserId={actAsUserId} />
  // … rest of Classic body unchanged
```

* [ ] Verify existing Classic tests still pass:

```bash
cd frontend && npx vitest run src/features/transactions/TransactionsPage.test.tsx 2>&1 | tail -8
```

Expected: all tests pass, no regressions.

* [ ] Commit: `git add frontend/src/features/transactions/TransactionsPage.tsx`

---

### Task 5 — Write `Ui2TransactionsPage.test.tsx`

**Files:**

* `frontend/src/ui2/transactions/Ui2TransactionsPage.test.tsx` (create)

Tests must cover: filtered row count, sort toggle, search text filter, ledger dialog opens on button click. They mock `useAllTransactions` and `useUiMode`. Each test verifies a behavior that would fail before slice 16 is applied.

* [ ] Create `frontend/src/ui2/transactions/Ui2TransactionsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2TransactionsPage } from './Ui2TransactionsPage'

vi.mock('../../features/transactions/useAllTransactions', () => ({
  useAllTransactions: () => ({
    transactions: [
      {
        id: 'tx1', holding_id: 'h1', type: 'buy', date: '2026-10-01',
        amount: 10000, quantity: 10, currency: 'INR',
        script: 'TCS', symbol: 'TCS.NS',
      },
      {
        id: 'tx2', holding_id: 'h1', type: 'sell', date: '2026-11-01',
        amount: 5000, quantity: 5, currency: 'INR',
        script: 'TCS', symbol: 'TCS.NS',
      },
      {
        id: 'tx3', holding_id: 'h2', type: 'dividend', date: '2026-09-15',
        amount: 300, currency: 'INR',
        script: 'Infosys', symbol: 'INFY.NS',
      },
    ],
    holdings: [
      { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
        stocks_owned: 5, avg_cost_price: 1000 },
      { id: 'h2', script: 'Infosys', symbol: 'INFY.NS', currency: 'INR', exchange: 'NSE',
        stocks_owned: 100, avg_cost_price: 1500 },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

vi.mock('../../features/transactions/TradeImportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Import transactions"><button onClick={onClose}>Close</button></div>,
}))

vi.mock('../transactions/Ui2HoldingLedger', () => ({
  Ui2HoldingLedger: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Holding ledger"><button onClick={onClose}>Close ledger</button></div>,
}))

vi.mock('../shell/Ui2PageIntro', () => ({
  Ui2PageIntro: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
    <header><h1>{title}</h1>{actions}</header>,
}))

describe('Ui2TransactionsPage', () => {
  beforeEach(() => { document.documentElement.setAttribute('data-ui', 'ui2') })

  it('renders all transactions by default', () => {
    render(<Ui2TransactionsPage />)
    expect(screen.getByRole('table', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(4) // 1 header + 3 rows
  })

  it('filters by search text', async () => {
    render(<Ui2TransactionsPage />)
    await userEvent.type(screen.getByRole('searchbox'), 'TCS')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3) // header + 2 TCS rows
  })

  it('filters by event type', async () => {
    render(<Ui2TransactionsPage />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by event type' }), 'dividend')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(2) // header + 1 dividend
  })

  it('opens the holding ledger when Open ledger is clicked', async () => {
    render(<Ui2TransactionsPage />)
    const buttons = screen.getAllByRole('button', { name: /open ledger/i })
    await userEvent.click(buttons[0])
    expect(screen.getByRole('dialog', { name: 'Holding ledger' })).toBeInTheDocument()
  })

  it('opens trade import dialog', async () => {
    render(<Ui2TransactionsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import transactions' })).toBeInTheDocument()
  })

  it('shows currency summary panels', () => {
    render(<Ui2TransactionsPage />)
    expect(screen.getByRole('region', { name: 'INR transaction totals' })).toBeInTheDocument()
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/transactions/Ui2TransactionsPage.test.tsx 2>&1 | tail -8
```

Expected: 6 tests pass.

* [ ] Commit: `git add frontend/src/ui2/transactions/Ui2TransactionsPage.test.tsx`

---

### Task 6 — Create `Ui2TradeImport.tsx` (slice 17)

**Files:**

* `frontend/src/ui2/transactions/Ui2TradeImport.tsx` (create)

The Classic `TradeImportModal` wraps the whole import flow in `modalBackdrop`/`modalCard`. For UI_2.0 the outer chrome is `Ui2Dialog` and the inner form uses `ui2-btn`. The pure logic — `parseTradeCsv`, `NameConfirmDialog`, `ImportTables`, `api.importTrades`, the step state machine — is reused unchanged. Only the shell and styling differ.

* [ ] Create `frontend/src/ui2/transactions/Ui2TradeImport.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { todayIST } from '../../lib/formDates'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import { ImportCounts, InvalidLines, type InvalidLine } from '../../features/imports/ImportTables'
import NameConfirmDialog, { type Answers } from '../../features/imports/NameConfirmDialog'
import { parseTradeCsv } from '../../features/transactions/tradeCsv'
import { Ui2Dialog } from '../shell/Ui2Dialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const EMPTY: TradeImportPreview = { counts: { ready: 0, replace: 0, covered: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] }
const open = (preview: TradeImportPreview, answers: Answers, created: string[]) =>
  preview.names.filter(name => (name.status === 'needs_confirmation' || name.status === 'ambiguous')
    && !(name.sheet_name in answers) && !created.includes(name.sheet_name))

interface Props {
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

export function Ui2TradeImport({ holdings, userId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [text, setText] = useState('')
  const [parse, setParse] = useState<{ preview: TradeImportPreview; invalid: InvalidLine[] } | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [created, setCreated] = useState<string[]>([])
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) { setError('File is too large (max 1 MB).'); return }
    setText(await file.text())
  }

  function handleParse() {
    setError(null)
    try {
      const { preview, invalid } = parseTradeCsv(text, holdings, todayIST())
      setParse({ preview, invalid })
      const needsNames = open(preview, answers, created)
      setStep(needsNames.length ? 'names' : 'preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleAnswers(newAnswers: Answers, newCreated: string[]) {
    setAnswers(newAnswers)
    setCreated(newCreated)
    setStep('preview')
  }

  async function handleConfirm() {
    if (!parse) return
    setSaving(true)
    setError(null)
    try {
      const rows: TradeImportRow[] = parse.preview.rows.map(row => ({ ...row, ...answers }))
      const importResult = await api.importTrades({ rows, replace: true, as_of: todayIST() }, userId)
      setResult(importResult)
      setStep('result')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const title = step === 'names' ? 'Confirm unknown holdings'
    : step === 'preview' ? 'Preview import'
    : step === 'result' ? 'Import complete'
    : 'Import transactions'

  return (
    <Ui2Dialog title={title} onClose={onClose}>
      {step === 'pick' && (
        <div>
          <p className="ui2-note">Upload a Groww trade export or paste its CSV contents. Imports replace duplicate events.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose CSV file"
              onChange={event => { const file = event.target.files?.[0]; if (file) handleFile(file) }}
            />
          </div>
          <textarea
            aria-label="CSV contents"
            placeholder="Or paste CSV contents here"
            value={text}
            onChange={event => setText(event.target.value)}
            style={{ width: '100%', height: 160, border: '1px solid var(--u2-border)', borderRadius: 8,
              padding: 12, background: 'var(--u2-bg)', color: 'var(--u2-text)', resize: 'vertical' }}
          />
          <p className="ui2-note">Required columns: Symbol, Type, Quantity, Value, Exchange, Execution date and time.</p>
          {error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{error}</p>}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="ui2-btn ui2-btn-primary" disabled={!text.trim()} onClick={handleParse}>
              Validate CSV
            </button>
          </div>
        </div>
      )}

      {step === 'names' && parse && (
        <NameConfirmDialog
          names={open(parse.preview, answers, created)}
          existingHoldings={holdings}
          onConfirm={handleAnswers}
          onCancel={onClose}
        />
      )}

      {step === 'preview' && parse && (
        <div>
          <ImportCounts counts={parse.preview.counts} />
          {parse.invalid.length > 0 && <InvalidLines lines={parse.invalid} />}
          {parse.preview.warnings.map((warning, index) =>
            <p key={index} className="ui2-note" role="alert">{warning}</p>)}
          {error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{error}</p>}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={() => setStep('pick')}>Back</button>
            <button
              type="button"
              className="ui2-btn ui2-btn-primary"
              disabled={saving || parse.preview.counts.ready === 0}
              onClick={handleConfirm}
            >
              {saving ? 'Importing…' : `Import ${parse.preview.counts.ready} trade${parse.preview.counts.ready !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div>
          <p><strong>{result.imported} trade{result.imported !== 1 ? 's' : ''} imported</strong>
            {result.replaced > 0 ? `, ${result.replaced} replaced` : ''}.
          </p>
          <p className="ui2-note">Your holdings have been updated.</p>
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={onImported}>Done</button>
          </div>
        </div>
      )}
    </Ui2Dialog>
  )
}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit 2>&1 | grep Ui2TradeImport` → no errors.

* [ ] Commit: `git add frontend/src/ui2/transactions/Ui2TradeImport.tsx`

---

### Task 7 — Wire `TradeImportModal` to dispatch for UI_2.0

**Files:**

* `frontend/src/features/transactions/TradeImportModal.tsx` (modify)

The guard pattern is identical to task 4: add `useUiMode()` and return `<Ui2TradeImport>` for UI_2.0, leaving the existing Classic path untouched. The `TradeImportModal` already receives `holdings`, `userId`, `onClose`, and `onImported` as props; the UI_2.0 guard passes all four through so act-as admins import into the viewed user's portfolio, not their own.

* [ ] In `frontend/src/features/transactions/TradeImportModal.tsx`, add at the top after existing imports:

```tsx
import { useUiMode } from '../../lib/uiMode'
import { Ui2TradeImport } from '../../ui2/transactions/Ui2TradeImport'
```

At the start of `TradeImportModal`'s function body:

```tsx
export default function TradeImportModal({ holdings, userId, onClose, onImported }: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2TradeImport holdings={holdings} userId={userId} onClose={onClose} onImported={onImported} />
  // … rest of Classic body unchanged
```

* [ ] Verify Classic test is unaffected:

```bash
cd frontend && npx vitest run src/features/transactions/TradeImport.test.tsx 2>&1 | tail -6
```

Expected: all tests pass.

* [ ] Commit: `git add frontend/src/features/transactions/TradeImportModal.tsx`

---

### Task 8 — Write `Ui2TradeImport.test.tsx`

**Files:**

* `frontend/src/ui2/transactions/Ui2TradeImport.test.tsx` (create)

Tests confirm: validation rejects an empty paste, a valid CSV moves to preview, and the Done button calls `onImported` after a successful API call.

* [ ] Create `frontend/src/ui2/transactions/Ui2TradeImport.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2TradeImport } from './Ui2TradeImport'
import type { Holding } from '../../types'

const HOLDINGS: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
    stocks_owned: 10, avg_cost_price: 1000 },
]

vi.mock('../../features/transactions/tradeCsv', () => ({
  parseTradeCsv: (_text: string, _holdings: Holding[]) => ({
    preview: { counts: { ready: 2, replace: 0, covered: 0, invalid: 0, total: 2 }, names: [], rows: [
      { symbol: 'TCS.NS', type: 'buy', date: '2026-10-01', quantity: 5, amount: 5000 },
      { symbol: 'TCS.NS', type: 'buy', date: '2026-11-01', quantity: 5, amount: 5500 },
    ], warnings: [] },
    invalid: [],
  }),
}))

vi.mock('../../lib/api/client', () => ({
  api: { importTrades: vi.fn().mockResolvedValue({ imported: 2, replaced: 0 }) },
  ApiError: class ApiError extends Error {},
}))

vi.mock('../shell/Ui2Dialog', () => ({
  Ui2Dialog: ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) =>
    <div role="dialog" aria-label={title}><h2>{title}</h2>{children}</div>,
}))

vi.mock('../../features/imports/NameConfirmDialog', () => ({
  default: () => <div>NameConfirmDialog</div>,
}))

vi.mock('../../features/imports/ImportTables', () => ({
  ImportCounts: ({ counts }: { counts: { ready: number } }) => <p>{counts.ready} ready</p>,
  InvalidLines: () => null,
}))

describe('Ui2TradeImport', () => {
  const onClose = vi.fn()
  const onImported = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })

  it('disables Validate when no text is entered', () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    expect(screen.getByRole('button', { name: 'Validate CSV' })).toBeDisabled()
  })

  it('advances to preview after valid parse', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'CSV contents' }), 'some,csv,content')
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    expect(screen.getByRole('dialog', { name: 'Preview import' })).toBeInTheDocument()
    expect(screen.getByText('2 ready')).toBeInTheDocument()
  })

  it('calls onImported after successful import', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'CSV contents' }), 'some,csv,content')
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import 2 trades' }))
    expect(screen.getByRole('dialog', { name: 'Import complete' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalledOnce()
  })
})
```

* [ ] Verify:

```bash
cd frontend && npx vitest run src/ui2/transactions/Ui2TradeImport.test.tsx 2>&1 | tail -6
```

Expected: 3 tests pass.

* [ ] Commit: `git add frontend/src/ui2/transactions/Ui2TradeImport.test.tsx`

---

### Task 9 — Full test run and lint

* [ ] Run all transaction-related tests:

```bash
cd frontend && npx vitest run src/features/transactions/ src/ui2/transactions/ 2>&1 | tail -10
```

Expected: all tests pass, no regressions in `TransactionsPage.test.tsx` or `TradeImport.test.tsx`.

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

### Task 10 — Update the status board

**Files:**

* `docs/plans/PD-059-ui-2-status.md` (modify)

Both implementation PRs have merged: #364 delivered slice 16 and #366 delivered slice 17. Their status-board rows are marked merged.

* [x] Confirm slice 16 is merged as #364.
* [x] Confirm slice 17 is merged as #366.
* [x] Record both merge states on the status board.
* [x] Commit the status update on the Wave 5a planning branch.

---

## 6. End-to-end verification scenarios

After both slices merge, an account with `ui_mode = ui2` should:

1. Navigate to `/transactions` → see `Ui2TransactionsPage` with summary panels and paginated table.
2. Type in the search box → table filters to matching holdings only.
3. Select an event type → only rows of that type appear.
4. Click "Open ledger" on any row → `Ui2HoldingLedger` dialog opens; add/edit/delete works; dialog closes and table refreshes.
5. Click "Import CSV" → `Ui2TradeImport` dialog opens; paste a valid Groww CSV → Validate → Preview shows counts → Import → "Done" refreshes the page.
6. Switch to Classic (settings) → `/transactions` shows the original `TransactionsPage` unchanged.

Classic and Glass accounts never see `Ui2TransactionsPage` or `Ui2TradeImport`.

---

## Done

* [x] `feat/PD-059-transactions-page` merged as #364 → slice 16 live.
* [x] `feat/PD-059-trade-import` merged as #366 → slice 17 live.
* [x] Status board updated with PR numbers and "merged" state.

**Next:** Wave 5a plan amendment (roadmap R03) is in progress on `docs/PD-059-wave5a-dividends`. Slice 18 — Dividends page — follows after that plan merges.
