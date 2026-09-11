import { describe, expect, it } from 'vitest'
import { formatDate } from './formDates'

describe('formatDate', () => {
  it('converts YYYY-MM-DD to dd-MM-yyyy', () => {
    expect(formatDate('2026-06-16')).toBe('16-06-2026')
  })

  it('handles a full RFC3339 timestamp by using the date part', () => {
    expect(formatDate('2026-06-16T00:00:00Z')).toBe('16-06-2026')
  })

  it('passes through non-ISO input unchanged', () => {
    expect(formatDate('16-06-2026')).toBe('16-06-2026')
    expect(formatDate('not a date')).toBe('not a date')
  })

  it('returns empty string for null/undefined/empty input', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
  })
})
