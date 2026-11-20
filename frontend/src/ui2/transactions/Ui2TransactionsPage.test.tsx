import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Ui2TransactionsPage } from './Ui2TransactionsPage'

const load = vi.hoisted(() => ({ error: '', refresh: vi.fn() }))

vi.mock('../../features/transactions/useAllTransactions', () => ({
  useAllTransactions: () => ({
    transactions: [
      {
        id: 'tx1', holding_id: 'h1', type: 'buy', date: '2026-10-01',
        amount: 10000, quantity: 10, currency: 'INR',
        script: 'TCS', symbol: 'TCS.NS',
      },
      {
        id: 'tx2', holding_id: 'h1', type: 'sell', date: '2026-11-01',
        amount: 5000, quantity: 5, currency: 'INR',
        script: 'TCS', symbol: 'TCS.NS',
      },
      {
        id: 'tx3', holding_id: 'h2', type: 'dividend', date: '2026-09-15',
        amount: 300, currency: 'INR',
        script: 'Infosys', symbol: 'INFY.NS',
      },
    ],
    holdings: [
      { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
        stocks_owned: 5, avg_cost_price: 1000 },
      { id: 'h2', script: 'Infosys', symbol: 'INFY.NS', currency: 'INR', exchange: 'NSE',
        stocks_owned: 100, avg_cost_price: 1500 },
    ],
    loading: false,
    error: load.error,
    refresh: load.refresh,
  }),
}))

vi.mock('../../features/transactions/TradeImportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Import transactions"><button onClick={onClose}>Close</button></div>,
}))

vi.mock('./Ui2HoldingLedger', () => ({
  Ui2HoldingLedger: ({ onClose }: { onClose: () => void }) =>
    <div role="dialog" aria-label="Holding ledger"><button onClick={onClose}>Close ledger</button></div>,
}))

vi.mock('../shell/Ui2PageIntro', () => ({
  Ui2PageIntro: ({ title, actions }: { title: string; actions?: React.ReactNode }) =>
    <header><h1>{title}</h1>{actions}</header>,
}))

describe('Ui2TransactionsPage', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-ui', 'ui2')
    load.error = ''
    load.refresh.mockClear()
  })

  it('keeps the filters and offers a retry after a load error', async () => {
    load.error = 'Network down'
    render(<Ui2TransactionsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('search', { name: 'Filter transactions' })).toBeInTheDocument()
    expect(screen.queryByText('No transactions match the current filters.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(load.refresh).toHaveBeenCalledOnce()
  })

  it('renders all transactions by default', () => {
    render(<Ui2TransactionsPage />)
    expect(screen.getByRole('table', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(4) // 1 header + 3 rows
  })

  it('filters by search text', async () => {
    render(<Ui2TransactionsPage />)
    await userEvent.type(screen.getByRole('searchbox'), 'TCS')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3) // header + 2 TCS rows
  })

  it('filters by event type', async () => {
    render(<Ui2TransactionsPage />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by event type' }), 'dividend')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(2) // header + 1 dividend
  })

  it('opens the holding ledger when Open ledger is clicked', async () => {
    render(<Ui2TransactionsPage />)
    const buttons = screen.getAllByRole('button', { name: /open ledger/i })
    await userEvent.click(buttons[0])
    expect(screen.getByRole('dialog', { name: 'Holding ledger' })).toBeInTheDocument()
  })

  it('opens trade import dialog', async () => {
    render(<Ui2TransactionsPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Import CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import transactions' })).toBeInTheDocument()
  })

  it('names the viewed account in act-as', () => {
    render(<MemoryRouter><Ui2TransactionsPage actAsUserId="u9" actAsLabel="alice's transactions" /></MemoryRouter>)
    expect(screen.getByRole('region', { name: 'Act-as session' })).toHaveTextContent("Viewing alice's transactions")
    expect(screen.getByRole('link', { name: 'Exit act-as' })).toHaveAttribute('href', '/admin')
  })

  it('shows currency summary panels', () => {
    render(<Ui2TransactionsPage />)
    expect(screen.getByRole('region', { name: 'INR transaction totals' })).toBeInTheDocument()
  })
})
