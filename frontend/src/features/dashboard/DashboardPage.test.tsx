import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage, { dividendIncome } from './DashboardPage'
import type { HoldingWithPrice } from '../../types'
import type { GroupDayChange } from '../holdings/dashboardPriceMovement'

// The holdings the mocked hook returns, and the props SummaryCards got.
const dashboard = vi.hoisted(() => ({
  holdings: [] as unknown[],
  enriched: [] as unknown[],
  summary: null as unknown,
  uiRevamp: false,
  uiMode: 'classic' as string,
  xirr: null as unknown,
  summaryProps: null as null | { computedDayChangeInr?: GroupDayChange | null; computedDayChangeEur?: GroupDayChange | null },
}))

vi.mock('../holdings/useHoldings', () => ({
  useHoldings: () => ({
    holdings: dashboard.holdings, enriched: dashboard.enriched, summary: dashboard.summary, xirr: dashboard.xirr,
    loadingHoldings: false, loadingPrices: false, lastRefresh: null,
    refresh: vi.fn(), fetchPrices: vi.fn(), remove: vi.fn(),
  }),
}))

vi.mock('../auth/AuthContext', () => {
  const session = () => ({
    user: {
      id: 'u1', username: 'alice', name: 'Alice', role: 'admin',
      region: 'india', gold_enabled: true, premium: false, ui_revamp: dashboard.uiRevamp, ui_mode: dashboard.uiMode,
    },
    loading: false,
    logout: vi.fn(),
  })
  return { useAuth: session, useAuthOptional: session }
})

vi.mock('../holdings/AddEditModal', () => ({ default: () => <div role="dialog" aria-label="Add holding" /> }))

vi.mock('../../lib/api/client', () => ({
  api: {
    getRegions: vi.fn().mockResolvedValue([]),
    getGoldMetrics: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('../../components/SummaryCards', () => ({
  default: (props: typeof dashboard.summaryProps) => { dashboard.summaryProps = props; return <div /> },
}))
// UI_2.0 hands the table a renderRows; render it so a holding can be opened.
vi.mock('../holdings/HoldingsByCurrency', () => ({
  default: ({ renderRows, holdings }: { renderRows?: (rows: unknown[]) => React.ReactNode; holdings: unknown[] }) =>
    <div>{renderRows?.(holdings)}</div>,
}))
vi.mock('../../components/Charts', () => ({ default: () => <div /> }))
vi.mock('../../ui2/overview/OverallPerformance', () => ({ default: () => null }))
vi.mock('../../ui2/overview/Ui2Allocation', () => ({ Ui2Allocation: () => null }))

describe('DashboardPage nav grouping', () => {
  it('keeps page links before the spacer and actions after it', () => {
    const { container } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const header = container.querySelector('header')!
    const nav = within(header as HTMLElement)
    const spacer = header.querySelector('.dash-nav-spacer')!
    expect(spacer).toBeInTheDocument()

    // Page links sit left of the spacer; action buttons sit right of it.
    for (const name of [/History/, /Gold/, /Admin Panel/]) {
      const link = nav.getByRole('link', { name })
      expect(spacer.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    }
    for (const name of [/Refresh/, /Add Holding/]) {
      const btn = nav.getByRole('button', { name })
      expect(spacer.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // No stray links among the actions after the spacer.
    const links = Array.from(header.querySelectorAll('a'))
    expect(links.every(link => spacer.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_PRECEDING)).toBe(true)
  })

  it('renders the Holdings/Charts switch as one segmented control', () => {
    const { getByRole } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const holdings = getByRole('button', { name: 'Holdings' })
    const charts = getByRole('button', { name: 'Charts' })
    expect(holdings).toHaveClass('seg-btn')
    expect(charts).toHaveClass('seg-btn')
    expect(holdings.getAttribute('aria-pressed')).toBe('true')
    expect(charts.getAttribute('aria-pressed')).toBe('false')
    expect(holdings.closest('.seg-group')).not.toBeNull()
  })
})

describe('DashboardPage summary day gain', () => {
  const held = (currency: string, current: number, previousClose?: number) => ({
    id: `${currency}-${current}`, script: currency, symbol: currency, currency,
    stocks_owned: 2, avg_cost_price: 10, current_price: current,
    ...(previousClose === undefined ? {} : { previous_close_price: previousClose }),
  })

  it('passes each currency its own group sum; a missing close nulls only that currency', () => {
    dashboard.enriched = [held('INR', 120, 100), held('EUR', 60), held('EUR', 50, 40)]
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    // INR: 2 × (120 − 100) = 40 against a previous value of 200 → 20%.
    expect(dashboard.summaryProps?.computedDayChangeInr).toEqual({ gain: 40, previousValue: 200, pct: 20 })
    expect(dashboard.summaryProps?.computedDayChangeEur).toBeNull()
  })

  it('computes the day change in act-as views from the closes the holdings carry', () => {
    dashboard.enriched = [held('INR', 120, 100)]
    render(<MemoryRouter><DashboardPage actAsUserId="u2" actAsLabel="bob" /></MemoryRouter>)
    expect(dashboard.summaryProps?.computedDayChangeInr?.gain).toBe(40)
  })

  it('passes null, not the gain over average cost, when no holding has a previous close', () => {
    dashboard.enriched = [held('INR', 120)]
    render(<MemoryRouter><DashboardPage actAsUserId="u2" actAsLabel="bob" /></MemoryRouter>)
    expect(dashboard.summaryProps?.computedDayChangeInr).toBeNull()
  })

  it('passes nothing for a currency with no shares held, so it gets no line', () => {
    dashboard.enriched = [held('INR', 120, 100)]
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(dashboard.summaryProps?.computedDayChangeEur).toBeUndefined()
  })
})

describe('DashboardPage in the glass UI (PD-054)', () => {
  afterEach(() => {
    dashboard.uiRevamp = false
    dashboard.summary = null
  })

  it('shows the hero only for a glass account', () => {
    dashboard.summary = { total_current_value: 1000, total_current_value_eur: 11, total_cost: 800, total_unrealized: 200 }
    const { unmount } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.queryByLabelText('Portfolio overview')).toBeNull()
    unmount()

    dashboard.uiRevamp = true
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.getByLabelText('Portfolio overview')).toBeInTheDocument()
  })

  it('marks the header copies of the shell controls, but keeps act-as links', () => {
    const { container, unmount } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const header = container.querySelector('header')!
    expect(within(header).getByRole('link', { name: /History/ })).toHaveClass('shell-dup')
    unmount()

    const actAs = render(<MemoryRouter><DashboardPage actAsUserId="u2" actAsLabel="bob" /></MemoryRouter>)
    const actAsHeader = actAs.container.querySelector('header')!
    expect(within(actAsHeader).getByRole('link', { name: /Transactions/ })).not.toHaveClass('shell-dup')
  })

  it('opens Add holding when the shell sends openAdd', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/', state: { openAdd: true } }]}>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('dialog', { name: 'Add holding' })).toBeInTheDocument()
  })

  it('ignores openAdd in act-as views', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/users/u2', state: { openAdd: true } }]}>
        <DashboardPage actAsUserId="u2" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog', { name: 'Add holding' })).toBeNull()
  })
})

describe('DashboardPage classification review queue', () => {
  const needsReview = (id: string, script: string) => ({
    id, script, symbol: `${script}.NS`, type: 'stock', currency: 'INR',
    classification: { symbol: `${script}.NS`, status: 'needs_review' },
  })
  beforeEach(() => { dashboard.holdings = [needsReview('h1', 'ITC'), needsReview('h2', 'HUL')] })
  afterEach(() => { dashboard.holdings = [] })

  const reviewing = () => screen.queryByRole('dialog', { name: 'Review classification' })

  it('Review later skips to the next holding, then ends after the last', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(within(reviewing()!).getByText('ITC')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review later' }))
    expect(within(reviewing()!).getByText('HUL')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review later' }))
    expect(reviewing()).toBeNull()
  })

  it('Escape ends the whole review', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(reviewing()).toBeNull()
  })
})

describe('dividendIncome', () => {
  it('buckets like the backend: blank is INR, USD is in neither line', () => {
    const holdings = [
      { currency: 'INR', total_dividends: 300 },
      { currency: undefined, total_dividends: 50 },
      { currency: 'EUR', total_dividends: 40 },
      { currency: 'USD', total_dividends: 999 },
    ] as unknown as HoldingWithPrice[]
    expect(dividendIncome(holdings)).toEqual({ inr: 350, eur: 40 })
  })
})

// PD-058 Task 11: the account menu closes for keyboard and touch users too.
describe('DashboardPage account menu', () => {
  const openMenu = () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const trigger = screen.getByRole('button', { name: /Alice/ })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /Account settings/ })).toBeInTheDocument()
    return trigger
  }

  it('closes on Escape', () => {
    const trigger = openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: /Account settings/ })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on a press outside the menu', () => {
    openMenu()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('link', { name: /Account settings/ })).not.toBeInTheDocument()
  })
})

describe('DashboardPage in UI_2.0', () => {
  const tcs = {
    id: 'h1', script: 'TCS', symbol: 'TCS.NS', exchange: 'NSE', currency: 'INR',
    stocks_owned: 10, avg_cost_price: 3000, current_price: 3500, current_value: 35000, cost_price: 30000,
  }

  afterEach(() => {
    dashboard.uiMode = 'classic'
    dashboard.xirr = null
    dashboard.holdings = []
    dashboard.enriched = []
  })

  it('shows the holding’s XIRR and its caveat in the details dialog', () => {
    dashboard.uiMode = 'ui2'
    dashboard.holdings = [tcs]
    dashboard.enriched = [tcs]
    dashboard.xirr = {
      asOf: '2026-11-20',
      byHolding: { h1: { holding_id: 'h1', xirr: 0.1234, since: '2026-06-01', undated_opening: false } },
      byCurrency: {},
    }
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'TCS' }))
    const dialog = screen.getByRole('dialog', { name: 'TCS' })
    expect(within(dialog).getByText('12.34%*')).toBeInTheDocument()
    expect(within(dialog).getByText(/Measured over less than a year/)).toBeInTheDocument()
  })
})
