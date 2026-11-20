import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type User } from '../../lib/api/client'
import { Ui2ProfilePage } from './Ui2ProfilePage'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: {
      getQuestions: vi.fn(),
      getRegions: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn(),
      updateSecurityQs: vi.fn(),
    },
  }
})

const session = vi.hoisted(() => ({
  user: { id: 'u1', username: 'alice', name: 'Alice Morgan', role: 'admin', region: 'europe' } as User,
  refresh: vi.fn(),
}))
vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: session.user, refresh: session.refresh }),
  useAuthOptional: () => ({ user: session.user, refresh: session.refresh }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getQuestions).mockResolvedValue([
    { id: 'q1', prompt: 'First school' }, { id: 'q2', prompt: 'First pet' }, { id: 'q3', prompt: 'Birth city' },
  ])
  vi.mocked(api.getRegions).mockResolvedValue([{ id: 'europe', label: 'Europe' }])
  vi.mocked(api.updateProfile).mockResolvedValue(undefined as never)
  vi.mocked(api.updatePassword).mockResolvedValue(undefined as never)
  vi.mocked(api.updateSecurityQs).mockResolvedValue(undefined as never)
  session.refresh.mockResolvedValue(undefined)
})

const openTab = (name: string) => userEvent.click(screen.getByRole('tab', { name }))

describe('Ui2ProfilePage', () => {
  it('shows the identity panel and the profile form first', async () => {
    render(<Ui2ProfilePage />)
    expect(screen.getByRole('heading', { name: 'Your account, your preferences.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alice Morgan' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Name')).toHaveValue('Alice Morgan')
    expect(await screen.findByText('Europe')).toBeInTheDocument()
  })

  it('saves the profile with the current password and refreshes the session', async () => {
    render(<Ui2ProfilePage />)
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Alice M ')
    await userEvent.type(screen.getByLabelText('Current password confirmation'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({
      name: 'Alice M', username: 'alice', current_password: 'secret-pass',
    }))
    expect(session.refresh).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated.')
  })

  it('rejects a short or mismatched new password before calling the server', async () => {
    render(<Ui2ProfilePage />)
    await openTab('Password')
    const panel = screen.getByRole('tabpanel')
    await userEvent.type(within(panel).getByLabelText('Current password'), 'old-pass')
    await userEvent.type(within(panel).getByLabelText('New password'), 'short')
    await userEvent.type(within(panel).getByLabelText('Confirm new password'), 'short')
    await userEvent.click(within(panel).getByRole('button', { name: 'Change password' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('New password must be at least 8 chars')
    await userEvent.clear(within(panel).getByLabelText('New password'))
    await userEvent.type(within(panel).getByLabelText('New password'), 'long-enough-1')
    await userEvent.click(within(panel).getByRole('button', { name: 'Change password' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Passwords do not match')
    expect(api.updatePassword).not.toHaveBeenCalled()
  })

  it('changes the password when the rules pass', async () => {
    render(<Ui2ProfilePage />)
    await openTab('Password')
    await userEvent.type(screen.getByLabelText('Current password'), 'old-pass')
    await userEvent.type(screen.getByLabelText('New password'), 'long-enough-1')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(api.updatePassword).toHaveBeenCalledWith({ current_password: 'old-pass', new_password: 'long-enough-1' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Other sessions were signed out.')
  })

  it('replaces all three security questions, each question used once', async () => {
    render(<Ui2ProfilePage />)
    await openTab('Security questions')
    await within(screen.getByLabelText('Question 1')).findByRole('option', { name: 'First school' })
    await userEvent.selectOptions(screen.getByLabelText('Question 1'), 'q1')
    expect(within(screen.getByLabelText('Question 2')).getByRole('option', { name: 'First school' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Question 2'), 'q2')
    await userEvent.selectOptions(screen.getByLabelText('Question 3'), 'q3')
    for (const index of [1, 2, 3]) await userEvent.type(screen.getByLabelText(`Answer ${index}`), `answer ${index}`)
    await userEvent.type(screen.getByLabelText('Current password confirmation'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save security questions' }))
    await waitFor(() => expect(api.updateSecurityQs).toHaveBeenCalledWith({
      current_password: 'secret-pass',
      security_answers: [
        { question_id: 'q1', answer: 'answer 1' },
        { question_id: 'q2', answer: 'answer 2' },
        { question_id: 'q3', answer: 'answer 3' },
      ],
    }))
  })
})
