import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyUiMode, initUiMode, isUiV2, UiModeSync } from './uiMode'

const auth = vi.hoisted(() => ({ value: null as null | { user: { ui_revamp: boolean } | null; loading: boolean } }))
vi.mock('../features/auth/AuthContext', () => ({ useAuthOptional: () => auth.value }))

// jsdom here runs without a storage file, so window.localStorage is absent.
beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
      clear: () => { values.clear() },
    },
  })
})

afterEach(() => {
  delete document.documentElement.dataset.ui
  auth.value = null
})

describe('ui mode', () => {
  it('mirrors the switch to <html data-ui> and remembers it', () => {
    applyUiMode(true)
    expect(document.documentElement.dataset.ui).toBe('v2')
    expect(isUiV2()).toBe(true)
    applyUiMode(false)
    expect(document.documentElement.dataset.ui).toBeUndefined()
    expect(isUiV2()).toBe(false)
  })

  it('applies the remembered mode at boot', () => {
    applyUiMode(true)
    delete document.documentElement.dataset.ui
    initUiMode()
    expect(document.documentElement.dataset.ui).toBe('v2')
  })

  it('follows the signed-in account', () => {
    auth.value = { user: { ui_revamp: true }, loading: false }
    const { rerender } = render(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('v2')

    auth.value = { user: { ui_revamp: false }, loading: false }
    rerender(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBeUndefined()
  })

  it('leaves the remembered mode alone while signed out', () => {
    applyUiMode(true)
    auth.value = { user: null, loading: false }
    render(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('v2')
  })
})
