import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { HistoryList, HistoryRow } from '../../lib/api/client'

// Recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock the API client; keep the real ApiError so the 409 branch works.
const mockApi = vi.hoisted(() => ({
  listHistory: vi.fn(),
  addHistoryRow: vi.fn(),
  patchHistoryRegions: vi.fn(),
  deleteHistoryRow: vi.fn(),
  pasteHistory: vi.fn(),
  getPrices: vi.fn(),
  getGoldMetrics: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import HistoryPage from './HistoryPage'

const renderPage = () => render(<MemoryRouter><HistoryPage /></MemoryRouter>)

// Freeze the clock so the year-dropdown assertion is deterministic across
// real wall-clock rollovers. 22:00 UTC is deliberately *outside* the live
// window (03:30–20:30 UTC), so these tests render snapshot rows only; the
// live-row tests below set their own time inside the window.
const FROZEN_NOW = new Date('2026-06-16T22:00:00Z')

const sampleRow: HistoryRow = {
  date: '2026-06-16',
  regions: {
    INR:  { invested: 100, current: 198, source: 'cron' },
    EUR: { invested: 0, current: 0, source: 'cron' },
    USD:     { invested: 0, current: 0, source: 'cron' },
  },
  totals: { invested_total: 100, current_total: 198, pnl_pct: 98 },
}

const list = (rows: HistoryRow[]): HistoryList => ({ currency: 'INR', rows })

describe('HistoryPage', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(FROZEN_NOW)
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FROZEN_NOW)
    mockApi.listHistory.mockResolvedValue(list([]))
    mockApi.getPrices.mockResolvedValue({
      holdings: [{
        symbol: 'TCS.NS', script: 'TCS', currency: 'INR', stocks_owned: 10,
        current_price: 150, cost_price: 1000, current_value: 1500,
      }],
      eur_rate: 0.011,
    })
  })

  it('year dropdown spans 2020 → current year regardless of snapshot range', async () => {
    renderPage()
    const opts = Array.from(document.querySelectorAll('option')).map(o => o.textContent)
    // Years are contiguous, oldest first.
    for (let y = 2020; y <= 2026; y++) {
      expect(opts).toContain(String(y))
    }
  })

  it('renders the friendly empty state when the month has no rows', async () => {
    renderPage()
    expect(await screen.findByText(/No data for/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add row/ })).toBeInTheDocument()
  })

  it('uses the shared header idiom: icon back-link left, toolbar on btn classes', async () => {
    renderPage()
    const back = screen.getByRole('link', { name: 'Back to dashboard' })
    expect(back).toHaveClass('btn-icon')
    expect(back.getAttribute('href')).toBe('/')
    expect(screen.getByRole('button', { name: /Add row/ })).toHaveClass('btn-primary')
    expect(screen.getByRole('button', { name: /Paste month/ })).toHaveClass('btn')
  })

  it('renders the table when rows are present', async () => {
    mockApi.listHistory.mockResolvedValue(list([sampleRow]))
    renderPage()
    expect(await screen.findByText('16-06-2026')).toBeInTheDocument()
    // Header "Amount invested" appears once per currency group (INR, EUR).
    expect(screen.getAllByText('Amount invested').length).toBe(2)
  })

  it('uses the wide content container so the currency + gold columns fit', async () => {
    mockApi.listHistory.mockResolvedValue(list([sampleRow]))
    renderPage()
    await screen.findByText('16-06-2026')
    expect(screen.getByRole('main').style.maxWidth).toBe('1800px')
  })

  it('opts into the cyberpunk history background art shell', () => {
    const { container } = renderPage()
    expect(container.firstElementChild).toHaveClass('page-art-history')
  })

  it('moves the charts above the table on toggle and persists the choice', async () => {
    // This jsdom has no localStorage (hence the `window.localStorage?.`
    // convention in app code) — install a minimal stub to observe persistence.
    const store = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
      },
    })
    mockApi.listHistory.mockResolvedValue(list([sampleRow]))
    renderPage()
    await screen.findByText('16-06-2026')

    const domOrder = () => {
      const table = document.querySelector('table')!
      const chartHeading = screen.getByRole('heading', { name: /India \(INR\)/ })
      // FOLLOWING = the table comes after the chart heading in document order.
      return chartHeading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
    }

    // Default: table first.
    expect(domOrder()).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: /Charts on top/ }))
    expect(domOrder()).not.toBe(0)
    expect(window.localStorage.getItem('pd_history_charts_top')).toBe('1')
    expect(screen.getByRole('button', { name: /Charts below/ })).toHaveAttribute('aria-pressed', 'true')

    // Toggle back: table first again.
    fireEvent.click(screen.getByRole('button', { name: /Charts below/ }))
    expect(domOrder()).toBe(0)
    expect(window.localStorage.getItem('pd_history_charts_top')).toBe('0')
  })

  it('surfaces a fetch error', async () => {
    mockApi.listHistory.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText(/Error: boom/)).toBeInTheDocument()
  })

  it('re-fetches when the month changes', async () => {
    renderPage()
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledTimes(1))

    const monthSelect = screen.getAllByRole('combobox')[1] // Year, Month
    fireEvent.change(monthSelect, { target: { value: '0' } }) // January
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledTimes(2))
    const calls = mockApi.listHistory.mock.calls
    const lastArgs = calls[calls.length - 1]
    // monthRange extends `from` back one day so Jan starts on Dec 31.
    expect(lastArgs?.[0]).toMatch(/-12-31$/)
  })

  it('deletes a manual row and reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const manualRow: HistoryRow = {
      ...sampleRow,
      regions: { INR: { invested: 100, current: 198, source: 'manual' } },
    }
    mockApi.listHistory.mockResolvedValue(list([manualRow]))
    mockApi.deleteHistoryRow.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Delete row/ }))
    await waitFor(() => expect(mockApi.deleteHistoryRow).toHaveBeenCalledWith('2026-06-16'))
  })

  it('drives the conflict dialog from a paste report and PATCHes on confirm', async () => {
    mockApi.pasteHistory.mockResolvedValue({
      applied: [],
      conflicts: [{
        date: '2026-06-02',
        existing: { INR: { invested: 100, current: 110, source: 'cron' } },
        incoming: { INR: { invested: 200, current: 220 } },
      }],
      rejected: [],
    })
    mockApi.patchHistoryRegions.mockResolvedValue(sampleRow)
    renderPage()
    await screen.findByText(/No data for/)

    fireEvent.click(screen.getByRole('button', { name: /Paste month/ }))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '2026-06-02\t200\t220\t0\t0\t0\t0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    // Conflict dialog appears for the colliding date.
    expect(await screen.findByText(/Conflict — 02-06-2026/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox')[0]) // India
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith(
      '2026-06-02', { regions: { INR: { invested: 200, current: 220 } } },
    ))
  })

  it('clicking the Gold invested-vs-current chart navigates to its full-history page, like India/Europe', async () => {
    const goldRow: HistoryRow = {
      ...sampleRow,
      gold: { invested: 7200, current: 14400, pnl_pct: 100, volatility_pct: 0 },
    }
    mockApi.listHistory.mockResolvedValue(list([goldRow]))
    render(
      <MemoryRouter initialEntries={['/history']}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/chart/:region" element={<div>chart page</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByText('16-06-2026')

    fireEvent.click(screen.getByRole('button', { name: /Expand full Gold invested vs current history/ }))
    expect(await screen.findByText('chart page')).toBeInTheDocument()
  })

  it('reloads after a successful add', async () => {
    mockApi.addHistoryRow.mockResolvedValue(sampleRow)
    renderPage()
    await screen.findByText(/No data for/)

    fireEvent.click(screen.getByRole('button', { name: /Add row/ }))
    const fieldsets = document.querySelectorAll('fieldset')
    const indiaInputs = fieldsets[0].querySelectorAll('input')
    fireEvent.change(indiaInputs[0], { target: { value: '100' } })
    fireEvent.change(indiaInputs[1], { target: { value: '198' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockApi.addHistoryRow).toHaveBeenCalled())
    // reload() runs after add: listHistory called again (mount + reload).
    await waitFor(() => expect(mockApi.listHistory.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  // Regression: `todayStr` used to be memoized with an empty dep array, so a
  // tab left open across the 02:30 UTC cut-over kept refreshing a tentative
  // row stamped with the previous trading day — and, across a month
  // boundary, filed under the previous month — until it was remounted.
  describe('trading-day roll-over while mounted', () => {
    const advancePastCutover = async () => {
      // Mounted at 02:00Z; the cut-over is at 02:30Z (+1s of scheduled slack).
      await vi.advanceTimersByTimeAsync(31 * 60 * 1000)
    }

    it('refetches the month when the trading day rolls over', async () => {
      vi.setSystemTime(new Date('2026-06-30T02:00:00Z')) // trading day 2026-06-29
      renderPage()
      await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalled())
      const callsBefore = mockApi.listHistory.mock.calls.length

      vi.setSystemTime(new Date('2026-06-30T02:31:00Z')) // trading day 2026-06-30
      await advancePastCutover()

      await waitFor(() =>
        expect(mockApi.listHistory.mock.calls.length).toBeGreaterThan(callsBefore))
      // Same month either side, so the range is unchanged — only refetched.
      const calls = mockApi.listHistory.mock.calls
      const last = calls[calls.length - 1]
      expect(last).toEqual(['2026-05-31', '2026-06-30'])
    })

    it('follows the clock into the new month when the roll-over crosses one', async () => {
      vi.setSystemTime(new Date('2026-07-01T02:00:00Z')) // trading day 2026-06-30 (June)
      renderPage()
      await waitFor(() =>
        expect(mockApi.listHistory).toHaveBeenCalledWith('2026-05-31', '2026-06-30'))

      vi.setSystemTime(new Date('2026-07-01T02:31:00Z')) // trading day 2026-07-01 (July)
      await advancePastCutover()

      // The picker must advance to July and refetch that range, rather than
      // leaving a July tentative row stranded under June.
      await waitFor(() =>
        expect(mockApi.listHistory).toHaveBeenCalledWith('2026-06-30', '2026-07-31'))
    })

    it('does not yank the user out of a month they navigated to', async () => {
      vi.setSystemTime(new Date('2026-07-01T02:00:00Z'))
      renderPage()
      await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalled())

      // Navigate deliberately to March 2026.
      const monthSelect = document.querySelectorAll('select')[1] as HTMLSelectElement
      fireEvent.change(monthSelect, { target: { value: '2' } })
      await waitFor(() =>
        expect(mockApi.listHistory).toHaveBeenCalledWith('2026-02-28', '2026-03-31'))

      vi.setSystemTime(new Date('2026-07-01T02:31:00Z'))
      await advancePastCutover()

      // Still on March: every later fetch keeps the chosen range.
      await waitFor(() => {
        const calls = mockApi.listHistory.mock.calls
      const last = calls[calls.length - 1]
        expect(last).toEqual(['2026-02-28', '2026-03-31'])
      })
    })
  })

  // The tentative row is only shown between 09:00 IST (03:30 UTC) and
  // 20:30 UTC. Outside that band the last snapshot is the whole truth.
  describe('live window (03:30–20:30 UTC)', () => {
    it('shows the tentative row inside the window', async () => {
      vi.setSystemTime(new Date('2026-06-16T12:00:00Z'))
      renderPage()
      expect(await screen.findByText('(live)')).toBeInTheDocument()
      expect(mockApi.getPrices).toHaveBeenCalled()
    })

    it('hides it before the 03:30 UTC open', async () => {
      vi.setSystemTime(new Date('2026-06-16T03:00:00Z'))
      renderPage()
      await screen.findByText(/No data for/)
      expect(screen.queryByText('(live)')).toBeNull()
      expect(mockApi.getPrices).not.toHaveBeenCalled()
    })

    it('hides it after the 20:30 UTC close', async () => {
      vi.setSystemTime(new Date('2026-06-16T21:00:00Z'))
      renderPage()
      await screen.findByText(/No data for/)
      expect(screen.queryByText('(live)')).toBeNull()
      expect(mockApi.getPrices).not.toHaveBeenCalled()
    })

    it('drops the row when the window closes while mounted', async () => {
      vi.setSystemTime(new Date('2026-06-16T20:29:00Z'))
      renderPage()
      expect(await screen.findByText('(live)')).toBeInTheDocument()

      vi.setSystemTime(new Date('2026-06-16T20:30:30Z'))
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

      await waitFor(() => expect(screen.queryByText('(live)')).toBeNull())
    })

    it('adds the row when the window opens while mounted', async () => {
      vi.setSystemTime(new Date('2026-06-16T03:29:00Z'))
      renderPage()
      await screen.findByText(/No data for/)
      expect(screen.queryByText('(live)')).toBeNull()

      vi.setSystemTime(new Date('2026-06-16T03:30:30Z'))
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

      expect(await screen.findByText('(live)')).toBeInTheDocument()
    })
  })
})
