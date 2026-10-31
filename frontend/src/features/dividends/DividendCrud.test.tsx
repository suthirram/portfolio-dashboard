import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockApi = vi.hoisted(() => ({
  listDividends: vi.fn(), listHoldings: vi.fn(),
  createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), deleteAllDividends: vi.fn(),
}))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import DividendsPage from './DividendsPage'

const view = {
  rows: [{ id: 'd1', holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: '2020-01-01', amount: 300, currency: 'INR', cumulative: 300, holding_cumulative: 300 }],
  summary: { total: 300, count: 1, holdings: 1, first_date: '2020-01-01', last_date: '2020-01-01' },
  by_year: [{ period: '2020', total: 300, count: 1 }], by_month: [{ period: '2020-01', total: 300, count: 1 }],
  by_holding: [{ holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 300, count: 1, share: 1 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listDividends.mockResolvedValue(view)
  mockApi.listHoldings.mockResolvedValue([
    { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR' },
    { id: 'h9', script: 'SAP', symbol: 'SAP.DE', currency: 'EUR' },
  ])
  mockApi.createTransaction.mockResolvedValue({})
  mockApi.deleteAllDividends.mockResolvedValue({ deleted: 1 })
  mockApi.deleteTransaction.mockResolvedValue({})
})

const renderPage = () => render(<MemoryRouter initialEntries={['/dividends']}><DividendsPage /></MemoryRouter>)

describe('dividend CRUD', () => {
  it('adds a dividend through the ledger to an INR holding and refreshes', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('+ Add dividend'))
    expect(screen.queryByRole('option', { name: /SAP/ })).toBeNull() // EUR holding not offered on the INR tab
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2024-03-15' } })
    fireEvent.change(screen.getByLabelText('Dividend (total received)'), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(mockApi.createTransaction).toHaveBeenCalledWith('h1',
      { type: 'dividend', date: '2024-03-15T00:00:00Z', quantity: 0, amount: 300, notes: undefined }, undefined))
    await waitFor(() => expect(mockApi.listDividends).toHaveBeenCalledTimes(2))
  })

  it('offers no INR row actions on the EUR tab while it loads or after it fails', async () => {
    let failEur: (reason: Error) => void = () => {}
    mockApi.listDividends.mockImplementation((currency: string) =>
      currency === 'INR' ? Promise.resolve(view) : new Promise((_, reject) => { failEur = reject }))
    renderPage()
    await screen.findByLabelText('Delete dividend of 01-01-2020')

    fireEvent.click(screen.getByRole('tab', { name: /EUR/ }))
    expect(screen.queryByLabelText('Delete dividend of 01-01-2020')).toBeNull()
    expect(screen.queryByLabelText('Edit dividend of 01-01-2020')).toBeNull()
    expect(screen.queryByText(/Delete all/)).toBeNull()

    failEur(new Error('network down'))
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
    expect(screen.queryByLabelText('Delete dividend of 01-01-2020')).toBeNull()
    expect(screen.queryByText(/Delete all/)).toBeNull()
  })

  it('deletes one dividend after an in-app confirmation', async () => {
    renderPage()
    fireEvent.click(await screen.findByLabelText('Delete dividend of 01-01-2020'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockApi.deleteTransaction).toHaveBeenCalledWith('d1', undefined))
  })

  it('delete all needs DELETE typed', async () => {
    renderPage()
    fireEvent.click(await screen.findByText('Delete all INR'))
    const button = screen.getByRole('button', { name: 'Delete 1 dividends' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'delete' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } })
    fireEvent.click(button)
    await waitFor(() => expect(mockApi.deleteAllDividends).toHaveBeenCalledWith('INR', undefined))
  })
})
