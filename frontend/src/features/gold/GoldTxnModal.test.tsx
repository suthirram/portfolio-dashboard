import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type GoldTransaction } from '../../lib/api/client'
import GoldTxnModal from './GoldTxnModal'

vi.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    createGoldTransaction: vi.fn().mockResolvedValue({}),
    updateGoldTransaction: vi.fn().mockResolvedValue({}),
  },
}))

const fill = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('GoldTxnModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a purchase, blank optionals sent as null, comma decimals parsed', async () => {
    const onSaved = vi.fn()
    render(<GoldTxnModal txn={null} onClose={() => {}} onSaved={onSaved} />)

    fill('Date *', '2026-07-01')
    fill(/Per-gram price/, '7275')
    fill(/Weight \(g\)/, '8,5')
    fill(/Actual amount paid/, '59500')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.createGoldTransaction).toHaveBeenCalledTimes(1))
    expect(api.createGoldTransaction).toHaveBeenCalledWith({
      date: '2026-07-01',
      gm_price: 7275,
      grams_bought: 8.5,
      actual_paid: 59500,
      quote_price: null,
      bill_amount: null,
      billed_weight: null,
      chennai_rate: null,
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('parses dot-separated gram weights as decimals, not thousands', async () => {
    render(<GoldTxnModal txn={null} onClose={() => {}} onSaved={() => {}} />)

    fill('Date *', '2026-07-01')
    fill(/Per-gram price/, '7275')
    fill(/Weight \(g\)/, '2.500')     // 2.5 g, not 2,500 g
    fill(/Billed weight/, '8.000')    // 8 g, not 8,000 g
    fill(/Actual amount paid/, '59,500') // grouped rupees stay 59500
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.createGoldTransaction).toHaveBeenCalledWith(expect.objectContaining({
      grams_bought: 2.5,
      billed_weight: 8,
      actual_paid: 59500,
    })))
  })

  it('rejects malformed amounts instead of sending NaN', async () => {
    render(<GoldTxnModal txn={null} onClose={() => {}} onSaved={() => {}} />)

    fill('Date *', '2026-07-01')
    fill(/Per-gram price/, '7275')
    fill(/Weight \(g\)/, '8')
    fill(/Actual amount paid/, '1..2')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Actual amount paid must be >= 0')).toBeTruthy()
    expect(api.createGoldTransaction).not.toHaveBeenCalled()
  })

  it('rejects a malformed optional field instead of nulling it silently', async () => {
    render(<GoldTxnModal txn={null} onClose={() => {}} onSaved={() => {}} />)

    fill('Date *', '2026-07-01')
    fill(/Per-gram price/, '7275')
    fill(/Weight \(g\)/, '8')
    fill(/Actual amount paid/, '59500')
    fill(/Gold price in quote/, '..')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Gold price in quote is not a number')).toBeTruthy()
    expect(api.createGoldTransaction).not.toHaveBeenCalled()
  })

  it('blocks save and shows the rule when a required field is invalid', async () => {
    render(<GoldTxnModal txn={null} onClose={() => {}} onSaved={() => {}} />)

    fill('Date *', '2026-07-01')
    fill(/Per-gram price/, '0')
    fill(/Weight \(g\)/, '8')
    fill(/Actual amount paid/, '100')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Per-gram price must be > 0')).toBeTruthy()
    expect(api.createGoldTransaction).not.toHaveBeenCalled()
  })

  it('edits an existing purchase via PUT with prefilled values', async () => {
    const txn = {
      id: 7, date: '2026-06-15', gm_price: 7000, grams_bought: 2,
      actual_paid: 14400, quote_price: null, bill_amount: null,
      billed_weight: null, chennai_rate: null,
      gold_cost: 14000, gst_on_cost: 420, total_expected: 14420,
      gst_on_quote: null, nett_per_gram: 7200, nett_reduction: null, nimmi_loss: 400,
    } as unknown as GoldTransaction

    render(<GoldTxnModal txn={txn} onClose={() => {}} onSaved={() => {}} />)
    fill(/Actual amount paid/, '14500')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.updateGoldTransaction).toHaveBeenCalledWith(7, expect.objectContaining({
      date: '2026-06-15',
      gm_price: 7000,
      actual_paid: 14500,
      quote_price: null,
    })))
  })
})
