import { render, screen, waitFor } from '@testing-library/react'
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
  chennai_rate: 7400,
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
    expect(screen.getAllByText('—').length).toBe(6)
  })

  it('opens the add modal from the header button', async () => {
    renderPage()
    await screen.findByText(/No gold purchases yet/)
    screen.getByRole('button', { name: /Add purchase/ }).click()
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Add gold purchase' })).toBeTruthy())
  })
})
