import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AdminShell } from './AdminShell'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'sa1', username: 'root', name: 'Root', role: 'superadmin' },
    logout: vi.fn(),
  }),
}))

describe('AdminShell chrome', () => {
  it('uses the shared .btn class for the logout action', () => {
    render(<MemoryRouter initialEntries={['/admin']}><AdminShell>content</AdminShell></MemoryRouter>)
    expect(screen.getByRole('button', { name: /Log out/ })).toHaveClass('btn')
  })

  it('offers the theme picker in the header like the other page shells', () => {
    render(<MemoryRouter initialEntries={['/admin']}><AdminShell>content</AdminShell></MemoryRouter>)
    expect(screen.getByRole('button', { name: /^Theme:/ })).toBeInTheDocument()
  })

  it('marks the active nav pill via aria-current on the shared .btn class', () => {
    render(<MemoryRouter initialEntries={['/admin']}><AdminShell>content</AdminShell></MemoryRouter>)
    const users = screen.getByRole('link', { name: /Users/ })
    expect(users).toHaveClass('btn')
    expect(users.getAttribute('aria-current')).toBe('page')
    const admins = screen.getByRole('link', { name: /Admins/ })
    expect(admins).toHaveClass('btn')
    expect(admins.getAttribute('aria-current')).toBeNull()
  })
})
