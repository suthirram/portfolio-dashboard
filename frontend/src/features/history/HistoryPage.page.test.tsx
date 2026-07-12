import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import HistoryPage from './HistoryPage'

const renderPage = () => render(<MemoryRouter><HistoryPage /></MemoryRouter>)

// Freeze the clock so the year-dropdown assertion is deterministic across
// real wall-clock rollovers.
const FROZEN_NOW = new Date('2026-06-16T12:00:00Z')

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
    mockApi.listHistory.mockResolvedValue(list([]))
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

  it('renders the table when rows are present', async () => {
    mockApi.listHistory.mockResolvedValue(list([sampleRow]))
    renderPage()
    expect(await screen.findByText('2026-06-16')).toBeInTheDocument()
    // Header "Amount invested" appears once per currency group (INR, EUR).
    expect(screen.getAllByText('Amount invested').length).toBe(2)
  })

  it('uses the wide content container so the currency + gold columns fit', async () => {
    mockApi.listHistory.mockResolvedValue(list([sampleRow]))
    renderPage()
    await screen.findByText('2026-06-16')
    expect(screen.getByRole('main').style.maxWidth).toBe('1800px')
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
    await screen.findByText('2026-06-16')

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
    expect(await screen.findByText(/Conflict — 2026-06-02/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox')[0]) // India
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith(
      '2026-06-02', { regions: { INR: { invested: 200, current: 220 } } },
    ))
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
})
