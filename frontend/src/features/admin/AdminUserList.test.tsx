import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    adminSetUserGold: vi.fn().mockResolvedValue(undefined),
    adminSetUserRegion: vi.fn().mockResolvedValue(undefined),
    adminPromoteUser: vi.fn().mockResolvedValue(undefined),
    adminResetLockout: vi.fn().mockResolvedValue(undefined),
    adminDeleteUser: vi.fn().mockResolvedValue(undefined),
  },
}))

const refreshCaller = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
// The signed-in caller (the super admin unless a test says otherwise) and
// whether their account has the glass UI.
const session = vi.hoisted(() => ({ caller: null as User | null, glass: false }))

vi.mock('../auth/AuthContext', () => {
  const auth = () => {
    const user = { ...(session.caller ?? superAdmin), ui_revamp: session.glass }
    return { user, loading: false, logout: vi.fn(), refresh: refreshCaller }
  }
  return { useAuth: auth, useAuthOptional: auth }
})

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

// PD-054: in the glass UI the page is a list of users and, for the one
// picked, a settings page; the actions are the table's.
describe('AdminUserList in the glass UI', () => {
  const bob: User = { id: 'u2', username: 'bob', name: 'Bob Builder', role: 'user', region: 'india', disabled: false, locked: false } as User

  beforeEach(() => {
    vi.clearAllMocks()
    session.glass = true
    session.caller = null
    vi.mocked(api.adminListUsers).mockImplementation(() => Promise.resolve([rowUser, bob]))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => {
    session.glass = false
    vi.restoreAllMocks()
  })

  const renderPage = () => render(<MemoryRouter><AdminUserList /></MemoryRouter>)
  const settings = () => screen.getByRole('region', { name: 'User settings' })

  it('lists the users and shows the first one’s settings instead of the table', async () => {
    renderPage()
    const list = await screen.findByRole('complementary', { name: 'Users' })
    expect(within(list).getByRole('button', { name: /Alice/ })).toHaveAttribute('aria-current', 'true')
    expect(within(settings()).getByRole('heading', { name: 'Alice' })).toBeInTheDocument()
    expect(within(settings()).getByRole('link', { name: 'Open portfolio' })).toHaveAttribute('href', '/admin/users/u1')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('opens another user’s settings on click and filters the list', async () => {
    renderPage()
    const list = await screen.findByRole('complementary', { name: 'Users' })
    fireEvent.click(within(list).getByRole('button', { name: /Bob Builder/ }))
    expect(within(settings()).getByRole('heading', { name: 'Bob Builder' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'ali' } })
    expect(within(list).queryByRole('button', { name: /Bob/ })).toBeNull()
  })

  it('flips features with switches through the shared toggle', async () => {
    renderPage()
    await screen.findByRole('complementary', { name: 'Users' })
    const gold = within(settings()).getByRole('switch', { name: 'Gold tracking' })
    expect(gold).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(gold)
    await waitFor(() => expect(api.adminSetUserGold).toHaveBeenCalledWith('u1', { enabled: true }))
    fireEvent.click(within(settings()).getByRole('switch', { name: 'Glass UI' }))
    await waitFor(() => expect(api.adminSetUserUiRevamp).toHaveBeenCalledWith('u1', { enabled: true }))
  })

  it('asks before turning a feature off, and keeps it on when declined', async () => {
    vi.mocked(api.adminListUsers).mockImplementation(() => Promise.resolve([{ ...rowUser, gold_enabled: true }]))
    vi.mocked(window.confirm).mockReturnValue(false)
    renderPage()
    await screen.findByRole('complementary', { name: 'Users' })
    fireEvent.click(within(settings()).getByRole('switch', { name: 'Gold tracking' }))
    expect(window.confirm).toHaveBeenCalledWith('Disable gold tracking for alice? Data is kept, only hidden.')
    expect(api.adminSetUserGold).not.toHaveBeenCalled()
  })

  it('moves the region with a dropdown, unlocks, promotes and deletes', async () => {
    renderPage()
    await screen.findByRole('complementary', { name: 'Users' })
    fireEvent.change(within(settings()).getByLabelText('Region'), { target: { value: 'india' } })
    await waitFor(() => expect(api.adminSetUserRegion).toHaveBeenCalledWith('u1', { region: 'india' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Unlock' }))
    await waitFor(() => expect(api.adminResetLockout).toHaveBeenCalledWith('u1'))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Promote to admin' }))
    await waitFor(() => expect(api.adminPromoteUser).toHaveBeenCalledWith('u1'))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.adminDeleteUser).toHaveBeenCalledWith('u1'))
  })

  it('shows a regional admin no feature switches and no region move', async () => {
    session.caller = { id: 'a1', username: 'asha', name: 'Asha', role: 'admin', region: 'india' } as User
    renderPage()
    await screen.findByRole('complementary', { name: 'Users' })
    expect(within(settings()).queryByRole('region', { name: 'Features' })).toBeNull()
    expect(within(settings()).queryByLabelText('Region')).toBeNull()
    expect(within(settings()).getByRole('region', { name: 'Access' })).toBeInTheDocument()
  })

  it('offers no hide or delete on the super admin’s own account', async () => {
    vi.mocked(api.adminListUsers).mockImplementation(() => Promise.resolve([superAdmin]))
    renderPage()
    await screen.findByRole('complementary', { name: 'Users' })
    expect(within(settings()).queryByRole('region', { name: 'Danger zone' })).toBeNull()
    expect(within(settings()).queryByRole('button', { name: 'Hide' })).toBeNull()
  })
})
