import { describe, expect, it } from 'vitest'
import {
  attachPreviousClosePrices,
  priceMovement,
  priceMovementKey,
  priceMovementTone,
} from './dashboardPriceMovement'
import type { HistoryHolding } from '../../lib/api/client'
import type { HoldingWithPrice } from '../../types'

const holding = (overrides: Partial<HoldingWithPrice>): HoldingWithPrice => ({
  id: '1',
  script: 'TCS',
  symbol: 'TCS.NS',
  exchange: 'NSE',
  type: 'stock',
  stocks_owned: 1,
  avg_cost_price: 100,
  realized_pnl: 0,
  currency: 'INR',
  current_price: 120,
  ...overrides,
} as HoldingWithPrice)

const snapshot = (overrides: Partial<HistoryHolding>): HistoryHolding => ({
  symbol: 'TCS.NS',
  script: 'TCS',
  currency: 'INR',
  quantity: 1,
  close_price: 100,
  ...overrides,
})

describe('dashboard price movement helpers', () => {
  it('builds a stable matching key from symbol, script, and currency', () => {
    expect(priceMovementKey({ symbol: ' tcs.ns ', script: 'TCS', currency: 'inr' }))
      .toBe('TCS.NS|TCS|INR')
  })

  it('attaches previous close prices from matching snapshot holdings', () => {
    const holdings = [
      holding({ id: '1', symbol: 'TCS.NS', script: 'TCS', currency: 'INR' }),
      holding({ id: '2', symbol: 'TCS.NS', script: 'Plan B', currency: 'INR' }),
      holding({ id: '3', symbol: 'SAP.DE', script: 'SAP', currency: 'EUR' }),
    ]

    const got = attachPreviousClosePrices(holdings, [
      snapshot({ symbol: 'TCS.NS', script: 'TCS', currency: 'INR', close_price: 101 }),
      snapshot({ symbol: 'TCS.NS', script: 'Plan B', currency: 'INR', close_price: 202 }),
    ])

    expect(got[0].previous_close_price).toBe(101)
    expect(got[1].previous_close_price).toBe(202)
    expect(got[2].previous_close_price).toBeUndefined()
  })

  it('derives only positive and negative tones; unchanged stays default', () => {
    expect(priceMovementTone(121, 120)).toBe('pos')
    expect(priceMovementTone(119, 120)).toBe('neg')
    expect(priceMovementTone(120, 120)).toBeNull()
    expect(priceMovementTone(120, undefined)).toBeNull()
  })

  it('returns movement value and percentage when both prices are available', () => {
    expect(priceMovement(121, 120)).toEqual({
      change: 1,
      pct: 0.8333333333333334,
      tone: 'pos',
    })
    expect(priceMovement(120, 120)).toEqual({
      change: 0,
      pct: 0,
      tone: null,
    })
  })
})
