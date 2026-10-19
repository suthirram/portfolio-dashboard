import { describe, expect, it } from 'vitest'
import {
  canonicalCurrency,
  compareCurrencies,
  currencySymbol,
  formatMoney,
  formatQuantity,
} from './currency'

describe('currencySymbol', () => {
  it('maps the supported currencies', () => {
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencySymbol('EUR')).toBe('€')
  })

  it('treats blank as INR and ignores case', () => {
    expect(currencySymbol('')).toBe('₹')
    expect(currencySymbol(null)).toBe('₹')
    expect(currencySymbol(undefined)).toBe('₹')
    expect(currencySymbol('eur')).toBe('€')
  })

  it('returns an unsupported code itself, never a rupee sign', () => {
    expect(currencySymbol('USD')).toBe('USD')
    expect(currencySymbol('gbp')).toBe('GBP')
  })
})

describe('canonicalCurrency', () => {
  it('defaults blank to INR and upper-cases', () => {
    expect(canonicalCurrency('  ')).toBe('INR')
    expect(canonicalCurrency('eur')).toBe('EUR')
  })

  it('keeps two distinct unknown codes distinct', () => {
    expect(canonicalCurrency('usd')).not.toBe(canonicalCurrency('gbp'))
  })
})

describe('compareCurrencies', () => {
  it('orders supported first, then other codes alphabetically', () => {
    expect(['USD', 'EUR', 'GBP', 'INR'].sort(compareCurrencies)).toEqual(['INR', 'EUR', 'GBP', 'USD'])
  })
})

describe('formatMoney', () => {
  it('prefixes a supported currency with its glyph, no gap', () => {
    expect(formatMoney(48912, 'INR')).toBe('₹48,912.00')
    expect(formatMoney(2600, 'EUR')).toBe('€2,600.00')
  })

  it('separates a legacy code from the amount', () => {
    expect(formatMoney(5310, 'USD')).toBe('USD 5,310.00')
  })

  it('renders no-cash as an em dash rather than a zero', () => {
    expect(formatMoney(0, 'INR')).toBe('—')
    expect(formatMoney(null, 'INR')).toBe('—')
    expect(formatMoney(undefined, 'INR')).toBe('—')
  })

  it('keeps the sign outside the symbol', () => {
    expect(formatMoney(-1200, 'INR')).toBe('-₹1,200.00')
    expect(formatMoney(-1200, 'USD')).toBe('-USD 1,200.00')
  })
})

describe('formatQuantity', () => {
  it('keeps fractional units and drops trailing zeros', () => {
    expect(formatQuantity(21.4508)).toBe('21.451')
    expect(formatQuantity(12)).toBe('12')
  })

  it('renders an absent or zero quantity as an em dash', () => {
    expect(formatQuantity(0)).toBe('—')
    expect(formatQuantity(null)).toBe('—')
  })
})
