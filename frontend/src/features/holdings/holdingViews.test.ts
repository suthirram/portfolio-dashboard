import { describe, expect, it } from 'vitest'
import { filterByView, isActive, isNil, viewCounts } from './holdingViews'

const h = (id: string, stocks_owned: number | null | undefined) =>
  ({ id, stocks_owned } as unknown as { id: string; stocks_owned: number })

describe('isActive / isNil', () => {
  it('treats > 0 as active', () => {
    expect(isActive(h('a', 1))).toBe(true)
    expect(isActive(h('a', 0.5))).toBe(true)
  })

  it('treats 0, null, undefined as nil', () => {
    expect(isNil(h('a', 0))).toBe(true)
    expect(isNil(h('a', null))).toBe(true)
    expect(isNil(h('a', undefined))).toBe(true)
    expect(isActive(h('a', 0))).toBe(false)
    expect(isActive(h('a', null))).toBe(false)
  })
})

describe('filterByView', () => {
  const data = [
    h('a', 10),
    h('b', 0),
    h('c', 5),
    h('d', null),
    h('e', undefined),
  ]

  it('returns active holdings (qty > 0) for "active"', () => {
    expect(filterByView(data, 'active').map(x => x.id)).toEqual(['a', 'c'])
  })

  it('returns nil holdings (qty == 0 / null / undefined) for "nil"', () => {
    expect(filterByView(data, 'nil').map(x => x.id)).toEqual(['b', 'd', 'e'])
  })

  it('returns everything for "all"', () => {
    expect(filterByView(data, 'all').map(x => x.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('handles null / undefined input safely', () => {
    expect(filterByView(null, 'active')).toEqual([])
    expect(filterByView(undefined, 'all')).toEqual([])
    expect(filterByView(undefined, 'nil')).toEqual([])
  })

  it('does not mutate input array', () => {
    const original = [...data]
    filterByView(data, 'nil')
    expect(data).toEqual(original)
  })
})

describe('viewCounts', () => {
  it('counts active, nil, and total', () => {
    const data = [h('a', 10), h('b', 0), h('c', 5), h('d', null)]
    expect(viewCounts(data)).toEqual({ active: 2, nil: 2, all: 4 })
  })

  it('returns zeros for empty / null input', () => {
    expect(viewCounts([])).toEqual({ active: 0, nil: 0, all: 0 })
    expect(viewCounts(null)).toEqual({ active: 0, nil: 0, all: 0 })
    expect(viewCounts(undefined)).toEqual({ active: 0, nil: 0, all: 0 })
  })

  it('active + nil always equals all', () => {
    const data = [h('a', 10), h('b', 0), h('c', 5), h('d', null), h('e', 0)]
    const c = viewCounts(data)
    expect(c.active + c.nil).toBe(c.all)
  })
})
