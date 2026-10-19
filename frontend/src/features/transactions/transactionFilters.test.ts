import { describe, expect, it } from 'vitest'
import type { TransactionWithHolding } from '../../types'
import {
  applyFilters,
  currencyFacet,
  currencySubtotals,
  defaultSort,
  emptyFilters,
  impliedCostPerShare,
  sortRows,
  toggleSort,
  typeFacet,
  visibleColumns,
} from './transactionFilters'

const t = (over: Partial<TransactionWithHolding>): TransactionWithHolding => ({
  id: over.id ?? 'x',
  holding_id: 'h1',
  type: 'buy',
  date: '2026-10-01T00:00:00Z',
  quantity: 10,
  amount: 1000,
  currency: 'INR',
  script: 'Tata Consultancy',
  symbol: 'TCS.NS',
  created_at: '2026-10-01T10:00:00Z',
  ...over,
})

const rows: TransactionWithHolding[] = [
  t({ id: 'a', date: '2026-10-17T00:00:00Z', amount: 48912, quantity: 12 }),
  t({ id: 'b', holding_id: 'h2', script: 'Vanguard FTSE', symbol: 'VWCE.DE', currency: 'EUR', date: '2026-09-16T00:00:00Z', amount: 2600, quantity: 21 }),
  t({ id: 'c', holding_id: 'h3', script: 'Apple Inc', symbol: 'AAPL', currency: 'USD', type: 'dividend', date: '2026-10-09T00:00:00Z', amount: 42.8, quantity: 0, notes: 'Q4 payout' }),
  t({ id: 'd', holding_id: 'h2', script: 'Vanguard FTSE', symbol: 'VWCE.DE', currency: 'EUR', type: 'sell', date: '2026-08-02T00:00:00Z', amount: 3200, quantity: 25 }),
  t({ id: 'e', type: 'split', date: '2026-07-26T00:00:00Z', amount: 0, quantity: 0, ratio: 2 }),
]

const ids = (list: TransactionWithHolding[]) => list.map(r => r.id)

describe('applyFilters', () => {
  it('returns everything when no filter is set', () => {
    expect(applyFilters(rows, emptyFilters())).toHaveLength(5)
  })

  it('filters by holding', () => {
    expect(ids(applyFilters(rows, { ...emptyFilters(), holdingIds: ['h2'] }))).toEqual(['b', 'd'])
  })

  it('filters by type', () => {
    expect(ids(applyFilters(rows, { ...emptyFilters(), types: ['sell', 'split'] }))).toEqual(['d', 'e'])
  })

  it('filters by currency, keeping a legacy code addressable', () => {
    expect(ids(applyFilters(rows, { ...emptyFilters(), currencies: ['USD'] }))).toEqual(['c'])
    expect(ids(applyFilters(rows, { ...emptyFilters(), currencies: ['EUR'] }))).toEqual(['b', 'd'])
  })

  it('treats a blank currency as INR, matching the server default', () => {
    const blank = [t({ id: 'f', currency: '' })]
    expect(ids(applyFilters(blank, { ...emptyFilters(), currencies: ['INR'] }))).toEqual(['f'])
  })

  it('bounds an inclusive date range', () => {
    const f = { ...emptyFilters(), from: '2026-09-01', to: '2026-10-09' }
    expect(ids(applyFilters(rows, f))).toEqual(['b', 'c'])
  })

  it('searches script, symbol and notes case-insensitively', () => {
    expect(ids(applyFilters(rows, { ...emptyFilters(), search: 'vwce' }))).toEqual(['b', 'd'])
    expect(ids(applyFilters(rows, { ...emptyFilters(), search: 'apple' }))).toEqual(['c'])
    expect(ids(applyFilters(rows, { ...emptyFilters(), search: 'q4 PAYOUT' }))).toEqual(['c'])
  })

  it('combines filters conjunctively', () => {
    const f = { ...emptyFilters(), holdingIds: ['h2'], types: ['buy'] as never, from: '2026-09-01' }
    expect(ids(applyFilters(rows, f))).toEqual(['b'])
  })
})

describe('sortRows', () => {
  it('defaults to newest first', () => {
    expect(ids(sortRows(rows, defaultSort()))).toEqual(['a', 'c', 'b', 'd', 'e'])
  })

  it('sorts ascending by date', () => {
    expect(ids(sortRows(rows, { key: 'date', dir: 'asc' }))).toEqual(['e', 'd', 'b', 'c', 'a'])
  })

  it('sorts by amount numerically, not lexicographically', () => {
    expect(ids(sortRows(rows, { key: 'amount', dir: 'desc' }))).toEqual(['a', 'd', 'b', 'c', 'e'])
  })

  it('sorts by holding name', () => {
    expect(ids(sortRows(rows, { key: 'holding', dir: 'asc' })).slice(0, 2)).toEqual(['c', 'a'])
  })

  it('does not mutate the input array', () => {
    const before = ids(rows)
    sortRows(rows, { key: 'amount', dir: 'asc' })
    expect(ids(rows)).toEqual(before)
  })

  it('breaks ties deterministically on created_at', () => {
    const sameDay = [
      t({ id: 'late', date: '2026-10-01T00:00:00Z', created_at: '2026-10-01T18:00:00Z' }),
      t({ id: 'early', date: '2026-10-01T00:00:00Z', created_at: '2026-10-01T09:00:00Z' }),
    ]
    expect(ids(sortRows(sameDay, { key: 'date', dir: 'desc' }))).toEqual(['late', 'early'])
    expect(ids(sortRows(sameDay, { key: 'date', dir: 'asc' }))).toEqual(['early', 'late'])
  })
})

describe('toggleSort', () => {
  it('starts a new column descending', () => {
    expect(toggleSort({ key: 'date', dir: 'desc' }, 'amount')).toEqual({ key: 'amount', dir: 'desc' })
  })

  it('flips direction on the active column', () => {
    expect(toggleSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' })
    expect(toggleSort({ key: 'date', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' })
  })
})

describe('currencySubtotals', () => {
  it('sums by type within each currency and never across them', () => {
    expect(currencySubtotals(rows)).toEqual([
      { currency: 'INR', bought: 48912, sold: 0, dividends: 0 },
      { currency: 'EUR', bought: 2600, sold: 3200, dividends: 0 },
      { currency: 'USD', bought: 0, sold: 0, dividends: 42.8 },
    ])
  })

  it('gives each legacy code its own bucket', () => {
    const legacy = [
      t({ id: 'u', currency: 'USD', amount: 100 }),
      t({ id: 'g', currency: 'GBP', amount: 200 }),
    ]
    const out = currencySubtotals(legacy)
    expect(out.map(b => b.currency)).toEqual(['GBP', 'USD'])
    expect(out.every(b => b.bought === (b.currency === 'USD' ? 100 : 200))).toBe(true)
  })

  it('counts an opening balance as money invested', () => {
    const opening = [t({ id: 'o', type: 'opening', amount: 241920 })]
    expect(currencySubtotals(opening)[0]).toEqual({ currency: 'INR', bought: 241920, sold: 0, dividends: 0 })
  })

  it('ignores cashless corporate actions', () => {
    const split = [t({ id: 's', type: 'split', amount: 0, ratio: 2 })]
    expect(currencySubtotals(split)[0]).toEqual({ currency: 'INR', bought: 0, sold: 0, dividends: 0 })
  })
})

describe('facets', () => {
  it('lists only the currencies present, supported ones first', () => {
    expect(currencyFacet(rows)).toEqual(['INR', 'EUR', 'USD'])
  })

  it('lists only the types present, in ledger order', () => {
    expect(typeFacet(rows)).toEqual(['buy', 'sell', 'dividend', 'split'])
  })
})

describe('impliedCostPerShare', () => {
  it('derives amount ÷ quantity for buy, sell and opening', () => {
    expect(impliedCostPerShare(t({ amount: 48912, quantity: 12 }))).toBeCloseTo(4076)
    expect(impliedCostPerShare(t({ type: 'sell', amount: 100, quantity: 4 }))).toBe(25)
    expect(impliedCostPerShare(t({ type: 'opening', amount: 100, quantity: 4 }))).toBe(25)
  })

  it('is undefined-by-design for dividends and corporate actions', () => {
    expect(impliedCostPerShare(t({ type: 'dividend', quantity: 0 }))).toBeNull()
    expect(impliedCostPerShare(t({ type: 'split', quantity: 0, amount: 0 }))).toBeNull()
  })

  it('never divides by zero', () => {
    expect(impliedCostPerShare(t({ quantity: 0 }))).toBeNull()
  })
})

describe('visibleColumns', () => {
  it('drops the columns no row in the set uses', () => {
    const buysOnly = applyFilters(rows, { ...emptyFilters(), types: ['buy'] })
    const cols = visibleColumns(buysOnly)
    expect(cols.quantity).toBe(true)
    expect(cols.impliedCost).toBe(true)
    expect(cols.ratio).toBe(false)
    expect(cols.realizedSeed).toBe(false)
    expect(cols.openingDate).toBe(false)
  })

  it('keeps the opening-date column whenever an opening is present', () => {
    expect(visibleColumns([t({ type: 'opening', opening_date: null })]).openingDate).toBe(true)
  })
})
