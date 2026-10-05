import { describe, expect, it } from 'vitest'
import { formatDate, formatDayMonth } from './formDates'

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

describe('formatDayMonth', () => {
  it('converts YYYY-MM-DD to dd-MM, keeping the app-wide day-first order', () => {
    expect(formatDayMonth('2026-06-16')).toBe('16-06')
    expect(formatDayMonth('2026-12-01')).toBe('01-12')
  })

  it('handles a full RFC3339 timestamp by using the date part', () => {
    expect(formatDayMonth('2026-06-16T00:00:00Z')).toBe('16-06')
  })

  it('passes through an already-formatted dd-MM-yyyy unchanged', () => {
    // Regression: the first cut re-parsed formatDate's *output* with a
    // /^\d{2}-\d{2}-\d{4}$/ test, which an already-formatted date matches —
    // so it got truncated to '16-06' instead of passing through.
    expect(formatDayMonth('16-06-2026')).toBe('16-06-2026')
  })

  it('passes through non-ISO input unchanged', () => {
    expect(formatDayMonth('not a date')).toBe('not a date')
    expect(formatDayMonth(null)).toBe('')
  })
})
