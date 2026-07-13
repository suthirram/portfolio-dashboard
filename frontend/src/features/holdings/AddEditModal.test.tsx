import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AddEditModal from './AddEditModal'
import { api } from '../../lib/api/client'

vi.mock('../../lib/api/client', () => ({
  api: {
    createHolding: vi.fn().mockResolvedValue({}),
    updateHolding: vi.fn().mockResolvedValue({}),
    getMarketPrice: vi.fn(),
  },
}))

describe('AddEditModal numeric input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits comma decimal costs as numbers', async () => {
    const onSaved = vi.fn()
    render(<AddEditModal holding={null} onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByPlaceholderText('e.g. TCS, GOLD BEES'), { target: { value: 'VWCE' } })
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30,68' } })
    fireEvent.change(screen.getByPlaceholderText(/Profit\/loss/), { target: { value: '-1,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Holding' }))

    await waitFor(() => expect(api.createHolding).toHaveBeenCalledTimes(1))
    expect(api.createHolding).toHaveBeenCalledWith(expect.objectContaining({
      stocks_owned: 1.5,
      avg_cost_price: 30.68,
      realized_pnl: -1.5,
    }), undefined)
  })

  // PD-045 design-system contract: modals carry the shared chrome classes so
  // the stylesheet supplies backdrop blur and the enter animation.
  it('renders the modal-overlay / modal-card chrome classes', () => {
    const { container } = render(<AddEditModal holding={null} onClose={() => {}} onSaved={() => {}} />)
    const overlay = container.querySelector('.modal-overlay')
    expect(overlay).not.toBeNull()
    expect(overlay!.querySelector('.modal-card')).not.toBeNull()
  })

  // Theme contract: the footer uses the shared button classes (gradient
  // brand primary + neutral secondary) instead of flat --blue + white text,
  // which loses contrast on the cyberpunk palette's cyan --blue.
  it('renders footer actions with the shared btn classes', () => {
    render(<AddEditModal holding={null} onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByRole('button', { name: 'Add Holding' })).toHaveClass('btn-primary', 'btn-lg')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('btn', 'btn-lg')
  })

  it('rejects malformed cost text instead of coercing it', async () => {
    render(<AddEditModal holding={null} onClose={() => {}} onSaved={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('e.g. TCS, GOLD BEES'), { target: { value: 'VWCE' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1,,2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Holding' }))

    expect(await screen.findByText('Enter a valid average cost price')).toBeInTheDocument()
    expect(api.createHolding).not.toHaveBeenCalled()
  })
})
