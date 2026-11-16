import { describe, expect, it } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { sectorAllocation } from './sectorAllocationData'

const holding = (symbol: string, sector: string | null, value: number, overrides: Partial<HoldingWithPrice> = {}): HoldingWithPrice => ({
  id: symbol, symbol, script: symbol, currency: 'INR', type: 'stock', stocks_owned: 1, current_price: value,
  current_value: value, current_value_eur: value / 100, cost_price: 10000,
  classification: { symbol, status: 'resolved', source: 'user', sector }, ...overrides,
})

describe('sector allocation', () => {
  it('uses the 60/20/20 priced-value denominator, isolated from other currencies and nil positions', () => {
    const rows = [holding('TCS', 'Technology', 60), holding('BANK', 'Banking', 20),
      holding('FUND', null, 20, { type: 'etf' }),
      holding('EUR', 'Technology', 9999, { currency: 'EUR', current_value_eur: 30 }),
      holding('NIL', 'Technology', 500, { stocks_owned: 0 }),
      holding('UNPRICED', 'Technology', 9000, { current_price: undefined, current_value: 0, price_error: 'unavailable' })]
    const allocation = sectorAllocation(rows, 'INR')
    expect(allocation.total).toBe(100)
    expect(allocation.buckets.map(bucket => bucket.share)).toEqual([60, 20, 20])
    expect(allocation.unpriced).toBe(1)
    expect(sectorAllocation(rows, 'EUR').total).toBe(30)
  })

  it('includes pending, unclassified and both fund buckets without look-through', () => {
    const allocation = sectorAllocation([
      holding('ETF', 'Ignored fund sector', 40, { type: 'etf' }),
      holding('MF', null, 30, { type: 'mutual_fund' }),
      holding('PENDING', null, 20, { classification: { status: 'needs_review' } }),
      holding('UNCLASSIFIED', null, 10),
    ], 'INR')
    expect(allocation.buckets.map(bucket => [bucket.key, bucket.share])).toEqual([
      ['etf', 40], ['mutual_fund', 30], ['needs_review', 20], ['unclassified', 10],
    ])
  })

  it('never substitutes cost or INR values for absent, failed or invalid native values', () => {
    const rows = [holding('MISSING', 'Technology', 50, { current_value_eur: undefined }),
      holding('FAILED', 'Technology', 50, { price_error: 'no quote' }),
      holding('INVALID', 'Technology', 50, { current_value_eur: NaN })].map(row => ({ ...row, currency: 'EUR' as const }))
    const allocation = sectorAllocation(rows, 'EUR')
    expect(allocation.total).toBe(0)
    expect(allocation.buckets).toEqual([])
    expect(allocation.unpriced).toBe(3)
  })

  it('has an empty allocation for empty portfolios and zero priced value', () => {
    expect(sectorAllocation([], 'INR').total).toBe(0)
    expect(sectorAllocation([holding('ZERO', 'Technology', 0, { current_price: 10 })], 'INR').buckets).toEqual([])
  })
})
