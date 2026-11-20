import { describe, expect, it } from 'vitest'
import { continuousPeriods } from './continuousPeriods'

describe('continuousPeriods', () => {
  it('fills quiet months with zero, across a year boundary', () => {
    expect(continuousPeriods([
      { period: '2018-11', total: 20 },
      { period: '2019-02', total: 74 },
    ], 'month')).toEqual([
      { period: '2018-11', total: 20 },
      { period: '2018-12', total: 0 },
      { period: '2019-01', total: 0 },
      { period: '2019-02', total: 74 },
    ])
  })

  it('fills quiet years and orders unsorted input', () => {
    expect(continuousPeriods([{ period: '2024', total: 5 }, { period: '2021', total: 9 }], 'year')).toEqual([
      { period: '2021', total: 9 },
      { period: '2022', total: 0 },
      { period: '2023', total: 0 },
      { period: '2024', total: 5 },
    ])
  })

  it('keeps a single period and an empty series as they are', () => {
    expect(continuousPeriods([{ period: '2026-11', total: 3 }], 'month')).toEqual([{ period: '2026-11', total: 3 }])
    expect(continuousPeriods([], 'month')).toEqual([])
  })
})
