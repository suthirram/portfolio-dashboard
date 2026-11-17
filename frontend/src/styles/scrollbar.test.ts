/// <reference types="node" />

// Scrollbars use the standard properties, with the WebKit pseudo-elements
// kept only as a fallback (PD-058 Task 10).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const fallbackStart = baseCss.indexOf('@supports not (scrollbar-color: auto)')

describe('scrollbar styling', () => {
  it('themes every scroller with scrollbar-color and scrollbar-width', () => {
    expect(baseCss).toMatch(/:root\s*\{[^}]*scrollbar-color:\s*var\(--scrollbar-thumb\) var\(--scrollbar-track\);/)
    expect(baseCss).toMatch(/\*\s*\{\s*scrollbar-width:\s*thin;\s*\}/)
  })

  it('keeps ::-webkit-scrollbar rules only inside the fallback block', () => {
    expect(fallbackStart).toBeGreaterThan(-1)
    expect(baseCss.indexOf('::-webkit-scrollbar')).toBeGreaterThan(fallbackStart)
    expect(baseCss.slice(fallbackStart)).toMatch(/\*\s*\{\s*scrollbar-width:\s*auto;\s*\}/)
  })
})
