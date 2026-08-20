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

describe('SummaryCards grouped change card', () => {
  it('groups one native line per held currency (India/EUR/USD) in a single card', () => {
    const summary: Summary = {
      ...base,
      previous_close_date: '2026-06-16',
      per_currency: [
        { currency: 'INR', current: 35000, previous_close: 30000, change_value: 5000, change_pct: 16.67 },
        { currency: 'EUR', current: 600, previous_close: 620, change_value: -20, change_pct: -3.23 },
        { currency: 'USD', current: 1100, previous_close: 1000, change_value: 100, change_pct: 10 },
      ],
    }
    render(<SummaryCards summary={summary} loading={false} />)
    // One card, three stacked lines with currency tags.
    expect(screen.getByText('Change vs Prev Close')).toBeInTheDocument()
    expect(screen.getByText('INR')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
    // Value and percent are separate aligned cells.
    expect(screen.getByText('▲ ₹5,000.00')).toBeInTheDocument()
    expect(screen.getByText('+16.67%')).toBeInTheDocument()
    expect(screen.getByText('▼ €20.00')).toBeInTheDocument()
    expect(screen.getByText('-3.23%')).toBeInTheDocument()
    expect(screen.getByText('▲ $100.00')).toBeInTheDocument()
    expect(screen.getByText('+10.00%')).toBeInTheDocument()
    // Close date shown once for the group.
    expect(screen.getAllByText(/vs 2026-06-16 close/).length).toBe(1)
    // Old P&L cards gone.
    expect(screen.queryByText('Unrealised P&L')).toBeNull()
    expect(screen.queryByText('Realised P&L')).toBeNull()
  })

  it('shows only the single held currency line (others hidden)', () => {
    const summary: Summary = {
      ...base,
      previous_close_date: '2026-06-16',
      per_currency: [
        { currency: 'INR', current: 28800, previous_close: 30000, change_value: -1200, change_pct: -4 },
      ],
    }
    render(<SummaryCards summary={summary} loading={false} />)
    expect(screen.getByText('INR')).toBeInTheDocument()
    expect(screen.getByText('▼ ₹1,200.00')).toBeInTheDocument()
    expect(screen.getByText('-4.00%')).toBeInTheDocument()
    expect(screen.queryByText('EUR')).toBeNull()
    expect(screen.queryByText('USD')).toBeNull()
  })

  it('groups unrealised + realised into a single Profit & Loss card', () => {
    const summary: Summary = {
      ...base,
      total_unrealized: 5000,
      total_unrealized_eur: 55,
      total_realized: -800,
      total_realized_eur: -8.8,
    }
    render(<SummaryCards summary={summary} loading={false} />)
    expect(screen.getByText('Profit & Loss')).toBeInTheDocument()
    expect(screen.getByText('Unrealised')).toBeInTheDocument()
    expect(screen.getByText('Realised')).toBeInTheDocument()
    expect(screen.getByText('₹5,000.00')).toBeInTheDocument()
    expect(screen.getByText('-₹800.00')).toBeInTheDocument()
  })

  it('shows a dash when there is no prior snapshot', () => {
    render(<SummaryCards summary={base} loading={false} />)
    expect(screen.getByText('Change vs Prev Close')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/vs .* close/)).toBeNull()
    expect(screen.queryByText(/▲|▼/)).toBeNull()
  })

  it('overrides INR/EUR rows with frontend-computed day gain when provided', () => {
    const summary: Summary = {
      ...base,
      previous_close_date: '2026-06-16',
      per_currency: [
        { currency: 'INR', current: 35000, previous_close: 30000, change_value: 5000, change_pct: 16.67 },
      ],
    }
    // Frontend computed a smaller gain (e.g. excludes intraday buys).
    render(<SummaryCards summary={summary} loading={false} computedDayGainInr={1000} />)
    expect(screen.getByText('▲ ₹1,000.00')).toBeInTheDocument()
    // pct recomputed: 1000 / 30000 * 100 = 3.33%
    expect(screen.getByText('+3.33%')).toBeInTheDocument()
    // backend value must not appear
    expect(screen.queryByText('▲ ₹5,000.00')).toBeNull()
  })

  it('falls back to backend change_value when computed gain is null (act-as / history failed)', () => {
    const summary: Summary = {
      ...base,
      previous_close_date: '2026-06-16',
      per_currency: [
        { currency: 'INR', current: 35000, previous_close: 30000, change_value: 5000, change_pct: 16.67 },
      ],
    }
    // null = history enrichment did not run (act-as or fetch error)
    render(<SummaryCards summary={summary} loading={false} computedDayGainInr={null} />)
    expect(screen.getByText('▲ ₹5,000.00')).toBeInTheDocument()
    expect(screen.getByText('+16.67%')).toBeInTheDocument()
  })
})
