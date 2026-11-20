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
import { Ui2ActAsBanner } from '../shell/Ui2ActAsBanner'
import { AssetStats, type AssetStat } from '../asset/AssetStats'
import { AssetBarChart } from '../asset/AssetBarChart'
import { Ui2DeleteAllDividends, Ui2DeleteDividend, Ui2DividendEditor } from './Ui2DividendDialogs'
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

export function Ui2DividendsPage({ actAsUserId, actAsLabel }: { actAsUserId?: string; actAsLabel?: string }) {
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

  return (
    <>
      {actAsLabel && <Ui2ActAsBanner label={actAsLabel} />}
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

        {/* Until the tab's first response (ready) every figure would be the
            empty view's zero, so stats and counts wait and the table says
            it is loading; later refreshes keep the old figures meanwhile. */}
        {loading && ready && <p className="ui2-note" aria-live="polite">Loading…</p>}
        {error && (
          <div className="ui2-notice" role="alert">
            <div>
              <strong>Dividends could not load</strong>
              <span>{error}</span>
            </div>
            <button type="button" className="ui2-btn" onClick={() => void refresh()}>Try again</button>
          </div>
        )}

        {ready && <AssetStats stats={stats} />}

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
            {ready && <span className="asset-note">{visible.length} of {view.rows.length} payments</span>}
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
                    {!ready ? (
                      <tr>
                        <td colSpan={6} className="empty" aria-live="polite">
                          {error ? 'Payments could not load.' : 'Loading payments…'}
                        </td>
                      </tr>
                    ) : pagination.pageItems.length === 0 ? (
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
        <Ui2DividendEditor
          currency={currency}
          holdings={holdings}
          editing={editor.row}
          userId={actAsUserId}
          onClose={() => setEditor(null)}
          onSaved={after(() => setEditor(null))}
        />
      )}
      {deleting && (
        <Ui2DeleteDividend
          row={deleting}
          currency={currency}
          userId={actAsUserId}
          onClose={() => setDeleting(null)}
          onDeleted={after(() => setDeleting(null))}
        />
      )}
      {deletingAll && (
        <Ui2DeleteAllDividends
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
