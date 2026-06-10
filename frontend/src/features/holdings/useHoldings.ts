import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, HoldingWithPrice, Summary } from '../../types'

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [enriched, setEnriched] = useState<HoldingWithPrice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingHoldings, setLoadingHoldings] = useState(false)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchHoldings = useCallback(async () => {
    setLoadingHoldings(true)
    try {
      const data = await api.listHoldings()
      setHoldings(data)
    } catch (e) {
      console.error('listHoldings:', e)
    } finally {
      setLoadingHoldings(false)
    }
  }, [])

  const fetchPrices = useCallback(async () => {
    setLoadingPrices(true)
    try {
      const data = await api.getPrices()
      setEnriched(data.holdings || [])
      const totals = (data.holdings || []).reduce(
        (acc, h) => {
          acc.total_cost += h.cost_price || 0
          acc.total_current_value += h.current_value || 0
          acc.total_unrealized += h.unrealized_pnl || 0
          acc.total_realized += h.realized_pnl || 0
          acc.total_cost_eur += h.cost_price_eur || 0
          acc.total_current_value_eur += h.current_value_eur || 0
          acc.total_unrealized_eur += h.unrealized_pnl_eur || 0
          acc.total_realized_eur += h.realized_pnl_eur || 0
          return acc
        },
        {
          total_cost: 0,
          total_current_value: 0,
          total_unrealized: 0,
          total_realized: 0,
          total_cost_eur: 0,
          total_current_value_eur: 0,
          total_unrealized_eur: 0,
          total_realized_eur: 0,
        },
      )
      setSummary({ ...totals, eur_rate: data.eur_rate })
      setLastRefresh(new Date())
    } catch (e) {
      console.error('getPrices:', e)
    } finally {
      setLoadingPrices(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    await fetchHoldings()
    await fetchPrices()
  }, [fetchHoldings, fetchPrices])

  const remove = useCallback(
    async (id: string) => {
      await api.deleteHolding(id)
      await refresh()
    },
    [refresh],
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
