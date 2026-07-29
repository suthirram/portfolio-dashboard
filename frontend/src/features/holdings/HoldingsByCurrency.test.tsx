import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import HoldingsByCurrency from './HoldingsByCurrency'
import type { HoldingWithPrice } from '../../types'

const noop = () => {}
type TestHolding = HoldingWithPrice & { previous_close_price?: number }

const h = (overrides: Partial<TestHolding>): TestHolding => ({
  id: overrides.id ?? Math.random().toString(),
  script: 'TEST',
  symbol: 'TEST',
  exchange: 'NSE',
  type: 'stock',
  stocks_owned: 10,
  avg_cost_price: 100,
  realized_pnl: 0,
  currency: 'INR',
  cost_price: 1000,
  cost_price_eur: 11,
  current_price: 120,
  current_value: 1200,
  current_value_eur: 13.2,
  unrealized_pnl: 200,
  unrealized_pnl_eur: 2.2,
  realized_pnl_eur: 0,
  ...overrides,
} as TestHolding)

describe('HoldingsByCurrency', () => {
  it('renders one section per distinct currency, INR before EUR', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'TCS.NS', currency: 'INR' }),
        h({ id: '2', script: 'SAP.DE', currency: 'EUR' }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const sections = document.querySelectorAll('section')
    expect(sections).toHaveLength(2)
    expect(within(sections[0] as HTMLElement).getByText(/Indian Rupee/)).toBeInTheDocument()
    expect(within(sections[1] as HTMLElement).getByText(/Euro/)).toBeInTheDocument()
  })

  it('renders each table in its native currency only — no conversion columns', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', currency: 'INR' }),
        h({ id: '2', currency: 'EUR', cost_price: 1000, current_value: 1200, unrealized_pnl: 200 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const wrappers = document.querySelectorAll('.holdings-table-wrap')
    expect(wrappers).toHaveLength(2)
    // No "in €" conversion sub-columns anywhere.
    expect(screen.queryByText('in €')).not.toBeInTheDocument()
    // INR table cells are ₹-formatted, EUR table cells are €-formatted.
    expect(within(wrappers[0] as HTMLElement).getAllByText(/₹1,000\.00/).length).toBeGreaterThan(0)
    expect(within(wrappers[0] as HTMLElement).queryByText(/€/)).not.toBeInTheDocument()
    expect(within(wrappers[1] as HTMLElement).getAllByText(/€1,000\.00/).length).toBeGreaterThan(0)
    expect(within(wrappers[1] as HTMLElement).queryByText(/₹/)).not.toBeInTheDocument()
  })

  it('renders the empty state when nothing matches the active view', () => {
    render(<HoldingsByCurrency
      holdings={[]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)
    expect(screen.getByText(/No holdings yet/)).toBeInTheDocument()
    expect(document.querySelector('section')).toBeNull()
  })

  it('shows a per-section totals card with both currencies for each section', () => {
    render(<HoldingsByCurrency
      holdings={[h({ id: '1', currency: 'INR', cost_price: 1000, cost_price_eur: 11 })]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const section = document.querySelector('section') as HTMLElement
    expect(section).not.toBeNull()
    expect(within(section).getByText(/Cost \(INR\)/)).toBeInTheDocument()
    // Native (₹1,000) primary, foreign (€11) secondary
    expect(within(section).getByText('₹1,000')).toBeInTheDocument()
    expect(within(section).getByText('(€11)')).toBeInTheDocument()
  })

  it('uses EUR primary in the EUR section card', () => {
    render(<HoldingsByCurrency
      holdings={[h({ id: '2', currency: 'EUR', cost_price: 1000, cost_price_eur: 11 })]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const section = document.querySelector('section') as HTMLElement
    expect(within(section).getByText(/Cost \(EUR\)/)).toBeInTheDocument()
    expect(within(section).getByText('€11')).toBeInTheDocument()
    expect(within(section).getByText('(₹1,000)')).toBeInTheDocument()
  })

  it('renders the per-currency daily change as a Today stat in the matching group card', () => {
    // Holdings are set up so per-holding movement sums produce the expected values:
    // INR: 10 shares × (3500 − 3000) = ₹5,000; pct = 5000 / 30000 = 16.67%
    // EUR: 10 shares × (60 − 62)     = −€20;   pct = -20 / 620   = -3.23%
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', currency: 'INR', script: 'TCS.NS', stocks_owned: 10, current_price: 3500, previous_close_price: 3000 }),
        h({ id: '2', currency: 'EUR', script: 'SAP.DE', stocks_owned: 10, current_price: 60, previous_close_price: 62 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
      perCurrency={[
        { currency: 'INR', current: 35000, previous_close: 30000, change_value: 5000, change_pct: 16.67 },
        { currency: 'EUR', current: 600, previous_close: 620, change_value: -20, change_pct: -3.23 },
      ]}
    />)

    const sections = document.querySelectorAll('section')
    const inr = sections[0] as HTMLElement
    const eur = sections[1] as HTMLElement
    // INR section: green up arrow + native ₹ amount + percent.
    expect(within(inr).getByText('Today')).toBeInTheDocument()
    expect(within(inr).getByText(/▲ ₹5,000/)).toBeInTheDocument()
    expect(within(inr).getByText('(+16.67%)')).toBeInTheDocument()
    // EUR section: red down arrow in native €.
    expect(within(eur).getByText(/▼ €20/)).toBeInTheDocument()
    expect(within(eur).getByText('(-3.23%)')).toBeInTheDocument()
  })

  it('omits the Today stat when no per-currency change is provided', () => {
    render(<HoldingsByCurrency
      holdings={[h({ id: '1', currency: 'INR' })]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)
    expect(screen.queryByText('Today')).toBeNull()
  })

  it('Today stat excludes intraday buy cost — shows only price movement not invested amount', () => {
    // Existing holding: previous_close 100, current 120 → +₹200 (10 shares)
    // New holding bought today at 130, current 130 → 0 movement (avg cost = current)
    // Backend change_value would be 200 + 1300 = 1500 (wrong); correct is 200.
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'OLD.NS', stocks_owned: 10, current_price: 120, previous_close_price: 100 }),
        h({ id: '2', script: 'NEW.NS', stocks_owned: 10, current_price: 130, avg_cost_price: 130 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
      perCurrency={[
        { currency: 'INR', current: 2500, previous_close: 1000, change_value: 1500, change_pct: 150 },
      ]}
    />)

    // Should show ₹200 (only OLD.NS movement), not ₹1,500 (backend's inflated value).
    expect(screen.getByText(/▲ ₹200/)).toBeInTheDocument()
  })

  it('omits Today stat when any holding with shares has no usable baseline', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'A.NS', stocks_owned: 10, current_price: 120, previous_close_price: 100 }),
        h({ id: '2', script: 'B.NS', stocks_owned: 10, current_price: 110, avg_cost_price: undefined as unknown as number }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
      perCurrency={[
        { currency: 'INR', current: 2300, previous_close: 1000, change_value: 1300, change_pct: 130 },
      ]}
    />)

    expect(screen.queryByText('Today')).toBeNull()
  })

  it('colors live share prices against the previous close and leaves unchanged prices default', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'UP.NS', current_price: 121, previous_close_price: 120 }),
        h({ id: '2', script: 'DOWN.NS', current_price: 119, previous_close_price: 120 }),
        h({ id: '3', script: 'FLAT.NS', current_price: 120, previous_close_price: 120 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const sharePriceCell = (script: string) =>
      screen.getByText(script).closest('tr')!.querySelectorAll('td')[4] as HTMLTableCellElement

    expect(sharePriceCell('UP.NS')).toHaveClass('pos')
    expect(sharePriceCell('DOWN.NS')).toHaveClass('neg')
    expect(sharePriceCell('FLAT.NS')).not.toHaveClass('pos')
    expect(sharePriceCell('FLAT.NS')).not.toHaveClass('neg')
    expect(sharePriceCell('FLAT.NS')).toHaveStyle({ color: 'var(--text-primary)' })
    expect(screen.getByText('(+₹1.00 / +0.83%)')).toBeInTheDocument()
    expect(screen.getByText('(-₹1.00 / -0.83%)')).toBeInTheDocument()
    expect(screen.getByText('(₹0.00 / 0.00%)')).toBeInTheDocument()

    // Day Gain column (td index 6): total monetary move for the position (price change × shares).
    const dayGainCell = (script: string) =>
      screen.getByText(script).closest('tr')!.querySelectorAll('td')[6] as HTMLTableCellElement
    expect(dayGainCell('UP.NS')).toHaveClass('pos')
    expect(dayGainCell('DOWN.NS')).toHaveClass('neg')
    expect(within(dayGainCell('UP.NS')).getByText('+₹10.00')).toBeInTheDocument()
    expect(within(dayGainCell('DOWN.NS')).getByText('-₹10.00')).toBeInTheDocument()
    expect(within(dayGainCell('UP.NS')).getByText('+0.83%')).toBeInTheDocument()
    expect(within(dayGainCell('DOWN.NS')).getByText('-0.83%')).toBeInTheDocument()
  })

  it('Day Gain row falls back to avg_cost_price when previous_close_price is absent', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'NEW.NS', current_price: 110, avg_cost_price: 100, stocks_owned: 5 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const dayGainCell = screen.getByText('NEW.NS').closest('tr')!.querySelectorAll('td')[6] as HTMLTableCellElement
    expect(dayGainCell).toHaveClass('pos')
    expect(within(dayGainCell).getByText('+₹50.00')).toBeInTheDocument()
  })

  it('Day Gain total shows sum when all rows have a baseline (via fallback)', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'A.NS', current_price: 110, avg_cost_price: 100, stocks_owned: 5 }),
        h({ id: '2', script: 'B.NS', current_price: 90, avg_cost_price: 100, stocks_owned: 5 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const tfoot = document.querySelector('tfoot') as HTMLElement
    const totalDayGain = tfoot.querySelectorAll('td')[6] as HTMLTableCellElement
    // +50 from A, -50 from B → net 0
    expect(totalDayGain.textContent).toContain('₹0.00')
  })

  it('Day Gain total shows — when any row with shares has no usable baseline', () => {
    render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', script: 'A.NS', current_price: 110, previous_close_price: 100, stocks_owned: 5 }),
        // no previous_close_price and no avg_cost_price → movement stays null
        h({ id: '2', script: 'NOPRICE.NS', current_price: 110, avg_cost_price: undefined as unknown as number, stocks_owned: 5 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const tfoot = document.querySelector('tfoot') as HTMLElement
    const totalDayGain = tfoot.querySelectorAll('td')[6] as HTMLTableCellElement
    expect(totalDayGain.textContent).toBe('—')
  })

  it('view tabs filter the rendered holdings by active/nil', () => {
    const user = vi.fn()
    const { rerender } = render(<HoldingsByCurrency
      holdings={[
        h({ id: '1', currency: 'INR', stocks_owned: 10, script: 'ACTIVE.NS' }),
        h({ id: '2', currency: 'INR', stocks_owned: 0, script: 'EXITED.NS' }),
      ]}
      loading={false}
      onEdit={user}
      onDelete={noop}
    />)
    expect(screen.getByText('ACTIVE.NS')).toBeInTheDocument()
    expect(screen.queryByText('EXITED.NS')).toBeNull()

    // Switch to Nil
    screen.getByRole('button', { name: /Nil/ }).click()
    rerender(<HoldingsByCurrency
      holdings={[
        h({ id: '1', currency: 'INR', stocks_owned: 10, script: 'ACTIVE.NS' }),
        h({ id: '2', currency: 'INR', stocks_owned: 0, script: 'EXITED.NS' }),
      ]}
      loading={false}
      onEdit={user}
      onDelete={noop}
    />)
    expect(screen.queryByText('ACTIVE.NS')).toBeNull()
    expect(screen.getByText('EXITED.NS')).toBeInTheDocument()
  })
})
