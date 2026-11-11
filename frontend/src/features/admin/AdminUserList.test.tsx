import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type User } from '../../lib/api/client'
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
    adminSetUserDeltaFromHistory: vi.fn().mockResolvedValue(undefined),
    adminSetUserUiRevamp: vi.fn().mockResolvedValue(undefined),
  },
}))

const refreshCaller = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: superAdmin, logout: vi.fn(), refresh: refreshCaller }),
}))

describe('AdminUserList action buttons', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders every row action with the shared btn classes', async () => {
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)

    // All plain actions share the same class set (uniform size/colour).
    for (const name of ['Unlock', 'Hide', 'Promote', 'Move region', 'Enable gold', 'Enable premium', 'Delta from History', 'Glass UI on']) {
      const el = await screen.findByRole('button', { name })
      expect(el, `${name} button`).toHaveClass('btn', 'btn-sm')
    }

    // The Open link renders as the same button idiom.
    expect(screen.getByRole('link', { name: 'Open' })).toHaveClass('btn', 'btn-sm')

    // Destructive action carries the danger variant on top of the same base.
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn', 'btn-sm', 'btn-danger')
  })

  it('lets the wide user table scroll sideways on narrow screens', async () => {
    const { container } = render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    await screen.findByRole('link', { name: 'Open' })
    const wrap = container.querySelector('.table-scroll')
    expect(wrap).not.toBeNull()
    expect(wrap!.querySelector('table')).not.toBeNull()
  })

  // PD-052: the super admin switches an account's investment delta back to
  // History rows; the ledger is the default.
  it('switches the investment delta to History for the account', async () => {
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Delta from History' }))
    await waitFor(() => expect(api.adminSetUserDeltaFromHistory).toHaveBeenCalledWith('u1', { enabled: true }))
    expect(refreshCaller).not.toHaveBeenCalled()
  })

  // On the super admin's own account the session user is refreshed, so the
  // Transactions panel follows without a page reload.
  it('refreshes the signed-in user after switching their own account', async () => {
    vi.mocked(api.adminListUsers).mockResolvedValueOnce([{ ...superAdmin, delta_from_history: false }])
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Delta from History' }))
    await waitFor(() => expect(refreshCaller).toHaveBeenCalledTimes(1))
    expect(api.adminSetUserDeltaFromHistory).toHaveBeenCalledWith('sa1', { enabled: true })
  })

  // PD-054: the glass UI is opt-in per account.
  it('switches an account to the glass UI and back', async () => {
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    const on = await screen.findByRole('button', { name: 'Glass UI on' })
    expect(on).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(on)
    await waitFor(() => expect(api.adminSetUserUiRevamp).toHaveBeenCalledWith('u1', { enabled: true }))
    expect(refreshCaller).not.toHaveBeenCalled()
  })

  it('turns the glass UI off for an account that has it', async () => {
    vi.mocked(api.adminListUsers).mockResolvedValueOnce([{ ...rowUser, ui_revamp: true }])
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Glass UI off' }))
    await waitFor(() => expect(api.adminSetUserUiRevamp).toHaveBeenCalledWith('u1', { enabled: false }))
  })

  it('refreshes the signed-in user after switching their own look', async () => {
    vi.mocked(api.adminListUsers).mockResolvedValueOnce([{ ...superAdmin, ui_revamp: false }])
    render(<MemoryRouter><AdminUserList /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Glass UI on' }))
    await waitFor(() => expect(refreshCaller).toHaveBeenCalledTimes(1))
  })
})
