import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from '../dashboard/DashboardPage'
import type { HoldingWithPrice } from '../../types'

const state = vi.hoisted(() => ({ rows: [] as HoldingWithPrice[] }))
vi.mock('./useHoldings', () => ({ useHoldings: () => ({ holdings: state.rows, enriched: state.rows, summary: null,
  xirr: null, loadingHoldings: false, loadingPrices: false, lastRefresh: null, refresh: vi.fn(), fetchPrices: vi.fn(), remove: vi.fn() }) }))
vi.mock('../auth/AuthContext', () => {
  const session = () => ({ user: { id: 'owner', username: 'owner', name: 'Owner', role: 'user', region: 'india', premium: false }, logout: vi.fn(), loading: false })
  return { useAuth: session, useAuthOptional: session }
})
vi.mock('../../lib/api/client', () => ({ api: { getRegions: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../components/SummaryCards', () => ({ default: () => null }))

beforeEach(() => {
  state.rows = [
    { id: 'TCS', script: 'TCS', symbol: 'TCS', currency: 'INR', type: 'stock', stocks_owned: 1, current_price: 60, current_value: 60,
      classification: { symbol: 'TCS', status: 'resolved', sector: 'Technology' } },
    { id: 'ITC', script: 'ITC', symbol: 'ITC', currency: 'INR', type: 'stock', stocks_owned: 1, current_price: 40, current_value: 40,
      classification: { symbol: 'ITC', status: 'resolved', sector: 'FMCG' } },
    { id: 'NIL', script: 'NIL', symbol: 'NIL', currency: 'INR', type: 'stock', stocks_owned: 0,
      classification: { symbol: 'NIL', status: 'resolved', sector: 'Banking' } },
  ]
})

const selectChartSector = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Charts' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sectors' }))
  fireEvent.click(screen.getByRole('button', { name: /Technology.*1 holding/ }))
}

describe('dashboard sector navigation', () => {
  it('opens grouped tables, focuses the selected heading, retains sibling groups and the All view', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^All/ }))
    selectChartSector()
    expect(screen.getByRole('button', { name: 'By sector' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: /Technology/ })).toHaveFocus()
    expect(screen.getByRole('heading', { name: /FMCG/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Banking/ })).toBeInTheDocument()
  })

  it('preserves Nil instead of switching it when the selected sector is absent', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^Nil/ }))
    selectChartSector()
    expect(screen.getByRole('button', { name: /^Nil/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('no matching holdings')
    expect(screen.getByRole('status')).toHaveFocus()
    expect(screen.getByText('NIL')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Technology/ })).not.toBeInTheDocument()
  })

  it('retains search filtering while navigating from the portfolio-wide chart', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText('Filter by script or symbol…'), { target: { value: 'ITC' } })
    selectChartSector()
    expect(screen.getByPlaceholderText('Filter by script or symbol…')).toHaveValue('ITC')
    expect(screen.getByRole('status')).toHaveTextContent('no matching holdings')
    expect(screen.getByRole('heading', { name: /FMCG/ })).toBeInTheDocument()
  })
})
