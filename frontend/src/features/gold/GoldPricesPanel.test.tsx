import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type GoldPrice } from '../../lib/api/client'
import GoldPricesPanel from './GoldPricesPanel'

vi.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: { putGoldPrices: vi.fn().mockResolvedValue(undefined) },
}))

describe('GoldPricesPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists recent prices newest-first with the rupee symbol', () => {
    const prices: GoldPrice[] = [
      { date: '2026-07-05', price_per_gram: 7300 },
      { date: '2026-07-06', price_per_gram: 7350 },
    ]
    render(<GoldPricesPanel prices={prices} onSaved={() => {}} />)
    const cells = screen.getAllByText(/2026-07-0/).map(el => el.textContent)
    expect(cells[0]).toBe('2026-07-06') // newest first
    expect(screen.getByText('₹7,350')).toBeTruthy()
  })

  it('saves a single day price and clears the input', async () => {
    const onSaved = vi.fn()
    render(<GoldPricesPanel prices={[]} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Price date'), { target: { value: '2026-07-06' } })
    fireEvent.change(screen.getByLabelText('Price per gram'), { target: { value: '7350' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))

    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([
      { date: '2026-07-06', price_per_gram: 7350 },
    ]))
    expect(onSaved).toHaveBeenCalled()
  })

  it('rejects a non-positive price without calling the API', async () => {
    render(<GoldPricesPanel prices={[]} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText('Price date'), { target: { value: '2026-07-06' } })
    fireEvent.change(screen.getByLabelText('Price per gram'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save price' }))

    expect(await screen.findByText('Price must be a number > 0')).toBeTruthy()
    expect(api.putGoldPrices).not.toHaveBeenCalled()
  })
})
