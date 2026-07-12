/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const componentsCss = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8')
const goldVaultAsset = resolve(process.cwd(), 'src/assets/gold-vault.webp')

const declarationsFor = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from<RegExpMatchArray>(componentsCss.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g')))
    .map(match => match[1])
    .join('\n')
}

describe('page art styles', () => {
  it('uses the gold vault photo layer for the gold page art', () => {
    const declarations = declarationsFor('.page-art-gold')

    expect(declarations).toContain("--page-art-photo: url('../assets/gold-vault.webp');")
    expect(declarations).toContain('--page-art-veil: 1;')
    expect(statSync(goldVaultAsset).isFile()).toBe(true)
  })
})
