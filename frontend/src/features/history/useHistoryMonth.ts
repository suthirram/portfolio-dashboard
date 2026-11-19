import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  type DateConflict,
  type HistoryRow,
  type PasteHistoryReport,
} from '../../lib/api/client'
import { formatDate } from '../../lib/formDates'
import { useAuthOptional } from '../auth/AuthContext'
import {
  goldChartData, monthRange, perCurrencyChartData, tradingDateIST, yearMonth0,
  type RegionKey,
} from './historyShared'
import { useLiveHistoryRows, useTradingClock } from './useLiveHistoryRows'

const CHARTS_ON_TOP_KEY = 'pd_history_charts_top'

// useHistoryMonth is the /history page's data and actions — the selected
// month, its rows (with today's live row), chart series, the charts-on-top
// preference, and the add / edit / paste / conflict / delete handlers. The
// classic page and the UI_2.0 page (PD-059) render it, so both share one
// implementation; it was moved out of HistoryPage unchanged.
export function useHistoryMonth() {
  const auth = useAuthOptional()
  const now = new Date()
  // The month picker defaults to the IST trading day's month/year, not the
  // raw UTC calendar one — between 00:00–02:30 UTC those can differ by a
  // day (see tradingDateIST), which would otherwise default the picker to
  // tomorrow's month while the snapshot job is still writing today's.
  const initial = yearMonth0(tradingDateIST(now))
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month0)
  const [rows, setRows] = useState<HistoryRow[]>([])
  // The month (YYYY-MM-01) `rows` were loaded for. A reload keeps the old
  // rows until the new ones land (and keeps them if it fails), so anything
  // labelled with the picker's month must check this first.
  const [rowsMonthStart, setRowsMonthStart] = useState<string | null>(null)
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [editRow, setEditRow] = useState<HistoryRow | null>(null)
  // Per-currency Holdings modal: the clicked row, the prior trading day's row
  // (for yesterday's price), and the currency clicked. null = closed.
  const [holdingsView, setHoldingsView] = useState<{ row: HistoryRow; prev: HistoryRow | null; region: RegionKey } | null>(null)
  // Sequential conflict queue: head opens as a modal.
  const [conflictQueue, setConflictQueue] = useState<DateConflict[]>([])
  // Layout preference: charts above the table. Persisted per browser.
  const [chartsOnTop, setChartsOnTop] = useState(() => {
    try { return window.localStorage?.getItem(CHARTS_ON_TOP_KEY) === '1' } catch { return false }
  })
  const toggleChartsOnTop = () => {
    setChartsOnTop(onTop => {
      const next = !onTop
      try { window.localStorage?.setItem(CHARTS_ON_TOP_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { from, to } = monthRange(year, month)
      const list = await api.listHistory(from, to, true)
      setRows(list.rows)
      setRowsMonthStart(from)
      setCurrency(list.currency || 'INR')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { void reload() }, [reload])

  // The IST trading day and the live window, recomputed at each boundary.
  const { todayStr, liveWindowOpen } = useTradingClock()
  const today = yearMonth0(todayStr)
  const isCurrentMonth = year === today.year && month === today.month0
  const selectedMonthStart = monthRange(year, month).from

  // At each cut-over, refetch so the day that just closed picks up its real
  // snapshot. If the roll-over also crossed a month *and* the user was still
  // parked on the month that was current until a moment ago, follow the
  // clock into the new month — but never yank them out of a month they
  // deliberately navigated to.
  const prevTodayRef = useRef(todayStr)
  useEffect(() => {
    const prev = prevTodayRef.current
    if (prev === todayStr) return
    prevTodayRef.current = todayStr
    const was = yearMonth0(prev)
    const nowYM = yearMonth0(todayStr)
    const crossedMonth = nowYM.year !== was.year || nowYM.month0 !== was.month0
    if (crossedMonth && year === was.year && month === was.month0) {
      // Changing the picker re-runs `reload` through its own effect.
      setYear(nowYM.year)
      setMonth(nowYM.month0)
    } else {
      void reload()
    }
  }, [todayStr, year, month, reload])
  // Today's live row is appended only while the current month is shown.
  const displayRows = useLiveHistoryRows(rows, {
    active: isCurrentMonth, todayStr, liveWindowOpen, goldEnabled: Boolean(auth?.user?.gold_enabled),
  })

  // One chart per currency. Compute series per bucket.
  //
  // Charts plot `displayRows`, the same array the table renders: on `rows`
  // the table's last row was today while every mini chart stopped at
  // yesterday, and a gold-enabled user whose only gold-bearing row was the
  // live one got the table's gold column with no gold panel beside it.
  const chartsByRegion = useMemo(() => ({
    INR: perCurrencyChartData(displayRows, 'INR'),
    EUR: perCurrencyChartData(displayRows, 'EUR'),
  }), [displayRows])
  // Gold gets its own panel (INR-denominated) from the per-row overlay,
  // shown only when at least one row carries gold data.
  const goldChart = useMemo(() => goldChartData(displayRows), [displayRows])
  const hasGoldChart = useMemo(() => displayRows.some(row => row.gold), [displayRows])

  const handleAddSaved = async (input: { date: string; regions: Record<string, { invested: number; current: number }> }) => {
    try {
      await api.addHistoryRow(input)
      setAddOpen(false)
      await reload()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Server returned conflicts. Surface via a single-date conflict.
        // The error body is the *ErrConflict shape stringified; refetch the row
        // to drive the modal instead.
        try {
          const list = await api.listHistory(input.date, input.date)
          if (list.rows[0]) {
            setConflictQueue([{
              date: input.date,
              existing: list.rows[0].regions,
              incoming: input.regions,
            }])
            setAddOpen(false)
          } else {
            // 409 said the row exists, but list returned nothing —
            // possible race between the POST and the refetch. Tell the
            // user instead of silently swallowing.
            alert('Conflict reported but row no longer exists. Try again.')
          }
        } catch {
          alert('Conflict, but failed to load existing row.')
        }
      } else {
        alert('Add failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
  }

  const handlePasteSubmit = async (input: { month: string; rows: { date: string; regions: Record<string, { invested: number; current: number }> }[] }): Promise<PasteHistoryReport> => {
    const report = await api.pasteHistory(input)
    if (report.conflicts.length) {
      // PRD-002 §7.3: dialogs open in date order. Backend may return
      // conflicts in non-deterministic order because the per-row map
      // iteration order is undefined; sort here.
      const sorted = report.conflicts.toSorted((left, right) => left.date.localeCompare(right.date))
      setConflictQueue(sorted)
    }
    if (report.applied.length) await reload()
    return report
  }

  const handleConflictResolve = async (date: string, chosen: Record<string, { invested: number; current: number }>) => {
    if (Object.keys(chosen).length > 0) {
      try {
        await api.patchHistoryRegions(date, { regions: chosen })
      } catch (e) {
        alert('Save failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
    // Advance queue
    setConflictQueue(queue => queue.slice(1))
    await reload()
  }

  const handleConflictSkip = () => {
    setConflictQueue(queue => queue.slice(1))
  }

  const handleEditSaved = async (date: string, regions: Record<string, { invested: number; current: number }>) => {
    try {
      await api.patchHistoryRegions(date, { regions })
      setEditRow(null)
      await reload()
    } catch (e) {
      alert('Edit failed: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  // Resolves true once the row is gone, so a caller that opened the delete
  // from a dialog (UI_2.0's Edit dialog) knows to close it.
  const handleDelete = async (date: string): Promise<boolean> => {
    if (!confirm(`Delete row for ${formatDate(date)}?`)) return false
    try {
      await api.deleteHistoryRow(date)
      await reload()
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert('Cannot delete a cron-written row. Override individual regions instead.')
      } else {
        alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)))
      }
      return false
    }
  }

  const headConflict = conflictQueue[0]

  return {
    year, setYear, month, setMonth, today, isCurrentMonth, selectedMonthStart,
    rows, rowsMonthStart, displayRows, currency, loading, error,
    chartsByRegion, goldChart, hasGoldChart,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    reload, handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  }
}
