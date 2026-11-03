// The Transactions page's bottom panel (PD-050): pulled up from a handle bar,
// it charts each month's investment delta for one year and one column.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, type HistoryRow } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'
import {
  MIN_YEAR, PERFORMANCE_COLUMNS, PERFORMANCE_COLUMN_LABELS, columnPosition, monthRange, monthlyInvestment,
  yearMonth0, type PerformanceColumn,
} from '../history/historyShared'
import { useLiveHistoryRows, useTradingClock } from '../history/useLiveHistoryRows'
import { InvestmentDeltaChart } from './InvestmentDeltaChart'

const OPEN_KEY = 'pd_txn_delta_open'
// One empty array for "not loaded", so the hook's memos stay stable.
const NO_ROWS: HistoryRow[] = []

interface Props {
  theme: ThemeName
  // Bumped by the page after each successful ledger edit: the backend has
  // healed the affected snapshots by then, so an open panel reloads the year.
  refreshKey?: number
}

export function InvestmentDeltaPanel({ theme, refreshKey = 0 }: Props) {
  const auth = useAuthOptional()
  const { todayStr, liveWindowOpen } = useTradingClock()
  const currentYear = yearMonth0(todayStr).year
  const [open, setOpen] = useState(() => {
    try { return window.localStorage?.getItem(OPEN_KEY) === '1' } catch { return false }
  })
  const [year, setYear] = useState(currentYear)
  // The loaded rows and the year they belong to. A ledger refresh keeps the
  // current figures on screen while it reloads; another year shows the
  // spinner until its own rows arrive.
  const [loaded, setLoaded] = useState<{ year: number; rows: HistoryRow[] } | null>(null)
  // null = not loaded yet for this year.
  const rows = loaded && loaded.year === year ? loaded.rows : null
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<PerformanceColumn | null>(null)

  const toggle = () => {
    setOpen(wasOpen => {
      const next = !wasOpen
      try { window.localStorage?.setItem(OPEN_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        // 1 Jan → 31 Dec, plus the latest row before 1 Jan as January's baseline.
        const list = await api.listHistory(monthRange(year, 0).from, monthRange(year, 11).to, true)
        if (!cancelled) setLoaded({ year, rows: list.rows })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [open, year, refreshKey])

  // Today's live row, as on History, while the current year is pulled up.
  const displayRows = useLiveHistoryRows(rows ?? NO_ROWS, {
    active: open && rows !== null && year === currentYear,
    todayStr, liveWindowOpen, goldEnabled: Boolean(auth?.user?.gold_enabled), refreshKey,
  })

  // Only columns with money invested on a row inside the year are offered;
  // the baseline row before 1 Jan stays in for January's opening.
  const yearStart = monthRange(year, 0).from
  const columns = useMemo(
    () => PERFORMANCE_COLUMNS.filter(column =>
      displayRows.some(row => row.date >= yearStart && columnPosition(row, column).invested > 0)),
    [displayRows, yearStart],
  )
  const column = picked && columns.includes(picked) ? picked : columns[0] ?? null
  const months = useMemo(
    () => (column ? monthlyInvestment(displayRows, year, column) : []),
    [displayRows, year, column],
  )

  return (
    <section style={dock}>
      <button type="button" onClick={toggle} aria-expanded={open} style={handle}>
        {open ? '▼' : '▲'} Investment delta · {year}
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
          ) : rows === null ? (
            <div style={centred}><span className="spinner" /></div>
          ) : !column ? (
            <div style={centred}>No History rows for {year}</div>
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

const dock: CSSProperties = {
  position: 'sticky', bottom: 0, zIndex: 5,
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: '8px 8px 0 0', boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
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
