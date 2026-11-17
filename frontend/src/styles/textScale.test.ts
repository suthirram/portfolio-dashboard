/// <reference types="node" />

// Stylesheet text follows the OS text-size setting (PD-058 Task 14): the
// page opts in with <meta name="text-scale">, never overrides the root
// font-size, and sizes stylesheet text in rem.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const stylesheets = ['src/styles/base.css', 'src/styles/components.css', 'src/styles/glass.css', 'src/styles/tokens.css', 'src/index.css']

describe('OS text scaling', () => {
  it('opts the page into OS text scaling', () => {
    expect(read('index.html')).toContain('<meta name="text-scale" content="scale" />')
  })

  it.each(stylesheets)('%s sizes text in rem, not px', path => {
    expect(read(path)).not.toMatch(/font-size:\s*[0-9.]+px/)
  })

  it.each(stylesheets)('%s leaves the root font-size to the browser', path => {
    const rootRules = Array.from(read(path).matchAll(/(?:^|\n)\s*(?:html|:root)\s*\{([^}]*)\}/g)).map(match => match[1])
    for (const rule of rootRules) expect(rule).not.toMatch(/(^|[\s;])font-size\s*:/)
  })
})
