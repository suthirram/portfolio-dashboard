// Names and hints no longer live only in a hover `title` (PD-058 Task 12):
// icon buttons name their target, and caveats are in screen-reader text.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../types'
import type { HistoryRow } from '../lib/api/client'
import HoldingsTable from './holdings/HoldingsTable'
import TransactionsModal from './holdings/TransactionsModal'
import { HistoryTable } from './history/HistoryTable'

vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api/client')>('../lib/api/client')
  return {
    ...actual,
    api: { listTransactions: vi.fn().mockResolvedValue([{ id: 'txn-1', type: 'buy', date: '2026-11-03', quantity: 1, amount: 100 }]) },
  }
})

const holding = {
  id: 'holding-1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', stocks_owned: 1,
  price_error: 'Yahoo returned no quote',
} as HoldingWithPrice

describe('accessible names beyond title', () => {
  it('names each holding row action after its holding', () => {
    render(<HoldingsTable holdings={[holding]} loading={false} onEdit={() => {}} onDelete={() => {}} onTransactions={() => {}} />)
    expect(screen.getByRole('button', { name: 'Edit TCS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete TCS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transactions for TCS' })).toBeInTheDocument()
  })

  it('reads the price error, not just its hover title', () => {
    render(<HoldingsTable holdings={[holding]} loading={false} onEdit={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(': Yahoo returned no quote')).toHaveClass('sr-only')
  })

  it('names ledger row actions after the event', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByRole('button', { name: /^Edit Buy on/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Delete Buy on/ })).toBeInTheDocument()
  })

  it('reads a day’s dividend receipt in the History table', () => {
    const row = {
      date: '2026-11-03',
      regions: { INR: { invested: 100, current: 110, source: 'cron' } },
      totals: { invested_total: 100, current_total: 110, pnl_pct: 10 },
      dividends: { INR: { on_day: 25, to_date: 25 } },
    } as unknown as HistoryRow
    render(<HistoryTable rows={[row]} currency="INR" onDelete={() => {}} />)
    expect(screen.getByText(/received this day/)).toHaveClass('sr-only')
  })
})
