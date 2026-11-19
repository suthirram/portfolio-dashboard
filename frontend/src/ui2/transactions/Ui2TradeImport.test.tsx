import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Ui2TradeImport } from './Ui2TradeImport'
import type { Holding } from '../../types'
import { TRADE_CSV_EXAMPLE_HEADER, parseTradeCsv } from '../../features/transactions/tradeCsv'
import { api } from '../../lib/api/client'

const HOLDINGS: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
    stocks_owned: 10, avg_cost_price: 1000 },
]

// The bare example header goes through the real parser so the "no data rows"
// rule is exercised; anything else yields one ready row.
vi.mock('../../features/transactions/tradeCsv', async importOriginal => {
  const actual = await importOriginal<typeof import('../../features/transactions/tradeCsv')>()
  return {
    ...actual,
    parseTradeCsv: vi.fn((text: string, today: string) => text === actual.TRADE_CSV_EXAMPLE_HEADER
      ? actual.parseTradeCsv(text, today)
      : {
          rows: [{ symbol: 'TCS.NS', type: 'buy', date: '2026-10-01', quantity: 5, amount: 5000, line: 2, status: 'ready' }],
          errors: [],
          skipped: [],
          total: 1,
        }),
  }
})

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

  it('loads a selected CSV into the editor and validates it on request', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['header\nrow'], 'trades.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'CSV contents' })).toHaveValue('header\nrow'))
    expect(screen.getByRole('textbox', { name: 'CSV contents' })).toHaveValue('header\nrow')
    expect(screen.getByRole('button', { name: 'Validate CSV' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    expect(await screen.findByRole('table', { name: 'Trade preview' })).toBeInTheDocument()
    expect(screen.getByText('1 ready')).toBeInTheDocument()
  })

  it('loads the example header and validates pasted CSV contents', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const textarea = screen.getByRole('textbox', { name: 'CSV contents' })
    await userEvent.click(screen.getByRole('button', { name: 'Load example' }))
    expect(textarea).toHaveValue(TRADE_CSV_EXAMPLE_HEADER)
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Stock name,Symbol,Type,Quantity,Value,Exchange,Execution date and time\nTCS,TCS.NS,BUY,5,5000,NSE,01/10/2026')
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    expect(await screen.findByRole('table', { name: 'Trade preview' })).toBeInTheDocument()
  })

  it('keeps a header-only CSV on the paste step with an error', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    await userEvent.click(screen.getByRole('button', { name: 'Load example' }))
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No data rows found. Add trade rows below the header.')
    expect(screen.getByRole('textbox', { name: 'CSV contents' })).toHaveValue(TRADE_CSV_EXAMPLE_HEADER)
    expect(api.previewTradeImport).not.toHaveBeenCalled()
  })

  it('rejects pasted CSV over 1 MB without calling the server', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'CSV contents' }), { target: { value: 'x'.repeat(1024 * 1024 + 1) } })
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The CSV is larger than 1 MB — split it.')
    expect(api.previewTradeImport).not.toHaveBeenCalled()
  })

  it('notes when the preview shows only part of the rows', async () => {
    const manyRows = Array.from({ length: 25 }, (_, index) => (
      { symbol: 'TCS.NS', stock_name: 'TCS', exchange: 'NSE' as const, type: 'buy' as const, date: '2026-10-01',
        quantity: 1, amount: 100, line: index + 2, status: 'ready' as const }))
    vi.mocked(api.previewTradeImport).mockResolvedValueOnce({
      counts: { ready: 25, replace: 0, covered: 0, invalid: 0, total: 25 }, names: [], rows: manyRows, warnings: [],
    })
    vi.mocked(parseTradeCsv).mockReturnValueOnce({ rows: manyRows, errors: [], skipped: [], total: 25 })
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'CSV contents' }), 'rows')
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    expect(await screen.findByText('Showing 20 of 25 rows.')).toBeInTheDocument()
  })

  it('calls onImported after successful import', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['header\nrow'], 'trades.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'CSV contents' })).toHaveValue('header\nrow'))
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    await screen.findByRole('button', { name: 'Confirm import' })
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('status')).toHaveTextContent('1 imported')
    await userEvent.click(await screen.findByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalledOnce()
  })

  it('calls onImported before onClose when dismissed on the result step', async () => {
    render(<Ui2TradeImport holdings={HOLDINGS} onClose={onClose} onImported={onImported} />)
    const file = new File(['header\nrow'], 'trades.csv', { type: 'text/csv' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(fileInput, file)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'CSV contents' })).toHaveValue('header\nrow'))
    await userEvent.click(screen.getByRole('button', { name: 'Validate CSV' }))
    await screen.findByRole('button', { name: 'Confirm import' })
    await userEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    await screen.findByRole('status')
    // Dismiss via × / backdrop (the Dismiss button in the mock stands in for both).
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onImported).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
