import { describe, expect, it } from 'vitest'
import { canonicalCurrency, compareCurrencies, currencySymbol } from './currency'

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
