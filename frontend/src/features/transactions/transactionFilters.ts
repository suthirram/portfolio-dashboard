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
  f: Filters,
): TransactionWithHolding[] {
  const needle = f.search.trim().toLowerCase()
  return rows.filter(t => {
    if (f.holdingIds.length && !f.holdingIds.includes(t.holding_id || '')) return false
    if (f.types.length && !f.types.includes((t.type || 'buy') as TransactionType)) return false
    if (f.currencies.length && !f.currencies.includes(canonicalCurrency(t.currency))) return false
    // Dates compare as ISO strings — lexicographic order is chronological
    // for yyyy-mm-dd, so no Date objects (and no timezone shifts) involved.
    const d = day(t.date)
    if (f.from && d < f.from) return false
    if (f.to && d > f.to) return false
    if (needle) {
      const haystack = `${t.script || ''} ${t.symbol || ''} ${t.notes || ''}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

export function sortRows(rows: TransactionWithHolding[], sort: Sort): TransactionWithHolding[] {
  const sign = sort.dir === 'desc' ? -1 : 1
  const value = (t: TransactionWithHolding): string | number => {
    switch (sort.key) {
      case 'holding': return (t.script || t.symbol || '').toLowerCase()
      case 'type': return t.type || ''
      case 'amount': return t.amount ?? 0
      case 'date': return day(t.date)
    }
  }
  // Copy first: callers hold the fetched array and must not see it reordered.
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === vb) {
      // Stable tiebreak so two events on one date never swap between
      // renders; created_at is what the server orders ties by too.
      return (a.created_at || '').localeCompare(b.created_at || '') * sign
    }
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
    return String(va).localeCompare(String(vb)) * sign
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
  for (const t of rows) {
    const currency = canonicalCurrency(t.currency)
    let bucket = buckets.get(currency)
    if (!bucket) {
      bucket = { currency, bought: 0, sold: 0, dividends: 0 }
      buckets.set(currency, bucket)
    }
    const amount = t.amount ?? 0
    switch (t.type) {
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
  return [...buckets.values()].sort((a, b) => compareCurrencies(a.currency, b.currency))
}

// currencyFacet lists the currencies actually present in the unfiltered
// ledger, so the filter never offers a code the user has no rows for.
export function currencyFacet(rows: TransactionWithHolding[]): string[] {
  const codes = new Set(rows.map(t => canonicalCurrency(t.currency)))
  return [...codes].sort(compareCurrencies)
}

// typeFacet lists the types present, in the canonical order above, so the
// chip row doesn't offer "merger" to someone who has never recorded one.
export function typeFacet(rows: TransactionWithHolding[]): TransactionType[] {
  const present = new Set(rows.map(t => t.type))
  return TXN_TYPES.filter(t => present.has(t))
}

// impliedCostPerShare mirrors the add/edit modal's hint: only meaningful
// where an amount buys or releases a quantity.
export function impliedCostPerShare(t: TransactionWithHolding): number | null {
  if (t.type !== 'buy' && t.type !== 'sell' && t.type !== 'opening') return null
  const qty = t.quantity ?? 0
  const amount = t.amount ?? 0
  if (qty <= 0 || amount <= 0) return null
  return amount / qty
}

// visibleColumns reports which type-specific columns any row in the current
// set actually uses, so a buy-only view isn't padded with three dash columns.
// Every other column is fixed (PRD-004 §5).
export function visibleColumns(rows: TransactionWithHolding[]) {
  return {
    quantity: rows.some(t => (t.quantity ?? 0) !== 0),
    impliedCost: rows.some(t => impliedCostPerShare(t) !== null),
    ratio: rows.some(t => (t.ratio ?? 0) !== 0),
    realizedSeed: rows.some(t => (t.realized_seed ?? 0) !== 0),
    openingDate: rows.some(t => t.type === 'opening'),
    notes: rows.some(t => (t.notes || '').trim() !== ''),
  }
}
