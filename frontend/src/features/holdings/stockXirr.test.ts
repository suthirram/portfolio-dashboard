import { describe, expect, it } from 'vitest'
import { indexXirr, underAYear, xirrNote } from './stockXirr'

describe('indexXirr', () => {
  it('keys holdings by id and buckets by currency', () => {
    const index = indexXirr({
      as_of: '2026-11-11',
      currencies: [
        { currency: 'INR', xirr: 0.12, since: '2024-01-01', undated_openings: 0 },
        { currency: 'EUR', xirr: null, since: null, undated_openings: 0 },
      ],
      holdings: [{ holding_id: 'h1', xirr: -0.05, since: '2025-01-01', undated_opening: true }],
    })
    expect(index?.asOf).toBe('2026-11-11')
    expect(index?.byHolding.h1?.xirr).toBe(-0.05)
    expect(index?.byCurrency.INR?.xirr).toBe(0.12)
    expect(index?.byCurrency.EUR?.xirr).toBeNull()
  })

  it('is null without a view', () => {
    expect(indexXirr(null)).toBeNull()
  })
})

describe('underAYear', () => {
  it('flags windows shorter than 365 days only', () => {
    expect(underAYear('2026-11-01', '2026-11-11')).toBe(true)
    expect(underAYear('2025-11-12', '2026-11-11')).toBe(true)
    expect(underAYear('2025-11-11', '2026-11-11')).toBe(false)
    expect(underAYear(null, '2026-11-11')).toBe(false)
  })
})

describe('xirrNote', () => {
  it('explains each caveat, and nothing when there is none', () => {
    expect(xirrNote('2026-11-01', '2026-11-11', false)).toMatch(/less than a year/)
    expect(xirrNote('2020-01-01', '2026-11-11', true)).toMatch(/no date set/)
    expect(xirrNote('2020-01-01', '2026-11-11', false)).toBe('')
  })
})
