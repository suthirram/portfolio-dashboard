import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type GoldTransaction } from '../../lib/api/client'
import { Ui2GoldPage } from './Ui2GoldPage'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: {
      listGoldTransactions: vi.fn(),
      listGoldPrices: vi.fn(),
      listGoldMissingDates: vi.fn(),
      getGoldMetrics: vi.fn(),
      createGoldTransaction: vi.fn(),
      updateGoldTransaction: vi.fn(),
      deleteGoldTransaction: vi.fn(),
      putGoldPrices: vi.fn(),
    },
  }
})

const older: GoldTransaction = {
  id: 1, date: '2026-03-01', gm_price: 8000, grams_bought: 10, actual_paid: 82000,
  gold_cost: 80000, gst_on_cost: 2400, total_expected: 82400, nett_per_gram: 8200, nimmi_loss: 0,
}
const newer: GoldTransaction = {
  id: 2, date: '2026-06-01', gm_price: 9000, grams_bought: 2.5, actual_paid: 23500,
  quote_price: 9100, bill_amount: 23400, billed_weight: 2.48, chennai_rate: 'Ditto',
  gold_cost: 22500, gst_on_cost: 675, total_expected: 23175, gst_on_quote: 682.5,
  nett_per_gram: 9400, nett_reduction: 100, nimmi_loss: 180,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.listGoldTransactions).mockResolvedValue([older, newer])
  vi.mocked(api.listGoldPrices).mockResolvedValue([{ date: '2026-11-19', price_per_gram: 9500 }])
  vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: [] })
  vi.mocked(api.getGoldMetrics).mockResolvedValue({
    invested: 105500, grams: 12.5, current: 118750, avg_per_gram: 8440,
    bees_pl: null, nett_ex_bees: 13250, nett_in_bees: null, xirr: 0.12,
  })
})

const ledger = () => screen.findByRole('table', { name: 'Gold purchases' })

describe('Ui2GoldPage', () => {
  it('renders the handoff intro and the four stat cards from the server metrics', async () => {
    render(<Ui2GoldPage />)
    expect(screen.getByRole('heading', { name: 'A clear view of your gold.' })).toBeInTheDocument()
    expect(await screen.findByText('₹1,18,750.00')).toBeInTheDocument()
    expect(screen.getByText('Latest recorded rate · 19 Nov 2026')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Physical gold' })).getByText('12.5 g')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Net P/L · physical' })).getByText('+₹13,250.00'))
      .toHaveClass('u2-positive')
  })

  it('shows unknowable metrics as a dash, never a zero', async () => {
    render(<Ui2GoldPage />)
    const metrics = await screen.findByRole('region', { name: 'Gold metrics' })
    expect(within(metrics).getByTitle(/GOLDBEES P\/L excluding tax/).parentElement).toHaveTextContent('—')
    expect(within(metrics).getByText('12%')).toHaveClass('u2-positive')
  })

  it('renders all 15 columns, shades the calculated ones and lists newest first', async () => {
    render(<Ui2GoldPage />)
    const table = await ledger()
    const headers = within(table).getAllByRole('columnheader')
    expect(headers).toHaveLength(16)
    expect(headers[3]).toHaveTextContent('Gold cost')
    expect(headers[3]).toHaveClass('computed')
    expect(headers[1]).not.toHaveClass('computed')
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    const [, first, second] = within(table).getAllByRole('row')
    expect(first).toHaveTextContent('01 Jun 2026')
    expect(second).toHaveTextContent('01 Mar 2026')
  })

  it('renders absent optional fields as a dash and tones a NIMMI loss', async () => {
    render(<Ui2GoldPage />)
    const table = await ledger()
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    const olderRow = within(table).getAllByRole('row')[2]
    expect(within(olderRow).getAllByText('—').length).toBeGreaterThanOrEqual(6)
    const newerRow = within(table).getAllByRole('row')[1]
    expect(within(newerRow).getByText('₹180.00')).toHaveClass('u2-negative')
  })

  it('opens Details with every column and deletes after confirmation', async () => {
    vi.mocked(api.deleteGoldTransaction).mockResolvedValue(undefined)
    render(<Ui2GoldPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Details of 01 Jun 2026 purchase' }))
    const dialog = screen.getByRole('dialog', { name: 'Purchase · 01 Jun 2026' })
    expect(within(dialog).getByText('LOSS due to NIMMI')).toBeInTheDocument()
    expect(within(dialog).getByText('Ditto')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete purchase' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete purchase?' })
    expect(confirm).toHaveTextContent('Remove the 2.5 g purchase from 01 Jun 2026?')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete purchase' }))
    await waitFor(() => expect(api.deleteGoldTransaction).toHaveBeenCalledWith(2))
    await waitFor(() => expect(api.listGoldTransactions).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves from Details to the editor prefilled with the purchase', async () => {
    render(<Ui2GoldPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Details of 01 Jun 2026 purchase' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit purchase' }))
    const editor = screen.getByRole('dialog', { name: 'Edit gold purchase' })
    expect(within(editor).getByLabelText('Weight bought · grams *')).toHaveValue('2.5')
    expect(within(editor).getByLabelText('Chennai rate / remark')).toHaveValue('Ditto')
  })

  it('validates and creates a purchase with the shared rules', async () => {
    vi.mocked(api.createGoldTransaction).mockResolvedValue(older)
    render(<Ui2GoldPage />)
    await userEvent.click(screen.getByRole('button', { name: '＋ Add purchase' }))
    const editor = screen.getByRole('dialog', { name: 'Add gold purchase' })
    await userEvent.click(within(editor).getByRole('button', { name: 'Save purchase' }))
    expect(within(editor).getByRole('alert')).toHaveTextContent('Per-gram price must be > 0')
    expect(api.createGoldTransaction).not.toHaveBeenCalled()
    await userEvent.type(within(editor).getByLabelText('Per-gram purchase rate · INR *'), '9000')
    await userEvent.type(within(editor).getByLabelText('Weight bought · grams *'), '2.500')
    await userEvent.type(within(editor).getByLabelText('Actual paid · INR *'), '23500')
    await userEvent.click(within(editor).getByRole('button', { name: 'Save purchase' }))
    await waitFor(() => expect(api.createGoldTransaction).toHaveBeenCalledWith(expect.objectContaining({
      gm_price: 9000, grams_bought: 2.5, actual_paid: 23500, quote_price: null, chennai_rate: null,
    })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add gold purchase' })).not.toBeInTheDocument())
  })

  it('opens the missing-price dialog on arrival and keeps the alert after a skip', async () => {
    vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: ['2026-11-15', '2026-11-16'] })
    render(<Ui2GoldPage />)
    const dialog = await screen.findByRole('dialog', { name: 'Complete missing daily prices' })
    expect(dialog).toHaveTextContent('2 dates are missing')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 daily prices need attention')
    await userEvent.click(screen.getByRole('button', { name: 'Review missing prices' }))
    expect(screen.getByRole('dialog', { name: 'Complete missing daily prices' })).toBeInTheDocument()
  })

  it('saves the entered days and stays open on the days still missing', async () => {
    vi.mocked(api.listGoldMissingDates)
      .mockResolvedValueOnce({ missing: ['2026-11-15', '2026-11-16'] })
      .mockResolvedValue({ missing: ['2026-11-16'] })
    vi.mocked(api.putGoldPrices).mockResolvedValue(undefined)
    render(<Ui2GoldPage />)
    const dialog = await screen.findByRole('dialog', { name: 'Complete missing daily prices' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save entered prices' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter at least one known rate, or skip for now.')
    await userEvent.type(within(dialog).getByLabelText('15 Nov 2026 · INR / gram'), '9400')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save entered prices' }))
    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([{ date: '2026-11-15', price_per_gram: 9400 }]))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Complete missing daily prices' }))
      .toHaveTextContent('1 date is missing'))
    expect(screen.queryByLabelText('15 Nov 2026 · INR / gram')).not.toBeInTheDocument()
  })

  it('shows the empty ledger row when there are no purchases', async () => {
    vi.mocked(api.listGoldTransactions).mockResolvedValue([])
    render(<Ui2GoldPage />)
    expect(await screen.findByText('No purchases yet. Add your first purchase.')).toBeInTheDocument()
  })
})
