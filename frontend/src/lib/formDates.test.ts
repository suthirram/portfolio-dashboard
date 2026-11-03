import { describe, expect, it } from 'vitest'
import { formatDate, formatDayMonth, normaliseDate, todayIST } from './formDates'

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

describe('todayIST', () => {
  it('rolls over at midnight IST, not UTC', () => {
    expect(todayIST(new Date('2026-10-30T18:29:00Z'))).toBe('2026-10-30')
    expect(todayIST(new Date('2026-10-30T18:31:00Z'))).toBe('2026-10-31')
  })
})

describe('normaliseDate', () => {
  it('reads day-first dates', () => {
    expect(normaliseDate('1/2/2020')).toBe('2020-02-01')
    expect(normaliseDate('12/5/2023')).toBe('2023-05-12')
    expect(normaliseDate('15-03-2020')).toBe('2020-03-15')
    expect(normaliseDate('2020-03-15')).toBe('2020-03-15')
  })
  it('rejects impossible dates', () => {
    expect(normaliseDate('31/02/2021')).toBe('')
    expect(normaliseDate('13/13/2020')).toBe('')
    expect(normaliseDate('abc')).toBe('')
  })
  // The owner's broker file mixes both shapes in one column (PRD-008 §4);
  // the time is read past and dropped, the day kept.
  it('keeps only the day when a time follows the date', () => {
    expect(normaliseDate('1/11/2024')).toBe('2024-11-01')
    expect(normaliseDate('17-12-2024 03:30 PM')).toBe('2024-12-17')
    expect(normaliseDate('01-01-2026 12:05 AM')).toBe('2026-01-01')
    expect(normaliseDate('25-06-2025 15:30')).toBe('2025-06-25')
    expect(normaliseDate('25-06-2025 09:00:45')).toBe('2025-06-25')
  })
  it('rejects an impossible time or a trailing word', () => {
    expect(normaliseDate('17-12-2024 13:30 PM')).toBe('')
    expect(normaliseDate('17-12-2024 24:00')).toBe('')
    expect(normaliseDate('17-12-2024 03:30 PM IST')).toBe('')
  })
})
