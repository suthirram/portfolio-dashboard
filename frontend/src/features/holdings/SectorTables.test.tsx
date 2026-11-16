import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import HoldingsByCurrency from './HoldingsByCurrency'
import type { HoldingWithPrice } from '../../types'
import { indexXirr } from './stockXirr'

const holding = (id: string, sector: string, cost: number, value: number): HoldingWithPrice => ({
  id, symbol: id, script: id, currency: 'INR', type: 'stock', stocks_owned: 2,
  current_price: value / 2, previous_close_price: cost / 2, cost_price: cost, current_value: value,
  unrealized_pnl: value - cost, realized_pnl: 7, total_dividends: 3,
  classification: { symbol: id, status: 'resolved', sector },
})

describe('sector tables', () => {
  it('preserves financial columns/actions and limits currency XIRR to the overall footer', () => {
    const onEdit = vi.fn(), onTransactions = vi.fn()
    const xirr = indexXirr({ as_of: '2026-11-13', currencies: [{ currency: 'INR', xirr: .12, since: '2020-01-01', undated_openings: 0 }],
      holdings: [{ holding_id: 'TCS', xirr: .2, since: '2020-01-01', undated_opening: false }] })
    render(<HoldingsByCurrency holdings={[holding('TCS', 'Technology', 100, 120), holding('ITC', 'FMCG', 200, 240)]}
      loading={false} onEdit={onEdit} onDelete={vi.fn()} onTransactions={onTransactions} xirr={xirr} />)
    const flat = document.querySelector('tfoot tr')!
    expect(flat.children[2]).toHaveTextContent('₹300.00')
    expect(flat.children[3]).toHaveTextContent(/^$/)
    expect(flat.children[4]).toHaveTextContent(/^$/)
    expect(flat.children[5]).toHaveTextContent('₹360.00')
    expect(flat.children[7]).toHaveTextContent('20.00%')
    expect(flat.children[10]).toHaveTextContent('12%')
    fireEvent.click(screen.getByRole('button', { name: 'By sector' }))
    expect(screen.getAllByRole('table')).toHaveLength(2)
    expect(screen.queryByText('TOTAL')).not.toBeInTheDocument()
    expect(screen.getAllByText('12%')).toHaveLength(1) // currency summary only
    const technology = screen.getByRole('heading', { name: /Technology/ }).parentElement!
    const table = within(technology).getByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(12)
    const cells = table.querySelectorAll('tfoot td')
    expect(cells[2]).toHaveTextContent('₹100.00')
    expect(cells[5]).toHaveTextContent('₹120.00')
    expect(cells[6]).toHaveTextContent('+₹20.00')
    expect(cells[8]).toHaveTextContent('₹7.00')
    expect(cells[9]).toHaveTextContent('₹3.00')
    expect(cells[10]).toHaveTextContent('—')
    expect(within(table).getByText('20%')).toBeInTheDocument() // row XIRR retained
    fireEvent.click(within(table).getByTitle('Edit holding'))
    fireEvent.click(within(table).getByTitle('Transactions (ledger)'))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'TCS' }))
    expect(onTransactions).toHaveBeenCalledWith(expect.objectContaining({ id: 'TCS' }))
    fireEvent.click(screen.getByRole('button', { name: 'By holding' }))
    expect(screen.getByText('TOTAL')).toBeInTheDocument()
  })

  it('combines nil/all views, zero-cost returns and incomplete day prices with grouping', () => {
    render(<HoldingsByCurrency holdings={[{ ...holding('NIL', 'Technology', 0, 0), stocks_owned: 0 },
      { ...holding('ACTIVE', 'FMCG', 0, 30), previous_close_price: undefined }]}
      loading={false} onEdit={vi.fn()} onDelete={vi.fn()} searchActive />)
    expect(screen.getByText('VISIBLE TOTAL')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'By sector' }))
    expect(screen.queryByText('NIL')).not.toBeInTheDocument()
    const cells = document.querySelectorAll('tfoot td')
    expect(cells[0]).toHaveTextContent('visible selection')
    expect(cells[6]).toHaveTextContent('—')
    expect(cells[7]).not.toHaveTextContent(/NaN|Infinity/)
    fireEvent.click(screen.getByRole('button', { name: /^Nil/ }))
    expect(screen.getByText('NIL')).toBeInTheDocument()
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })
})
