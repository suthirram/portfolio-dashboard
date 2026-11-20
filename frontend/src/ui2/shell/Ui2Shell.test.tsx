import { act, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('gives the super admin a Branding link after Administration', () => {
    renderShell({ role: 'superadmin', gold_enabled: false }, '/admin/branding')
    expect(navLabels()).toEqual(['Overview', 'History', 'Transactions', 'Dividends', 'Administration', 'Branding'])
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Branding' })).toHaveAttribute('href', '/admin/branding')
    expect(within(nav).getByRole('link', { name: 'Branding' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Administration' })).not.toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Administration' })).not.toHaveClass('active')
    expect(screen.getByRole('banner')).toHaveTextContent('Workspace / Branding')
  })

  it('keeps Branding out of a regional admin’s sidebar', () => {
    renderShell({ role: 'admin' })
    expect(navLabels()).not.toContain('Branding')
  })

  it('keeps Overview, Transactions and Dividends on the viewed account during act-as', () => {
    renderShell({ role: 'admin', gold_enabled: true }, '/admin/users/u9/transactions')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/admin/users/u9')
    expect(within(nav).getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/admin/users/u9/transactions')
    expect(within(nav).getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Dividends' })).toHaveAttribute('href', '/admin/users/u9/dividends')
    expect(within(nav).getByRole('link', { name: 'Administration' })).not.toHaveAttribute('aria-current', 'page')
  })

  it('keeps History and Gold out of act-as and says why', () => {
    renderShell({ role: 'admin', gold_enabled: true }, '/admin/users/u9')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).queryByRole('link', { name: 'History' })).not.toBeInTheDocument()
    const history = within(nav).getByRole('button', { name: 'History' })
    expect(history).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(history)
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/users/u9')
    expect(within(nav).getByRole('button', { name: 'Gold' })).toBeInTheDocument()
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

  it('opens the drawer with focus inside and the page behind it inert', () => {
    const { container } = renderShell({ role: 'user' })
    const menu = screen.getByRole('button', { name: 'Toggle navigation' })
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu)
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' })
    expect(menu).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar).toHaveClass('open')
    expect(within(sidebar).getByRole('button', { name: 'Close navigation' })).toHaveFocus()
    expect(container.querySelector('.ui2-main')).toHaveAttribute('inert')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.ui2-main')).not.toHaveAttribute('inert')
  })

  // The open drawer covers ☰, so it must close without it.
  it.each([
    ['its close button', () => fireEvent.click(within(screen.getByRole('complementary', { name: 'Sidebar' })).getByRole('button', { name: 'Close navigation' }))],
    ['the backdrop', () => fireEvent.click(document.querySelector('.ui2-backdrop')!)],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('closes the drawer from %s and returns focus to the menu button', (_, close) => {
    const { container } = renderShell({ role: 'user' })
    const menu = screen.getByRole('button', { name: 'Toggle navigation' })
    // A real browser refuses focus inside an inert subtree (jsdom does not),
    // so record whether ☰ was still inert when it got focus.
    let inertAtFocus: boolean | null = null
    menu.addEventListener('focus', () => { inertAtFocus = Boolean(container.querySelector('.ui2-main')?.hasAttribute('inert')) })
    fireEvent.click(menu)
    close()
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).not.toHaveClass('open')
    expect(menu).toHaveAttribute('aria-expanded', 'false')
    expect(document.querySelector('.ui2-backdrop')).toBeNull()
    expect(menu).toHaveFocus()
    expect(inertAtFocus).toBe(false)
  })

  it('resets an open drawer when the window widens to desktop', () => {
    const listeners: ((e: { matches: boolean }) => void)[] = []
    const matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: (_: string, listener: (e: { matches: boolean }) => void) => { listeners.push(listener) },
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal('matchMedia', matchMedia)
    try {
      const { container } = renderShell({ role: 'user' })
      fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }))
      expect(container.querySelector('.ui2-main')).toHaveAttribute('inert')
      act(() => listeners.forEach(listener => listener({ matches: true })))
      expect(screen.getByRole('complementary', { name: 'Sidebar' })).not.toHaveClass('open')
      expect(container.querySelector('.ui2-main')).not.toHaveAttribute('inert')
      expect(matchMedia).toHaveBeenCalledWith('(min-width: 761px)')
    } finally {
      vi.unstubAllGlobals()
    }
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
