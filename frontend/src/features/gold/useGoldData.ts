import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type GoldMetrics, type GoldPrice, type GoldTransaction } from '../../lib/api/client'

// useGoldData owns every gold read for both interfaces (PD-059 slice 20):
// purchases, the daily price series, the missing-price days and the live
// metrics. The gap list drives the missing-price prompt (PRD-003 §7).
export function useGoldData() {
  const [rows, setRows] = useState<GoldTransaction[]>([])
  const [prices, setPrices] = useState<GoldPrice[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [metrics, setMetrics] = useState<GoldMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const [txns, priceRows, gaps, goldMetrics] = await Promise.all([
      api.listGoldTransactions(),
      api.listGoldPrices(),
      api.listGoldMissingDates(),
      api.getGoldMetrics(),
    ])
    setRows(txns)
    setPrices(priceRows)
    setMissing(gaps.missing)
    setMetrics(goldMetrics)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      await fetchAll()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to load gold data')
    } finally {
      setLoading(false)
    }
  }, [fetchAll])

  // refresh re-pulls without the full-page spinner, so the missing-price
  // prompt re-renders with the days still blank instead of the page flashing.
  // It clears the error first so a stale failure does not outlive a later
  // successful refresh.
  const refresh = useCallback(async () => {
    setErr(null)
    try {
      await fetchAll()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to refresh gold data')
    }
  }, [fetchAll])

  useEffect(() => { void load() }, [load])

  return { rows, prices, missing, metrics, loading, err, load, refresh }
}
