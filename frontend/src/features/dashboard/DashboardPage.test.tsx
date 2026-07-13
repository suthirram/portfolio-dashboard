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
  it('keeps page links on the left with the brand and actions on the right', () => {
    const { container } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    const sides = container.querySelectorAll('header .dash-nav-side')
    expect(sides.length).toBe(2)

    const left = within(sides[0] as HTMLElement)
    expect(left.getByRole('link', { name: /History/ })).toBeInTheDocument()
    expect(left.getByRole('link', { name: /Gold/ })).toBeInTheDocument()
    expect(left.getByRole('link', { name: /Admin Panel/ })).toBeInTheDocument()

    const right = within(sides[1] as HTMLElement)
    expect(right.getByRole('button', { name: /Refresh/ })).toBeInTheDocument()
    expect(right.getByRole('button', { name: /Add Holding/ })).toBeInTheDocument()
    // Navigation lives on the left only — no stray links among the actions.
    expect((sides[1] as HTMLElement).querySelector('a')).toBeNull()
  })
})
