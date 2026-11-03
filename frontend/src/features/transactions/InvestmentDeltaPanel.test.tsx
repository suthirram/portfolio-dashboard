import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HistoryList, HistoryRow, InvestmentDelta } from '../../lib/api/client'
import type { MonthlyInvestment } from '../history/historyShared'
import { historyRow } from '../history/historyTestRows'

const mockApi = vi.hoisted(() => ({ listHistory: vi.fn(), getInvestmentDelta: vi.fn(), getPrices: vi.fn(), getGoldMetrics: vi.fn() }))
// The signed-in user's per-user switch (PD-052): true reads History rows.
const session = vi.hoisted(() => ({ deltaFromHistory: true }))
const chart = vi.hoisted(() => ({ months: [] as MonthlyInvestment[] }))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

vi.mock('../auth/AuthContext', () => ({
  useAuthOptional: () => ({ user: { gold_enabled: false, delta_from_history: session.deltaFromHistory } }),
}))

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

// The PD-050 version, for users the super admin switched to History.
describe('InvestmentDeltaPanel (switched to History)', () => {
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
    session.deltaFromHistory = true
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
    expect(handleButton()).toHaveTextContent('▼ Investment delta · 2026')
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

  it('reloads the year after a ledger edit, keeping the chart on screen meanwhile', async () => {
    const { rerender } = renderPanel()
    fireEvent.click(handleButton())
    // January: opening 100 (31 Dec), closing 150.
    await waitFor(() => expect(chart.months[0]).toEqual({ month0: 0, delta: 50, invested: 150 }))

    let resolveReload: (value: HistoryList) => void = () => {}
    mockApi.listHistory.mockReturnValue(new Promise<HistoryList>(resolve => { resolveReload = resolve }))
    rerender(<InvestmentDeltaPanel theme="dark" refreshKey={1} />)
    expect(mockApi.listHistory).toHaveBeenCalledTimes(2)
    expect(mockApi.listHistory).toHaveBeenLastCalledWith('2026-01-01', '2026-12-31', true)
    expect(screen.getByRole('img', { name: 'Investment delta 2026, 🇮🇳 India' })).toBeInTheDocument()

    // A backdated buy healed January's closing row.
    resolveReload(list([
      historyRow('2025-12-31', { INR: [100, 110] }),
      historyRow('2026-01-31', { INR: [180, 190] }),
    ]))
    await waitFor(() => expect(chart.months[0]).toEqual({ month0: 0, delta: 80, invested: 180 }))
  })

  it('fetches nothing on a ledger edit while collapsed', () => {
    const { rerender } = renderPanel()
    rerender(<InvestmentDeltaPanel theme="dark" refreshKey={1} />)
    expect(mockApi.listHistory).not.toHaveBeenCalled()
  })

  it("refetches today's live row after a ledger edit", async () => {
    vi.setSystemTime(new Date('2026-06-17T10:00:00Z')) // Wednesday, inside the live window
    mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
    const { rerender } = renderPanel()
    fireEvent.click(handleButton())
    await waitFor(() => expect(mockApi.getPrices).toHaveBeenCalledTimes(1))

    rerender(<InvestmentDeltaPanel theme="dark" refreshKey={1} />)
    await waitFor(() => expect(mockApi.getPrices).toHaveBeenCalledTimes(2))
  })

  it('shows the error when the year fails to load', async () => {
    mockApi.listHistory.mockRejectedValue(new Error('boom'))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText('boom')).toBeInTheDocument()
  })
})

// The default since PD-052: the figures come from the ledger endpoint.
describe('InvestmentDeltaPanel (from the ledger)', () => {
  const months = (values: Array<[number, number]>) => Array.from({ length: 12 }, (_, month0) => (
    values[month0] ? { month0, invested: values[month0][0], delta: values[month0][1] } : { month0, invested: null, delta: null }))
  const delta = (year: number): InvestmentDelta => ({
    year,
    columns: [
      { column: 'INR', months: months([[150, 50], [150, 0]]) },
      { column: 'GOLD', months: months([[7000, 7000]]) },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    chart.months = []
    session.deltaFromHistory = false
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value) },
        removeItem: (key: string) => { store.delete(key) },
      },
    })
    mockApi.getInvestmentDelta.mockImplementation((year: number) => Promise.resolve(delta(year)))
  })

  it('charts the ledger months and never reads History', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByRole('img', { name: /Investment delta \d+, 🇮🇳 India/ })).toBeInTheDocument()
    expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(1)
    expect(mockApi.listHistory).not.toHaveBeenCalled()
    expect(mockApi.getPrices).not.toHaveBeenCalled()
    expect(chart.months[0]).toEqual({ month0: 0, delta: 50, invested: 150 })
    expect(chart.months[2]).toEqual({ month0: 2, delta: null, invested: null })
  })

  it('offers the columns the ledger returns', async () => {
    renderPanel()
    fireEvent.click(handleButton())
    fireEvent.click(await screen.findByRole('button', { name: '🥇 Gold' }))
    await waitFor(() => expect(chart.months[0]).toEqual({ month0: 0, delta: 7000, invested: 7000 }))
    expect(screen.queryByRole('button', { name: '🇪🇺 Europe' })).not.toBeInTheDocument()
  })

  it('asks the ledger for the year shown, and reloads after a ledger edit', async () => {
    const { rerender } = renderPanel()
    fireEvent.click(handleButton())
    const shown = Number(handleButton().textContent?.match(/\d{4}/)?.[0])
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenLastCalledWith(shown))
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenLastCalledWith(shown - 1))
    rerender(<InvestmentDeltaPanel theme="dark" refreshKey={1} />)
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(3))
  })

  it('says so when nothing was invested in the year', async () => {
    mockApi.getInvestmentDelta.mockImplementation((year: number) => Promise.resolve({ year, columns: [] }))
    renderPanel()
    fireEvent.click(handleButton())
    expect(await screen.findByText(/^Nothing invested in \d{4}$/)).toBeInTheDocument()
  })
})
