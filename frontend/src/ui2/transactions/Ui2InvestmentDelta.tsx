import { useEffect, useRef, useState } from 'react'
import type { MonthlyInvestment } from '../../features/history/historyShared'
import { MIN_YEAR, PERFORMANCE_COLUMN_LABELS, PERFORMANCE_COLUMN_SYMBOL } from '../../features/history/historyShared'
import { InvestmentDeltaChart } from '../../features/transactions/InvestmentDeltaChart'
import { useInvestmentDelta } from '../../features/transactions/useInvestmentDelta'
import { useAuthOptional } from '../../features/auth/AuthContext'
import { useTheme } from '../../lib/useTheme'

const OPEN_KEY = 'pd_u2_txn_delta_open'

function TeaserSparkline({ months }: { months: MonthlyInvestment[] }) {
  const deltas = months.map(m => m.delta ?? 0)
  const validInvested = months.map(m => m.invested).filter((v): v is number => v !== null)
  const maxDelta = Math.max(...deltas, 1)
  const minInv = validInvested.length ? Math.min(...validInvested) : 0
  const maxInv = validInvested.length ? Math.max(...validInvested, 1) : 1
  const W = 80, H = 22, step = W / 12
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {deltas.map((d, i) => {
        const bh = Math.max(1, (d / maxDelta) * 16)
        return <rect key={i} x={i * step + 1} y={H - bh} width={step - 2} height={bh} rx={1} fill="currentColor" opacity={0.45} />
      })}
      {validInvested.length > 1 && (
        <polyline fill="none" stroke="currentColor" strokeWidth={1.5}
          points={months.map((m, i) => {
            if (m.invested === null) return null
            const y = H - 2 - ((m.invested - minInv) / (maxInv - minInv || 1)) * 14
            return `${i * step + step / 2},${y}`
          }).filter(Boolean).join(' ')} />
      )}
    </svg>
  )
}

// Investment delta inline on the UI_2.0 Transactions page (PD-059 R22).
// Collapsible with a mini sparkline teaser when closed — stays inline, no
// sub-route (R33 resolved as inline).
export function Ui2InvestmentDelta({ refreshKey }: { refreshKey: number }) {
  const auth = useAuthOptional()
  const { theme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const [open, setOpen] = useState(() => {
    try { return window.localStorage?.getItem(OPEN_KEY) === '1' } catch { return false }
  })
  const { fromHistory, year, setYear, currentYear, ready, error, columns, column, setPicked, months } =
    useInvestmentDelta({ active: true, refreshKey })

  const bodyRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    setOpen(wasOpen => {
      const next = !wasOpen
      try { window.localStorage?.setItem(OPEN_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  // Keep the collapsed body inert so its buttons are removed from tab order
  // and the accessibility tree while the chart is hidden.
  useEffect(() => {
    bodyRef.current?.toggleAttribute('inert', !open)
  }, [open])

  const sym = column ? PERFORMANCE_COLUMN_SYMBOL[column] : '₹'
  const netChange = months.reduce((s, m) => s + (m.delta ?? 0), 0)

  return (
    <section className="ui2-panel u2-tx-delta" aria-label="Investment delta">
      <div className="u2-tx-delta-banner" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle}
        onKeyDown={e => {
          // Only activate when the banner itself is focused, not an inner button,
          // to avoid a double-toggle when Enter/Space fires then the button's
          // native click also fires.
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') toggle()
        }}>
        <div className="u2-tx-delta-title-col">
          <span className="u2-tx-delta-title">Investment delta</span>
          <span className="u2-tx-delta-year-badge">{year}</span>
          <p className="u2-tx-delta-sub">Monthly investment and sales by year</p>
        </div>
        <div className="u2-tx-delta-banner-right">
          {!open && ready && months.length > 0 && (
            <div className="u2-tx-delta-teaser">
              <TeaserSparkline months={months} />
              <span className="u2-tx-delta-teaser-val">
                {netChange >= 0 ? '+' : '−'}{sym}{Math.abs(netChange).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          <button type="button" className="ui2-btn u2-tx-delta-toggle"
            onClick={e => { e.stopPropagation(); toggle() }}>
            {open ? 'Hide chart ▴' : 'Show chart ▾'}
          </button>
        </div>
      </div>
      <div ref={bodyRef} className={`u2-tx-delta-body${open ? ' is-open' : ''}`}>
        <div className="u2-tx-delta-inner">
          <div className="u2-tx-delta-panel">
            <div className="u2-tx-delta-controls">
              <div className="u2-tx-delta-year">
                <button type="button" className="ui2-btn" aria-label="Previous year"
                  disabled={year <= MIN_YEAR} onClick={() => setYear(shown => shown - 1)}>‹</button>
                <strong>{year}</strong>
                <button type="button" className="ui2-btn" aria-label="Next year"
                  disabled={year >= currentYear} onClick={() => setYear(shown => shown + 1)}>›</button>
              </div>
              {columns.length > 1 && (
                <div className="u2-tx-delta-columns" role="group" aria-label="Investment delta column">
                  {columns.map(option => (
                    <button key={option} type="button" aria-pressed={option === column}
                      className={option === column ? 'ui2-btn ui2-btn-primary' : 'ui2-btn'}
                      onClick={e => { e.stopPropagation(); setPicked(option) }}>
                      {PERFORMANCE_COLUMN_LABELS[option]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error ? (
              <p className="ui2-note" role="alert">{error}</p>
            ) : !ready ? (
              <p className="ui2-note" aria-live="polite">Loading…</p>
            ) : !column ? (
              <p className="ui2-note">{fromHistory ? `No History rows for ${year}` : `Nothing invested in ${year}`}</p>
            ) : (
              <div className="u2-tx-delta-chart" role="img"
                aria-label={`Investment delta ${year}, ${PERFORMANCE_COLUMN_LABELS[column]}`}>
                <InvestmentDeltaChart months={months} column={column} theme={theme} />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
