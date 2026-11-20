import { useEffect, useMemo, useState } from 'react'
import { api, type HistoryRow, type InvestmentDelta } from '../../lib/api/client'
import { useAuthOptional } from '../auth/AuthContext'
import {
  PERFORMANCE_COLUMNS, columnPosition, monthRange, monthlyInvestment,
  yearMonth0, type MonthlyInvestment, type PerformanceColumn,
} from '../history/historyShared'
import { useIstDay } from '../../lib/useIstDay'
import { useLiveHistoryRows, useTradingClock } from '../history/useLiveHistoryRows'

// One empty array for "not loaded", so the hook's memos stay stable.
const NO_ROWS: HistoryRow[] = []

// useInvestmentDelta loads one year's monthly investment delta for the
// Transactions page, in every interface (PD-050 / PD-052, PD-059 R22). The
// figures come from the ledger; a user switched to History by the super admin
// (`delta_from_history`) gets them read off History rows. Nothing loads
// while active is false (a collapsed panel).
export function useInvestmentDelta({ active, refreshKey = 0 }: { active: boolean; refreshKey?: number }) {
  const auth = useAuthOptional()
  const fromHistory = Boolean(auth?.user?.delta_from_history)
  const { todayStr, liveWindowOpen } = useTradingClock()
  // The ledger months are as of the IST calendar day (the server's
  // istToday); History keeps the trading day it snapshots on.
  const istDay = useIstDay()
  const currentYear = yearMonth0(fromHistory ? todayStr : istDay).year
  const [year, setYear] = useState(currentYear)
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

  // The ledger months are as of the day they were fetched: while the current
  // year is shown, a new IST day refetches them, so a month that has just
  // begun gets its figures at midnight.
  const ledgerDay = !fromHistory && year === currentYear ? istDay : null

  useEffect(() => {
    if (!active) return
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
  }, [active, year, refreshKey, fromHistory, ledgerDay])

  // Today's live row, as on History, while the current year is pulled up
  // (the History version only: the ledger is already as of today).
  const displayRows = useLiveHistoryRows(rows ?? NO_ROWS, {
    active: fromHistory && active && rows !== null && year === currentYear,
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

  return { fromHistory, year, setYear, currentYear, ready, error, columns, column, setPicked, months }
}
