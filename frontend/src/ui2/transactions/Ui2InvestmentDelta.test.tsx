import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2InvestmentDelta } from './Ui2InvestmentDelta'

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
  mockApi.getInvestmentDelta.mockImplementation(async (year: number) => ({
    year,
    columns: [{ column: 'INR', months: months(12) }, { column: 'EUR', months: months(6) }],
  }))
})

describe('Ui2InvestmentDelta', () => {
  it('charts the current year’s first column from the ledger', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
    const year = new Date().getFullYear()
    expect(await screen.findByRole('img', { name: new RegExp(`Investment delta ${year}`) })).toBeInTheDocument()
    expect(mockApi.getInvestmentDelta).toHaveBeenCalledWith(year)
    expect(drawn.column).toBe('INR')
    expect(drawn.months).toBe(12)
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()
  })

  it('switches column and year', async () => {
    render(<Ui2InvestmentDelta refreshKey={0} />)
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
    expect(await screen.findByText(/Nothing invested in/)).toBeInTheDocument()
  })

  it('reloads when the ledger changes', async () => {
    const { rerender } = render(<Ui2InvestmentDelta refreshKey={0} />)
    await screen.findByRole('img', { name: /Investment delta/ })
    rerender(<Ui2InvestmentDelta refreshKey={1} />)
    await waitFor(() => expect(mockApi.getInvestmentDelta).toHaveBeenCalledTimes(2))
  })
})
