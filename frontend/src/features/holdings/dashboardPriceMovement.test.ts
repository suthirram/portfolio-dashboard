import { describe, expect, it } from 'vitest'
import {
  attachPreviousClosePrices,
  computeGroupDayGain,
  holdingDayGain,
  holdingMovement,
  priceMovement,
  priceMovementKey,
  priceMovementTone,
  type HoldingWithPreviousClose,
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

  it('prefers the snapshot close over the close the prices response carries', () => {
    // The response's close (e.g. Yahoo's, which drifts over weekends) stays
    // only where no snapshot row matches.
    const holdings = [
      { ...holding({ id: '1', symbol: 'TCS.NS', script: 'TCS' }), previous_close_price: 90 },
      { ...holding({ id: '2', symbol: 'INFY.NS', script: 'INFY' }), previous_close_price: 95 },
    ]

    const got = attachPreviousClosePrices(holdings, [
      snapshot({ symbol: 'TCS.NS', script: 'TCS', close_price: 101 }),
    ])

    expect(got[0].previous_close_price).toBe(101)
    expect(got[1].previous_close_price).toBe(95)
  })

  it('has no day gain without a previous close, even with an average cost', () => {
    const fresh = holding({ stocks_owned: 5, avg_cost_price: 100, current_price: 110 })
    expect(holdingMovement(fresh)).toBeNull()
    expect(holdingDayGain(fresh)).toBeNull()
    expect(holdingDayGain({ ...fresh, previous_close_price: 108 })).toBe(10)
  })

  it('sums a group whose holdings mix snapshot and response closes', () => {
    const holdings: HoldingWithPreviousClose[] = [
      { ...holding({ id: '1', symbol: 'TCS.NS', script: 'TCS', stocks_owned: 2, current_price: 120 }), previous_close_price: 80 },
      { ...holding({ id: '2', symbol: 'INFY.NS', script: 'INFY', stocks_owned: 3, current_price: 50 }), previous_close_price: 60 },
    ]
    const [fromSnapshot, fromResponse] = attachPreviousClosePrices(holdings,
      [snapshot({ symbol: 'TCS.NS', script: 'TCS', close_price: 100 })])

    // TCS: 2 × (120 − 100 snapshot) = 40; INFY: 3 × (50 − 60 response) = −30.
    expect(computeGroupDayGain([fromSnapshot, fromResponse])).toBe(10)
  })

  it('returns null for a group when any active holding has no previous close', () => {
    expect(computeGroupDayGain([
      { ...holding({ id: '1', stocks_owned: 2, current_price: 120 }), previous_close_price: 100 },
      holding({ id: '2', stocks_owned: 3, current_price: 50, avg_cost_price: 40 }),
    ])).toBeNull()
  })

  it('ignores exited holdings and returns null for a group that holds nothing', () => {
    expect(computeGroupDayGain([
      { ...holding({ id: '1', stocks_owned: 2, current_price: 120 }), previous_close_price: 100 },
      holding({ id: '2', stocks_owned: 0, current_price: 50 }),
    ])).toBe(40)
    expect(computeGroupDayGain([holding({ stocks_owned: 0 })])).toBeNull()
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
