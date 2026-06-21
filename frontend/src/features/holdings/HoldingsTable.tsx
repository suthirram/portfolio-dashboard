import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { HoldingWithPrice } from '../../types'
import { EditIcon, TrashIcon, AlertTriangleIcon, ListIcon } from '../../components/Icon'
import { filterByView, viewCounts, type HoldingView } from './holdingViews'

const INR = (n?: number | null) => {
  if (n === undefined || n === null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-₹' : '₹') + s
}
const EUR = (n?: number | null) => {
  if (n === undefined || n === null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-€' : '€') + s
}
const NUM = (n?: number | null) => (n === undefined || n === null || isNaN(n) || n === 0) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 3 })

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
  holdings: HoldingWithPrice[]
  loading: boolean
  onEdit: (holding: HoldingWithPrice) => void
  onDelete: (id: string) => void
  /** Opens the per-holding transaction ledger. */
  onTransactions?: (holding: HoldingWithPrice) => void
  /** When set, the view tab strip is hidden and the table renders only the
   * holdings matching this view. Used when a parent (e.g. the currency-grouped
   * wrapper) owns a single shared view selector across multiple tables. */
  view?: HoldingView
  /** Drives which money columns drop out on mobile: INR-native sections hide
   * the EUR conversion subcolumns, EUR-native sections hide the INR primary
   * columns and promote the EUR subcolumns to primary instead. */
  nativeCurrency?: 'INR' | 'EUR'
}

export default function HoldingsTable({ holdings, loading, onEdit, onDelete, onTransactions, view: viewProp, nativeCurrency }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<keyof HoldingWithPrice>('script')
  const [sortDir, setSortDir] = useState(1)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [internalView, setInternalView] = useState<HoldingView>('active')
  const controlled = viewProp !== undefined
  const view = viewProp ?? internalView
  const setView = (v: HoldingView) => { if (!controlled) setInternalView(v) }

  const toggleSort = (key: keyof HoldingWithPrice) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const counts = viewCounts(holdings)
  const visible = filterByView(holdings, view)

  const sorted = [...visible].sort((a, b) => {
    const rawA = a[sortKey]
    const rawB = b[sortKey]
    // Strings get an empty-string fallback so missing values sort consistently
    // alongside other strings; numbers fall back to 0 for the same reason.
    const isStringKey = typeof rawA === 'string' || typeof rawB === 'string'
    const av = isStringKey ? String(rawA ?? '').toLowerCase() : (rawA as number | undefined) ?? 0
    const bv = isStringKey ? String(rawB ?? '').toLowerCase() : (rawB as number | undefined) ?? 0
    return av < bv ? -sortDir : av > bv ? sortDir : 0
  })

  // Totals
  const totals = sorted.reduce((acc, h) => {
    acc.cost += h.cost_price || 0
    acc.costEur += h.cost_price_eur || 0
    acc.value += h.current_value || 0
    acc.valueEur += h.current_value_eur || 0
    acc.unreal += h.unrealized_pnl || 0
    acc.unrealEur += h.unrealized_pnl_eur || 0
    acc.real += h.realized_pnl || 0
    acc.realEur += h.realized_pnl_eur || 0
    return acc
  }, { cost: 0, costEur: 0, value: 0, valueEur: 0, unreal: 0, unrealEur: 0, real: 0, realEur: 0 })

  const SortIcon = ({ k }: { k: keyof HoldingWithPrice }) => <>{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</>

  const colHead = (label: string, key: keyof HoldingWithPrice) => (
    <TH style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span onClick={() => toggleSort(key)} style={{ color: sortKey === key ? 'var(--text-primary)' : undefined }}>
        {label}<SortIcon k={key} />
      </span>
    </TH>
  )

  const segBtn = (key: HoldingView, label: string, count: number) => {
    const active = view === key
    return (
      <button
        key={key}
        type="button"
        onClick={() => setView(key)}
        style={{
          background: active ? 'var(--bg-card)' : 'transparent',
          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
          border: 'none',
          padding: '6px 14px', fontSize: 12, fontWeight: active ? 600 : 500,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          boxShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
          transition: 'background 0.15s ease',
        }}>
        {label}
        <span style={{
          marginLeft: 6, fontSize: 11, fontWeight: 500,
          color: 'var(--text-muted)', opacity: 0.8,
        }}>
          {count}
        </span>
      </button>
    )
  }

  return (
    <>
    {!controlled && (
      <div style={{
        display: 'inline-flex', gap: 2, padding: 3, marginBottom: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
      }}>
        {segBtn('active', 'Holdings', counts.active)}
        {segBtn('all', 'All', counts.all)}
        {segBtn('nil', 'Nil', counts.nil)}
      </div>
    )}
    <div className={`holdings-table-wrap${nativeCurrency === 'EUR' ? ' native-eur' : ''}`} style={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <TH style={{ textAlign: 'left', width: 160 }}>Script</TH>
            {colHead('Shares', 'stocks_owned')}
            <TH className="col-hide-sm">{(<span onClick={() => toggleSort('avg_cost_price')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'avg_cost_price' ? 'var(--text-primary)' : undefined }}>Avg Cost/Sh<SortIcon k="avg_cost_price" /></span>)}</TH>
            <TH className="col-inr-amt">Cost Price</TH>
            <TH className="col-eur-amt" style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            {colHead('Share Price', 'current_price')}
            <TH className="col-inr-amt">Current Value</TH>
            <TH className="col-eur-amt" style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            <TH className="col-inr-amt">Money in Making</TH>
            <TH className="col-eur-amt" style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            <TH className="col-hide-sm">Money Made</TH>
            <TH className="col-hide-sm" style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
          </tr>
        </thead>

        <tbody>
          {sorted.length === 0 && !loading && (
            <tr>
              <td colSpan={14} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
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

          {sorted.map((h) => {
            const hasPrice = (h.current_price ?? 0) > 0
            const unrealized = h.unrealized_pnl ?? 0
            const realized = h.realized_pnl ?? 0
            const unrealCls = !hasPrice ? '' : unrealized > 0 ? 'pos' : unrealized < 0 ? 'neg' : 'neutral'
            const realCls = realized > 0 ? 'pos' : realized < 0 ? 'neg' : 'neutral'

            return (
              <tr key={h.id} style={{ background: 'var(--bg-card)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}>

                {/* Script */}
                <TD style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.script}</div>
                  {h.symbol && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      {h.symbol} · {h.exchange} · {h.type?.toUpperCase()}
                    </div>
                  )}
                  {h.price_error && (
                    <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={h.price_error}><AlertTriangleIcon size={10} /> price unavail.</div>
                  )}
                </TD>

                {/* Shares */}
                <TD className="mono">{NUM(h.stocks_owned)}</TD>

                {/* Avg cost — shown in the holding's native currency */}
                <TD className="mono col-hide-sm">{h.avg_cost_price ? (h.currency === 'EUR' ? EUR(h.avg_cost_price) : INR(h.avg_cost_price)) : '—'}</TD>

                {/* Cost price */}
                <TD className="mono col-inr-amt">{h.cost_price ? INR(h.cost_price) : '—'}</TD>
                <TD className="mono col-eur-amt" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.cost_price_eur ? EUR(h.cost_price_eur) : '—'}</TD>

                {/* Share price — in the holding's native currency */}
                <TD className="mono" style={{ color: hasPrice ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {hasPrice ? (h.currency === 'EUR' ? EUR(h.current_price) : INR(h.current_price)) : h.price_error ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <span className="spinner" style={{ width: 12, height: 12, display: 'inline-block' }} />}
                </TD>

                {/* Current value */}
                <TD className="mono col-inr-amt">{h.current_value ? INR(h.current_value) : '—'}</TD>
                <TD className="mono col-eur-amt" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.current_value_eur ? EUR(h.current_value_eur) : '—'}</TD>

                {/* Unrealised (money in making) */}
                <TD className={`mono col-inr-amt ${unrealCls}`}>
                  {hasPrice ? INR(h.unrealized_pnl) : '—'}
                </TD>
                <TD className={`mono col-eur-amt ${unrealCls}`} style={{ fontSize: 12, opacity: 0.75 }}>
                  {hasPrice ? EUR(h.unrealized_pnl_eur) : '—'}
                </TD>

                {/* Realised (money made) — in the holding's native currency */}
                <TD className={`mono col-hide-sm ${realized !== 0 ? realCls : 'neutral'}`}>
                  {realized !== 0 ? (h.currency === 'EUR' ? EUR(h.realized_pnl) : INR(h.realized_pnl)) : '—'}
                </TD>
                <TD className={`mono col-hide-sm ${realized !== 0 ? realCls : 'neutral'}`} style={{ fontSize: 12, opacity: 0.75 }}>
                  {realized !== 0 ? EUR(h.realized_pnl_eur) : '—'}
                </TD>

                {/* Actions */}
                <TD style={{ textAlign: 'center' }}>
                  {h.id && confirm === h.id ? (
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => { onDelete(h.id!); setConfirm(null) }}
                        style={{ background: 'var(--red)', color: '#fff', padding: '3px 8px', fontSize: 11 }}>
                        Yes
                      </button>
                      <button onClick={() => setConfirm(null)}
                        style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', padding: '3px 8px', fontSize: 11, border: '1px solid var(--border)' }}>
                        No
                      </button>
                    </span>
                  ) : (
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      {onTransactions && (
                        <button onClick={() => onTransactions(h)} disabled={!h.id}
                          title="Transactions (ledger)"
                          style={{
                            background: 'var(--bg-input)', color: 'var(--text-secondary)',
                            padding: '4px 8px', border: '1px solid var(--border)',
                            display: 'inline-flex', alignItems: 'center',
                          }}>
                          <ListIcon size={13} />
                        </button>
                      )}
                      <button onClick={() => onEdit(h)} disabled={!h.id}
                        title="Edit holding"
                        style={{
                          background: 'var(--blue-dim)', color: 'var(--blue)',
                          padding: '4px 8px', border: '1px solid rgba(79,142,247,0.2)',
                          display: 'inline-flex', alignItems: 'center',
                        }}>
                        <EditIcon size={13} />
                      </button>
                      <button onClick={() => h.id && setConfirm(h.id)} disabled={!h.id}
                        title="Delete holding"
                        style={{
                          background: 'var(--red-dim)', color: 'var(--red)',
                          padding: '4px 8px', border: '1px solid rgba(255,77,109,0.2)',
                          display: 'inline-flex', alignItems: 'center',
                        }}>
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
              <TD className="mono col-inr-amt">{INR(totals.cost)}</TD>
              <TD className="mono col-eur-amt" style={{ fontSize: 12 }}>{EUR(totals.costEur)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
              <TD className="mono col-inr-amt">{INR(totals.value)}</TD>
              <TD className="mono col-eur-amt" style={{ fontSize: 12 }}>{EUR(totals.valueEur)}</TD>
              <TD className={`mono col-inr-amt ${totals.unreal >= 0 ? 'pos' : 'neg'}`}>{INR(totals.unreal)}</TD>
              <TD className={`mono col-eur-amt ${totals.unreal >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12 }}>{EUR(totals.unrealEur)}</TD>
              <TD className={`mono col-hide-sm ${totals.real >= 0 ? 'pos' : 'neg'}`}>{INR(totals.real)}</TD>
              <TD className={`mono col-hide-sm ${totals.real >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12 }}>{EUR(totals.realEur)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </>
  )
}
