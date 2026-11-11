import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navItems, ShellLayout } from './AppShell'

const session = vi.hoisted(() => ({
  user: { id: 'u1', username: 'alice', name: 'Alice', role: 'user', gold_enabled: false, premium: false, ui_revamp: true },
  logout: vi.fn(),
}))
vi.mock('../../features/auth/AuthContext', () => ({
  useAuthOptional: () => ({ user: session.user, loading: false, logout: session.logout }),
}))

function Probe() {
  const location = useLocation()
  return <div data-testid="where">{location.pathname} {JSON.stringify(location.state)}</div>
}

function renderShell(path = '/history') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ShellLayout />}>
          <Route path="*" element={<Probe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  session.user = { ...session.user, role: 'user', gold_enabled: false, ui_revamp: true }
})

describe('navItems', () => {
  it('offers Gold and Admin only to accounts that have them', () => {
    expect(navItems(false, false).map(item => item.label)).toEqual(['Dashboard', 'History', 'Transactions', 'Dividends'])
    expect(navItems(true, true).map(item => item.label)).toEqual(['Dashboard', 'History', 'Transactions', 'Dividends', 'Gold', 'Admin'])
  })
})

describe('ShellLayout', () => {
  it('renders the page alone for an account without the glass UI', () => {
    session.user = { ...session.user, ui_revamp: false }
    renderShell()
    expect(screen.queryByRole('complementary', { name: 'Main navigation' })).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('/history')
  })

  it('wraps the page in the shell and marks the current page', () => {
    renderShell('/history')
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(sidebar).getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).queryByRole('link', { name: 'Gold' })).toBeNull()
    expect(screen.getByTestId('where')).toBeInTheDocument()
  })

  it('opens the command palette on Ctrl+K and navigates from it', async () => {
    renderShell('/history')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    await userEvent.type(input, 'dividends{Enter}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('where')).toHaveTextContent('/dividends')
  })

  it('sends Add holding to the dashboard with openAdd', async () => {
    renderShell('/history')
    await userEvent.click(screen.getByRole('button', { name: /Add holding/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/ {"openAdd":true}')
  })

  it('logs out from the sidebar', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(session.logout).toHaveBeenCalled()
  })
})
