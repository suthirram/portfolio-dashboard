/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { modalBackdrop, modalCard } from '../features/history/historyShared'

const componentsCss = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Declarations of the first rule whose selector list contains selector.
const declarationsFor = (selector: string) => {
  const rule = Array.from(componentsCss.matchAll(/([^{}]+)\{([^}]*)\}/g))
    .find(match => match[1].split(',').map(part => part.trim()).includes(selector) && /overscroll-behavior/.test(match[2]))
  return rule?.[2] ?? ''
}

describe('modal scroll containment', () => {
  it.each(['.modal-overlay', '.classification-overlay', '.palette-overlay'])(
    '%s is a scroll container that contains overscroll', selector => {
      const declarations = declarationsFor(selector)
      expect(declarations).toContain('overflow: auto;')
      expect(declarations).toContain('overscroll-behavior: contain;')
    })

  it.each(['.modal-card', '.classification-card'])('%s contains overscroll', selector => {
    expect(declarationsFor(selector)).toContain('overscroll-behavior: contain;')
  })

  it('applies the same containment to the shared inline modal styles', () => {
    expect(modalBackdrop).toMatchObject({ overflow: 'auto', overscrollBehavior: 'contain' })
    expect(modalCard).toMatchObject({ overscrollBehavior: 'contain' })
  })
})
