import { useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { HoldingWithPrice } from '../../types'
import { EditIcon, TrashIcon, AlertTriangleIcon, ListIcon } from '../../components/Icon'
import { filterByView, viewCounts, type HoldingView } from './holdingViews'
import {
  computeGroupDayGain,
  holdingDayGain,
  holdingMovement,
  type HoldingWithPreviousClose,
} from './dashboardPriceMovement'
import { currencySymbol } from '../../lib/currency'

const INR = (amount?: number | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '—'
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (amount < 0 ? '-₹' : '₹') + formatted
}
const EUR = (amount?: number | null) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '—'
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (amount < 0 ? '-€' : '€') + formatted
}
const NUM = (amount?: number | null) => (amount === undefined || amount === null || isNaN(amount) || amount === 0) ? '—' : amount.toLocaleString('en-IN', { maximumFractionDigits: 3 })
const SIGNED_MONEY = (amount: number, currency?: string | null) => {
  const abs = Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : ''
  const symbol = currencySymbol(currency)
  return `${sign}${symbol}${abs}`
}
const SIGNED_PCT = (pct: number) => `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct).toFixed(2)}%`

// HoldingWithPrice.cost_price/current_value/unrealized_pnl are always
// INR-denominated, even for a EUR holding — the backend converts the other
// way for the _eur twin (HoldingWithPriceToAPI). The native-currency amount
// for a EUR holding lives in the _eur field instead. (avg_cost_price,
// current_price, and realized_pnl are already native — no twin needed.)
const nativeCost       = (holding: HoldingWithPrice) => holding.currency === 'EUR' ? holding.cost_price_eur : holding.cost_price
const nativeValue      = (holding: HoldingWithPrice) => holding.currency === 'EUR' ? holding.current_value_eur : holding.current_value
const nativeUnrealized = (holding: HoldingWithPrice) => holding.currency === 'EUR' ? holding.unrealized_pnl_eur : holding.unrealized_pnl

interface CellProps {
  children?: ReactNode
  style?: CSSProperties
  className?: string
}

const TH = ({ children, style, className }: CellProps) => (
  <th className={className} style={{
    padding: '10px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    position: 'sticky', top: 'var(--nav-height)', zIndex: 1,
    background: 'var(--bg-secondary)',
    boxShadow: 'inset 0 -1px 0 var(--border)',
    ...style,
  }}>
    {children}
  </th>
)
const TD = ({ children, style, className }: CellProps) => (
  <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', ...style }} className={className}>
    {children}
  </td>
)

interface HoldingsTableProps {
  holdings: HoldingWithPreviousClose[]
  loading: boolean
  onEdit: (holding: HoldingWithPrice) => void
  onDelete: (id: string) => void
  /** Opens the per-holding transaction ledger. */
  onTransactions?: (holding: HoldingWithPrice) => void
  /** When set, the view tab strip is hidden and the table renders only the
   * holdings matching this view. Used when a parent (e.g. the currency-grouped
   * wrapper) owns a single shared view selector across multiple tables. */
  view?: HoldingView
  /** Currency the TOTAL row is formatted in; rows format per-holding. */
  nativeCurrency?: 'INR' | 'EUR'
}

export default function HoldingsTable({ holdings, loading, onEdit, onDelete, onTransactions, view: viewProp, nativeCurrency }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<keyof HoldingWithPrice>('script')
  const [sortDir, setSortDir] = useState(1)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [internalView, setInternalView] = useState<HoldingView>('active')
  const controlled = viewProp !== undefined
  const view = viewProp ?? internalView
  const setView = (nextView: HoldingView) => { if (!controlled) setInternalView(nextView) }

  const toggleSort = (key: keyof HoldingWithPrice) => {
    if (sortKey === key) setSortDir(direction => -direction)
    else { setSortKey(key); setSortDir(1) }
  }

  // Column hover highlight: tint every cell sharing the hovered cell's column
  // index (CSS can't do column-from-cell hover). Delegated on the table so it
  // works across header/body without per-cell wiring.
  const tableRef = useRef<HTMLTableElement>(null)
  const clearCol = () => tableRef.current?.querySelectorAll('.col-hl').forEach(cell => cell.classList.remove('col-hl'))
  const highlightCol = (e: ReactMouseEvent) => {
    const cell = (e.target as HTMLElement).closest('td, th') as HTMLTableCellElement | null
    const table = tableRef.current
    if (!table || !cell || !table.contains(cell)) return
    const idx = cell.cellIndex
    clearCol()
    if (idx < 0) return
    table.querySelectorAll(`tr > *:nth-child(${idx + 1})`).forEach(columnCell => columnCell.classList.add('col-hl'))
  }

  const counts = viewCounts(holdings)
  const visible = filterByView(holdings, view)

  const sorted = [...visible].sort((left, right) => {
    const rawA = left[sortKey]
    const rawB = right[sortKey]
    // Strings get an empty-string fallback so missing values sort consistently
    // alongside other strings; numbers fall back to 0 for the same reason.
    const isStringKey = typeof rawA === 'string' || typeof rawB === 'string'
    const av = isStringKey ? String(rawA ?? '').toLowerCase() : (rawA as number | undefined) ?? 0
    const bv = isStringKey ? String(rawB ?? '').toLowerCase() : (rawB as number | undefined) ?? 0
    return av < bv ? -sortDir : av > bv ? sortDir : 0
  })

  // Totals — summed in the table's native currency (the currency-grouped
  // wrapper renders one table per currency, so rows share a currency).
  const totals = sorted.reduce((acc, holding) => {
    acc.cost += nativeCost(holding) || 0
    acc.value += nativeValue(holding) || 0
    acc.unreal += nativeUnrealized(holding) || 0
    acc.real += holding.realized_pnl || 0
    acc.dividends += holding.total_dividends || 0
    return acc
  }, { cost: 0, value: 0, unreal: 0, real: 0, dividends: 0 })
  // The same group sum as the currency cards: null when a row with shares
  // has no previous close.
  const totalDayGain = computeGroupDayGain(sorted)
  const TOTAL_MONEY = nativeCurrency === 'EUR' ? EUR : INR

  const SortIcon = ({ k }: { k: keyof HoldingWithPrice }) => <>{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</>

  const colHead = (label: string, key: keyof HoldingWithPrice) => (
    <TH style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span onClick={() => toggleSort(key)} style={{ color: sortKey === key ? 'var(--text-primary)' : undefined }}>
        {label}<SortIcon k={key} />
      </span>
    </TH>
  )

  const segBtn = (key: HoldingView, label: string, count: number) => (
    <button
      key={key}
      type="button"
      className="seg-btn"
      aria-pressed={view === key}
      onClick={() => setView(key)}>
      {label}
      <span style={{
        marginLeft: 6, fontSize: 11, fontWeight: 500,
        color: 'var(--text-muted)', opacity: 0.8,
      }}>
        {count}
      </span>
    </button>
  )

  return (
    <>
    {!controlled && (
      <div className="seg-group" style={{ marginBottom: 10 }}>
        {segBtn('active', 'Holdings', counts.active)}
        {segBtn('all', 'All', counts.all)}
        {segBtn('nil', 'Nil', counts.nil)}
      </div>
    )}
    <div className="holdings-table-wrap" style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table ref={tableRef} onMouseOver={highlightCol} onMouseLeave={clearCol}
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <TH style={{ textAlign: 'left', width: 160 }}>Script</TH>
            {colHead('Shares', 'stocks_owned')}
            <TH>Cost Price</TH>
            <TH>{(<span onClick={() => toggleSort('avg_cost_price')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'avg_cost_price' ? 'var(--text-primary)' : undefined }}>Avg Cost/Sh<SortIcon k="avg_cost_price" /></span>)}</TH>
            {colHead('Share Price', 'current_price')}
            <TH>Current Value</TH>
            <TH>Day Gain</TH>
            <TH>Unrealised Gain</TH>
            <TH className="col-hide-sm">Realised Gain</TH>
            <TH className="col-hide-sm">Dividends</TH>
            <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
          </tr>
        </thead>

        <tbody>
          {sorted.length === 0 && !loading && (
            <tr>
              <td colSpan={10} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                {counts.all === 0
                  ? 'No holdings yet. Click "Add Holding" to get started.'
                  : view === 'nil'
                    ? 'No nil holdings. Fully-exited positions (0 shares) will appear here.'
                    : view === 'active'
                      ? 'No active holdings — all positions exited. Switch to "Nil" to see them.'
                      : 'No holdings match.'}
              </td>
            </tr>
          )}

          {sorted.map((holding) => {
            const hasPrice = (holding.current_price ?? 0) > 0
            const movement = holdingMovement(holding)
            const priceTone = movement?.tone ?? null
            const dayGain = holdingDayGain(holding)
            const unrealized = holding.unrealized_pnl ?? 0
            const realized = holding.realized_pnl ?? 0
            const unrealCls = !hasPrice ? '' : unrealized > 0 ? 'pos' : unrealized < 0 ? 'neg' : 'neutral'
            const realCls = realized > 0 ? 'pos' : realized < 0 ? 'neg' : 'neutral'
            const MONEY = holding.currency === 'EUR' ? EUR : INR

            return (
              <tr key={holding.id} style={{ background: 'var(--bg-card)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>

                {/* Script */}
                <TD style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{holding.script}</div>
                  {holding.symbol && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      {holding.symbol} · {holding.exchange} · {holding.type?.toUpperCase()}
                    </div>
                  )}
                  {holding.price_error && (
                    <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={holding.price_error}><AlertTriangleIcon size={10} /> price unavail.</div>
                  )}
                </TD>

                {/* Shares */}
                <TD className="mono">{NUM(holding.stocks_owned)}</TD>

                {/* Cost price — in the holding's native currency */}
                <TD className="mono">{nativeCost(holding) ? MONEY(nativeCost(holding)) : '—'}</TD>

                {/* Avg cost — color coded vs current share price */}
                {(() => {
                  const avgCls = holding.avg_cost_price && hasPrice
                    ? (holding.current_price! > holding.avg_cost_price ? 'pos' : holding.current_price! < holding.avg_cost_price ? 'neg' : 'neutral')
                    : ''
                  return (
                    <TD className={`mono${avgCls ? ` ${avgCls}` : ''}`}>
                      {holding.avg_cost_price ? (holding.currency === 'EUR' ? EUR(holding.avg_cost_price) : INR(holding.avg_cost_price)) : '—'}
                    </TD>
                  )
                })()}

                {/* Share price — in the holding's native currency */}
                <TD
                  className={`mono${priceTone ? ` ${priceTone}` : ''}`}
                  style={{ color: hasPrice && !priceTone ? 'var(--text-primary)' : hasPrice ? undefined : 'var(--text-muted)' }}
                >
                  {hasPrice ? (
                    <>
                      <div>{holding.currency === 'EUR' ? EUR(holding.current_price) : INR(holding.current_price)}</div>
                      {movement && (
                        <div style={{ fontSize: 10, lineHeight: 1.2, marginTop: 2, whiteSpace: 'nowrap' }}>
                          ({SIGNED_MONEY(movement.change, holding.currency)} / {SIGNED_PCT(movement.pct)})
                        </div>
                      )}
                    </>
                  ) : holding.price_error ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <span className="spinner" style={{ width: 12, height: 12, display: 'inline-block' }} />}
                </TD>

                {/* Current value */}
                <TD className="mono" style={{ fontWeight: 700, fontSize: 14, color: nativeValue(holding) ? 'var(--blue)' : undefined }}>{nativeValue(holding) ? MONEY(nativeValue(holding)) : '—'}</TD>

                {/* Day Gain — today's monetary move for this position */}
                <TD className={`mono${dayGain === null ? '' : dayGain > 0 ? ' pos' : dayGain < 0 ? ' neg' : ' neutral'}`}>
                  {dayGain === null ? '—' : (
                    <>
                      <div>{SIGNED_MONEY(dayGain, holding.currency)}</div>
                      {movement && <div style={{ fontSize: 10, lineHeight: 1.2, marginTop: 2, whiteSpace: 'nowrap' }}>{SIGNED_PCT(movement.pct)}</div>}
                    </>
                  )}
                </TD>

                {/* Unrealised gain */}
                <TD className={`mono ${unrealCls}`}>
                  {hasPrice ? MONEY(nativeUnrealized(holding)) : '—'}
                </TD>

                {/* Realised gain — in the holding's native currency */}
                <TD className={`mono col-hide-sm ${realized !== 0 ? realCls : 'neutral'}`}>
                  {realized !== 0 ? MONEY(holding.realized_pnl) : '—'}
                </TD>

                {/* Dividends received — ledger-derived, native currency (PRD-005 §9) */}
                <TD className={`mono col-hide-sm ${(holding.total_dividends ?? 0) > 0 ? 'pos' : 'neutral'}`}>
                  {(holding.total_dividends ?? 0) > 0 ? MONEY(holding.total_dividends) : '—'}
                </TD>

                {/* Actions */}
                <TD style={{ textAlign: 'center' }}>
                  {holding.id && confirm === holding.id ? (
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => { onDelete(holding.id!); setConfirm(null) }}
                        className="btn btn-sm btn-danger-solid">
                        Yes
                      </button>
                      <button onClick={() => setConfirm(null)} className="btn btn-sm">
                        No
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {onTransactions && (
                        <button onClick={() => onTransactions(holding)} disabled={!holding.id}
                          title="Transactions (ledger)" className="btn-row">
                          <ListIcon size={13} />
                        </button>
                      )}
                      <button onClick={() => onEdit(holding)} disabled={!holding.id}
                        title="Edit holding" className="btn-row btn-row-accent">
                        <EditIcon size={13} />
                      </button>
                      <button onClick={() => holding.id && setConfirm(holding.id)} disabled={!holding.id}
                        title="Delete holding" className="btn-row btn-row-danger">
                        <TrashIcon size={13} />
                      </button>
                    </span>
                  )}
                </TD>
              </tr>
            )
          })}
        </tbody>

        {sorted.length > 0 && (
          <tfoot>
            <tr style={{ background: 'var(--bg-secondary)', fontWeight: 700 }}>
              <TD style={{ textAlign: 'left', fontWeight: 700 }}>TOTAL</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
              <td className="col-hide-sm" style={{ borderBottom: '1px solid var(--border)' }} />
              <TD className="mono">{TOTAL_MONEY(totals.cost)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
              <TD className="mono">{TOTAL_MONEY(totals.value)}</TD>
              <TD className={`mono${totalDayGain === null ? '' : totalDayGain > 0 ? ' pos' : totalDayGain < 0 ? ' neg' : ' neutral'}`}>
                {totalDayGain === null ? '—' : SIGNED_MONEY(totalDayGain, nativeCurrency === 'EUR' ? 'EUR' : 'INR')}
              </TD>
              <TD className={`mono ${totals.unreal >= 0 ? 'pos' : 'neg'}`}>{TOTAL_MONEY(totals.unreal)}</TD>
              <TD className={`mono col-hide-sm ${totals.real >= 0 ? 'pos' : 'neg'}`}>{TOTAL_MONEY(totals.real)}</TD>
              <TD className={`mono col-hide-sm ${totals.dividends > 0 ? 'pos' : 'neutral'}`}>{TOTAL_MONEY(totals.dividends)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </>
  )
}
