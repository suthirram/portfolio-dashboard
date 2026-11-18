import type { TransactionType, TransactionWithHolding } from '../../types'
import { canonicalCurrency, compareCurrencies } from '../../lib/currency'

// Pure filter / sort / subtotal logic for the portfolio-wide ledger view.
// No React here so every rule is unit-testable on its own, matching
// historyShared.ts and currencyTotals.ts.

export const TXN_TYPES: TransactionType[] = [
  'buy', 'sell', 'dividend', 'opening', 'split', 'bonus', 'merger',
]

export interface Filters {
  search: string
  holdingIds: string[]
  types: TransactionType[]
  currencies: string[]
  from: string // yyyy-mm-dd, inclusive; '' = unbounded
  to: string   // yyyy-mm-dd, inclusive; '' = unbounded
}

export const emptyFilters = (): Filters => ({
  search: '', holdingIds: [], types: [], currencies: [], from: '', to: '',
})

export type SortKey = 'date' | 'holding' | 'type' | 'amount'
export interface Sort { key: SortKey; dir: 'asc' | 'desc' }

// Newest first: "recent transactions" is the entry point for this view.
export const defaultSort = (): Sort => ({ key: 'date', dir: 'desc' })

// toggleSort flips direction when the same column is clicked again, and
// starts a new column descending (largest / latest first, which is what a
// reader wants from money and dates alike).
export function toggleSort(current: Sort, key: SortKey): Sort {
  if (current.key !== key) return { key, dir: 'desc' }
  return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
}

const day = (iso?: string) => (iso || '').slice(0, 10)

export function applyFilters(
  rows: TransactionWithHolding[],
  filters: Filters,
): TransactionWithHolding[] {
  const needle = filters.search.trim().toLowerCase()
  return rows.filter(txn => {
    if (filters.holdingIds.length && !filters.holdingIds.includes(txn.holding_id || '')) return false
    if (filters.types.length && !filters.types.includes((txn.type || 'buy') as TransactionType)) return false
    if (filters.currencies.length && !filters.currencies.includes(canonicalCurrency(txn.currency))) return false
    // Dates compare as ISO strings — lexicographic order is chronological
    // for yyyy-mm-dd, so no Date objects (and no timezone shifts) involved.
    const txnDay = day(txn.date)
    if (filters.from && txnDay < filters.from) return false
    if (filters.to && txnDay > filters.to) return false
    if (needle) {
      const haystack = `${txn.script || ''} ${txn.symbol || ''} ${txn.notes || ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

export function sortRows(rows: TransactionWithHolding[], sort: Sort): TransactionWithHolding[] {
  const sign = sort.dir === 'desc' ? -1 : 1
  const value = (txn: TransactionWithHolding): string | number => {
    switch (sort.key) {
      case 'holding': return (txn.script || txn.symbol || '').toLowerCase()
      case 'type': return txn.type || ''
      case 'amount': return txn.amount ?? 0
      case 'date': return day(txn.date)
    }
  }
  // toSorted returns a copy: callers hold the fetched array and must not see
  // it reordered.
  return rows.toSorted((left, right) => {
    const leftValue = value(left)
    const rightValue = value(right)
    if (leftValue === rightValue) {
      // Stable tiebreak so two events on one date never swap between
      // renders; created_at is what the server orders ties by too.
      return (left.created_at || '').localeCompare(right.created_at || '') * sign
    }
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * sign
    return String(leftValue).localeCompare(String(rightValue)) * sign
  })
}

export interface CurrencySubtotal {
  currency: string
  bought: number
  sold: number
  dividends: number
}

// currencySubtotals sums amounts by type within each currency present in the
// given rows. The bucket key is the RAW canonical code, never a folded
// "other": two unlike currencies must never share a card, since a summed
// figure across currencies looks authoritative and means nothing.
export function currencySubtotals(rows: TransactionWithHolding[]): CurrencySubtotal[] {
  const buckets = new Map<string, CurrencySubtotal>()
  for (const txn of rows) {
    const currency = canonicalCurrency(txn.currency)
    let bucket = buckets.get(currency)
    if (!bucket) {
      bucket = { currency, bought: 0, sold: 0, dividends: 0 }
      buckets.set(currency, bucket)
    }
    const amount = txn.amount ?? 0
    switch (txn.type) {
      // An opening balance is money that went in, so it counts as bought —
      // otherwise a migrated portfolio reads as having invested nothing.
      case 'opening':
      case 'buy':
        bucket.bought += amount
        break
      case 'sell':
        bucket.sold += amount
        break
      case 'dividend':
        bucket.dividends += amount
        break
      // split / bonus / merger carry no cash.
    }
  }
  return [...buckets.values()].sort((left, right) => compareCurrencies(left.currency, right.currency))
}

// currencyFacet lists the currencies actually present in the unfiltered
// ledger, so the filter never offers a code the user has no rows for.
export function currencyFacet(rows: TransactionWithHolding[]): string[] {
  const codes = new Set(rows.map(txn => canonicalCurrency(txn.currency)))
  return [...codes].sort(compareCurrencies)
}

// typeFacet lists the types present, in the canonical order above, so the
// chip row doesn't offer "merger" to someone who has never recorded one.
export function typeFacet(rows: TransactionWithHolding[]): TransactionType[] {
  const present = new Set(rows.map(txn => txn.type))
  return TXN_TYPES.filter(txnType => present.has(txnType))
}

// impliedCostPerShare mirrors the add/edit modal's hint: only meaningful
// where an amount buys or releases a quantity.
export function impliedCostPerShare(txn: TransactionWithHolding): number | null {
  if (txn.type !== 'buy' && txn.type !== 'sell' && txn.type !== 'opening') return null
  const qty = txn.quantity ?? 0
  const amount = txn.amount ?? 0
  if (qty <= 0 || amount <= 0) return null
  return amount / qty
}

// visibleColumns reports which type-specific columns any row in the current
// set actually uses, so a buy-only view isn't padded with three dash columns.
// Every other column is fixed (PRD-004 §5).
export function visibleColumns(rows: TransactionWithHolding[]) {
  return {
    quantity: rows.some(txn => (txn.quantity ?? 0) !== 0),
    impliedCost: rows.some(txn => impliedCostPerShare(txn) !== null),
    ratio: rows.some(txn => (txn.ratio ?? 0) !== 0),
    realizedSeed: rows.some(txn => (txn.realized_seed ?? 0) !== 0),
    openingDate: rows.some(txn => txn.type === 'opening'),
    notes: rows.some(txn => (txn.notes || '').trim() !== ''),
  }
}
