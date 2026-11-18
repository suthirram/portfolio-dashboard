import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '../../lib/api/client'
import { Ui2Shell } from './Ui2Shell'

const session = vi.hoisted(() => ({ user: null as Partial<User> | null, logout: vi.fn() }))
vi.mock('../../features/auth/AuthContext', () => ({
  useAuthOptional: () => ({ user: session.user, loading: false, logout: session.logout, refresh: vi.fn() }),
}))

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

const renderShell = (user: Partial<User>, path = '/') => {
  session.user = user
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<Ui2Shell><Where /></Ui2Shell>} /></Routes>
    </MemoryRouter>,
  )
}
const navLabels = () =>
  within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link').map(link => link.textContent?.trim())

describe('Ui2Shell', () => {
  it('lists the workspace pages with the mockup names and renders the page', () => {
    renderShell({ role: 'user', gold_enabled: false })
    expect(navLabels()).toEqual(['Overview', 'History', 'Transactions', 'Dividends'])
    expect(screen.getByTestId('where')).toHaveTextContent('/')
  })

  it('adds Gold for gold accounts and Administration for admins', () => {
    renderShell({ role: 'admin', gold_enabled: true })
    expect(navLabels()).toEqual(['Overview', 'History', 'Transactions', 'Dividends', 'Gold', 'Administration'])
  })

  it('names the current page in the breadcrumb', () => {
    renderShell({ role: 'user' }, '/history')
    expect(screen.getByRole('banner')).toHaveTextContent('Workspace / History')
  })

  it('offers Cyber only to premium accounts', () => {
    const { unmount } = renderShell({ role: 'user', premium: false })
    expect(screen.queryByRole('button', { name: /Cyber/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Light/ })).toBeInTheDocument()
    unmount()
    renderShell({ role: 'user', premium: true })
    expect(screen.getByRole('button', { name: /Cyber/ })).toBeInTheDocument()
  })

  it('opens the sidebar drawer from the menu button', () => {
    renderShell({ role: 'user' })
    const menu = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu)
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveClass('open')
  })

  it('reaches profile, administration and log out from the account menu', () => {
    renderShell({ role: 'admin', name: 'Asha Rao' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Asha Rao account menu' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Profile & security', 'Administration', 'Log out'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Profile & security' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/profile')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Asha Rao account menu' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(session.logout).toHaveBeenCalled()
  })

  it('keeps Administration out of a plain user’s account menu', () => {
    renderShell({ role: 'user', name: 'Bob' })
    fireEvent.click(screen.getByRole('button', { name: 'Open Bob account menu' }))
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull()
  })
})
