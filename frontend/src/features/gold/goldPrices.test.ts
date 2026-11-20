import { describe, expect, it } from 'vitest'
import { enteredPrices, pricePerGram, pricesByMonth } from './goldPrices'

describe('pricePerGram', () => {
  it('accepts a positive rate, grouped or not', () => {
    expect(pricePerGram('9500')).toBe(9500)
    expect(pricePerGram('9,500.5')).toBe(9500.5)
  })

  it('rejects zero, negatives and blanks', () => {
    expect(pricePerGram('0')).toBeNull()
    expect(pricePerGram('')).toBeNull()
  })
})

describe('enteredPrices', () => {
  const days = ['2026-11-15', '2026-11-16', '2026-11-17']

  it('sends only the filled days, in the given order', () => {
    expect(enteredPrices(days, { '2026-11-17': '9600', '2026-11-15': '9500', '2026-11-16': ' ' })).toEqual({
      prices: [{ date: '2026-11-15', price_per_gram: 9500 }, { date: '2026-11-17', price_per_gram: 9600 }],
      invalidDate: null,
    })
  })

  it('names the first unusable entry and sends nothing', () => {
    expect(enteredPrices(days, { '2026-11-15': '9500', '2026-11-16': '0' }))
      .toEqual({ prices: [], invalidDate: '2026-11-16' })
  })
})

describe('pricesByMonth', () => {
  it('groups newest month first with newest day first inside each', () => {
    const groups = pricesByMonth([
      { date: '2026-10-30', price_per_gram: 9000 },
      { date: '2026-11-01', price_per_gram: 9100 },
      { date: '2026-11-18', price_per_gram: 9500 },
    ])
    expect(groups.map(group => group.month)).toEqual(['2026-11', '2026-10'])
    expect(groups[0].prices.map(price => price.date)).toEqual(['2026-11-18', '2026-11-01'])
  })
})
