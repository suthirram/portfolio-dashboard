import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import DashboardPage from '../../features/dashboard/DashboardPage'

const state = vi.hoisted(() => ({
  mode: 'ui2',
  remove: vi.fn(),
  rows: [
    { id: 'india', script: 'Twin', symbol: 'TWIN.NS', currency: 'INR', stocks_owned: 1, avg_cost_price: 10,
      current_price: 10000, current_value: 10000, previous_close_price: 9900 },
    { id: 'europe', script: 'Twin', symbol: 'TWIN.DE', currency: 'EUR', stocks_owned: 1, avg_cost_price: 10,
      current_price: 100, current_value_eur: 100, current_value: 10000, previous_close_price: 102 },
  ],
}))
vi.mock('../../features/auth/AuthContext', () => {
  const session = () => ({ user: { id: 'owner', role: 'user', ui_mode: state.mode } })
  return { useAuth: session, useAuthOptional: session }
})
vi.mock('../../features/holdings/useHoldings', () => ({
  useHoldings: () => ({
    holdings: state.rows, enriched: state.rows, summary: { eur_rate: 0.01 }, remove: state.remove,
  }),
}))
vi.mock('../../features/holdings/AddEditModal', () => ({
  default: ({ holding }: { holding: { id: string } }) => <p>Edit {holding.id}</p>,
}))
vi.mock('../../features/holdings/TransactionsModal', () => ({
  default: ({ holding }: { holding: { id: string } }) => <p>Ledger {holding.id}</p>,
}))

const mount = (owner?: string) => render(<MemoryRouter><DashboardPage actAsUserId={owner} /></MemoryRouter>)
beforeEach(() => { state.mode = 'ui2'; state.remove.mockReset() })

it.each(['Edit', 'Ledger', 'Delete'])('routes %s from the selected EUR row', async action => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    mount()
    // Click the second Twin button (EUR row)
    fireEvent.click(screen.getAllByRole('button', { name: 'Twin' })[1])
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('TWIN.DE')
    fireEvent.click(within(dialog).getByRole('button', { name: action }))
    if (action === 'Delete') expect(state.remove).toHaveBeenCalledWith('europe')
    else expect(await screen.findByText(action + ' europe')).toBeVisible()
  } finally { confirmSpy.mockRestore() }
})

it('omits ledger in act-as and returns focus to the selected holding', () => {
  mount('target')
  const opener = screen.getAllByRole('button', { name: 'Twin' })[0]
  opener.focus()
  fireEvent.click(opener)
  expect(within(screen.getByRole('dialog')).queryByText('Ledger')).toBeNull()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(opener).toHaveFocus()
})

it('shows the currency mix alongside allocation and restricts Performance to the owner', () => {
  const owner = mount()
  const mix = within(screen.getByRole('region', { name: 'Currency mix' }))
  expect(mix.getByText('EUR · 50.0%')).toBeVisible()
  expect(mix.getByText('INR · 50.0%')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Performance' })).toBeVisible()
  owner.unmount()
  mount('target')
  expect(screen.queryByRole('button', { name: 'Performance' })).toBeNull()
})

it('selecting a sector entry opens the sector grouping and focuses its heading', () => {
  mount()
  const allocationView = within(screen.getByRole('group', { name: 'Allocation view' }))
  fireEvent.click(allocationView.getByRole('button', { name: 'Sector' }))
  // Both rows are unclassified here, so they share one "Needs review" entry.
  fireEvent.click(screen.getByRole('button', { name: /Show Needs review holdings/ }))
  expect(document.activeElement).toHaveAttribute('id', 'sector-INR-needs_review')
  expect(screen.getByRole('button', { name: 'Holdings' })).toHaveAttribute('aria-pressed', 'true')
})

it.each(['classic', 'glass'])('keeps existing row actions in %s', mode => {
  state.mode = mode
  mount()
  expect(screen.getAllByRole('button', { name: 'Edit Twin' })).toHaveLength(2)
})

it('clears selection when act-as owner changes', () => {
  const { rerender } = render(<MemoryRouter><DashboardPage actAsUserId="user-a" /></MemoryRouter>)
  fireEvent.click(screen.getAllByRole('button', { name: 'Twin' })[0])
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  // Switch to a different act-as owner
  rerender(<MemoryRouter><DashboardPage actAsUserId="user-b" /></MemoryRouter>)
  expect(screen.queryByRole('dialog')).toBeNull()
  // Switch back to the original owner — dialog must not reopen
  rerender(<MemoryRouter><DashboardPage actAsUserId="user-a" /></MemoryRouter>)
  expect(screen.queryByRole('dialog')).toBeNull()
})
