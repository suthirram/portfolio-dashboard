import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { nextThemeLabel, useTheme } from './useTheme'

describe('useTheme premium gating (PD-046)', () => {
  it('premium accounts cycle dark → light → cyberpunk → dark', () => {
    const { result } = renderHook(() => useTheme({ premium: true }))
    act(() => result.current.set('dark'))
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('cyberpunk')
    expect(document.documentElement.dataset.theme).toBe('cyberpunk')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
  })

  it('non-premium accounts never reach cyberpunk from the toggle', () => {
    const { result } = renderHook(() => useTheme({ premium: false }))
    act(() => result.current.set('dark'))
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
  })

  it('revoked premium downgrades an active cyberpunk theme to dark', () => {
    const { result, rerender } = renderHook(
      ({ premium }: { premium?: boolean }) => useTheme({ premium }),
      { initialProps: { premium: true as boolean | undefined } },
    )
    act(() => result.current.set('cyberpunk'))
    expect(result.current.theme).toBe('cyberpunk')
    rerender({ premium: false })
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('labels the next theme, cyber only for premium', () => {
    expect(nextThemeLabel('dark', true)).toBe('☀ Light')
    expect(nextThemeLabel('light', true)).toBe('⚡ Cyber')
    expect(nextThemeLabel('light', false)).toBe('🌙 Dark')
    expect(nextThemeLabel('cyberpunk', true)).toBe('🌙 Dark')
  })
})
