import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import DashboardPage from '../../features/dashboard/DashboardPage'

const state = vi.hoisted(() => ({ mode: 'ui2', rows: [] as HoldingWithPrice[], goldEnabled: false }))
vi.mock('../../features/auth/AuthContext', () => {
  const session = () => ({ user: { id: 'owner', role: 'user', ui_mode: state.mode, gold_enabled: state.goldEnabled }, logout: vi.fn() })
  return { useAuth: session, useAuthOptional: session }
})
vi.mock('../../features/holdings/useHoldings', () => ({ useHoldings: () => ({
  holdings: state.rows, enriched: state.rows, summary: { eur_rate: 0.01, previous_close_date: '2026-11-16' },
  refresh: vi.fn(), fetchPrices: vi.fn(),
}) }))
vi.mock('../../features/holdings/HoldingsByCurrency', () => ({ default: () => null }))
vi.mock('../../lib/api/client', () => ({ api: { getGoldMetrics: vi.fn().mockResolvedValue({ invested: 500, current: 600 }) } }))
import { api } from '../../lib/api/client'

beforeEach(() => {
  state.mode = 'ui2'
  state.goldEnabled = false
  state.rows = [{
    id: 'inr', script: 'Example', currency: 'INR', stocks_owned: 1, avg_cost_price: 80,
    cost_price: 80, current_value: 100, unrealized_pnl: 20, current_price: 100, previous_close_price: 100,
    realized_pnl: 5, total_dividends: 2,
  }]
  vi.clearAllMocks()
})

const mount = (owner?: string) => render(<MemoryRouter><DashboardPage actAsUserId={owner} /></MemoryRouter>)

it('uses the dashboard values and shows a failed quote as an unavailable valuation', () => {
  state.rows[0] = { ...state.rows[0], price_error: 'No quote', current_value: 0, unrealized_pnl: -80 }
  mount()
  const summary = within(screen.getByRole('region', { name: 'Portfolio summary' }))
  expect(summary.queryByText('₹100.00')).toBeNull()
  expect(summary.getByText('₹5.00')).toBeVisible()
  expect(summary.getByText('₹2.00')).toBeVisible()
  fireEvent.click(summary.getByRole('button', { name: 'View breakdown · Total portfolio value' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Current —')
})

it('keeps a sold-out position at zero value with its realised gains and dividends', () => {
  state.rows[0] = { ...state.rows[0], stocks_owned: 0, cost_price: 0, price_error: 'No quote', current_value: undefined }
  mount()
  const summary = within(screen.getByRole('region', { name: 'Portfolio summary' }))
  expect(summary.getByText('₹5.00')).toBeVisible()
  expect(summary.getByText('₹2.00')).toBeVisible()
  fireEvent.click(summary.getByRole('button', { name: 'View breakdown · Total portfolio value' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Current ₹0.00')
})

it('includes gold for its owner and excludes it and its request in act-as', async () => {
  state.goldEnabled = true
  const owner = mount()
  expect(await screen.findByText('₹700.00')).toBeVisible()
  owner.unmount()
  vi.mocked(api.getGoldMetrics).mockClear()
  mount('target')
  expect(api.getGoldMetrics).not.toHaveBeenCalled()
  expect(screen.getByText('₹100.00')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'View breakdown · Total portfolio value' }))
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Physical gold')
})

it.each(['classic', 'glass'])('keeps the existing summary entry point in %s', mode => {
  state.mode = mode
  mount()
  expect(screen.queryByRole('region', { name: 'Portfolio summary' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'View breakdown · Total portfolio value' })).toBeNull()
})
