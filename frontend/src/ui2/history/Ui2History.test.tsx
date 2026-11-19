import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { HistoryList, HistoryRow, User } from '../../lib/api/client'

const mockApi = vi.hoisted(() => ({
  listHistory: vi.fn(),
  addHistoryRow: vi.fn(),
  patchHistoryRegions: vi.fn(),
  deleteHistoryRow: vi.fn(),
  pasteHistory: vi.fn(),
  getPrices: vi.fn(),
  getGoldMetrics: vi.fn(),
  getFxMissing: vi.fn(),
  refetchFx: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const mockAuth = vi.hoisted(() => ({ user: null as Partial<User> | null }))

vi.mock('../../features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../features/auth/AuthContext')>('../../features/auth/AuthContext')
  return { ...actual, useAuthOptional: () => (mockAuth.user ? { user: mockAuth.user } : null) }
})

import HistoryPage from '../../features/history/HistoryPage'

// Outside the live window (03:30–20:30 UTC), so only stored rows render.
const FROZEN_NOW = new Date('2026-11-16T22:00:00Z')

const row = (date: string, invested: number, current: number, source: 'cron' | 'manual' = 'cron', extra: Partial<HistoryRow> = {}): HistoryRow => ({
  date,
  regions: {
    INR: { invested, current, source },
    EUR: { invested: 100, current: 110, source },
  },
  totals: { invested_total: invested, current_total: current, pnl_pct: 0 },
  ...extra,
})

const novemberRows: HistoryRow[] = [
  row('2026-10-30', 1000, 1100),
  row('2026-11-13', 1000, 1150, 'manual'),
  row('2026-11-16', 1200, 1300, 'cron', {
    holdings: [{ symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 650, price_date: '2026-11-16', current: 1300 }],
  }),
]

const list = (rows: HistoryRow[]): HistoryList => ({ currency: 'INR', rows })

const renderPage = () => render(<MemoryRouter><HistoryPage /></MemoryRouter>)

describe('UI_2.0 History page', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FROZEN_NOW)
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'ui2', premium: false, gold_enabled: false }
    mockApi.listHistory.mockResolvedValue(list(novemberRows))
    mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
    mockApi.getFxMissing.mockResolvedValue({ dates: [] })
    try { window.localStorage.removeItem('pd_history_charts_top') } catch { /* private mode */ }
  })

  it('renders the handoff layout instead of the classic page', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Your portfolio through time' })).toBeInTheDocument()
    expect(screen.queryByText('Historical data')).not.toBeInTheDocument()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    expect(screen.getByRole('table', { name: 'Monthly performance summary' })).toBeInTheDocument()
    expect((screen.getByRole('combobox', { name: 'Snapshot month' }) as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe('November 2026')
  })

  it('keeps the classic page for other interfaces', async () => {
    mockAuth.user = { id: 'u1', role: 'user', ui_mode: 'glass', premium: false, gold_enabled: false }
    renderPage()
    expect(screen.getByText('Historical data')).toBeInTheDocument()
    expect(screen.queryByText('Your portfolio through time')).not.toBeInTheDocument()
  })

  it('narrows Daily records to one asset group', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    expect(within(table).getByRole('columnheader', { name: 'Europe · EUR' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'INR' }))
    expect(screen.getByRole('button', { name: 'INR' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(table).queryByRole('columnheader', { name: 'Europe · EUR' })).not.toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'India · INR' })).toBeInTheDocument()
    // No gold overlay, so no Gold filter.
    expect(screen.queryByRole('button', { name: 'Gold' })).not.toBeInTheDocument()
  })

  it('tints the P/L cell by direction and marks a new investment', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    const latest = within(table).getAllByRole('row').find(tableRow => tableRow.textContent?.startsWith('16 Nov'))!
    expect(within(latest).getAllByText('＋ New investment')).toHaveLength(1)
    expect(within(latest).getByText('↑ Up')).toBeInTheDocument()
  })

  it('offers Delete inside the Edit dialog only for an all-manual row', async () => {
    mockApi.deleteHistoryRow.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.queryByRole('button', { name: 'Delete record' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Edit daily record' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-13' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete record' }))
    await waitFor(() => expect(mockApi.deleteHistoryRow).toHaveBeenCalledWith('2026-11-13'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets a super admin delete a cron row from the Edit dialog', async () => {
    mockAuth.user = { id: 'u1', role: 'superadmin', ui_mode: 'ui2', premium: false, gold_enabled: false }
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    expect(screen.getByRole('button', { name: 'Delete record' })).toBeInTheDocument()
  })

  it('shows the handoff breakdown: group totals, then holding, quantity and value', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'View INR holdings on 2026-11-16' }))
    const dialog = await screen.findByRole('dialog', { name: '16 Nov snapshot' })
    expect(dialog).toHaveTextContent('India · INR · 2026-11-16')
    expect(dialog).toHaveTextContent('Invested₹1,200.00')
    expect(dialog).toHaveTextContent('Snapshot value₹1,300.00')
    expect(within(dialog).getAllByRole('columnheader').map(header => header.textContent))
      .toEqual(['Holding', 'Quantity', 'Value'])
    expect(within(dialog).getByRole('rowheader', { name: 'TCS' })).toBeInTheDocument()
    expect(dialog).toHaveTextContent('₹1,300.00')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('adds one asset group per record', async () => {
    mockApi.addHistoryRow.mockResolvedValue(novemberRows[2])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: '＋ Add record' }))
    const dialog = screen.getByRole('dialog', { name: 'Add daily record' })
    // Gold is recorded from the Gold page, not here.
    expect(within(dialog).getAllByRole('option').map(option => option.textContent)).toEqual(['India · INR', 'Europe · EUR'])
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-11-10' } })
    fireEvent.change(within(dialog).getByLabelText('Asset group'), { target: { value: 'EUR' } })
    fireEvent.change(within(dialog).getByLabelText('Invested amount (€)'), { target: { value: '2610' } })
    fireEvent.change(within(dialog).getByLabelText('Snapshot value (€)'), { target: { value: '4144.05' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save record' }))
    await waitFor(() => expect(mockApi.addHistoryRow).toHaveBeenCalledWith({
      date: '2026-11-10', regions: { EUR: { invested: 2610, current: 4144.05 } },
    }))
  })

  it('refuses an add with no amounts', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: '＋ Add record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the invested amount and the snapshot value.')
    expect(mockApi.addHistoryRow).not.toHaveBeenCalled()
  })

  it('edits the chosen group pre-filled from the row and sends only a change', async () => {
    mockApi.patchHistoryRegions.mockResolvedValue(novemberRows[2])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit daily record' })
    expect(within(dialog).getByLabelText('Date')).toHaveAttribute('readonly')
    expect(within(dialog).getByLabelText('Invested amount (₹)')).toHaveValue('1,200')
    fireEvent.change(within(dialog).getByLabelText('Asset group'), { target: { value: 'EUR' } })
    expect(within(dialog).getByLabelText('Invested amount (€)')).toHaveValue('100')
    fireEvent.change(within(dialog).getByLabelText('Snapshot value (€)'), { target: { value: '125' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update record' }))
    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith('2026-11-16', {
      regions: { EUR: { invested: 100, current: 125 } },
    }))
  })

  it('closes an unchanged edit without saving', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit snapshot 2026-11-16' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update record' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockApi.patchHistoryRegions).not.toHaveBeenCalled()
  })

  it('pastes the current format and asks about an existing date', async () => {
    mockApi.pasteHistory.mockResolvedValue({
      applied: [],
      rejected: [],
      conflicts: [{
        date: '2026-11-13',
        existing: { INR: { invested: 1000, current: 1150, source: 'manual' } },
        incoming: { INR: { invested: 1000, current: 1175 } },
      }],
    })
    mockApi.patchHistoryRegions.mockResolvedValue(novemberRows[1])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Paste month' }))
    const paste = screen.getByRole('dialog', { name: 'Paste monthly records' })
    fireEvent.change(within(paste).getByRole('textbox'), { target: { value: '2026-11-13\t1000\t1175\t100\t110' } })
    fireEvent.click(within(paste).getByRole('button', { name: 'Import rows' }))
    await waitFor(() => expect(mockApi.pasteHistory).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-11' })))

    const conflict = await screen.findByRole('dialog', { name: 'Record exists · 13 Nov' })
    fireEvent.click(within(conflict).getByRole('checkbox', { name: 'Replace India · INR' }))
    fireEvent.click(within(conflict).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith('2026-11-13', {
      regions: { INR: { invested: 1000, current: 1175 } },
    }))
  })

  it('resets region picks between consecutive date conflicts', async () => {
    mockApi.pasteHistory.mockResolvedValue({
      applied: [],
      rejected: [],
      conflicts: [
        {
          date: '2026-11-13',
          existing: { INR: { invested: 1000, current: 1150, source: 'manual' } },
          incoming: { INR: { invested: 1000, current: 1175 } },
        },
        {
          date: '2026-11-14',
          existing: { INR: { invested: 1000, current: 1160, source: 'manual' } },
          incoming: { INR: { invested: 1000, current: 1180 } },
        },
      ],
    })
    mockApi.patchHistoryRegions.mockResolvedValue(novemberRows[1])
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    fireEvent.click(screen.getByRole('button', { name: 'Paste month' }))
    const paste = screen.getByRole('dialog', { name: 'Paste monthly records' })
    fireEvent.change(within(paste).getByRole('textbox'), {
      target: { value: '2026-11-13\t1000\t1175\t100\t110\n2026-11-14\t1000\t1180\t100\t110' },
    })
    fireEvent.click(within(paste).getByRole('button', { name: 'Import rows' }))

    const first = await screen.findByRole('dialog', { name: 'Record exists · 13 Nov' })
    fireEvent.click(within(first).getByRole('checkbox', { name: 'Replace India · INR' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Confirm' }))
    const second = await screen.findByRole('dialog', { name: 'Record exists · 14 Nov' })
    expect(within(second).getByRole('checkbox', { name: 'Replace India · INR' })).not.toBeChecked()
    fireEvent.click(within(second).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockApi.patchHistoryRegions).toHaveBeenCalledWith('2026-11-13', {
      regions: { INR: { invested: 1000, current: 1175 } },
    }))
    expect(mockApi.patchHistoryRegions).toHaveBeenCalledTimes(1)
  })

  it('opens the full-history charts without point markers', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    mockApi.listHistory.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Full-history charts' }))
    const dialog = screen.getByRole('dialog', { name: 'Full-history charts' })
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledWith('2000-01-01', '2026-11-17'))
    await waitFor(() => expect(within(dialog).getAllByText('Full history').length).toBeGreaterThan(0))
    expect(dialog.querySelectorAll('circle')).toHaveLength(0)
    expect(within(dialog).getByRole('button', { name: /Open the full India · INR, Full history/ })).toBeInTheDocument()
  })

  it('moves the charts above the table when Charts on top is checked', async () => {
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    const charts = screen.getByRole('region', { name: 'Supporting history charts' })
    expect(table.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Charts on top' }))
    const movedTable = screen.getByRole('table', { name: 'Daily portfolio snapshots' })
    const movedCharts = screen.getByRole('region', { name: 'Supporting history charts' })
    expect(movedTable.compareDocumentPosition(movedCharts) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it('shows All assets in a month without gold and restores Gold on return', async () => {
    const withGold = (date: string): HistoryRow =>
      row(date, 1000, 1100, 'cron', { gold: { invested: 500, current: 520, pnl_pct: 4, volatility_pct: 0 } })
    mockApi.listHistory.mockImplementation(async (from: string) =>
      list(from === '2026-11-01' ? [withGold('2026-11-13'), withGold('2026-11-16')] : [row('2026-10-15', 1000, 1100)]))
    renderPage()
    const table = await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    await within(table).findByRole('columnheader', { name: 'Gold · INR' })
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }))
    expect(within(table).queryByRole('columnheader', { name: 'India · INR' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(screen.getAllByText('15 Oct').length).toBeGreaterThan(0))
    const october = screen.getByRole('table', { name: 'Daily portfolio snapshots' })
    expect(within(october).getByRole('columnheader', { name: 'India · INR' })).toBeInTheDocument()
    expect(within(october).getByRole('columnheader', { name: 'Europe · EUR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All assets' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Gold' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    await waitFor(() => expect(screen.getAllByText('16 Nov').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: 'Gold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('labels the charts with the month their rows came from while a new month loads or fails', async () => {
    let failOctober: (reason: Error) => void = () => {}
    mockApi.listHistory.mockImplementation((from: string) => from === '2026-11-01'
      ? Promise.resolve(list(novemberRows))
      : new Promise((_, reject) => { failOctober = reject }))
    renderPage()
    const charts = await screen.findByRole('region', { name: 'Supporting history charts' })
    expect(within(charts).getAllByText('November 2026').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    // Loading October: November's rows are still shown, so still November.
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31', true))
    const loading = screen.getByRole('region', { name: 'Supporting history charts' })
    expect(within(loading).queryByText('October 2026')).not.toBeInTheDocument()
    expect(within(loading).getAllByText('November 2026').length).toBeGreaterThan(0)

    failOctober(new Error('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    const failed = screen.getByRole('region', { name: 'Supporting history charts' })
    expect(within(failed).queryByText('October 2026')).not.toBeInTheDocument()
    expect(within(failed).getAllByText('November 2026').length).toBeGreaterThan(0)
    // Nor do the stale rows count as "October has no data".
    expect(screen.queryByText(/No data for October 2026/)).not.toBeInTheDocument()
  })

  it('steps months with the arrows and loads that month', async () => {
    renderPage()
    await screen.findByRole('table', { name: 'Daily portfolio snapshots' })
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31', true))
  })
})
