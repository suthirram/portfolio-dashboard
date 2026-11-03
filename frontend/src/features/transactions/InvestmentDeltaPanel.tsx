// The Transactions page's investment delta panel (PD-050), just below the
// filters: expanded from a handle bar, it charts each month's investment
// delta for one year and one column. The figures come from the ledger
// (PD-052); a user switched to History by the super admin
// (`delta_from_history`) gets the PD-050 version read off History rows.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { api, type HistoryRow, type InvestmentDelta } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'
import {
  MIN_YEAR, PERFORMANCE_COLUMNS, PERFORMANCE_COLUMN_LABELS, columnPosition, monthRange, monthlyInvestment,
  yearMonth0, type MonthlyInvestment, type PerformanceColumn,
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
  const fromHistory = Boolean(auth?.user?.delta_from_history)
  // The loaded figures and the year they belong to: History rows, or the
  // ledger's months. A ledger refresh keeps the current figures on screen
  // while it reloads; another year shows the spinner until its own arrive.
  const [loaded, setLoaded] = useState<{ year: number; rows: HistoryRow[] } | null>(null)
  const [ledger, setLedger] = useState<{ year: number; delta: InvestmentDelta } | null>(null)
  // null = not loaded yet for this year.
  const rows = loaded && loaded.year === year ? loaded.rows : null
  const ledgerDelta = ledger && ledger.year === year ? ledger.delta : null
  const ready = fromHistory ? rows !== null : ledgerDelta !== null
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
        if (fromHistory) {
          // 1 Jan → 31 Dec, plus the latest row before 1 Jan as January's baseline.
          const list = await api.listHistory(monthRange(year, 0).from, monthRange(year, 11).to, true)
          if (!cancelled) setLoaded({ year, rows: list.rows })
        } else {
          const delta = await api.getInvestmentDelta(year)
          if (!cancelled) setLedger({ year, delta })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [open, year, refreshKey, fromHistory])

  // Today's live row, as on History, while the current year is pulled up
  // (the History version only: the ledger is already as of today).
  const displayRows = useLiveHistoryRows(rows ?? NO_ROWS, {
    active: fromHistory && open && rows !== null && year === currentYear,
    todayStr, liveWindowOpen, goldEnabled: Boolean(auth?.user?.gold_enabled), refreshKey,
  })

  // Only columns with money invested inside the year are offered: on
  // History, on a row of the year (the baseline row before 1 Jan stays in
  // for January's opening); from the ledger, the server already filters.
  const yearStart = monthRange(year, 0).from
  const columns = useMemo<PerformanceColumn[]>(
    () => fromHistory
      ? PERFORMANCE_COLUMNS.filter(column =>
        displayRows.some(row => row.date >= yearStart && columnPosition(row, column).invested > 0))
      : (ledgerDelta?.columns ?? []).map(entry => entry.column),
    [fromHistory, displayRows, yearStart, ledgerDelta],
  )
  const column = picked && columns.includes(picked) ? picked : columns[0] ?? null
  const months = useMemo<MonthlyInvestment[]>(() => {
    if (!column) return []
    if (fromHistory) return monthlyInvestment(displayRows, year, column)
    const entry = ledgerDelta?.columns.find(candidate => candidate.column === column)
    return (entry?.months ?? []).map(month => ({ month0: month.month0, delta: month.delta ?? null, invested: month.invested ?? null }))
  }, [fromHistory, displayRows, year, column, ledgerDelta])

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
