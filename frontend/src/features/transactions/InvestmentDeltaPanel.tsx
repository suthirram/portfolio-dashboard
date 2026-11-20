// The Transactions page's investment delta panel (PD-050), just below the
// filters: expanded from a handle bar, it charts each month's investment
// delta for one year and one column. The figures come from useInvestmentDelta
// (the ledger, or History rows for a `delta_from_history` account).
import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { ThemeName } from '../../lib/useTheme'
import { MIN_YEAR, PERFORMANCE_COLUMN_LABELS } from '../history/historyShared'
import { InvestmentDeltaChart } from './InvestmentDeltaChart'
import { useInvestmentDelta } from './useInvestmentDelta'

const OPEN_KEY = 'pd_txn_delta_open'

interface Props {
  theme: ThemeName
  // Bumped by the page after each successful ledger edit: the backend has
  // healed the affected snapshots by then, so an open panel reloads the year.
  refreshKey?: number
}

export function InvestmentDeltaPanel({ theme, refreshKey = 0 }: Props) {
  const [open, setOpen] = useState(() => {
    try { return window.localStorage?.getItem(OPEN_KEY) === '1' } catch { return false }
  })
  const { fromHistory, year, setYear, currentYear, ready, error, columns, column, setPicked, months } =
    useInvestmentDelta({ active: open, refreshKey })

  const toggle = () => {
    setOpen(wasOpen => {
      const next = !wasOpen
      try { window.localStorage?.setItem(OPEN_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  return (
    <section style={dock}>
      <button type="button" onClick={toggle} aria-expanded={open} style={handle}>
        {open ? '▲' : '▼'} Investment delta · {year}
      </button>
      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={toolbar}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" className="btn btn-sm" aria-label="Previous year"
                disabled={year <= MIN_YEAR} onClick={() => setYear(shown => shown - 1)}>‹</button>
              <span className="mono" style={{ fontWeight: 600 }}>{year}</span>
              <button type="button" className="btn btn-sm" aria-label="Next year"
                disabled={year >= currentYear} onClick={() => setYear(shown => shown + 1)}>›</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {columns.map(option => (
                <button key={option} type="button" className="btn btn-sm" style={{ borderRadius: 999 }}
                  aria-pressed={option === column} onClick={() => setPicked(option)}>
                  {PERFORMANCE_COLUMN_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
          {error ? (
            <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>
          ) : !ready ? (
            <div style={centred}><span className="spinner" /></div>
          ) : !column ? (
            <div style={centred}>{fromHistory ? `No History rows for ${year}` : `Nothing invested in ${year}`}</div>
          ) : (
            <div role="img" aria-label={`Investment delta ${year}, ${PERFORMANCE_COLUMN_LABELS[column]}`}
              style={{ height: 260 }}>
              <InvestmentDeltaChart months={months} column={column} theme={theme} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// The same surface as the filters section above it.
const dock: CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
}
const handle: CSSProperties = {
  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
  padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
}
const toolbar: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  flexWrap: 'wrap', gap: 10, marginBottom: 8,
}
const centred: CSSProperties = { padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }
