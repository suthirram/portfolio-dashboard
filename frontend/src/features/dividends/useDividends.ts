import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { DividendCurrency, DividendView, Holding } from '../../types'

const EMPTY: DividendView = {
  rows: [], by_year: [], by_month: [], by_holding: [],
  summary: { total: 0, count: 0, holdings: 0 },
}

// One currency tab of dividends plus the holdings list. userId targets the
// admin act-as endpoints, like useAllTransactions.
export function useDividends(currency: DividendCurrency, userId?: string) {
  const [view, setView] = useState<DividendView>(EMPTY)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [v, h] = await Promise.all([api.listDividends(currency, userId), api.listHoldings(userId)])
      setView(v)
      setHoldings(h)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [currency, userId])

  useEffect(() => { void refresh() }, [refresh])

  return { view, holdings, loading, error, refresh }
}
