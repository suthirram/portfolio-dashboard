/// <reference types="node" />

// The keyboard focus ring survives Forced Colors Mode (PD-058 Task 13): a
// transparent outline backs the box-shadow ring, and forced-colors mode
// repaints it in a system colour even over inline `outline: none`.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('focus ring', () => {
  it('backs the shadow ring with a transparent outline', () => {
    const rule = baseCss.match(/(?:^|\n):focus-visible\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toContain('outline: 2px solid transparent;')
    expect(rule).toContain('box-shadow: var(--ring);')
  })

  it('paints a system-colour outline in forced-colors mode', () => {
    expect(baseCss).toMatch(/@media \(forced-colors: active\)\s*\{\s*:focus-visible\s*\{\s*outline: 2px solid CanvasText !important;/)
  })
})
