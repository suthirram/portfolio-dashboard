import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Holding, TransactionWithHolding } from '../../types'

const mockApi = vi.hoisted(() => ({
  listAllTransactions: vi.fn(),
  listHoldings: vi.fn(),
  listTransactions: vi.fn(),
  listHistory: vi.fn(),
  getPrices: vi.fn(),
  deleteTransaction: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import TransactionsPage from './TransactionsPage'

const holdings: Holding[] = [
  { id: 'h1', script: 'Tata Consultancy', symbol: 'TCS.NS', currency: 'INR' },
  { id: 'h2', script: 'Vanguard FTSE', symbol: 'VWCE.DE', currency: 'EUR' },
]

const txns: TransactionWithHolding[] = [
  {
    id: 't1', holding_id: 'h1', type: 'buy', date: '2026-10-17T00:00:00Z',
    quantity: 12, amount: 48912, currency: 'INR', notes: 'SIP tranche',
    script: 'Tata Consultancy', symbol: 'TCS.NS', created_at: '2026-10-17T10:00:00Z',
  },
  {
    id: 't2', holding_id: 'h2', type: 'sell', date: '2026-09-02T00:00:00Z',
    quantity: 25, amount: 3200, currency: 'EUR',
    script: 'Vanguard FTSE', symbol: 'VWCE.DE', created_at: '2026-09-02T10:00:00Z',
  },
  {
    id: 't3', holding_id: 'h1', type: 'opening', date: '2026-06-15T00:00:00Z',
    quantity: 64, amount: 241920, currency: 'INR', realized_seed: 12480,
    opening_date: null, script: 'Tata Consultancy', symbol: 'TCS.NS',
    created_at: '2026-06-15T10:00:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listAllTransactions.mockResolvedValue(txns)
  mockApi.listHoldings.mockResolvedValue(holdings)
  mockApi.listTransactions.mockResolvedValue([])
})

const renderPage = (props = {}) =>
  render(<MemoryRouter><TransactionsPage {...props} /></MemoryRouter>)

describe('TransactionsPage', () => {
  it('shows the investment delta panel on the user’s own page', async () => {
    renderPage()
    await screen.findByText('SIP tranche')
    expect(screen.getByRole('button', { name: /Investment delta/ })).toBeInTheDocument()
  })

  it('places the investment delta panel just below the filters, above the table', async () => {
    renderPage()
    await screen.findByText('SIP tranche')
    const panel = screen.getByRole('button', { name: /Investment delta/ })
    const follows = (earlier: Element, later: Element) =>
      Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(screen.getByLabelText('Search'), panel)).toBe(true)
    expect(follows(panel, screen.getByText('SIP tranche'))).toBe(true)
  })

  it('does not show the investment delta panel in admin act-as', async () => {
    renderPage({ actAsUserId: 'u2', actAsLabel: "bob's transactions" })
    await screen.findByText('SIP tranche')
    expect(screen.queryByRole('button', { name: /Investment delta/ })).not.toBeInTheDocument()
  })

  describe('after a ledger edit in the editor', () => {
    beforeEach(() => {
      mockApi.listHistory.mockResolvedValue({ currency: 'INR', rows: [] })
      mockApi.getPrices.mockResolvedValue({ holdings: [], eur_rate: 0.011 })
      mockApi.listTransactions.mockResolvedValue([txns[0]])
      mockApi.deleteTransaction.mockResolvedValue({})
    })

    // Deletes the SIP tranche through the real per-holding editor.
    const deleteThroughEditor = async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Edit in .* ledger/ })[0])
      fireEvent.click(await screen.findByTitle('Delete'))
      fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
      await waitFor(() => expect(mockApi.deleteTransaction).toHaveBeenCalledWith('t1', undefined))
    }

    it('reloads the History rows of an open investment delta panel', async () => {
      renderPage()
      await screen.findByText('SIP tranche')
      fireEvent.click(screen.getByRole('button', { name: /Investment delta/ }))
      await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledTimes(1))

      await deleteThroughEditor()
      await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledTimes(2))
    })

    it('fetches no History while the panel is collapsed', async () => {
      renderPage()
      await screen.findByText('SIP tranche')

      await deleteThroughEditor()
      await waitFor(() => expect(mockApi.listAllTransactions).toHaveBeenCalledTimes(2))
      expect(mockApi.listHistory).not.toHaveBeenCalled()
    })
  })

  it('lists every ledger event with the PRD-004 §5 columns', async () => {
    renderPage()

    // Wait on a value only the table can render (the notes cell), rather
    // than a label the filter chips also carry.
    expect(await screen.findByText('SIP tranche')).toBeInTheDocument()
    // Sortable headers are buttons whose label carries the direction arrow.
    for (const header of [/^Date/, /^Holding/, /^Type/, /^Amount/]) {
      expect(screen.getByRole('button', { name: header })).toBeInTheDocument()
    }
    for (const header of ['Shares', 'Implied cost/sh', 'Realised seed', 'Opening date', 'Notes', 'Cur']) {
      expect(screen.getByText(header)).toBeInTheDocument()
    }
    // Amounts carry their own currency's symbol, never a shared one.
    expect(screen.getByText('₹48,912.00')).toBeInTheDocument()
    // EUR sell amount: once in the row, once in the EUR subtotal card.
    expect(screen.getAllByText('€3,200.00')).toHaveLength(2)
    // An opening with no effective date shows the state the dashboard prompts on.
    expect(screen.getByText('Not set')).toBeInTheDocument()
  })

  it('fetches the caller\'s own ledger when not acting as anyone', async () => {
    renderPage()
    await waitFor(() => expect(mockApi.listAllTransactions).toHaveBeenCalledWith(undefined))
  })

  it('narrows to a type and reports the filtered count', async () => {
    renderPage()
    await screen.findByText('SIP tranche')

    fireEvent.click(screen.getByRole('button', { name: 'Sell' }))

    await waitFor(() => expect(screen.queryByText('₹48,912.00')).not.toBeInTheDocument())
    // "1 of 3" — the count is the only active-filter signal the view needs.
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getAllByText('€3,200.00').length).toBeGreaterThan(0)
  })

  it('searches script, symbol and notes', async () => {
    renderPage()
    await screen.findByText('SIP tranche')

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'vwce' } })

    await waitFor(() => expect(screen.queryByText('₹48,912.00')).not.toBeInTheDocument())
    expect(screen.getAllByText('€3,200.00').length).toBeGreaterThan(0)
  })

  it('subtotals per currency and never combines them', async () => {
    renderPage()
    await screen.findByText('SIP tranche')

    // INR bought = 48912 + 241920 (opening counts as invested); EUR sold = 3200.
    expect(screen.getByText('₹2,90,832.00')).toBeInTheDocument()
    // EUR's 3,200 stays in the EUR card; nothing sums the two currencies.
    expect(screen.queryByText('₹2,94,032.00')).not.toBeInTheDocument()
  })

  it('sorts by a clicked column and flips on a second click', async () => {
    renderPage()
    await screen.findByText('SIP tranche')

    const dateHeader = screen.getByRole('button', { name: /^Date/ })
    expect(dateHeader.closest('th')).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(dateHeader)
    await waitFor(() => expect(dateHeader.closest('th')).toHaveAttribute('aria-sort', 'ascending'))
  })

  it('opens the owning holding\'s ledger editor from a row', async () => {
    renderPage()
    await screen.findByText('SIP tranche')

    fireEvent.click(screen.getAllByRole('button', { name: /Edit in .* ledger/ })[0])

    // The existing per-holding modal, scoped to that row's holding.
    expect(await screen.findByText('Transactions — Tata Consultancy')).toBeInTheDocument()
    await waitFor(() => expect(mockApi.listTransactions).toHaveBeenCalledWith('h1', undefined))
  })

  // PD-048: act-as ledger writes — the editor opens on the target's ledger.
  it('renders act-as editable: target endpoint, editor scoped to the target', async () => {
    renderPage({ actAsUserId: 'u9', actAsLabel: "priya.n's transactions" })

    await waitFor(() => expect(mockApi.listAllTransactions).toHaveBeenCalledWith('u9'))
    expect(screen.queryByText(/read-only/)).not.toBeInTheDocument()
    fireEvent.click((await screen.findAllByRole('button', { name: /Edit in .* ledger/ }))[0])
    await waitFor(() => expect(mockApi.listTransactions).toHaveBeenCalledWith('h1', 'u9'))
  })

  it('shows an empty state pointing at the only action that creates a transaction', async () => {
    mockApi.listAllTransactions.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
  })
})
