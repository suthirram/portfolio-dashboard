import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Only the newest request may write state. Switching tab while the old
  // tab's request is in flight would otherwise let its late response land
  // under the new tab, formatted in the wrong currency.
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const [dividendView, holdingList] = await Promise.all([api.listDividends(currency, userId), api.listHoldings(userId)])
      if (request !== generation.current) return
      setView(dividendView)
      setHoldings(holdingList)
    } catch (err) {
      if (request !== generation.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [currency, userId])

  useEffect(() => {
    void refresh()
    // Unmount or a currency/user change: drop whatever is still in flight.
    return () => { generation.current++ }
  }, [refresh])

  return { view, holdings, loading, error, refresh }
}
