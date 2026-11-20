import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../../lib/api/client'
import type { DividendRow, Holding } from '../../types'
import { Ui2DeleteAllDividends, Ui2DeleteDividend, Ui2DividendEditor } from './Ui2DividendDialogs'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: { createTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(), deleteAllDividends: vi.fn() },
  }
})

const holdings: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE', stocks_owned: 10, avg_cost_price: 1000 },
  { id: 'h2', script: 'SAP', symbol: 'SAP.DE', currency: 'EUR', exchange: 'OTHER', stocks_owned: 5, avg_cost_price: 100 },
]
const row = {
  id: 't9', holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: '2026-10-01',
  amount: 500, currency: 'INR', cumulative: 500, holding_cumulative: 500,
} as DividendRow

beforeEach(() => {
  vi.clearAllMocks()
  for (const call of ['createTransaction', 'updateTransaction', 'deleteTransaction', 'deleteAllDividends'] as const) {
    vi.mocked(api[call]).mockResolvedValue(undefined as never)
  }
})

describe('Ui2DividendEditor', () => {
  it('offers only the tab currency’s holdings and records the total received', async () => {
    const onSaved = vi.fn()
    render(<Ui2DividendEditor currency="INR" holdings={holdings} editing={null} onClose={vi.fn()} onSaved={onSaved} />)
    expect(screen.getByRole('dialog', { name: 'Add dividend · INR' })).toBeInTheDocument()
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['TCS · TCS.NS'])
    await userEvent.clear(screen.getByLabelText('Payment date'))
    await userEvent.type(screen.getByLabelText('Payment date'), '2026-10-15')
    await userEvent.type(screen.getByLabelText('Total received · INR'), '1,250.50')
    await userEvent.click(screen.getByRole('button', { name: 'Save dividend' }))
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledWith('h1', expect.objectContaining({
      type: 'dividend', date: '2026-10-15T00:00:00Z', amount: 1250.5, quantity: 0,
    }), undefined))
    expect(onSaved).toHaveBeenCalled()
  })

  it('refuses a missing amount without calling the server', async () => {
    render(<Ui2DividendEditor currency="INR" holdings={holdings} editing={null} onClose={vi.fn()} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save dividend' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a holding, a date and a positive amount.')
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('edits in place with the holding fixed, for the viewed account in act-as', async () => {
    render(<Ui2DividendEditor currency="INR" holdings={holdings} editing={row} userId="u7" onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Edit dividend · INR' })).toBeInTheDocument()
    expect(screen.getByLabelText('Holding')).toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Total received · INR'))
    await userEvent.type(screen.getByLabelText('Total received · INR'), '600')
    await userEvent.click(screen.getByRole('button', { name: 'Save dividend' }))
    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith('t9', expect.objectContaining({ amount: 600 }), 'u7'))
  })
})

describe('Ui2DeleteDividend', () => {
  it('deletes the payment after confirming', async () => {
    const onDeleted = vi.fn()
    render(<Ui2DeleteDividend row={row} currency="INR" onClose={vi.fn()} onDeleted={onDeleted} />)
    expect(screen.getByRole('dialog', { name: 'Delete dividend?' })).toHaveTextContent('TCS · 01 Oct 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Delete dividend' }))
    await waitFor(() => expect(api.deleteTransaction).toHaveBeenCalledWith('t9', undefined))
    expect(onDeleted).toHaveBeenCalled()
  })

  it('stays open and explains a failure', async () => {
    vi.mocked(api.deleteTransaction).mockRejectedValueOnce(new Error('Server unavailable'))
    const onDeleted = vi.fn()
    render(<Ui2DeleteDividend row={row} currency="INR" onClose={vi.fn()} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete dividend' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
    expect(onDeleted).not.toHaveBeenCalled()
  })
})

describe('Ui2DeleteAllDividends', () => {
  it('needs DELETE typed before it removes the currency’s dividends', async () => {
    render(<Ui2DeleteAllDividends currency="EUR" count={4} onClose={vi.fn()} onDeleted={vi.fn()} />)
    const confirm = screen.getByRole('button', { name: 'Delete 4 dividends' })
    expect(confirm).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE')
    await userEvent.click(confirm)
    await waitFor(() => expect(api.deleteAllDividends).toHaveBeenCalledWith('EUR', undefined))
  })
})
