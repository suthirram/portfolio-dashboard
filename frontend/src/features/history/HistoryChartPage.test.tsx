import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { HistoryRow } from '../../lib/api/client'

// Recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import HistoryChartPage, { weekKey, toWeekly, fullSeries } from './HistoryChartPage'

const row = (date: string, inv: number, cur: number): HistoryRow => ({
  date,
  regions: { INR: { invested: inv, current: cur, source: 'cron' } },
  totals: { invested_total: inv, current_total: cur, pnl_pct: 0 },
})

describe('weekKey', () => {
  it('maps any weekday to the Monday of its ISO week', () => {
    // 2024-01-01 is a Monday; the whole week collapses to it.
    expect(weekKey('2024-01-01')).toBe('2024-01-01') // Mon
    expect(weekKey('2024-01-03')).toBe('2024-01-01') // Wed
    expect(weekKey('2024-01-07')).toBe('2024-01-01') // Sun (ISO week end)
  })
  it('rolls Sunday back to the prior Monday, not forward', () => {
    // 2024-01-07 Sun → 2024-01-01 Mon; 2024-01-08 Mon starts a new bucket.
    expect(weekKey('2024-01-07')).toBe('2024-01-01')
    expect(weekKey('2024-01-08')).toBe('2024-01-08')
  })
  it('handles month/year boundaries', () => {
    // 2023-12-31 is a Sunday → Monday 2023-12-25.
    expect(weekKey('2023-12-31')).toBe('2023-12-25')
  })
})

describe('toWeekly', () => {
  const daily = [
    { date: '2024-01-01', invested: 100, current: 110 }, // Mon wk A
    { date: '2024-01-03', invested: 100, current: 120 }, // Wed wk A
    { date: '2024-01-05', invested: 100, current: 130 }, // Fri wk A (last)
    { date: '2024-01-08', invested: 200, current: 250 }, // Mon wk B (only)
  ]
  it('collapses each ISO week to one point keyed by its Monday', () => {
    const w = toWeekly(daily)
    expect(w.map(p => p.date)).toEqual(['2024-01-01', '2024-01-08'])
  })
  it('keeps the LAST day of each week (weekly close)', () => {
    const w = toWeekly(daily)
    expect(w[0].current).toBe(130) // Fri, not Mon/Wed
    expect(w[1].current).toBe(250)
  })
  it('returns oldest-first even if input is unordered', () => {
    const w = toWeekly([...daily].reverse())
    expect(w.map(p => p.date)).toEqual(['2024-01-01', '2024-01-08'])
  })
  it('empty in, empty out', () => {
    expect(toWeekly([])).toEqual([])
  })
})

describe('fullSeries', () => {
  it('sorts oldest-first and keeps the full ISO date (no MM-DD slicing)', () => {
    const s = fullSeries([row('2024-02-01', 1, 2), row('2024-01-01', 3, 4)], 'INR')
    expect(s.map(p => p.date)).toEqual(['2024-01-01', '2024-02-01'])
  })
  it('emits null (not 0) for a region absent on a row', () => {
    const s = fullSeries([row('2024-01-01', 5, 6)], 'EUR')
    expect(s[0]).toEqual({ date: '2024-01-01', invested: null, current: null })
  })
})

const renderAt = (region: string) =>
  render(
    <MemoryRouter initialEntries={[`/history/chart/${region}`]}>
      <Routes>
        <Route path="/history/chart/:region" element={<HistoryChartPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('HistoryChartPage', () => {
  it('loads the full 2000→today range and renders the region header', async () => {
    mockApi.listHistory.mockResolvedValueOnce({
      currency: 'INR',
      rows: [row('2024-01-01', 100, 110), row('2024-01-08', 200, 250)],
    })
    renderAt('INR')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('India (INR) — Invested vs Current'))
    // Requested from the year-2000 floor, not a single month.
    expect(mockApi.listHistory).toHaveBeenCalledWith('2000-01-01', expect.any(String))
  })

  it('down-samples to weekly close when the Weekly toggle is clicked', async () => {
    // Two rows in the same ISO week collapse to one weekly point.
    mockApi.listHistory.mockResolvedValueOnce({
      currency: 'INR',
      rows: [row('2024-01-01', 100, 110), row('2024-01-03', 100, 130)],
    })
    renderAt('INR')
    await waitFor(() => expect(screen.getByText(/2 points · daily/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    expect(screen.getByText(/1 points · weekly close/)).toBeInTheDocument()
  })

  it('falls back to INR for an unknown region param', async () => {
    mockApi.listHistory.mockResolvedValueOnce({ currency: 'INR', rows: [row('2024-01-01', 1, 2)] })
    renderAt('ZZZ')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }))
      .toHaveTextContent('India (INR)'))
  })
})
