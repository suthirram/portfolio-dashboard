import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyUiMode, initUiMode, isUiV2, UiModeSync } from './uiMode'

type Mode = 'classic' | 'glass' | 'ui2'
const auth = vi.hoisted(() => ({ value: null as null | { user: { ui_mode: Mode } | null; loading: boolean } }))
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
  it('mirrors each interface to its own <html data-ui> value', () => {
    applyUiMode('glass')
    expect(document.documentElement.dataset.ui).toBe('v2')
    expect(isUiV2()).toBe(true)
    applyUiMode('ui2')
    expect(document.documentElement.dataset.ui).toBe('ui2')
    expect(isUiV2()).toBe(false)
    applyUiMode('classic')
    expect(document.documentElement.dataset.ui).toBeUndefined()
  })

  it('applies the remembered mode at boot', () => {
    applyUiMode('ui2')
    delete document.documentElement.dataset.ui
    initUiMode()
    expect(document.documentElement.dataset.ui).toBe('ui2')
    applyUiMode('glass')
    delete document.documentElement.dataset.ui
    initUiMode()
    expect(document.documentElement.dataset.ui).toBe('v2')
  })

  it('follows the signed-in account', () => {
    auth.value = { user: { ui_mode: 'ui2' }, loading: false }
    const { rerender } = render(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('ui2')

    auth.value = { user: { ui_mode: 'glass' }, loading: false }
    rerender(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('v2')

    auth.value = { user: { ui_mode: 'classic' }, loading: false }
    rerender(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBeUndefined()
  })

  it('leaves the remembered mode alone while signed out', () => {
    applyUiMode('ui2')
    auth.value = { user: null, loading: false }
    render(<UiModeSync />)
    expect(document.documentElement.dataset.ui).toBe('ui2')
  })
})
