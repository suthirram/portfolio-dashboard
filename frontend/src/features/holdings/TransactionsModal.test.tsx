import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { api } from '../../lib/api/client'
import TransactionsModal from './TransactionsModal'
import { useUiMode } from '../../lib/uiMode'

vi.mock('../../lib/uiMode', () => ({ useUiMode: vi.fn(() => 'classic') }))

vi.mock('../../lib/api/client', () => ({
  api: {
    listTransactions: vi.fn().mockResolvedValue([]),
    createTransaction: vi.fn().mockResolvedValue({}),
    updateTransaction: vi.fn().mockResolvedValue({}),
    deleteTransaction: vi.fn().mockResolvedValue({}),
  },
}))

const holding = {
  id: 'holding-1',
  script: 'VWCE',
  currency: 'EUR',
} as HoldingWithPrice

describe('TransactionsModal numeric input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUiMode).mockReturnValue('classic')
    vi.mocked(api.listTransactions).mockResolvedValue([])
  })

  it('creates a UI_2.0 buy using the editable total after price and shares prefill it', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText('Shares (not used for dividends)'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByLabelText(/Price \/ share/), { target: { value: '10' } })
    expect(screen.getByLabelText(/Total amount/)).toHaveValue('15.00')
    fireEvent.change(screen.getByLabelText(/Total amount/), { target: { value: '15,25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeVisible()
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      type: 'buy', quantity: 1.5, amount: 15.25,
    }), undefined)
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('opens the UI_2.0 event editor and confirms deletion against the selected owner', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    vi.mocked(api.listTransactions).mockResolvedValueOnce([
      { id: 'event-1', type: 'split', date: '2026-10-01', ratio: 2 },
    ])
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} userId="owner" />)
    expect(screen.getByRole('dialog', { name: 'VWCE · transaction ledger' })).toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Split/ }))
    expect(screen.getByLabelText(/Ratio/)).toHaveValue('2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }))
    expect(api.deleteTransaction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeVisible()
    expect(api.deleteTransaction).toHaveBeenCalledWith('event-1', 'owner')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('clears an invalid UI_2.0 amount when cancelling and reopening the editor', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    await screen.findByText('No transactions yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText('Shares (not used for dividends)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Total amount/), { target: { value: '1,2,3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid amount')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('No transactions yet.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('edits a UI_2.0 opening with its type locked and realised seed prefilled', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    vi.mocked(api.listTransactions).mockResolvedValueOnce([
      { id: 'opening-1', type: 'opening', date: '2026-01-01', quantity: 4, amount: 80, realized_seed: -7.25 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Edit Opening/ }))
    expect(screen.getByLabelText('Event type')).toBeDisabled()
    expect(screen.getByLabelText('Event type')).toHaveDisplayValue('Opening')
    const seed = screen.getByLabelText(/Realised P&L seed/)
    expect(seed).toHaveValue('-7.25')
    fireEvent.change(seed, { target: { value: '-8.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeVisible()
    expect(api.updateTransaction).toHaveBeenCalledWith('opening-1',
      expect.objectContaining({ type: 'opening', realized_seed: -8.5 }), undefined)
  })

  it('rejects a cleared date in the Classic editor', async () => {
    const { container } = render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    expect(await screen.findByText('Enter a valid date')).toBeVisible()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  // The shared row-action classes track the theme's blue and red borders.
  it('renders ledger row actions with the shared btn-row classes', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'buy', date: '2026-01-05', quantity: 1, amount: 100 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByTitle('Edit')).toHaveClass('btn-row', 'btn-row-accent')
    expect(screen.getByTitle('Delete')).toHaveClass('btn-row', 'btn-row-danger')
  })

  it('submits comma decimal transaction values as numbers', async () => {
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} />)

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30,68' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledTimes(1))
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      quantity: 1.5,
      amount: 30.68,
    }), undefined)
  })

  it('rejects malformed amount text instead of coercing it', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1,,2' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('keeps a stored 1.234 amount on a notes-only edit', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'dividend', date: '2026-01-05', quantity: 0, amount: 1.234 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.click(await screen.findByTitle('Edit'))
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: 'tax refund' } })
    fireEvent.click(screen.getByRole('button', { name: /Update transaction/ }))
    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 1.234, notes: 'tax refund' }), undefined))
  })

  it('reads and writes the target ledger in act-as', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} userId="u1" />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith('holding-1', 'u1'))
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({ amount: 100 }), 'u1'))
  })

  it('loads the next owner ledger when the target changes', async () => {
    const props = { holding, onClose: vi.fn(), onChanged: vi.fn() }
    const view = render(<TransactionsModal {...props} userId="first" />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith('holding-1', 'first'))
    view.rerender(<TransactionsModal {...props} userId="second" />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith('holding-1', 'second'))
  })

  it('keeps the Classic editor open while deletion is pending', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 'event-1', type: 'buy', date: '2026-01-05', quantity: 1, amount: 100 },
    ])
    let finishDelete!: () => void
    vi.mocked(api.deleteTransaction).mockImplementationOnce(() => new Promise(resolve => {
      finishDelete = () => resolve({})
    }))
    const onClose = vi.fn()
    render(<TransactionsModal holding={holding} onClose={onClose} onChanged={() => {}} />)
    fireEvent.click(await screen.findByTitle('Delete'))
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    finishDelete()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add transaction' })).toBeEnabled())
  })
})
