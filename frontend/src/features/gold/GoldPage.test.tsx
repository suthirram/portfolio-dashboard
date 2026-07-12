import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type GoldTransaction } from '../../lib/api/client'
import GoldPage from './GoldPage'

vi.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    listGoldTransactions: vi.fn().mockResolvedValue([]),
    createGoldTransaction: vi.fn().mockResolvedValue({}),
    updateGoldTransaction: vi.fn().mockResolvedValue({}),
    deleteGoldTransaction: vi.fn().mockResolvedValue(undefined),
    listGoldPrices: vi.fn().mockResolvedValue([]),
    listGoldMissingDates: vi.fn().mockResolvedValue({ missing: [] }),
    putGoldPrices: vi.fn().mockResolvedValue(undefined),
    getGoldMetrics: vi.fn().mockResolvedValue({ invested: 0, grams: 0 }),
  },
}))

const row: GoldTransaction = {
  id: 1,
  date: '2026-07-01',
  gm_price: 7275,
  grams_bought: 8,
  quote_price: 7500,
  bill_amount: 61000,
  actual_paid: 59500,
  billed_weight: 8.2,
  chennai_rate: 'Ditto',
  gold_cost: 58200,
  gst_on_cost: 1746,
  total_expected: 59946,
  gst_on_quote: 225,
  nett_per_gram: 7437.5,
  nett_reduction: 1500,
  nimmi_loss: 1300,
}

const renderPage = () => render(<MemoryRouter><GoldPage /></MemoryRouter>)

describe('GoldPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listGoldTransactions).mockResolvedValue([])
    vi.mocked(api.listGoldPrices).mockResolvedValue([])
    vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: [] })
    vi.mocked(api.getGoldMetrics).mockResolvedValue({ invested: 0, grams: 0 })
  })

  it('offers direct theme selection in the header', async () => {
    renderPage()
    // Outside an AuthProvider premium is unknown → dark/light options only.
    fireEvent.click(await screen.findByRole('button', { name: '☀ Light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: '🌙 Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.queryByRole('button', { name: '⚡ Cyber' })).toBeNull()
  })

  it('shows the blocking missing-prices prompt when there are gaps, and clears it on save', async () => {
    vi.mocked(api.listGoldMissingDates)
      .mockResolvedValueOnce({ missing: ['2026-07-05', '2026-07-06'] })
      .mockResolvedValue({ missing: [] }) // after saving, the reload finds no gaps
    renderPage()

    expect(await screen.findByRole('dialog', { name: 'Fill missing gold prices' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('2026-07-05'), { target: { value: '7300' } })
    fireEvent.change(screen.getByLabelText('2026-07-06'), { target: { value: '7350' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save all' }))

    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([
      { date: '2026-07-05', price_per_gram: 7300 },
      { date: '2026-07-06', price_per_gram: 7350 },
    ]))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fill missing gold prices' })).toBeNull())
  })

  it('saves only the filled days and re-asks for the ones left blank', async () => {
    vi.mocked(api.listGoldMissingDates)
      .mockResolvedValueOnce({ missing: ['2026-07-04', '2026-07-05', '2026-07-06'] })
      .mockResolvedValue({ missing: ['2026-07-05', '2026-07-06'] }) // 04 filled, two remain
    renderPage()

    await screen.findByRole('dialog', { name: 'Fill missing gold prices' })
    // Fill only one of the three days.
    fireEvent.change(screen.getByLabelText('2026-07-04'), { target: { value: '7300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save all' }))

    // Only the filled day is sent.
    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([
      { date: '2026-07-04', price_per_gram: 7300 },
    ]))
    // The prompt stays open and now lists just the two still-blank days.
    await waitFor(() => expect(screen.queryByLabelText('2026-07-04')).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Fill missing gold prices' })).toBeTruthy()
    expect(screen.getByLabelText('2026-07-05')).toBeTruthy()
    expect(screen.getByLabelText('2026-07-06')).toBeTruthy()
  })

  it('clears a stale refresh error once a later refresh succeeds', async () => {
    vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: ['2026-07-06'] })
    // First save's refresh fails; the second succeeds.
    vi.mocked(api.getGoldMetrics)
      .mockResolvedValueOnce({ invested: 0, grams: 0 }) // initial load
      .mockRejectedValueOnce(new Error('boom'))         // refresh after 1st save
      .mockResolvedValue({ invested: 0, grams: 0 })     // refresh after 2nd save
    renderPage()

    await screen.findByRole('dialog', { name: 'Fill missing gold prices' })
    fireEvent.change(screen.getByLabelText('2026-07-06'), { target: { value: '7300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save all' }))
    expect(await screen.findByText('Failed to refresh gold data')).toBeTruthy()

    // Save again → this refresh succeeds → the stale banner clears.
    fireEvent.change(screen.getByLabelText('2026-07-06'), { target: { value: '7350' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save all' }))
    await waitFor(() => expect(screen.queryByText('Failed to refresh gold data')).toBeNull())
  })

  it('does not show the prompt when there are no gaps', async () => {
    renderPage()
    await screen.findByText(/No gold purchases yet/)
    expect(screen.queryByRole('dialog', { name: 'Fill missing gold prices' })).toBeNull()
  })

  it('skipping the prompt dismisses it without saving', async () => {
    vi.mocked(api.listGoldMissingDates).mockResolvedValue({ missing: ['2026-07-06'] })
    renderPage()

    await screen.findByRole('dialog', { name: 'Fill missing gold prices' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Fill missing gold prices' })).toBeNull())
    expect(api.putGoldPrices).not.toHaveBeenCalled()
  })

  it('shows the empty state when there are no purchases', async () => {
    renderPage()
    expect(await screen.findByText(/No gold purchases yet/)).toBeTruthy()
  })

  it('renders a purchase row with its computed columns', async () => {
    vi.mocked(api.listGoldTransactions).mockResolvedValue([row])
    renderPage()

    expect(await screen.findByText('2026-07-01')).toBeTruthy()
    // Server-computed columns rendered as-is (en-IN grouping).
    expect(screen.getByText('58,200')).toBeTruthy()  // gold cost
    expect(screen.getByText('1,746')).toBeTruthy()   // 3% GST
    expect(screen.getByText('59,946')).toBeTruthy()  // total expected
    expect(screen.getByText('7,437.5')).toBeTruthy() // nett per gram
    expect(screen.getByText('1,300')).toBeTruthy()   // NIMMI loss
  })

  it('renders em dashes for absent optional columns', async () => {
    vi.mocked(api.listGoldTransactions).mockResolvedValue([{
      ...row, quote_price: null, gst_on_quote: null, bill_amount: null,
      nett_reduction: null, billed_weight: null, chennai_rate: null,
    } as unknown as GoldTransaction])
    renderPage()

    await screen.findByText('2026-07-01')
    // Scope to the transactions table — the metrics panel has its own dashes.
    const table = document.querySelector('table')!
    const dashes = Array.from(table.querySelectorAll('td')).filter(td => td.textContent === '—')
    expect(dashes.length).toBe(6)
  })

  it('opens the add modal from the header button', async () => {
    renderPage()
    await screen.findByText(/No gold purchases yet/)
    screen.getByRole('button', { name: /Add purchase/ }).click()
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Add gold purchase' })).toBeTruthy())
  })
})
