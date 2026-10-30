import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DividendView } from '../../types'

const mockApi = vi.hoisted(() => ({ listDividends: vi.fn(), listHoldings: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import DividendsPage, { tabFrom } from './DividendsPage'

const row = (id: string, holding: string, script: string, date: string, amount: number, cumulative: number, holdingCumulative: number) => ({
  id, holding_id: holding, script, symbol: `${script}.NS`, date, amount, currency: 'INR', cumulative, holding_cumulative: holdingCumulative,
})

const inr: DividendView = {
  rows: [
    row('d1', 'h1', 'TCS', '2020-01-01', 300, 300, 300),
    row('d2', 'h1', 'TCS', '2020-01-01', 300, 600, 600),
    row('d3', 'h2', 'JIO', '2020-03-15', 1250.5, 1850.5, 1250.5),
  ],
  summary: { total: 1850.5, count: 3, holdings: 2, first_date: '2020-01-01', last_date: '2020-03-15' },
  by_year: [{ period: '2020', total: 1850.5, count: 3 }],
  by_month: [{ period: '2020-01', total: 600, count: 2 }, { period: '2020-03', total: 1250.5, count: 1 }],
  by_holding: [
    { holding_id: 'h2', script: 'JIO', symbol: 'JIO.NS', total: 1250.5, count: 1, share: 0.676 },
    { holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 600, count: 2, share: 0.324 },
  ],
}
const empty: DividendView = { rows: [], by_year: [], by_month: [], by_holding: [], summary: { total: 0, count: 0, holdings: 0 } }

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listDividends.mockImplementation((c: string) => Promise.resolve(c === 'INR' ? inr : empty))
  mockApi.listHoldings.mockResolvedValue([])
})

const renderAt = (url = '/dividends') => render(<MemoryRouter initialEntries={[url]}><DividendsPage /></MemoryRouter>)

describe('DividendsPage', () => {
  it('shows the INR tab in order with both running totals', async () => {
    renderAt()
    const tables = await screen.findAllByRole('table')
    const rows = within(tables[0]).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getAllByText(/600\.00/)).toHaveLength(2) // cumulative + holding cumulative
    expect(within(rows[2]).getByText(/1,850\.50/)).toBeInTheDocument()
    expect(mockApi.listDividends).toHaveBeenCalledWith('INR', undefined)
  })

  it('switches tab and refetches', async () => {
    renderAt()
    await screen.findAllByRole('table')
    fireEvent.click(screen.getByRole('tab', { name: /EUR/ }))
    await waitFor(() => expect(mockApi.listDividends).toHaveBeenCalledWith('EUR', undefined))
    expect(await screen.findByText('No EUR dividends yet')).toBeInTheDocument()
  })

  it('filters by holding but keeps the full-tab cumulative', async () => {
    renderAt()
    await screen.findAllByRole('table')
    fireEvent.change(screen.getByLabelText('Holding'), { target: { value: 'h2' } })
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument()
    expect(screen.getAllByText(/1,850\.50/).length).toBeGreaterThan(0)
  })

  it('reads the tab from the URL and falls back to INR', () => {
    expect(tabFrom('EUR')).toBe('EUR')
    expect(tabFrom('USD')).toBe('INR')
    expect(tabFrom(null)).toBe('INR')
  })
})
