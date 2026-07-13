import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, Summary } from '../../types'
import {
  attachPreviousClosePrices,
  type HoldingWithPreviousClose,
} from './dashboardPriceMovement'

// When userId is set, the hook targets the admin act-as endpoints
// (/api/admin/users/:id/...) instead of the caller's own portfolio.
export function useHoldings(userId?: string) {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [enriched, setEnriched] = useState<HoldingWithPreviousClose[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingHoldings, setLoadingHoldings] = useState(false)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchHoldings = useCallback(async () => {
    setLoadingHoldings(true)
    try {
      const data = await api.listHoldings(userId)
      setHoldings(data)
    } catch (e) {
      console.error('listHoldings:', e)
    } finally {
      setLoadingHoldings(false)
    }
  }, [userId])

  const fetchPrices = useCallback(async () => {
    setLoadingPrices(true)
    try {
      // Two reads in flight: /prices feeds the per-row table; /summary is
      // the authoritative totals + daily-change vs previous close. The
      // summary is fetched here (not synthesised from the rows) so the
      // change_value / per_currency fields the backend computes survive.
      const [prices, summary] = await Promise.all([
        api.getPrices(userId),
        api.getSummary(userId),
      ])
      let enrichedHoldings: HoldingWithPreviousClose[] = prices.holdings || []

      if (!userId && summary.previous_close_date) {
        try {
          const history = await api.listHistory(summary.previous_close_date, summary.previous_close_date)
          const previousRow = history.rows.find(r => r.date === summary.previous_close_date) ?? history.rows[0]
          enrichedHoldings = attachPreviousClosePrices(enrichedHoldings, previousRow?.holdings)
        } catch (e) {
          console.error('previousCloseHistory:', e)
        }
      }

      setEnriched(enrichedHoldings)
      setSummary(summary)
      setLastRefresh(new Date())
    } catch (e) {
      console.error('fetchPrices:', e)
    } finally {
      setLoadingPrices(false)
    }
  }, [userId])

  const refresh = useCallback(async () => {
    await Promise.all([fetchHoldings(), fetchPrices()])
  }, [fetchHoldings, fetchPrices])

  const remove = useCallback(
    async (id: string) => {
      await api.deleteHolding(id, userId)
      await refresh()
    },
    [refresh, userId],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    holdings,
    enriched,
    summary,
    loadingHoldings,
    loadingPrices,
    lastRefresh,
    refresh,
    fetchPrices,
    remove,
  }
}
