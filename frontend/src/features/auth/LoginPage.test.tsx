import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { api, ApiError } from '../../lib/api/client'
import LoginPage from './LoginPage'

const { setUser } = vi.hoisted(() => ({ setUser: vi.fn() }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ setUser }) }))
vi.mock('../../lib/api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/api/client')>(),
  api: { login: vi.fn() },
}))

const user = {
  id: 'demo', name: 'Demo', username: 'demo', role: 'user' as const, region: 'india',
  must_change_password: false, disabled: false, locked: false,
  gold_enabled: false, premium: false, delta_from_history: false, ui_revamp: false,
}

function LocationProbe() {
  return <output aria-label="Current route">{useLocation().pathname}</output>
}

function renderLogin(from?: string) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
      <LoginPage /><LocationProbe />
    </MemoryRouter>,
  )
}

function submitLogin() {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: ' demo ' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'example-password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('sunrise login', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
        removeItem: vi.fn((key: string) => { values.delete(key) }),
      },
    })
    vi.mocked(api.login).mockResolvedValue(user)
  })

  it('reveals and masks the same password without submitting', () => {
    renderLogin()
    const password = screen.getByLabelText('Password')
    fireEvent.change(password, { target: { value: 'example-password' } })
    const toggle = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('example-password')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(password).toHaveAttribute('type', 'password')
    expect(api.login).not.toHaveBeenCalled()
  })

  it('remembers only the username after successful login and restores it on a later visit', async () => {
    const view = renderLogin()
    fireEvent.click(screen.getByLabelText('Remember me'))
    submitLogin()
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user))
    expect(api.login).toHaveBeenCalledWith({ username: 'demo', password: 'example-password' })
    expect(window.localStorage.setItem).toHaveBeenCalledExactlyOnceWith('pd_login_username', 'demo')
    view.unmount()
    renderLogin()
    expect(screen.getByLabelText('Username')).toHaveValue('demo')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Remember me')).toBeChecked()
    fireEvent.click(screen.getByLabelText('Remember me'))
    expect(window.localStorage.getItem('pd_login_username')).toBeNull()
  })

  it('does not remember credentials unless selected', async () => {
    renderLogin()
    submitLogin()
    await waitFor(() => expect(setUser).toHaveBeenCalled())
    expect(window.localStorage.setItem).not.toHaveBeenCalled()
  })

  it('allows login when device storage is blocked', async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('Storage blocked') } })
    renderLogin()
    fireEvent.click(screen.getByLabelText('Remember me'))
    submitLogin()
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(user))
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/')
  })

  it.each([
    [false, 'user', undefined, '/'],
    [false, 'user', '/history', '/history'],
    [false, 'user', '/login', '/'],
    [false, 'superadmin', undefined, '/admin'],
    [true, 'superadmin', '/history', '/onboarding'],
  ] as const)('preserves login routing (onboarding=%s, role=%s, from=%s)', async (mustChangePassword, role, from, expected) => {
    vi.mocked(api.login).mockResolvedValue({ ...user, role, must_change_password: mustChangePassword })
    renderLogin(from)
    submitLogin()
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent(expected))
  })

  it.each([
    [403, 'Account is hidden. Contact your administrator.'],
    [423, 'Account is locked. Contact your administrator to reset it.'],
    [401, 'Invalid credentials'],
  ])('announces login errors for status %s and permits retry', async (status, message) => {
    vi.mocked(api.login).mockRejectedValue(new ApiError(status, 'Invalid credentials'))
    renderLogin()
    fireEvent.click(screen.getByLabelText('Remember me'))
    submitLogin()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled()
    expect(window.localStorage.setItem).not.toHaveBeenCalled()
    expect(setUser).not.toHaveBeenCalled()
  })

  it('keeps signup and password recovery reachable', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/forgot-password')
  })
})
