import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { HistoryList, HistoryRangeInfo, HistoryRow } from '../../lib/api/client'

// Recharts' ResponsiveContainer needs ResizeObserver, absent in jsdom.
globalThis.ResizeObserver ||= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock the API client; keep the real ApiError so the 409 branch works.
const mockApi = vi.hoisted(() => ({
  historyRange: vi.fn(),
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

const range = (info: Partial<HistoryRangeInfo> = {}): HistoryRangeInfo =>
  ({ earliest_year: 2024, latest_year: 2026, has_data: true, ...info })

const sampleRow: HistoryRow = {
  date: '2026-06-16',
  regions: {
    india:  { invested: 100, current: 198, source: 'cron' },
    europe: { invested: 0, current: 0, source: 'cron' },
    us:     { invested: 0, current: 0, source: 'cron' },
  },
  totals: { invested_total: 100, current_total: 198, pnl_pct: 98 },
}

const list = (rows: HistoryRow[]): HistoryList => ({ currency: 'INR', rows })

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.historyRange.mockResolvedValue(range())
    mockApi.listHistory.mockResolvedValue(list([]))
  })

  it('populates the year dropdown from /history/range', async () => {
    renderPage()
    await waitFor(() => {
      const opts = Array.from(document.querySelectorAll('option')).map(o => o.textContent)
      expect(opts).toEqual(expect.arrayContaining(['2024', '2025', '2026']))
    })
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
    expect(screen.getByText(/India inv\./)).toBeInTheDocument()
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
    expect(lastArgs?.[0]).toMatch(/-01-01$/)
  })

  it('deletes a manual row and reloads', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const manualRow: HistoryRow = {
      ...sampleRow,
      regions: { india: { invested: 100, current: 198, source: 'manual' } },
    }
    mockApi.listHistory.mockResolvedValue(list([manualRow]))
    mockApi.deleteHistoryRow.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockApi.deleteHistoryRow).toHaveBeenCalledWith('2026-06-16'))
  })

  it('drives the conflict dialog from a paste report and PATCHes on confirm', async () => {
    mockApi.pasteHistory.mockResolvedValue({
      applied: [],
      conflicts: [{
        date: '2026-06-02',
        existing: { india: { invested: 100, current: 110, source: 'cron' } },
        incoming: { india: { invested: 200, current: 220 } },
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
      '2026-06-02', { regions: { india: { invested: 200, current: 220 } } },
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
