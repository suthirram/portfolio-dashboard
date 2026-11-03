import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HistoryList, HistoryRow } from '../../lib/api/client'
import type { MonthlyInvestment } from '../history/historyShared'
import { historyRow } from '../history/historyTestRows'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn(), getPrices: vi.fn(), getGoldMetrics: vi.fn() }))
const chart = vi.hoisted(() => ({ months: [] as MonthlyInvestment[] }))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

vi.mock('./InvestmentDeltaChart', () => ({
  InvestmentDeltaChart: ({ months }: { months: MonthlyInvestment[] }) => {
    chart.months = months
    return null
  },
}))

import { InvestmentDeltaPanel } from './InvestmentDeltaPanel'

const list = (rows: HistoryRow[]): HistoryList => ({ currency: 'INR', rows })
const handleButton = () => screen.getByRole('button', { name: /Investment delta/ })
const renderPanel = () => render(<InvestmentDeltaPanel theme="dark" />)
// Trading year 2026; 22:00 UTC is outside the live window (03:30–20:30 UTC).
const FROZEN_NOW = new Date('2026-06-16T22:00:00Z')

describe('InvestmentDeltaPanel', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FROZEN_NOW)
    chart.months = []
    // This jsdom has no localStorage (hence `window.localStorage?.` in app
    // code); a fresh stub per test, as History's charts-on-top test does.
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) },
      },
    })
    mockApi.listHistory.mockResolvedValue(list([
      historyRow('2025-12-31', { INR: [100, 110] }),
      historyRow('2026-01-31', { INR: [150, 160], EUR: [0, 0] }),
    ]))
  })

  it('starts collapsed and fetches nothing', () => {
    renderPanel()
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
    expect(handleButton()).toHaveTextContent('▲ Investment delta · 2026')
    expect(mockApi.listHistory).not.toHaveBeenCalled()
  })

  it('opens on the year with its baseline row, and stays open after a reload', async () => {
    const { unmount } = renderPanel()
    fireEvent.click(handleButton())
    expect(handleButton()).toHaveAttribute('aria-expanded', 'true')
    expect(mockApi.listHistory).toHaveBeenCalledWith('2026-01-01', '2026-12-31', true)
    expect(await screen.findByRole('img', { name: 'Investment delta 2026, 🇮🇳 India' })).toBeInTheDocument()

    unmount()
    renderPanel()
    expect(handleButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('moves between years, with next disabled on the current year', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledWith('2025-01-01', '2025-12-31', true))
    expect(handleButton()).toHaveTextContent('Investment delta · 2025')
    expect(screen.getByRole('button', { name: 'Next year' })).toBeEnabled()
  })

  it('offers only the columns with money invested', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByRole('button', { name: '🇮🇳 India' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: '🇪🇺 Europe' })).not.toBeInTheDocument()
  })

  it('says so when the year has no History rows', async () => {
    mockApi.listHistory.mockResolvedValue(list([]))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText('No History rows for 2026')).toBeInTheDocument()
  })

  it('treats a year holding only the earlier baseline row as empty', async () => {
    mockApi.listHistory.mockResolvedValue(list([historyRow('2025-12-31', { INR: [100, 110] })]))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText('No History rows for 2026')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '🇮🇳 India' })).not.toBeInTheDocument()
  })

  it("adds today's live row to the current month, as the History card does", async () => {
    vi.setSystemTime(new Date('2026-06-17T10:00:00Z')) // Wednesday, inside the live window
    mockApi.listHistory.mockResolvedValue(list([
      historyRow('2026-05-29', { INR: [100, 110] }),
      historyRow('2026-06-16', { INR: [100, 112] }),
    ]))
    // Bought 50 more today, after the last snapshot.
    mockApi.getPrices.mockResolvedValue({
      holdings: [{
        symbol: 'TCS.NS', script: 'TCS', currency: 'INR', stocks_owned: 15,
        current_price: 11, cost_price: 150, current_value: 165,
      }],
      eur_rate: 0.011,
    })
    renderPanel()
    fireEvent.click(handleButton())
    // June: opening 100 (29 May), closing 150 (today's live row).
    await waitFor(() => expect(chart.months[5]).toEqual({ month0: 5, delta: 50, invested: 150 }))
    expect(mockApi.getPrices).toHaveBeenCalled()
  })

  it('shows the error when the year fails to load', async () => {
    mockApi.listHistory.mockRejectedValue(new Error('boom'))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})
