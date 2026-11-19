import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { GoldMetrics } from '../../lib/api/client'
import type { HoldingWithPrice } from '../../types'
import DashboardPage from '../../features/dashboard/DashboardPage'

const state = vi.hoisted(() => ({ mode: 'ui2', rows: [] as HoldingWithPrice[], goldEnabled: false, fetchPrices: vi.fn() }))
vi.mock('../../features/auth/AuthContext', () => {
  const session = () => ({ user: { id: 'owner', role: 'user', ui_mode: state.mode, gold_enabled: state.goldEnabled }, logout: vi.fn() })
  return { useAuth: session, useAuthOptional: session }
})
vi.mock('../../features/holdings/useHoldings', () => ({ useHoldings: () => ({
  holdings: state.rows, enriched: state.rows, summary: { eur_rate: 0.01, previous_close_date: '2026-11-16' },
  refresh: vi.fn(), fetchPrices: state.fetchPrices,
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
const summary = () => within(screen.getByRole('region', { name: 'Portfolio summary' }))
// One card by its heading, so each assertion names the card it reads.
const card = (title: string) => within(summary().getByRole('heading', { name: title }).closest('article') as HTMLElement)
const withGold = (metrics: Partial<GoldMetrics>) => {
  state.goldEnabled = true
  vi.mocked(api.getGoldMetrics).mockResolvedValueOnce(metrics as GoldMetrics)
}

it('uses the dashboard values and shows a failed quote as an unavailable valuation', () => {
  state.rows[0] = { ...state.rows[0], price_error: 'No quote', current_value: 0, unrealized_pnl: -80 }
  mount()
  expect(card('Portfolio value').queryByText('₹100.00')).toBeNull()
  expect(card('Portfolio value').getByText('—', { selector: '.u2-summary-amount' })).toBeVisible()
  // The unknown valuation withholds the combined P/L but not its known parts.
  expect(card('Total profit & loss').getByText('Realised').nextElementSibling).toHaveTextContent('+₹5.00')
  expect(card('Total profit & loss').getByText(/^Unrealised/).nextElementSibling).toHaveTextContent('—')
  expect(card('Dividend income').getByText('₹2.00')).toBeVisible()
  fireEvent.click(summary().getByRole('button', { name: 'View breakdown · Portfolio value' }))
  expect(within(screen.getByRole('dialog')).getByRole('row', { name: /INR equities/ })).toHaveTextContent('₹80.00—')
})

it('keeps a sold-out position at zero value with its realised gains and dividends', () => {
  state.rows[0] = { ...state.rows[0], stocks_owned: 0, cost_price: 0, price_error: 'No quote', current_value: undefined }
  mount()
  expect(card('Total profit & loss').getByText('Realised').nextElementSibling).toHaveTextContent('+₹5.00')
  expect(card('Dividend income').getByText('₹2.00')).toBeVisible()
  fireEvent.click(summary().getByRole('button', { name: 'View breakdown · Portfolio value' }))
  expect(within(screen.getByRole('dialog')).getByRole('row', { name: /INR equities/ })).toHaveTextContent('₹0.00')
})

it('adds unrealised and realised into one profit & loss and leaves it unknown without both', () => {
  mount()
  expect(card('Total profit & loss').getByText('+₹25.00')).toBeVisible()
  expect(card('Total profit & loss').getByText('Unrealised (25.00%)')).toBeVisible()
})

it('includes gold for its owner and excludes it and its request in act-as', async () => {
  state.goldEnabled = true
  const owner = mount()
  expect(await card('Portfolio value').findByText('₹700.00')).toBeVisible()
  expect(summary().getByText('Equities + physical gold')).toBeVisible()
  owner.unmount()
  vi.mocked(api.getGoldMetrics).mockClear()
  mount('target')
  expect(api.getGoldMetrics).not.toHaveBeenCalled()
  expect(card('Portfolio value').getByText('₹100.00')).toBeVisible()
  expect(summary().getByText('Equities')).toBeVisible()
  fireEvent.click(summary().getByRole('button', { name: 'View breakdown · Portfolio value' }))
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Physical gold')
})

// Review finding on #356: an account that never entered gold has an empty
// position, not an unknown one, so its equities must still be totalled.
it('counts an empty gold position as zero so the equity totals stay available', async () => {
  withGold({ grams: 0, invested: 0 })
  mount()
  expect(await card('Portfolio value').findByText('₹100.00')).toBeVisible()
  expect(card('Total profit & loss').getByText('+₹25.00')).toBeVisible()
})

it('keeps the totals unavailable for gold that is held but has no price', async () => {
  withGold({ grams: 10, invested: 500 })
  mount()
  await waitFor(() => expect(api.getGoldMetrics).toHaveBeenCalled())
  expect(card('Portfolio value').getByText('—', { selector: '.u2-summary-amount' })).toBeVisible()
  expect(card('Total profit & loss').getByText('Realised').nextElementSibling).toHaveTextContent('+₹5.00')
})

it('keeps the totals unavailable when the gold read fails', async () => {
  state.goldEnabled = true
  vi.mocked(api.getGoldMetrics).mockRejectedValueOnce(new Error('503'))
  mount()
  await waitFor(() => expect(api.getGoldMetrics).toHaveBeenCalled())
  expect(card('Portfolio value').queryByText('₹100.00')).toBeNull()
  expect(card('Portfolio value').getByText('—', { selector: '.u2-summary-amount' })).toBeVisible()
})

it('puts Refresh and Add holding in the UI_2.0 intro, as the handoff does', () => {
  mount()
  const intro = within(screen.getByRole('heading', { level: 1, name: 'Your portfolio, at a glance' }).closest('section') as HTMLElement)
  fireEvent.click(intro.getByRole('button', { name: 'Refresh' }))
  expect(state.fetchPrices).toHaveBeenCalledTimes(1)
  expect(intro.getByRole('button', { name: /Add holding/ })).toBeVisible()
  // The classic header no longer repeats them.
  expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: /Add holding/i })).toHaveLength(1)
})

it.each(['classic', 'glass'])('keeps the existing summary entry point and header buttons in %s', mode => {
  state.mode = mode
  mount()
  expect(screen.queryByRole('region', { name: 'Portfolio summary' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'View breakdown · Portfolio value' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Add Holding' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible()
})
