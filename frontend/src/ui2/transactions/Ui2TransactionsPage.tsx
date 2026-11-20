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
import { Ui2ActAsBanner } from '../shell/Ui2ActAsBanner'
import { Ui2InvestmentDelta } from './Ui2InvestmentDelta'
import { TransactionCurrency, currencyFlag } from './TransactionCurrency'
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

interface Props { actAsUserId?: string; actAsLabel?: string }

export function Ui2TransactionsPage({ actAsUserId, actAsLabel }: Props) {
  const { transactions, holdings, loading, error, refresh } = useAllTransactions(actAsUserId)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<Sort>(defaultSort)
  const [ledger, setLedger] = useState<HoldingWithPrice | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  // Bumped after each ledger write or import so the investment delta reloads
  // the healed figures.
  const [ledgerVersion, setLedgerVersion] = useState(0)
  const ledgerChanged = () => { void refresh(); setLedgerVersion(version => version + 1) }

  const rows = useMemo(() => sortRows(applyFilters(transactions, filters), sort), [transactions, filters, sort])
  const currencies = useMemo(() => currencyFacet(transactions), [transactions])
  const types = useMemo(() => typeFacet(transactions), [transactions])
  const subtotals = useMemo(() => currencySubtotals(rows), [rows])
  const cols = useMemo(() => visibleColumns(rows), [rows])
  const resetKey = useMemo(
    () => filters.search + filters.holdingIds.join() + filters.types.join() + filters.currencies.join() + filters.from + filters.to + sort.key + sort.dir,
    [filters, sort],
  )
  const pagination = usePagination(rows, resetKey, PAGE_SIZE)
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

  return (
    <div className="u2-tx-page">
      {actAsLabel && <Ui2ActAsBanner label={actAsLabel} />}
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
              <div className="u2-tx-summary-eyebrow"><TransactionCurrency currency={sub.currency} /> · filtered totals</div>
              <div className="u2-tx-totals">
                <div><span>Bought</span><strong>{money(sub.bought, sub.currency)}</strong></div>
                <div><span>Sold</span><strong>{money(sub.sold, sub.currency)}</strong></div>
                <div><span>Dividends</span><strong>{money(sub.dividends, sub.currency)}</strong></div>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* The investment delta reads the signed-in account's own ledger, so
          it is not shown in act-as (same as Classic). */}
      {!actAsUserId && <Ui2InvestmentDelta refreshKey={ledgerVersion} />}

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
          <select
            className="u2-tx-filter-select"
            aria-label="Filter by holding"
            value={filters.holdingIds[0] ?? ''}
            onChange={event => setFilter('holdingIds', event.target.value ? [event.target.value] : [])}
          >
            <option value="">All holdings</option>
            {holdings.map(holding => (
              <option key={holding.id} value={holding.id ?? ''}>{holding.script ?? holding.symbol}</option>
            ))}
          </select>
          {currencies.length > 1 && (
            <select
              className="u2-tx-filter-select"
              aria-label="Filter by currency"
              value={filters.currencies[0] ?? ''}
              onChange={event => setFilter('currencies', event.target.value ? [event.target.value] : [])}
            >
              <option value="">All currencies</option>
                {currencies.map(code => <option key={code} value={code}>{currencyFlag(code)} {code}</option>)}
            </select>
          )}
          <select
            className="u2-tx-filter-select"
            aria-label="Filter by event type"
            value={filters.types[0] ?? ''}
            onChange={event => setFilter('types', event.target.value ? [event.target.value as typeof filters.types[0]] : [])}
          >
            <option value="">All event types</option>
            {types.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
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
          <button type="button" className="ui2-btn" onClick={() => setFilters(emptyFilters)}>
            Clear filters
          </button>
        </div>

        {loading && <p className="ui2-note" aria-live="polite">Loading transactions…</p>}

        {/* A failed load keeps the page and its filters usable, with a way to
            retry, instead of replacing everything with the error. */}
        {error && (
          <div className="ui2-notice" role="alert">
            <div>
              <strong>Transactions could not load</strong>
              <span>{error}</span>
            </div>
            <button type="button" className="ui2-btn" onClick={() => void refresh()}>Try again</button>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <p className="ui2-note">No transactions match the current filters.</p>
        )}

        {!loading && rows.length > 0 && (
          <>
            <div className="u2-tx-scroll">
              <table className="ui2-table u2-tx-table" aria-label="Transactions">
                <thead>
                  <tr>
                    <th scope="col" className="u2-left">
                      <button type="button" className="u2-sort-btn" onClick={() => handleSort('date')}>
                        Date{sortIndicator('date')}
                      </button>
                    </th>
                    <th scope="col" className="u2-left">
                      <button type="button" className="u2-sort-btn" onClick={() => handleSort('holding')}>
                        Holding{sortIndicator('holding')}
                      </button>
                    </th>
                    <th scope="col" className="u2-left">
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
                    <th scope="col" className="u2-center">Currency</th>
                    {cols.notes && <th scope="col" className="u2-left">Notes</th>}
                    <th scope="col" className="u2-center"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((txn: TransactionWithHolding) => {
                    const holding = holdingMap.get(txn.holding_id ?? '')
                    const sym = holding?.symbol ?? txn.symbol ?? ''
                    const icon = sym.split('.')[0].slice(0, 4)
                    const currency = txn.currency ?? holding?.currency ?? 'INR'
                    const implied = impliedCostPerShare(txn)
                    return (
                      <tr key={txn.id}>
                        <td className="u2-left">{txn.date ? formatDate(txn.date) : '—'}</td>
                        <td className="u2-left">
                          <div className="u2-holding">
                            <div className="u2-stock-icon" style={stockIconStyle(sym)} aria-hidden="true">{icon}</div>
                            <div>
                              <strong style={{ fontSize: 11, fontWeight: 700 }}>{txn.script ?? txn.symbol ?? '—'}</strong>
                              <small>{sym}{holding?.exchange ? ` · ${holding.exchange}` : ''}</small>
                            </div>
                          </div>
                        </td>
                        <td className="u2-left"><span className={txTagClass(txn.type)}>{txn.type ?? '—'}</span></td>
                        {cols.quantity && <td>{txn.quantity != null && txn.quantity !== 0 ? formatQuantity(txn.quantity) : '—'}</td>}
                        <td><strong>{money(txn.amount, currency)}</strong></td>
                        {cols.impliedCost && <td>{implied != null ? money(implied, currency) : '—'}</td>}
                        {cols.ratio && <td>{txn.ratio != null && txn.ratio !== 0 ? txn.ratio : '—'}</td>}
                        {cols.realizedSeed && <td>{txn.realized_seed != null && txn.realized_seed !== 0 ? money(txn.realized_seed, currency) : '—'}</td>}
                        {cols.openingDate && <td>{txn.type === 'opening' ? (txn.opening_date ?? '—') : ''}</td>}
                        <td className="u2-center"><TransactionCurrency currency={currency} /></td>
                        {cols.notes && <td className="u2-left">{txn.notes || '—'}</td>}
                        <td className="u2-center">
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
          onChanged={ledgerChanged}
        />
      )}

      {/* Trade import */}
      {importOpen && (
        <TradeImportModal
          holdings={holdings}
          userId={actAsUserId}
          onClose={() => setImportOpen(false)}
          onImported={() => { ledgerChanged(); setImportOpen(false) }}
        />
      )}
    </div>
  )
}
