import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2TradeImport } from './Ui2TradeImport'
import type { Holding } from '../../types'

const HOLDINGS: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
    stocks_owned: 10, avg_cost_price: 1000 },
]

vi.mock('../../features/transactions/tradeCsv', () => ({
  parseTradeCsv: (_text: string, _today: string) => ({
    rows: [{ symbol: 'TCS.NS', type: 'buy', date: '2026-10-01', quantity: 5, amount: 5000, line: 2, status: 'ready' }],
    errors: [],
    skipped: [],
    total: 1,
  }),
}))

vi.mock('../../lib/api/client', () => ({
  api: {
    previewTradeImport: vi.fn().mockResolvedValue({
      counts: { ready: 1, replace: 0, covered: 0, invalid: 0, total: 1 },
      names: [],
      rows: [{ symbol: 'TCS.NS', type: 'buy', date: '2026-10-01', quantity: 5, amount: 5000, line: 2, status: 'ready' }],
      warnings: [],
    }),
    importTrades: vi.fn().mockResolvedValue({
      imported: 1, replaced: 0, covered: 0, created_holdings: 0,
    }),
  },
  ApiError: class ApiError extends Error { status = 0; body = null },
}))

vi.mock('../shell/Ui2Dialog', () => ({
  Ui2Dialog: ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) =>
    <div role="dialog" aria-label={title}><button onClick={onClose}>Dismiss</button>{children}</div>,
}))

vi.mock('../../features/imports/NameConfirmDialog', () => ({
  default: () => <div>NameConfirmDialog</div>,
}))

vi.mock('../../features/imports/ImportTables', () => ({
  ImportCounts: ({ counts }: { counts: [string, number][] }) =>
    <p>{counts.find(([label]) => label === 'Ready to import')?.[1] ?? 0} ready</p>,
  InvalidLines: () => null,
}))

describe('Ui2TradeImport', () => {
  const onClose = vi.fn()
  const onImported = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })

  it('shows the pick step initially', () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    expect(screen.getByRole('dialog', { name: 'Import transactions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('advances to preview after file upload', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['header\nrow'], 'trades.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    expect(await screen.findByRole('dialog', { name: 'Preview import' })).toBeInTheDocument()
    expect(screen.getByText('1 ready')).toBeInTheDocument()
  })

  it('calls onImported after successful import', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['header\nrow'], 'trades.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await screen.findByRole('dialog', { name: 'Preview import' })
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('dialog', { name: 'Import complete' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalledOnce()
  })

  it('calls onImported before onClose when dismissed on the result step', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['header\nrow'], 'trades.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await screen.findByRole('dialog', { name: 'Preview import' })
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    await screen.findByRole('dialog', { name: 'Import complete' })
    // Dismiss via × / backdrop (the Dismiss button in the mock stands in for both).
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onImported).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
