
import { describe, expect, it } from 'vitest'
import { groupByCurrency, normaliseCurrency } from './groupByCurrency'

const h = (id: string, currency: string | null | undefined) => ({ id, currency })

describe('normaliseCurrency', () => {
  it('passes INR and EUR through, uppercase', () => {
    expect(normaliseCurrency('INR')).toBe('INR')
    expect(normaliseCurrency('inr')).toBe('INR')
    expect(normaliseCurrency('EUR')).toBe('EUR')
  })

  it('buckets unknown / null / undefined into OTHER', () => {
    expect(normaliseCurrency('USD')).toBe('OTHER')
    expect(normaliseCurrency('')).toBe('OTHER')
    expect(normaliseCurrency(null)).toBe('OTHER')
    expect(normaliseCurrency(undefined)).toBe('OTHER')
  })
})

describe('groupByCurrency', () => {
  it('groups by currency and preserves the canonical INR → EUR → OTHER order', () => {
    const data = [
      h('a', 'EUR'),
      h('b', 'INR'),
      h('c', 'USD'),
      h('d', 'INR'),
      h('e', 'EUR'),
    ]
    const result = groupByCurrency(data)
    expect(result.map(g => g.currency)).toEqual(['INR', 'EUR', 'OTHER'])
    expect(result[0].holdings.map(x => x.id)).toEqual(['b', 'd'])
    expect(result[1].holdings.map(x => x.id)).toEqual(['a', 'e'])
    expect(result[2].holdings.map(x => x.id)).toEqual(['c'])
  })

  it('omits buckets with no holdings', () => {
    const result = groupByCurrency([h('a', 'INR')])
    expect(result.map(g => g.currency)).toEqual(['INR'])
  })

  it('preserves input order within each bucket', () => {
    const data = [h('a', 'INR'), h('b', 'INR'), h('c', 'INR')]
    expect(groupByCurrency(data)[0].holdings.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles null / undefined / empty input', () => {
    expect(groupByCurrency(null)).toEqual([])
    expect(groupByCurrency(undefined)).toEqual([])
    expect(groupByCurrency([])).toEqual([])
  })

  it('total holdings across groups equals input length', () => {
    const data = [h('a', 'INR'), h('b', 'EUR'), h('c', 'USD'), h('d', null)]
    const total = groupByCurrency(data).reduce((n, g) => n + g.holdings.length, 0)
    expect(total).toBe(data.length)
  })
})
