import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, TransactionWithHolding } from '../../types'

// Data for the portfolio-wide ledger view. When userId is set the hook
// targets the admin act-as endpoints, exactly like useHoldings.
//
// Two reads: the ledger itself, and the holdings list. Holdings are needed
// for the holding filter facet and to hand the per-holding ledger editor its
// holding — note this calls listHoldings, not getPrices: the editor only
// needs stored fields, and a ledger page has no reason to trigger a live
// Yahoo fetch per symbol.
export function useAllTransactions(userId?: string) {
  const [transactions, setTransactions] = useState<TransactionWithHolding[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [txns, hlds] = await Promise.all([
        api.listAllTransactions(userId),
        api.listHoldings(userId),
      ])
      setTransactions(txns)
      setHoldings(hlds)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { transactions, holdings, loading, error, refresh }
}
