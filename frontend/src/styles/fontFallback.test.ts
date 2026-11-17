/// <reference types="node" />

// Fallback fonts take the primary font's x-height so the web-font swap does
// not shift layout (PD-058 Task 15).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('font fallback stability', () => {
  it('normalises the body font stack to the primary font', () => {
    const body = baseCss.match(/(?:^|\n)body\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(body).toContain('font-family: var(--brand-font-family);')
    expect(body).toContain('font-size-adjust: from-font;')
  })
})
