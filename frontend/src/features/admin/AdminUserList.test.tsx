import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../../lib/api/client'
import AdminUserList from './AdminUserList'

const superAdmin: User = {
  id: 'sa1', username: 'root', name: 'Root', role: 'superadmin', region: '',
} as User

const rowUser: User = {
  id: 'u1', username: 'alice', name: 'Alice', role: 'user', region: 'india',
  disabled: false, locked: true,
} as User

vi.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    adminListUsers: vi.fn().mockImplementation(() => Promise.resolve([rowUser])),
    getRegions: vi.fn().mockResolvedValue([{ id: 'india', label: 'India' }]),
  },
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: superAdmin, logout: vi.fn() }),
}))

describe('AdminUserList action buttons', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders every row action with the shared btn classes', async () => {
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)

    // All plain actions share the same class set (uniform size/colour).
    for (const name of ['Unlock', 'Hide', 'Promote', 'Move region', 'Enable gold', 'Enable premium']) {
      const el = await screen.findByRole('button', { name })
      expect(el, `${name} button`).toHaveClass('btn', 'btn-sm')
    }

    // The Open link renders as the same button idiom.
    expect(screen.getByRole('link', { name: 'Open' })).toHaveClass('btn', 'btn-sm')

    // Destructive action carries the danger variant on top of the same base.
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn', 'btn-sm', 'btn-danger')
  })
})
