import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../../lib/api/client'
import type { Holding } from '../../types'

const mockApi = vi.hoisted(() => ({ previewTradeImport: vi.fn(), importTrades: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import TradeImportModal from './TradeImportModal'

const holdings: Holding[] = [{ id: 'h1', script: 'ITC', symbol: 'ITC.NS', currency: 'INR' }]
const csv = [
  'Stock name\tSymbol\tISIN\tType\tQuantity\tValue\tExchange\tExchange Order Id\tExecution date and time\tOrder status',
  'ITC LTD\tITC\tINE154A01025\tBUY\t1\t427\tNSE\t1.1E+15\t10/2/2025\tExecuted',
  'LG ELECTRONICS INDIA LTD\tLGEINDIA\tINE324D01010\tBUY\t13\t14820\tNSE\t83385640\t13-10-2025 03:30 PM\tExecuted',
  'LG ELECTRONICS INDIA LTD\tLGEINDIA\tINE324D01010\tSELL\t13\t22258.6\tNSE\t1400000000800144\t14-10-2025 10:00 AM\tExecuted',
].join('\n')
const pick = (text: string) =>
  fireEvent.change(screen.getByLabelText('Choose a .csv file'), { target: { files: [new File([text], 'orders.csv', { type: 'text/csv' })] } })

const names = [
  { sheet_name: 'ITC', rows: 1, status: 'auto', holding_id: 'h1', matched_by: 'symbol', suggestions: [] },
  { sheet_name: 'LGEINDIA', rows: 2, status: 'needs_confirmation', suggestions: [] },
]
const needsLg = { counts: { ready: 0, replace: 1, covered: 0, invalid: 2, total: 3 }, names, rows: [], warnings: [] }
const ready = { counts: { ready: 2, replace: 1, covered: 0, invalid: 0, total: 3 }, names, rows: [], warnings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.previewTradeImport.mockResolvedValueOnce(needsLg).mockResolvedValueOnce(ready)
  mockApi.importTrades.mockResolvedValue({ imported: 2, replaced: 1, covered: 0, created_holdings: 1 })
})

const renderModal = (onImported = vi.fn()) => render(<TradeImportModal holdings={holdings} onClose={vi.fn()} onImported={onImported} />)

describe('TradeImportModal', () => {
  it('creates an unknown symbol, previews the replacements and imports in one go', async () => {
    const onImported = vi.fn()
    renderModal(onImported)
    expect(screen.getByText(/dates read as/)).toHaveTextContent('DD/MM/YYYY')
    pick(csv)

    // Both date shapes reach the server as the day alone, read day-first.
    await waitFor(() => expect(mockApi.previewTradeImport).toHaveBeenCalledTimes(1))
    const sent = mockApi.previewTradeImport.mock.calls[0][0]
    expect(sent.rows.map((row: Record<string, unknown>) => [row.date, 'minutes' in row]))
      .toEqual([['2025-02-10', false], ['2025-10-13', false], ['2025-10-14', false]])

    expect(await screen.findByRole('dialog', { name: 'Confirm symbols' })).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Create a new holding LGEINDIA'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to preview' }))
    await waitFor(() => expect(mockApi.previewTradeImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ mappings: {}, create: ['LGEINDIA'] }), undefined))

    expect(await screen.findByText('Replaces an identical trade')).toBeInTheDocument()
    expect(screen.getByText(/nothing is duplicated/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByRole('status')).toHaveTextContent('2 imported · 1 replaced · 0 covered by an opening balance · 1 new holdings')
    expect(mockApi.importTrades).toHaveBeenCalledWith(expect.objectContaining({ create: ['LGEINDIA'] }), undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onImported).toHaveBeenCalled()
  })

  it('blocks the import while lines are invalid, naming each line', async () => {
    renderModal()
    pick(csv.replace('10/2/2025', '31/02/2025'))
    fireEvent.click(await screen.findByLabelText('Create a new holding LGEINDIA'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to preview' }))
    expect(await screen.findByText(/rows need fixing/)).toBeInTheDocument()
    expect(screen.getByText(/Date "31\/02\/2025" is not a DD\/MM\/YYYY date/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })

  it('shows the fresh preview when the data changed since the preview (422)', async () => {
    mockApi.importTrades.mockRejectedValue(new ApiError(422, 'invalid', { ...ready, counts: { ...ready.counts, ready: 1, invalid: 1 } }))
    renderModal()
    pick(csv)
    fireEvent.click(await screen.findByLabelText('Create a new holding LGEINDIA'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to preview' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByText('The data changed since the preview — review it again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
  })
})
