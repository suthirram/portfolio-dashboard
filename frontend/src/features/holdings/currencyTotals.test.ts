import { describe, expect, it } from 'vitest'
import { emptyTotals, nativeSymbols, nativeView, sumTotals } from './currencyTotals'

const row = (
  cost: number, costEur: number,
  value: number, valueEur: number,
  unreal: number, unrealEur: number,
  real: number, realEur: number,
) => ({
  cost_price: cost,
  cost_price_eur: costEur,
  current_value: value,
  current_value_eur: valueEur,
  unrealized_pnl: unreal,
  unrealized_pnl_eur: unrealEur,
  realized_pnl: real,
  realized_pnl_eur: realEur,
})

describe('sumTotals', () => {
  it('returns zeros for empty / null / undefined input', () => {
    expect(sumTotals([])).toEqual(emptyTotals())
    expect(sumTotals(null)).toEqual(emptyTotals())
    expect(sumTotals(undefined)).toEqual(emptyTotals())
  })

  it('sums all eight fields across rows', () => {
    const rows = [
      row(100, 1, 200, 2, 50, 0.5, 10, 0.1),
      row(300, 3, 400, 4, 70, 0.7, 20, 0.2),
    ]
    const t = sumTotals(rows)
    expect(t.cost).toBe(400)
    expect(t.costEur).toBeCloseTo(4)
    expect(t.value).toBe(600)
    expect(t.valueEur).toBeCloseTo(6)
    expect(t.unreal).toBe(120)
    expect(t.unrealEur).toBeCloseTo(1.2)
    expect(t.real).toBe(30)
    expect(t.realEur).toBeCloseTo(0.3)
  })

  it('treats missing / null / undefined numbers as 0', () => {
    const rows = [
      { cost_price: undefined, cost_price_eur: null,
        current_value: undefined, current_value_eur: undefined,
        unrealized_pnl: undefined, unrealized_pnl_eur: undefined,
        realized_pnl: undefined, realized_pnl_eur: undefined } as unknown as Parameters<typeof sumTotals>[0] extends (infer R)[] | null | undefined ? R : never,
      row(50, 0.5, 0, 0, 0, 0, 0, 0),
    ]
    expect(sumTotals(rows).cost).toBe(50)
    expect(sumTotals(rows).costEur).toBeCloseTo(0.5)
  })

  it('handles negative numbers (realised losses)', () => {
    const rows = [row(0, 0, 0, 0, -10, -0.1, -50, -0.5)]
    const t = sumTotals(rows)
    expect(t.unreal).toBe(-10)
    expect(t.realEur).toBeCloseTo(-0.5)
  })
})

describe('nativeView', () => {
  it('makes INR primary when currency is INR', () => {
    expect(nativeView('INR', 100, 1.2)).toEqual({ primary: 100, secondary: 1.2 })
  })

  it('makes EUR primary when currency is EUR', () => {
    expect(nativeView('EUR', 100, 1.2)).toEqual({ primary: 1.2, secondary: 100 })
  })

  it('treats OTHER as INR-side primary (no EUR-native handling)', () => {
    expect(nativeView('OTHER', 100, 1.2)).toEqual({ primary: 100, secondary: 1.2 })
  })

  it('preserves arbitrary value types (the helper is generic)', () => {
    expect(nativeView('EUR', 'a', 'b')).toEqual({ primary: 'b', secondary: 'a' })
  })
})

describe('nativeSymbols', () => {
  it('returns ₹/€ for INR currencies', () => {
    expect(nativeSymbols('INR')).toEqual({ native: '₹', foreign: '€' })
    expect(nativeSymbols('OTHER')).toEqual({ native: '₹', foreign: '€' })
  })

  it('returns €/₹ for EUR', () => {
    expect(nativeSymbols('EUR')).toEqual({ native: '€', foreign: '₹' })
  })
})
