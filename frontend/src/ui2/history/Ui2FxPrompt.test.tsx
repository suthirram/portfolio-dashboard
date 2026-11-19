import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { __resetToastsForTests, currentToasts } from '../../lib/toast'

const mockApi = vi.hoisted(() => ({
  getFxMissing: vi.fn(),
  refetchFx: vi.fn(),
}))

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: mockApi }
})

const mockAuth = vi.hoisted(() => ({ userId: 'u1' }))

vi.mock('../../features/auth/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../features/auth/AuthContext')>('../../features/auth/AuthContext')
  return { ...actual, useAuthOptional: () => ({ user: { id: mockAuth.userId } }) }
})

import { Ui2FxPrompt, __resetFxPromptForTests } from './Ui2FxPrompt'

const openDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Fetch rates again' }))
  return screen.getByRole('dialog', { name: 'Fetch exchange rates again' })
}

describe('UI_2.0 exchange-rate prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.userId = 'u1'
    __resetFxPromptForTests()
    __resetToastsForTests()
  })

  it('shows nothing when no day is flagged', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: [] })
    const { container } = render(<Ui2FxPrompt />)
    await waitFor(() => expect(mockApi.getFxMissing).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the flagged dates and restores them all', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-17', '2026-11-16'] })
    mockApi.refetchFx.mockResolvedValue({ dates: [] })
    render(<Ui2FxPrompt />)
    expect(await screen.findByText('Review exchange rates')).toBeInTheDocument()
    expect(screen.getByText('2 dates have missing or carried FX rates.')).toBeInTheDocument()
    const dialog = await openDialog()
    expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['17 Nov 2026', '16 Nov 2026'])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch rates again' }))
    await waitFor(() => expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument())
    expect(mockApi.refetchFx).toHaveBeenCalledWith(['2026-11-17', '2026-11-16'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(currentToasts().map(queued => queued.message)).toEqual(['Exchange rates restored'])
  })

  it('keeps the dialog open with the dates still missing', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-17', '2026-11-16'] })
    mockApi.refetchFx.mockResolvedValue({ dates: ['2026-11-16'] })
    render(<Ui2FxPrompt />)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch rates again' }))
    expect(await within(dialog).findByText('1 date is still missing; retry or choose Not now.')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem').map(item => item.textContent)).toEqual(['16 Nov 2026'])
    expect(screen.getByText('1 date has missing or carried FX rates.')).toBeInTheDocument()
  })

  it('keeps every date when the fetch fails', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-16'] })
    mockApi.refetchFx.mockRejectedValue(new Error('500'))
    render(<Ui2FxPrompt />)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fetch rates again' }))
    expect(await within(dialog).findByText('The fetch failed. The dates remain flagged; retry or choose Not now.')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1)
  })

  it('lists the first ten dates and counts the rest', async () => {
    const dates = Array.from({ length: 12 }, (_, i) => `2026-10-${String(30 - i).padStart(2, '0')}`)
    mockApi.getFxMissing.mockResolvedValue({ dates })
    render(<Ui2FxPrompt />)
    const items = within(await openDialog()).getAllByRole('listitem')
    expect(items).toHaveLength(11)
    expect(items[10]).toHaveTextContent('and 2 more')
  })

  it('Not now hides the notice until the app reloads', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-16'] })
    const { unmount } = render(<Ui2FxPrompt />)
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument()
    unmount()
    // Coming back to History in the same app session: no notice, no request.
    mockApi.getFxMissing.mockClear()
    render(<Ui2FxPrompt />)
    expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument()
    expect(mockApi.getFxMissing).not.toHaveBeenCalled()
  })

  it('Not now belongs to the account that chose it', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-16'] })
    const { unmount } = render(<Ui2FxPrompt />)
    fireEvent.click(within(await openDialog()).getByRole('button', { name: 'Not now' }))
    unmount()
    // Another account signs in the same tab without a reload.
    mockAuth.userId = 'u2'
    render(<Ui2FxPrompt />)
    expect(await screen.findByText('Review exchange rates')).toBeInTheDocument()
  })

  it('reads the list again when History reloads its rows', async () => {
    mockApi.getFxMissing.mockResolvedValueOnce({ dates: [] }).mockResolvedValueOnce({ dates: ['2026-11-18'] })
    const { rerender } = render(<Ui2FxPrompt refreshKey={1} />)
    await waitFor(() => expect(mockApi.getFxMissing).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Review exchange rates')).not.toBeInTheDocument()
    // An add for a new date flagged it; History reloaded its rows.
    rerender(<Ui2FxPrompt refreshKey={2} />)
    expect(await screen.findByText('1 date has missing or carried FX rates.')).toBeInTheDocument()
  })

  it('Escape returns focus to the button that opened the dialog', async () => {
    mockApi.getFxMissing.mockResolvedValue({ dates: ['2026-11-16'] })
    render(<Ui2FxPrompt />)
    const opener = await screen.findByRole('button', { name: 'Fetch rates again' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fetch rates again' })).toHaveFocus()
  })
})
