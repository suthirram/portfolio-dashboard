import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ApiError } from '../../lib/api/client'
import type { Holding } from '../../types'

const mockApi = vi.hoisted(() => ({ previewDividendImport: vi.fn(), importDividends: vi.fn() }))
vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

import DividendImportModal from './DividendImportModal'

const holdings: Holding[] = [
  { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR' },
  { id: 'h2', script: 'Jio Platforms Ltd', symbol: 'JIOPLA.NS', currency: 'INR' },
]
const csv = 'Date,Share Name,Dividend,CUMULATIVE\n1/1/2020,TCS,300,300\n1/1/2020,TCS,300,600\n15/03/2020,JLP,500,1100\n'
const pick = (text: string) =>
  fireEvent.change(screen.getByLabelText('Choose a .csv file'), { target: { files: [new File([text], 'divs.csv', { type: 'text/csv' })] } })

const names = [
  { sheet_name: 'TCS', rows: 2, status: 'auto', holding_id: 'h1', matched_by: 'script', suggestions: [] },
  { sheet_name: 'JLP', rows: 1, status: 'needs_confirmation', suggestions: [] },
]
const needsJlp = { counts: { ready: 2, duplicate: 0, invalid: 1, total: 3 }, names, rows: [], warnings: [] }
const ready = { counts: { ready: 2, duplicate: 1, invalid: 0, total: 3 }, names, rows: [], warnings: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.previewDividendImport.mockResolvedValueOnce(needsJlp).mockResolvedValueOnce(ready)
  mockApi.importDividends.mockResolvedValue({ imported: 2, duplicates: [{ line: 2, date: '2020-01-01', share_name: 'TCS', amount: 300 }], batch_id: 'b', warnings: [] })
})

const renderModal = () => render(<DividendImportModal currency="INR" holdings={holdings} onClose={vi.fn()} onImported={vi.fn()} />)

describe('DividendImportModal', () => {
  it('confirms an inconsistent name, previews, imports and reports duplicates', async () => {
    renderModal()
    expect(screen.getByText(/Importing into/)).toHaveTextContent('₹ INR')
    pick(csv)
    expect(await screen.findByRole('dialog', { name: 'Confirm share names' })).toBeInTheDocument()
    const cont = screen.getByRole('button', { name: 'Continue to preview' })
    expect(cont).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Other holding for JLP'), { target: { value: 'h2' } })
    fireEvent.click(cont)
    await waitFor(() => expect(mockApi.previewDividendImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ currency: 'INR', mappings: { JLP: 'h2' } }), undefined))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByText('2 imported')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 duplicates are discarded')
  })

  it('keeps Confirm disabled while any row is invalid', async () => {
    mockApi.previewDividendImport.mockReset().mockResolvedValue({ ...ready, names: [], counts: { ready: 1, duplicate: 0, invalid: 0, total: 1 } })
    renderModal()
    pick('Date,Share Name,Dividend\n1/1/2020,TCS,300\n31/02/2021,TCS,300\n')
    expect(await screen.findByText(/1 rows need fixing/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled()
    expect(screen.getByText(/31\/02\/2021/)).toBeInTheDocument()
  })

  it('shows the server preview when confirm finds a new problem (422)', async () => {
    mockApi.previewDividendImport.mockReset().mockResolvedValue({ ...ready, names: [] })
    mockApi.importDividends.mockRejectedValue(new ApiError(422, 'invalid', {
      ...ready, names: [], counts: { ready: 1, duplicate: 1, invalid: 1, total: 3 },
      rows: [{ line: 3, status: 'invalid', reason: 'no holding chosen for "X"' }],
    }))
    renderModal()
    pick('Date,Share Name,Dividend\n1/1/2020,TCS,300\n')
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm import' }))
    expect(await screen.findByText(/data changed since the preview/)).toBeInTheDocument()
    expect(screen.getByText('no holding chosen for "X"')).toBeInTheDocument()
  })
})
