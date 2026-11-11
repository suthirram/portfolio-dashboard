import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('collapsible sidebar', () => {
  // jsdom here runs without a storage file, so window.localStorage is absent.
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value) },
        removeItem: (key: string) => { values.delete(key) },
      },
    })
  })
  const shell = (container: HTMLElement) => container.querySelector('.shell')!

  it('folds into an icon rail with the hamburger and back', async () => {
    const { container } = renderShell()
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(toggle)
    expect(shell(container)).toHaveClass('shell-collapsed')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false')
    // Labels are hidden in the rail; the controls keep their names.
    const sidebar = screen.getByRole('complementary', { name: 'Main navigation' })
    expect(within(sidebar).getByRole('link', { name: 'History' })).toHaveAttribute('title', 'History')
    expect(within(sidebar).getByRole('button', { name: 'Add holding' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(shell(container)).not.toHaveClass('shell-collapsed')
  })

  it('remembers the choice in this browser', async () => {
    const first = renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    first.unmount()
    const { container } = renderShell()
    expect(shell(container)).toHaveClass('shell-collapsed')
  })

  it('collapses from the command palette too', async () => {
    const { container } = renderShell()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    await userEvent.type(screen.getByRole('combobox', { name: 'Search commands' }), 'collapse{Enter}')
    expect(shell(container)).toHaveClass('shell-collapsed')
  })
})
