import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { HistoryRow, User } from '../../lib/api/client'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const mockAuth = vi.hoisted(() => ({ user: null as Partial<User> | null }))
vi.mock('../../features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../features/auth/AuthContext')>('../../features/auth/AuthContext')
  return { ...actual, useAuthOptional: () => (mockAuth.user ? { user: mockAuth.user } : null) }
})

import HistoryChartPage from '../../features/history/HistoryChartPage'

const row = (date: string, invested: number, current: number): HistoryRow => ({
  date,
  regions: { INR: { invested, current, source: 'cron' } },
  totals: { invested_total: invested, current_total: current, pnl_pct: 0 },
})

const renderAt = (region: string) => render(
  <MemoryRouter initialEntries={[`/history/chart/${region}`]}>
    <Routes>
      <Route path="/history/chart/:region" element={<HistoryChartPage />} />
      <Route path="/history" element={<p>History page</p>} />
    </Routes>
  </MemoryRouter>,
)

describe('full-history chart page in UI_2.0', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.listHistory.mockResolvedValue({
      currency: 'INR',
      rows: [row('2024-01-01', 100, 110), row('2024-01-03', 100, 130)],
    })
  })

  it('uses the UI_2.0 intro, panel and controls with the same data and actions', async () => {
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'ui2', premium: false }
    renderAt('INR')
    expect(await screen.findByRole('heading', { level: 1, name: 'India (INR) · invested vs current' })).toBeInTheDocument()
    expect(screen.getByText(/Full dataset \(01-01-2024 → 03-01-2024\)/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/2 points · daily/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveClass('ui2-btn')
    const weekly = screen.getByRole('button', { name: 'Weekly' })
    fireEvent.click(weekly)
    expect(weekly).toHaveClass('active')
    expect(screen.getByText(/1 points · weekly close/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '‹ Back to History' }))
    expect(screen.getByText('History page')).toBeInTheDocument()
  })

  it('keeps the classic header for other interfaces', async () => {
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'glass', premium: false }
    renderAt('INR')
    expect(await screen.findByRole('heading', { level: 1, name: 'India (INR) — Invested vs Current' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to historical data' })).toBeInTheDocument()
  })
})
