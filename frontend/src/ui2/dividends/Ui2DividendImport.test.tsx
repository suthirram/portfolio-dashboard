import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Holding } from '../../types'
import { Ui2DividendImport } from './Ui2DividendImport'

const mockApi = vi.hoisted(() => ({ previewDividendImport: vi.fn(), importDividends: vi.fn() }))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const holdings: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
    stocks_owned: 10, avg_cost_price: 1000 },
]

const SHEET = 'Date,Share Name,Dividend,CUMULATIVE\n01/10/2026,TCS,500,500\n01/11/2026,TCS,300,800'

const names = [{ sheet_name: 'TCS', rows: 2, status: 'auto', holding_id: 'h1', matched_by: 'name', suggestions: [] }]
const ready = { counts: { ready: 2, duplicate: 0, invalid: 0, total: 2 }, names, rows: [], warnings: [] }

const show = (onImported = vi.fn(), onClose = vi.fn()) => {
  render(<Ui2DividendImport currency="INR" holdings={holdings} onClose={onClose} onImported={onImported} />)
  return { onImported, onClose }
}

const paste = async (text: string) => {
  await userEvent.click(screen.getByLabelText('Dividend CSV contents'))
  await userEvent.paste(text)
  await userEvent.click(screen.getByRole('button', { name: 'Validate and preview' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.previewDividendImport.mockResolvedValue(ready)
  mockApi.importDividends.mockResolvedValue({ imported: 2, duplicates: [] })
})

describe('Ui2DividendImport', () => {
  it('offers a file input, a paste area and Load example', () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Upload dividend CSV · INR' })).toBeInTheDocument()
    expect(screen.getByLabelText('Dividend CSV file')).toBeInTheDocument()
    expect(screen.getByLabelText('Dividend CSV contents')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load example' })).toBeInTheDocument()
  })

  it('cannot validate an empty buffer', () => {
    show()
    expect(screen.getByRole('button', { name: 'Validate and preview' })).toBeDisabled()
  })

  it('Load example fills the buffer with the header only', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Load example' }))
    expect(screen.getByLabelText('Dividend CSV contents'))
      .toHaveValue('Date,Share Name,Dividend,CUMULATIVE')
  })

  it('validates a pasted sheet and previews the server counts', async () => {
    show()
    await paste(SHEET)
    await waitFor(() => expect(mockApi.previewDividendImport).toHaveBeenCalledTimes(1))
    // Day-first dates reach the server as ISO days.
    expect(mockApi.previewDividendImport.mock.calls[0][0].rows.map((row: { date: string }) => row.date))
      .toEqual(['2026-10-01', '2026-11-01'])
    expect(await screen.findByText('Ready to import')).toBeInTheDocument()
  })

  it('locks the sheet while the preview request is in flight', async () => {
    let resolvePreview: (value: typeof ready) => void = () => {}
    mockApi.previewDividendImport.mockReturnValue(new Promise(resolve => { resolvePreview = resolve }))
    show()
    await paste(SHEET)
    await waitFor(() => expect(screen.getByLabelText('Dividend CSV contents')).toHaveAttribute('readonly'))
    expect(screen.getByLabelText('Dividend CSV file')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Load example' })).toBeDisabled()
    resolvePreview(ready)
    expect(await screen.findByText('Ready to import')).toBeInTheDocument()
  })

  it('fills the buffer from a file without validating it', async () => {
    show()
    await userEvent.upload(
      screen.getByLabelText('Dividend CSV file'),
      new File([SHEET], 'dividends.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByLabelText('Dividend CSV contents')).toHaveValue(SHEET))
    expect(mockApi.previewDividendImport).not.toHaveBeenCalled()
  })

  it('blocks the import while a line is invalid', async () => {
    mockApi.previewDividendImport.mockResolvedValue({
      ...ready,
      counts: { ready: 1, duplicate: 0, invalid: 1, total: 2 },
      rows: [{ line: 3, status: 'invalid', reason: 'No matching holding' }],
    })
    show()
    await paste(SHEET)
    expect(await screen.findByText('No matching holding')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })

  it('imports and refreshes on Done', async () => {
    const { onImported } = show()
    await paste(SHEET)
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('status')).toHaveTextContent('2 imported')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalledOnce()
  })

  it('refreshes when the result step is dismissed instead of confirmed', async () => {
    const { onImported, onClose } = show()
    await paste(SHEET)
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    await screen.findByRole('status')
    await userEvent.click(screen.getByRole('button', { name: 'Close Import complete' }))
    expect(onImported).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
