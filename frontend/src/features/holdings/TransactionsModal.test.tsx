import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { api } from '../../lib/api/client'
import TransactionsModal from './TransactionsModal'

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
    vi.mocked(api.listTransactions).mockResolvedValue([])
  })

  // Theme contract: row actions use the shared tinted classes whose borders
  // track --blue/--red per theme, not hardcoded rgba colours.
  it('renders ledger row actions with the shared btn-row classes', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'buy', date: '2026-01-05', quantity: 1, amount: 100 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    expect((await screen.findByTitle('Edit')).className).toBe('btn-row btn-row-accent')
    expect(screen.getByTitle('Delete').className).toBe('btn-row btn-row-danger')
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
    }))
  })

  it('rejects malformed amount text instead of coercing it', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1,,2' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })
})
