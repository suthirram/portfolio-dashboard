// The browser-chrome theme-color tracks the active theme (PD-058 Task 9).
// Each theme's color-scheme is checked in Chromium by
// colorScheme.browser.test.ts.
import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { THEME_COLOR, __resetThemeChoiceForTests, useTheme } from '../lib/useTheme'

describe('theme-color meta', () => {
  beforeEach(() => {
    __resetThemeChoiceForTests()
    document.head.innerHTML = '<meta name="theme-color" content="#0a0c16" />'
  })

  it('switches the browser chrome colour with the theme', () => {
    const { result } = renderHook(() => useTheme({ premium: false }))
    act(() => result.current.set('light'))
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', THEME_COLOR.light)

    act(() => result.current.set('dark'))
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', THEME_COLOR.dark)
  })
})
