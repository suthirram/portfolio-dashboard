/// <reference types="node" />

// Native controls follow the app theme (PD-058 Task 9): every theme block
// declares its color-scheme on :root, index.html announces both schemes, and
// the browser-chrome theme-color tracks the active theme.
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { THEME_COLOR, __resetThemeChoiceForTests, useTheme } from '../lib/useTheme'

const tokensCss = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

const declarationsFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return tokensCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
}

describe('color-scheme per theme', () => {
  it.each([
    [':root', 'dark'],
    [':root[data-theme="cyberpunk"]', 'dark'],
    [':root[data-theme="light"]', 'light'],
  ])('%s uses the %s scheme', (selector, scheme) => {
    expect(declarationsFor(selector)).toContain(`color-scheme: ${scheme};`)
  })

  it('announces both schemes before the stylesheet loads', () => {
    expect(indexHtml).toContain('<meta name="color-scheme" content="dark light" />')
  })
})

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
