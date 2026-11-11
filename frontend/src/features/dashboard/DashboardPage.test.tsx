import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DashboardPage, { dividendIncome } from './DashboardPage'
import type { HoldingWithPrice } from '../../types'

// The holdings the mocked hook returns, and the props SummaryCards got.
const dashboard = vi.hoisted(() => ({
  enriched: [] as unknown[],
  summaryProps: null as null | { computedDayGainInr?: number | null; computedDayGainEur?: number | null },
}))

vi.mock('../holdings/useHoldings', () => ({
  useHoldings: () => ({
    holdings: [], enriched: dashboard.enriched, summary: null,
    loadingHoldings: false, loadingPrices: false, lastRefresh: null,
    refresh: vi.fn(), fetchPrices: vi.fn(), remove: vi.fn(),
  }),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'u1', username: 'alice', name: 'Alice', role: 'admin',
      region: 'india', gold_enabled: true, premium: false,
    },
    logout: vi.fn(),
  }),
}))

vi.mock('../../lib/api/client', () => ({
  api: {
    getRegions: vi.fn().mockResolvedValue([]),
    getGoldMetrics: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('../../components/SummaryCards', () => ({
  default: (props: typeof dashboard.summaryProps) => { dashboard.summaryProps = props; return <div /> },
}))
vi.mock('../holdings/HoldingsByCurrency', () => ({ default: () => <div /> }))
vi.mock('../../components/Charts', () => ({ default: () => <div /> }))

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
    expect(dashboard.summaryProps?.computedDayGainInr).toBe(40)
    expect(dashboard.summaryProps?.computedDayGainEur).toBeNull()
  })

  it('computes the day gain in act-as views from the closes the holdings carry', () => {
    dashboard.enriched = [held('INR', 120, 100)]
    render(<MemoryRouter><DashboardPage actAsUserId="u2" actAsLabel="bob" /></MemoryRouter>)
    expect(dashboard.summaryProps?.computedDayGainInr).toBe(40)
  })

  it('passes null, not the gain over average cost, when no holding has a previous close', () => {
    dashboard.enriched = [held('INR', 120)]
    render(<MemoryRouter><DashboardPage actAsUserId="u2" actAsLabel="bob" /></MemoryRouter>)
    expect(dashboard.summaryProps?.computedDayGainInr).toBeNull()
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
