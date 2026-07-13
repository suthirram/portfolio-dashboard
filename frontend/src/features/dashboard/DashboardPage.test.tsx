import { render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'

vi.mock('../holdings/useHoldings', () => ({
  useHoldings: () => ({
    holdings: [], enriched: [], summary: null,
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

vi.mock('../../components/SummaryCards', () => ({ default: () => <div /> }))
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
    expect(links.every(a => spacer.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING)).toBe(true)
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
