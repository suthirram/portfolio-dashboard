import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetToastsForTests, currentToasts, notify, toast, TOAST_MS } from './toast'
import { Toaster } from '../components/shell/Toaster'

beforeEach(() => __resetToastsForTests())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.ui
})

describe('toasts', () => {
  it('queues a toast and drops it after TOAST_MS', () => {
    vi.useFakeTimers()
    toast('Saved', 'success')
    expect(currentToasts().map(queued => queued.message)).toEqual(['Saved'])
    vi.advanceTimersByTime(TOAST_MS)
    expect(currentToasts()).toEqual([])
  })

  it('renders the queue in a live region and dismisses on ×', async () => {
    render(<Toaster />)
    act(() => { toast('Price refresh failed', 'error') })
    expect(screen.getByRole('status')).toHaveTextContent('Price refresh failed')
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Price refresh failed')).toBeNull()
  })

  it('notify keeps the browser alert in the current UI', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    notify('Delete failed')
    expect(alert).toHaveBeenCalledWith('Delete failed')
    expect(currentToasts()).toEqual([])
  })

  it('notify shows a toast in the glass UI', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    document.documentElement.dataset.ui = 'v2'
    notify('Delete failed')
    expect(alert).not.toHaveBeenCalled()
    expect(currentToasts()[0]).toMatchObject({ message: 'Delete failed', tone: 'error' })
  })
})
