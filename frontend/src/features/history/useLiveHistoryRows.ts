// Today's tentative History row, built from live prices (moved out of
// HistoryPage for PD-050). History's month view and the Transactions
// investment delta panel both append it, so both show the same figures for
// the current month while today's snapshot has not landed yet.
import { useEffect, useMemo, useState } from 'react'
import { api, type HistoryRow } from '../../lib/api/client'
import {
  buildLiveGoldOverlay, buildLiveRow, isLiveWindowOpen, latestGoldOverlay,
  msUntilNextLiveBoundary, tradingDateIST,
} from './historyShared'

// The IST trading day and whether the live window is open.
//
// Neither value may be memoized for the component's lifetime: a tab left
// mounted across a boundary would otherwise keep a stale trading day or
// window state until remount. `clockTick` fires at each boundary (+1s of
// slack, since a timer landing a hair early would recompute the same
// values; re-arming on the tick rather than on the derived values keeps
// the next timeout scheduled anyway).
export function useTradingClock(): { todayStr: string; liveWindowOpen: boolean } {
  const [clockTick, setClockTick] = useState(0)
  useEffect(() => {
    const timer = setTimeout(() => setClockTick(tick => tick + 1), msUntilNextLiveBoundary(new Date()) + 1000)
    return () => clearTimeout(timer)
  }, [clockTick])
  const todayStr = useMemo(() => tradingDateIST(new Date()), [clockTick])
  const liveWindowOpen = useMemo(() => isLiveWindowOpen(new Date()), [clockTick])
  return { todayStr, liveWindowOpen }
}

interface LiveRowOptions {
  // The caller is showing a range that contains today (History: the current
  // month; the panel: the current year, pulled up).
  active: boolean
  todayStr: string
  liveWindowOpen: boolean
  goldEnabled: boolean
}

// `rows` plus today's live row: only while `active`, only while no snapshot
// has landed for today yet (the cron row, once it exists, is the real
// number), and only inside the live window.
export function useLiveHistoryRows(
  rows: HistoryRow[],
  { active, todayStr, liveWindowOpen, goldEnabled }: LiveRowOptions,
): HistoryRow[] {
  const [liveRow, setLiveRow] = useState<HistoryRow | null>(null)
  // /prices is cached 5 min server-side. Without its own cadence the row
  // labelled "live" would keep showing the window-open price for the whole
  // 17-hour window, since nothing else in the fetch effect's deps changes.
  const [priceTick, setPriceTick] = useState(0)
  useEffect(() => {
    if (!liveWindowOpen) return
    const timer = setInterval(() => setPriceTick(tick => tick + 1), 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [liveWindowOpen])
  const hasTodaySnapshot = rows.some(row => row.date === todayStr)
  // The only thing the fetch below needs out of `rows` is the previous
  // gold close its volatility chains off. Reducing that to a primitive keeps
  // `rows` out of the deps, so a same-range reload (add / edit / paste) no
  // longer triggers a redundant /prices + /gold/metrics round-trip.
  const prevGoldCurrent = useMemo(() => latestGoldOverlay(rows)?.current ?? null, [rows])
  useEffect(() => {
    if (!active || hasTodaySnapshot || !liveWindowOpen) {
      setLiveRow(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const prices = await api.getPrices()
        const live = buildLiveRow(todayStr, prices.holdings ?? [])
        // Gold is a separate store (DD-003) with its own endpoint; only
        // fetch it for gold-enabled users, and degrade silently (gold just
        // stays absent, same as a pre-purchase historical row) if it 503s.
        if (goldEnabled) {
          try {
            const metrics = await api.getGoldMetrics()
            live.gold = buildLiveGoldOverlay(metrics, prevGoldCurrent)
          } catch { /* gold disabled server-side or a transient error — leave gold absent */ }
        }
        if (!cancelled) setLiveRow(live)
      } catch {
        // Live row is a nice-to-have; a failed fetch just means no tentative
        // row shows, not a page-level error.
        if (!cancelled) setLiveRow(null)
      }
    })()
    return () => { cancelled = true }
  }, [active, hasTodaySnapshot, liveWindowOpen, priceTick, todayStr, prevGoldCurrent, goldEnabled])

  // `hasTodaySnapshot` and `active` are computed during render but `liveRow`
  // is only cleared by the effect above, which runs after paint — so guard
  // here too, or the frame where today's cron row first arrives renders two
  // <tr>s with the same key and collapses their day-over-day maths.
  return useMemo(
    () => liveRow && active && !hasTodaySnapshot ? [...rows, liveRow] : rows,
    [rows, liveRow, active, hasTodaySnapshot],
  )
}
