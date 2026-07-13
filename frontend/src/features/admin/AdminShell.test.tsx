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
    expect(screen.getByRole('button', { name: /Log out/ }).className).toBe('btn')
  })

  it('offers the theme picker in the header like the other page shells', () => {
    render(<MemoryRouter initialEntries={['/admin']}><AdminShell>content</AdminShell></MemoryRouter>)
    expect(screen.getByRole('button', { name: /^Theme:/ })).toBeInTheDocument()
  })

  it('marks the active nav pill with the tinted blue style, not solid blue + white', () => {
    render(<MemoryRouter initialEntries={['/admin']}><AdminShell>content</AdminShell></MemoryRouter>)
    const users = screen.getByRole('link', { name: /Users/ })
    expect(users.style.background).toBe('var(--blue-dim)')
    expect(users.style.color).toBe('var(--blue)')
    const admins = screen.getByRole('link', { name: /Admins/ })
    expect(admins.style.background).toBe('transparent')
  })
})
