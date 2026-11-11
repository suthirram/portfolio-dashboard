import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type User } from '../../lib/api/client'
import AdminManageAdmins from './AdminManageAdmins'

const superAdmin = { id: 'sa1', username: 'root', name: 'Root', role: 'superadmin', region: '' } as User
const asha = { id: 'a1', username: 'asha', name: 'Asha Rao', role: 'admin', region: 'india', disabled: false, locked: false } as User
const erik = { id: 'a2', username: 'erik', name: 'Erik Lund', role: 'admin', region: 'europe', disabled: false, locked: false } as User

vi.mock('../../lib/api/client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    adminListAdmins: vi.fn(),
    getRegions: vi.fn().mockResolvedValue([{ id: 'india', label: 'India' }, { id: 'europe', label: 'Europe' }]),
    adminDemoteUser: vi.fn().mockResolvedValue(undefined),
    adminSetUserRegion: vi.fn().mockResolvedValue(undefined),
    adminSetUserPremium: vi.fn().mockResolvedValue(undefined),
  },
}))

const session = vi.hoisted(() => ({ glass: false }))
vi.mock('../auth/AuthContext', () => {
  const auth = () => ({ user: { ...superAdmin, ui_revamp: session.glass }, loading: false, logout: vi.fn(), refresh: vi.fn() })
  return { useAuth: auth, useAuthOptional: auth }
})

const renderPage = () => render(<MemoryRouter><AdminManageAdmins /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.adminListAdmins).mockResolvedValue([superAdmin, asha, erik])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  session.glass = false
  vi.restoreAllMocks()
})

describe('AdminManageAdmins (current UI)', () => {
  it('keeps the table with Demote and Move region', async () => {
    renderPage()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Demote' })[0])
    await waitFor(() => expect(api.adminDemoteUser).toHaveBeenCalledWith('a1'))
  })
})

// PD-054: the same list + settings layout as Users.
describe('AdminManageAdmins in the glass UI', () => {
  beforeEach(() => { session.glass = true })
  const settings = () => screen.getByRole('region', { name: 'User settings' })

  it('lists the administrators without the Active / All toggle', async () => {
    renderPage()
    const list = await screen.findByRole('complementary', { name: 'Administrators' })
    expect(within(list).getAllByRole('button')).toHaveLength(3)
    expect(screen.queryByRole('group', { name: 'Which users' })).toBeNull()
    expect(screen.getByLabelText('Search administrators')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('demotes, moves the region and flips features for the picked admin', async () => {
    renderPage()
    const list = await screen.findByRole('complementary', { name: 'Administrators' })
    fireEvent.click(within(list).getByRole('button', { name: /Erik Lund/ }))
    expect(within(settings()).getByRole('heading', { name: 'Erik Lund' })).toBeInTheDocument()

    fireEvent.change(within(settings()).getByLabelText('Region'), { target: { value: 'india' } })
    await waitFor(() => expect(api.adminSetUserRegion).toHaveBeenCalledWith('a2', { region: 'india' }))
    fireEvent.click(within(settings()).getByRole('switch', { name: 'Premium' }))
    await waitFor(() => expect(api.adminSetUserPremium).toHaveBeenCalledWith('a2', { enabled: true }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Demote to user' }))
    expect(window.confirm).toHaveBeenCalledWith('Demote erik back to user?')
    await waitFor(() => expect(api.adminDemoteUser).toHaveBeenCalledWith('a2'))
  })
})
