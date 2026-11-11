import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import HoldingsByCurrency from './HoldingsByCurrency'
import type { HoldingWithPrice } from '../../types'
import { indexXirr } from './stockXirr'

const noop = () => {}
type TestHolding = HoldingWithPrice & { previous_close_price?: number }

const testHolding = (overrides: Partial<TestHolding>): TestHolding => ({
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
        testHolding({ id: '1', script: 'TCS.NS', currency: 'INR' }),
        testHolding({ id: '2', script: 'SAP.DE', currency: 'EUR' }),
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
        testHolding({ id: '1', currency: 'INR' }),
        testHolding({ id: '2', currency: 'EUR' }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const wrappers = document.querySelectorAll('.holdings-table-wrap')
    expect(wrappers).toHaveLength(2)
    // No "in €" conversion sub-columns anywhere.
    expect(screen.queryByText('in €')).not.toBeInTheDocument()
    // INR table cells are ₹-formatted (cost_price 1000), EUR table cells are
    // €-formatted (cost_price_eur 11 — the native twin, not cost_price).
    expect(within(wrappers[0] as HTMLElement).getAllByText(/₹1,000\.00/).length).toBeGreaterThan(0)
    expect(within(wrappers[0] as HTMLElement).queryByText(/€/)).not.toBeInTheDocument()
    expect(within(wrappers[1] as HTMLElement).getAllByText(/€11\.00/).length).toBeGreaterThan(0)
    expect(within(wrappers[1] as HTMLElement).queryByText(/₹/)).not.toBeInTheDocument()
  })

  it('a EUR holding shows its native _eur amounts, not the INR-converted twins', () => {
    // Regression: HoldingWithPrice.cost_price/current_value/unrealized_pnl
    // are always INR-denominated, even for a EUR holding — the native
    // amount lives in the _eur twin (HoldingWithPriceToAPI). cost_price_eur
    // etc. are deliberately DIFFERENT from cost_price etc. here, so reverting
    // the fix (reading the plain field regardless of currency) renders a
    // different, wrong number and this test catches it.
    render(<HoldingsByCurrency
      holdings={[
        testHolding({
          id: '1', currency: 'EUR',
          cost_price: 91000, cost_price_eur: 1000,
          current_value: 118300, current_value_eur: 1300,
          unrealized_pnl: 27300, unrealized_pnl_eur: 300,
        }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const wrapper = document.querySelector('.holdings-table-wrap') as HTMLElement
    // Cost price, current value, and unrealised gain cells.
    expect(within(wrapper).getAllByText(/€1,000\.00/).length).toBeGreaterThan(0)
    expect(within(wrapper).getAllByText(/€1,300\.00/).length).toBeGreaterThan(0)
    expect(within(wrapper).getAllByText(/€300\.00/).length).toBeGreaterThan(0)
    // The INR-converted twins must never leak into this EUR-native table.
    expect(within(wrapper).queryByText(/91,000/)).not.toBeInTheDocument()
    expect(within(wrapper).queryByText(/118,300/)).not.toBeInTheDocument()
    expect(within(wrapper).queryByText(/27,300/)).not.toBeInTheDocument()
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
      holdings={[testHolding({ id: '1', currency: 'INR', cost_price: 1000, cost_price_eur: 11 })]}
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
      holdings={[testHolding({ id: '2', currency: 'EUR', cost_price: 1000, cost_price_eur: 11 })]}
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
        testHolding({ id: '1', currency: 'INR', script: 'TCS.NS', stocks_owned: 10, current_price: 3500, previous_close_price: 3000 }),
        testHolding({ id: '2', currency: 'EUR', script: 'SAP.DE', stocks_owned: 10, current_price: 60, previous_close_price: 62 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
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

  it('omits the Today stat when the holdings carry no previous close', () => {
    render(<HoldingsByCurrency
      holdings={[testHolding({ id: '1', currency: 'INR' })]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)
    expect(screen.queryByText('Today')).toBeNull()
  })

  it('shows the Today stat from the holdings closes alone, with no History row', () => {
    // Day 1 or act-as: no snapshot, but Yahoo closes on every holding.
    // 10 × (120 − 100) = ₹200 against a previous value of ₹1,000 → +20.00%.
    render(<HoldingsByCurrency
      holdings={[testHolding({ id: '1', currency: 'INR', stocks_owned: 10, current_price: 120, previous_close_price: 100 })]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText(/▲ ₹200/)).toBeInTheDocument()
    expect(screen.getByText('(+20.00%)')).toBeInTheDocument()
  })

  it('Today stat excludes intraday buy cost — shows only price movement not invested amount', () => {
    // Existing holding: previous_close 100, current 120 → +₹200 (10 shares)
    // Holding bought today with a previous close of 125, current 130 → +₹50.
    // Backend change_value would be 1500 (counts the purchase); correct is 250.
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'OLD.NS', stocks_owned: 10, current_price: 120, previous_close_price: 100 }),
        testHolding({ id: '2', script: 'NEW.NS', stocks_owned: 10, current_price: 130, avg_cost_price: 130, previous_close_price: 125 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    expect(screen.getByText(/▲ ₹250/)).toBeInTheDocument()
  })

  it('omits Today stat for a new holding with no previous close instead of counting its lifetime gain', () => {
    // NEW.NS has no snapshot and no Yahoo close: current − avg cost (₹200) is
    // its lifetime gain, so the group has no day gain at all.
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'OLD.NS', stocks_owned: 10, current_price: 120, previous_close_price: 100 }),
        testHolding({ id: '2', script: 'NEW.NS', stocks_owned: 10, current_price: 130, avg_cost_price: 110 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    expect(screen.queryByText('Today')).toBeNull()
  })

  it('a missing previous close hides only its own currency group Today stat', () => {
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', currency: 'INR', script: 'TCS.NS', stocks_owned: 10, current_price: 120, previous_close_price: 100 }),
        testHolding({ id: '2', currency: 'EUR', script: 'SAP.DE', stocks_owned: 10, current_price: 60, avg_cost_price: 50 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const [inr, eur] = Array.from(document.querySelectorAll('section')) as HTMLElement[]
    expect(within(inr).getByText(/▲ ₹200/)).toBeInTheDocument()
    expect(within(eur).queryByText('Today')).toBeNull()
  })

  it('omits Today stat when any holding with shares has no usable baseline', () => {
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'A.NS', stocks_owned: 10, current_price: 120, previous_close_price: 100 }),
        testHolding({ id: '2', script: 'B.NS', stocks_owned: 10, current_price: 110, avg_cost_price: undefined as unknown as number }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    expect(screen.queryByText('Today')).toBeNull()
  })

  it('colors live share prices against the previous close and leaves unchanged prices default', () => {
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'UP.NS', current_price: 121, previous_close_price: 120 }),
        testHolding({ id: '2', script: 'DOWN.NS', current_price: 119, previous_close_price: 120 }),
        testHolding({ id: '3', script: 'FLAT.NS', current_price: 120, previous_close_price: 120 }),
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

  it('Day Gain row shows — when previous_close_price is absent, never the gain over avg cost', () => {
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'NEW.NS', current_price: 110, avg_cost_price: 100, stocks_owned: 5 }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
    />)

    const row = screen.getByText('NEW.NS').closest('tr')!
    const dayGainCell = row.querySelectorAll('td')[6] as HTMLTableCellElement
    expect(dayGainCell.textContent).toBe('—')
    expect(dayGainCell).not.toHaveClass('pos')
    // The share price is not tinted against the purchase cost either.
    expect(row.querySelectorAll('td')[4]).not.toHaveClass('pos')
    const tfoot = document.querySelector('tfoot') as HTMLElement
    expect((tfoot.querySelectorAll('td')[6] as HTMLTableCellElement).textContent).toBe('—')
  })

  it('Day Gain total sums the rows when every row has a previous close', () => {
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'A.NS', current_price: 110, avg_cost_price: 50, previous_close_price: 100, stocks_owned: 5 }),
        testHolding({ id: '2', script: 'B.NS', current_price: 90, avg_cost_price: 50, previous_close_price: 100, stocks_owned: 5 }),
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
        testHolding({ id: '1', script: 'A.NS', current_price: 110, previous_close_price: 100, stocks_owned: 5 }),
        // no previous_close_price and no avg_cost_price → movement stays null
        testHolding({ id: '2', script: 'NOPRICE.NS', current_price: 110, avg_cost_price: undefined as unknown as number, stocks_owned: 5 }),
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
        testHolding({ id: '1', currency: 'INR', stocks_owned: 10, script: 'ACTIVE.NS' }),
        testHolding({ id: '2', currency: 'INR', stocks_owned: 0, script: 'EXITED.NS' }),
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
        testHolding({ id: '1', currency: 'INR', stocks_owned: 10, script: 'ACTIVE.NS' }),
        testHolding({ id: '2', currency: 'INR', stocks_owned: 0, script: 'EXITED.NS' }),
      ]}
      loading={false}
      onEdit={user}
      onDelete={noop}
    />)
    expect(screen.queryByText('ACTIVE.NS')).toBeNull()
    expect(screen.getByText('EXITED.NS')).toBeInTheDocument()
  })

  it('shows each currency XIRR in its card and TOTAL row, and each holding XIRR in its row', () => {
    const xirr = indexXirr({
      as_of: '2026-11-11',
      currencies: [
        { currency: 'INR', xirr: 0.1234, since: '2023-04-01', undated_openings: 0 },
        { currency: 'EUR', xirr: -0.0432, since: '2026-10-01', undated_openings: 0 },
      ],
      holdings: [
        { holding_id: '1', xirr: 0.2, since: '2023-04-01', undated_opening: false },
        { holding_id: '2', xirr: -0.0432, since: '2026-10-01', undated_opening: false },
      ],
    })
    render(<HoldingsByCurrency
      holdings={[
        testHolding({ id: '1', script: 'TCS', currency: 'INR' }),
        testHolding({ id: '2', script: 'SAP', currency: 'EUR' }),
      ]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
      xirr={xirr}
    />)

    const [inr, eur] = Array.from(document.querySelectorAll('section')) as HTMLElement[]
    expect(within(inr).getByText('XIRR', { selector: 'div' })).toBeInTheDocument()
    expect(within(inr).getByText('(since 01-04-2023)')).toBeInTheDocument()
    // The card and the TOTAL row both carry the INR bucket's rate.
    expect(within(inr).getAllByText('12.34%')).toHaveLength(2)
    const inrRow = within(inr).getByText('TCS').closest('tr') as HTMLElement
    expect(within(inrRow).getByText('20%').closest('td')).toHaveClass('pos')
    // Under a year: starred, with the caveat on hover.
    const eurRow = within(eur).getByText('SAP').closest('tr') as HTMLElement
    expect(within(eurRow).getByText('-4.32%*')).toHaveAttribute('title', expect.stringMatching(/less than a year/))
  })

  it('renders dashes for XIRR while the rates are unavailable', () => {
    render(<HoldingsByCurrency
      holdings={[testHolding({ id: '1', script: 'TCS', currency: 'INR' })]}
      loading={false}
      onEdit={noop}
      onDelete={noop}
      xirr={null}
    />)
    const section = document.querySelector('section') as HTMLElement
    expect(within(section).queryByText('XIRR', { selector: 'div' })).not.toBeInTheDocument()
    const row = within(section).getByText('TCS').closest('tr') as HTMLElement
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0)
  })
})
