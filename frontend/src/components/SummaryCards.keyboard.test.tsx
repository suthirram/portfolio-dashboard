// Flippable summary cards are keyboard buttons (PD-058 Task 6): focusable,
// announced as buttons, flipped by Enter or Space like a click.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SummaryCards, { clickableCard } from './SummaryCards'
import type { Summary } from '../types'

const summary: Summary = {
  total_cost: 30000,
  total_current_value: 35000,
  total_unrealized: 5000,
  total_realized: 0,
  total_cost_eur: 330,
  total_current_value_eur: 385,
  total_unrealized_eur: 55,
  total_realized_eur: 0,
  eur_rate: 0.011,
}

describe('SummaryCards keyboard access', () => {
  it('exposes each flippable card as a focusable button', () => {
    render(<SummaryCards summary={summary} loading={false} />)
    const invested = screen.getByRole('button', { name: /Total Invested/ })
    expect(invested).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: /Current Value/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Profit & Loss/ })).toBeInTheDocument()
  })

  it.each(['Enter', ' '])('starts the flip on %j', key => {
    render(<SummaryCards summary={summary} loading={false} />)
    const invested = screen.getByRole('button', { name: /Total Invested/ })
    fireEvent.keyDown(invested, { key })
    expect(invested).toHaveClass('card-flipping-out')
  })

  it('leaves a card without a handler static', () => {
    expect(clickableCard(undefined)).toEqual({})
  })
})
