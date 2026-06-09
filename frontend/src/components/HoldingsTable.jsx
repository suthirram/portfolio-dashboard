import React, { useState } from 'react'

const INR = (n) => {
  if (n === undefined || n === null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-₹' : '₹') + s
}
const EUR = (n) => {
  if (n === undefined || n === null || isNaN(n)) return '—'
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 ? '-€' : '€') + s
}
const NUM = (n) => (n === undefined || n === null || isNaN(n) || n === 0) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 3 })

const PNL = ({ inr, eur }) => {
  if (!inr && inr !== 0) return <td colSpan={2} style={{ color: 'var(--text-muted)' }}>—</td>
  const cls = inr > 0 ? 'pos' : inr < 0 ? 'neg' : 'neutral'
  return (
    <>
      <td className={`mono ${cls}`}>{INR(inr)}</td>
      <td className={`mono ${cls}`} style={{ color: inr > 0 ? 'rgba(0,200,150,0.7)' : inr < 0 ? 'rgba(255,77,109,0.7)' : undefined }}>{EUR(eur)}</td>
    </>
  )
}

const TH = ({ children, style }) => (
  <th style={{
    padding: '10px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', ...style,
  }}>
    {children}
  </th>
)
const TD = ({ children, style, className }) => (
  <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid var(--border)', ...style }} className={className}>
    {children}
  </td>
)

export default function HoldingsTable({ holdings, loading, onEdit, onDelete }) {
  const [sortKey, setSortKey] = useState('script')
  const [sortDir, setSortDir] = useState(1)
  const [confirm, setConfirm] = useState(null)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  const sorted = [...(holdings || [])].sort((a, b) => {
    let av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
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

  const SortIcon = ({ k }) => sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''

  const colHead = (label, key) => (
    <TH style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span onClick={() => toggleSort(key)} style={{ color: sortKey === key ? 'var(--text-primary)' : undefined }}>
        {label}<SortIcon k={key} />
      </span>
    </TH>
  )

  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <TH style={{ textAlign: 'left', width: 160 }}>Script</TH>
            {colHead('Shares', 'stocks_owned')}
            {colHead('Avg Cost/Sh', 'avg_cost_price')}
            <TH>Cost Price</TH>
            <TH style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            {colHead('Share Price', 'current_price')}
            <TH>Current Value</TH>
            <TH style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            <TH>Money in Making</TH>
            <TH style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            <TH>Money Made</TH>
            <TH style={{ color: 'var(--text-muted)', fontSize: 10 }}>in €</TH>
            <TH style={{ textAlign: 'center', width: 90 }}>Actions</TH>
          </tr>
        </thead>

        <tbody>
          {sorted.length === 0 && !loading && (
            <tr>
              <td colSpan={14} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                No holdings yet. Click "Add Holding" to get started.
              </td>
            </tr>
          )}

          {sorted.map((h) => {
            const hasPrice = h.current_price > 0
            const unrealCls = !hasPrice ? '' : h.unrealized_pnl > 0 ? 'pos' : h.unrealized_pnl < 0 ? 'neg' : 'neutral'
            const realCls = h.realized_pnl > 0 ? 'pos' : h.realized_pnl < 0 ? 'neg' : 'neutral'

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
                    <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 1 }} title={h.price_error}>⚠ price unavail.</div>
                  )}
                </TD>

                {/* Shares */}
                <TD className="mono">{NUM(h.stocks_owned)}</TD>

                {/* Avg cost — shown in the holding's native currency */}
                <TD className="mono">{h.avg_cost_price ? (h.currency === 'EUR' ? EUR(h.avg_cost_price) : INR(h.avg_cost_price)) : '—'}</TD>

                {/* Cost price */}
                <TD className="mono">{h.cost_price ? INR(h.cost_price) : '—'}</TD>
                <TD className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.cost_price_eur ? EUR(h.cost_price_eur) : '—'}</TD>

                {/* Share price — in the holding's native currency */}
                <TD className="mono" style={{ color: hasPrice ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {hasPrice ? (h.currency === 'EUR' ? EUR(h.current_price) : INR(h.current_price)) : h.price_error ? <span style={{ color: 'var(--text-muted)' }}>—</span> : <span className="spinner" style={{ width: 12, height: 12, display: 'inline-block' }} />}
                </TD>

                {/* Current value */}
                <TD className="mono">{h.current_value ? INR(h.current_value) : '—'}</TD>
                <TD className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{h.current_value_eur ? EUR(h.current_value_eur) : '—'}</TD>

                {/* Unrealised (money in making) */}
                <TD className={`mono ${unrealCls}`}>
                  {hasPrice ? INR(h.unrealized_pnl) : '—'}
                </TD>
                <TD className={`mono ${unrealCls}`} style={{ fontSize: 12, opacity: 0.75 }}>
                  {hasPrice ? EUR(h.unrealized_pnl_eur) : '—'}
                </TD>

                {/* Realised (money made) — in the holding's native currency */}
                <TD className={`mono ${h.realized_pnl !== 0 ? realCls : 'neutral'}`}>
                  {h.realized_pnl !== 0 ? (h.currency === 'EUR' ? EUR(h.realized_pnl) : INR(h.realized_pnl)) : '—'}
                </TD>
                <TD className={`mono ${h.realized_pnl !== 0 ? realCls : 'neutral'}`} style={{ fontSize: 12, opacity: 0.75 }}>
                  {h.realized_pnl !== 0 ? EUR(h.realized_pnl_eur) : '—'}
                </TD>

                {/* Actions */}
                <TD style={{ textAlign: 'center' }}>
                  {confirm === h.id ? (
                    <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => { onDelete(h.id); setConfirm(null) }}
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
                      <button onClick={() => onEdit(h)}
                        style={{ background: 'var(--blue-dim)', color: 'var(--blue)', padding: '3px 10px', border: '1px solid rgba(79,142,247,0.2)' }}>
                        Edit
                      </button>
                      <button onClick={() => setConfirm(h.id)}
                        style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '3px 10px', border: '1px solid rgba(255,77,109,0.2)' }}>
                        Del
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
              <td colSpan={2} style={{ borderBottom: '1px solid var(--border)' }} />
              <TD className="mono">{INR(totals.cost)}</TD>
              <TD className="mono" style={{ fontSize: 12 }}>{EUR(totals.costEur)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
              <TD className="mono">{INR(totals.value)}</TD>
              <TD className="mono" style={{ fontSize: 12 }}>{EUR(totals.valueEur)}</TD>
              <TD className={`mono ${totals.unreal >= 0 ? 'pos' : 'neg'}`}>{INR(totals.unreal)}</TD>
              <TD className={`mono ${totals.unreal >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12 }}>{EUR(totals.unrealEur)}</TD>
              <TD className={`mono ${totals.real >= 0 ? 'pos' : 'neg'}`}>{INR(totals.real)}</TD>
              <TD className={`mono ${totals.real >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 12 }}>{EUR(totals.realEur)}</TD>
              <td style={{ borderBottom: '1px solid var(--border)' }} />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
