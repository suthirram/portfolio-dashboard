import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SummaryCards from './SummaryCards'
import type { Summary } from '../types'

const base: Summary = {
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

describe('SummaryCards daily change', () => {
  it('renders the increase vs previous close on the Current Value card', () => {
    const summary: Summary = {
      ...base,
      previous_close_value: 30000,
      change_value: 5000,
      change_pct: 16.67,
      previous_close_date: '2026-06-16',
    }
    render(<SummaryCards summary={summary} loading={false} />)
    // ▲ arrow, INR amount, percent, and the close date are all shown.
    expect(screen.getByText(/▲ ₹5,000.00 \(\+16\.67%\)/)).toBeInTheDocument()
    expect(screen.getByText(/vs 2026-06-16 close/)).toBeInTheDocument()
  })

  it('renders a decrease with the ▼ arrow', () => {
    const summary: Summary = {
      ...base,
      change_value: -1200,
      change_pct: -4,
      previous_close_date: '2026-06-16',
    }
    render(<SummaryCards summary={summary} loading={false} />)
    expect(screen.getByText(/▼ ₹1,200.00 \(-4\.00%\)/)).toBeInTheDocument()
  })

  it('does not render the per-currency strip (moved to the group cards)', () => {
    const summary: Summary = {
      ...base,
      change_value: 5000,
      change_pct: 16.67,
      per_currency: [
        { currency: 'INR', current: 35000, previous_close: 30000, change_value: 5000, change_pct: 16.67 },
        { currency: 'EUR', current: 600, previous_close: 620, change_value: -20, change_pct: -3.23 },
      ],
    }
    render(<SummaryCards summary={summary} loading={false} />)
    // The headline delta still shows once, on the Current Value card.
    expect(screen.getAllByText(/▲ ₹5,000.00/).length).toBe(1)
    // The EUR per-currency entry now lives in HoldingsByCurrency, not here.
    expect(screen.queryByText(/€20.00 \(-3\.23%\)/)).toBeNull()
  })

  it('omits the change indicator when there is no prior snapshot', () => {
    render(<SummaryCards summary={base} loading={false} />)
    expect(screen.queryByText(/vs .* close/)).toBeNull()
    expect(screen.queryByText(/▲|▼/)).toBeNull()
  })
})
