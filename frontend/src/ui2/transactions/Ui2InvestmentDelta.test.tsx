import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2InvestmentDelta } from './Ui2InvestmentDelta'

const OPEN_KEY = 'pd_u2_txn_delta_open'

// Node 22 exposes localStorage only with --localstorage-file; provide a simple
// in-memory stand-in so the component's window.localStorage?.* calls work.
const lsStore: Record<string, string> = {}
const lsMock = {
  getItem: (k: string) => lsStore[k] ?? null,
  setItem: (k: string, v: string) => { lsStore[k] = v },
  removeItem: (k: string) => { delete lsStore[k] },
  clear: () => { for (const k of Object.keys(lsStore)) delete lsStore[k] },
}
Object.defineProperty(window, 'localStorage', { value: lsMock, configurable: true })

const mockApi = vi.hoisted(() => ({ getInvestmentDelta: vi.fn(), listHistory: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

vi.mock('../../features/auth/AuthContext', () => ({
  useAuthOptional: () => ({ user: { gold_enabled: false, delta_from_history: false, premium: false } }),
}))

// The chart is Recharts (no layout in jsdom); record what it is asked to draw.
const drawn = vi.hoisted(() => ({ column: '', months: 0 }))
vi.mock('../../features/transactions/InvestmentDeltaChart', () => ({
  InvestmentDeltaChart: ({ column, months }: { column: string; months: unknown[] }) => {
    drawn.column = column
    drawn.months = months.length
    return null
  },
}))

const months = (count: number) => Array.from({ length: count }, (_, month0) => ({ month0, delta: 1000, invested: 5000 }))

beforeEach(() => {
  vi.clearAllMocks()
  drawn.column = ''
  try { window.localStorage?.clear() } catch { /* unavailable in this env */ }
  mockApi.getInvestmentDelta.mockImplementation(async (year: number) => ({
    year,
    columns: [{ column: 'INR', months: months(12) }, { column: 'EUR', months: months(6) }],
  }))
})

describe('Ui2InvestmentDelta', () => {
  async function openPanel() {
    // The banner div[role=button] and the inner toggle <button> both expose
    // 'Show chart' text; pick the last match which is the actual <button>.
    const buttons = screen.getAllByRole('button', { name: /show chart/i })
    await userEvent.click(buttons[buttons.length - 1])
  }

  it('starts collapsed and shows "Show chart" toggle', () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    // Both the banner div[role=button] and inner <button> expose this text.
    expect(screen.getAllByRole('button', { name: /show chart/i }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('img', { name: /Investment delta/ })).toBeNull()
  })

  it('opens and closes on toggle click, persisting to localStorage', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    await openPanel()
    expect(window.localStorage?.getItem(OPEN_KEY)).toBe('1')
    await screen.findAllByRole('button', { name: /hide chart/i })
    const hideButtons = screen.getAllByRole('button', { name: /hide chart/i })
    await userEvent.click(hideButtons[hideButtons.length - 1])
    expect(window.localStorage?.getItem(OPEN_KEY)).toBe('0')
    expect(screen.getAllByRole('button', { name: /show chart/i })).not.toHaveLength(0)
  })

  it('restores saved open state from localStorage', async () => {
    window.localStorage?.setItem(OPEN_KEY, '1')
    render(<Ui2InvestmentDelta refreshKey={0} />)
    expect(await screen.findByRole('img', { name: /Investment delta/ })).toBeInTheDocument()
  })

  it('shows teaser net change with sign (positive)', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    // 12 months x delta 1000 = net +12000
    expect(await screen.findByText(/\+₹12,000/)).toBeInTheDocument()
  })

  it('shows teaser net change with minus sign for negative annual delta', async () => {
    mockApi.getInvestmentDelta.mockResolvedValue({
      year: new Date().getFullYear(),
      columns: [{ column: 'INR', months: months(12).map(m => ({ ...m, delta: -500 })) }],
    })
    render(<Ui2InvestmentDelta refreshKey={0} />)
    // 12 months x delta -500 = net -6000; must display minus prefix, not bare 6,000
    expect(await screen.findByText(/−₹6,000/)).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('collapsed body is inert so inner buttons are out of tab order', async () => {
    const { container } = render(<Ui2InvestmentDelta refreshKey={0} />)
    expect(container.querySelector('.u2-tx-delta-body')).toHaveAttribute('inert')
    await openPanel()
    await waitFor(() => expect(container.querySelector('.u2-tx-delta-body')).not.toHaveAttribute('inert'))
  })

  it('charts the current year first column from the ledger after opening', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    await openPanel()
    const year = new Date().getFullYear()
    expect(await screen.findByRole('img', { name: new RegExp(`Investment delta ${year}`) })).toBeInTheDocument()
    expect(mockApi.getInvestmentDelta).toHaveBeenCalledWith(year)
    expect(drawn.column).toBe('INR')
    expect(drawn.months).toBe(12)
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()
  })

  it('switches column and year', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    await openPanel()
    const year = new Date().getFullYear()
    const group = await screen.findByRole('group', { name: 'Investment delta column' })
    const eur = [...group.querySelectorAll('button')].find(button => button.getAttribute('aria-pressed') === 'false')!
    await userEvent.click(eur)
    await waitFor(() => expect(drawn.column).toBe('EUR'))
    await userEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenLastCalledWith(year - 1))
  })

  it('says when nothing was invested in the year', async () => {
    mockApi.getInvestmentDelta.mockResolvedValue({ year: 2026, columns: [] })
    render(<Ui2InvestmentDelta refreshKey={0} />)
    await openPanel()
    expect(await screen.findByText(/Nothing invested in/)).toBeInTheDocument()
  })

  it('reloads when the ledger changes', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    // Data fetches eagerly (active: true) even while collapsed.
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(1))
    const { rerender } = render(<Ui2InvestmentDelta refreshKey={1} />)
    await act(async () => { rerender(<Ui2InvestmentDelta refreshKey={1} />) })
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(2))
  })
})
