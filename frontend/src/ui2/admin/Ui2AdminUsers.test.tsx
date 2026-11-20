import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api, type User } from '../../lib/api/client'
import { Ui2AdminUsers } from './Ui2AdminUsers'

const owner = { id: 'sa1', username: 'root', name: 'Root Owner', role: 'superadmin', region: '' } as User
const europeAdmin = { id: 'a1', username: 'eve', name: 'Eve Admin', role: 'admin', region: 'europe' } as User
const alice = {
  id: 'u1', username: 'alice', name: 'Alice Morgan', role: 'user', region: 'india',
  locked: true, disabled: false, gold_enabled: true, premium: false, ui_mode: 'classic',
} as User
const bob = { id: 'u2', username: 'bob', name: 'Bob Lee', role: 'user', region: 'europe', disabled: true } as User

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: {
      adminListUsers: vi.fn(),
      getRegions: vi.fn(),
      adminSetUserRegion: vi.fn(),
      adminPromoteUser: vi.fn(),
      adminDemoteUser: vi.fn(),
      adminResetLockout: vi.fn(),
      adminHideUser: vi.fn(),
      adminReactivateUser: vi.fn(),
      adminDeleteUser: vi.fn(),
      adminSetUserGold: vi.fn(),
      adminSetUserPremium: vi.fn(),
      adminSetUserDeltaFromHistory: vi.fn(),
      adminSetUserUiMode: vi.fn(),
    },
  }
})

const session = vi.hoisted(() => ({ caller: null as User | null }))
vi.mock('../../features/auth/AuthContext', () => {
  const auth = () => ({ user: session.caller, loading: false, logout: vi.fn(), refresh: vi.fn() })
  return { useAuth: auth, useAuthOptional: auth }
})

const show = () => render(<MemoryRouter initialEntries={['/admin']}><Ui2AdminUsers /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  session.caller = owner
  vi.mocked(api.adminListUsers).mockImplementation(async includeHidden => (includeHidden ? [owner, alice, bob] : [owner, alice]))
  vi.mocked(api.getRegions).mockResolvedValue([{ id: 'india', label: 'India' }, { id: 'europe', label: 'Europe' }])
  for (const call of ['adminSetUserRegion', 'adminPromoteUser', 'adminResetLockout', 'adminHideUser', 'adminDeleteUser',
    'adminSetUserGold', 'adminSetUserUiMode'] as const) {
    vi.mocked(api[call]).mockResolvedValue(undefined as never)
  }
})

const pick = async (name: RegExp) => userEvent.click(await screen.findByRole('button', { name }))

describe('Ui2AdminUsers', () => {
  it('shows the super admin all three sections and the account list', async () => {
    show()
    expect(screen.getByRole('heading', { name: 'A clear view of your users.' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Administration sections' })
    expect(within(tabs).getAllByRole('link').map(link => link.textContent)).toEqual(['Users', 'Administrators', 'Branding'])
    expect(await screen.findByRole('button', { name: /Alice Morgan/ })).toBeInTheDocument()
    expect(screen.getByText('2 accounts · all regions')).toBeInTheDocument()
  })

  it('gives a region admin the Users tab only and no feature controls', async () => {
    session.caller = europeAdmin
    vi.mocked(api.adminListUsers).mockResolvedValue([alice])
    show()
    expect(within(screen.getByRole('navigation', { name: 'Administration sections' })).getAllByRole('link')).toHaveLength(1)
    await screen.findByRole('heading', { name: 'Alice Morgan' })
    expect(screen.queryByRole('region', { name: 'Features & interface' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Promote to admin' })).not.toBeInTheDocument()
  })

  it('includes hidden accounts on request', async () => {
    show()
    await screen.findByRole('button', { name: /Alice Morgan/ })
    await userEvent.click(screen.getByLabelText('Include hidden accounts'))
    await waitFor(() => expect(api.adminListUsers).toHaveBeenLastCalledWith(true))
    expect(await screen.findByRole('button', { name: /Bob Lee/ })).toBeInTheDocument()
  })

  it('protects the owner account: no role change, hide or delete', async () => {
    show()
    await pick(/Root Owner/)
    expect(screen.getByRole('heading', { name: 'Root Owner' })).toBeInTheDocument()
    expect(screen.getByText('Your own account and the super-admin account cannot be hidden or deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My portfolio' })).toHaveAttribute('href', '/')
  })

  it('promotes after a confirmation dialog, not a browser prompt', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('button', { name: 'Promote to admin' }))
    const dialog = screen.getByRole('dialog', { name: 'Change role?' })
    expect(api.adminPromoteUser).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Promote to admin' }))
    await waitFor(() => expect(api.adminPromoteUser).toHaveBeenCalledWith('u1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('unlocks recovery for a locked account', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('button', { name: 'Unlock recovery' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Unlock recovery?' })).getByRole('button', { name: 'Unlock recovery' }))
    await waitFor(() => expect(api.adminResetLockout).toHaveBeenCalledWith('u1'))
  })

  it('asks before turning a feature off, then skips the browser prompt', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm')
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gold tracking' }))
    const dialog = screen.getByRole('dialog', { name: 'Disable gold tracking?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(api.adminSetUserGold).toHaveBeenCalledWith('u1', { enabled: false }))
    expect(browserConfirm).not.toHaveBeenCalled()
  })

  it('saves the chosen interface', async () => {
    show()
    await pick(/Alice Morgan/)
    const save = screen.getByRole('button', { name: 'Save interface' })
    expect(save).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Interface'), 'ui2')
    await userEvent.click(save)
    await waitFor(() => expect(api.adminSetUserUiMode).toHaveBeenCalledWith('u1', { mode: 'ui2' }))
  })

  it('moves an account to another region', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.selectOptions(screen.getByLabelText('Region'), 'europe')
    await waitFor(() => expect(api.adminSetUserRegion).toHaveBeenCalledWith('u1', { region: 'europe' }))
  })

  it('deletes only after the exact username is typed', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete account' })
    await userEvent.type(within(dialog).getByLabelText('Confirm username'), 'alic')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the exact username.')
    expect(api.adminDeleteUser).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('Confirm username'), 'e')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(api.adminDeleteUser).toHaveBeenCalledWith('u1'))
  })

  it('opens another account’s portfolio through act-as', async () => {
    show()
    await pick(/Alice Morgan/)
    expect(screen.getByRole('link', { name: 'Open portfolio' })).toHaveAttribute('href', '/admin/users/u1')
  })
})
