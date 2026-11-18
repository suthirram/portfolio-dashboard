/// <reference types="node" />

// The frontend targets ES2023 library typings so copying array methods
// (toSorted / toReversed) are available, and the sort helpers built on them
// never reorder the caller's array (PD-058 Task 16).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TransactionWithHolding } from '../types'
import { sortRows } from '../features/transactions/transactionFilters'

describe('ES2023 copying array methods', () => {
  it('types the app against the ES2023 library', () => {
    const tsconfig = readFileSync(resolve(process.cwd(), 'tsconfig.json'), 'utf8')
    expect(tsconfig).toMatch(/"lib":\s*\[\s*"ES2023"/)
  })

  it('sorts a copy and leaves the fetched array in place', () => {
    const rows = [
      { id: 'older', date: '2026-01-01', amount: 1 },
      { id: 'newer', date: '2026-02-01', amount: 2 },
    ] as TransactionWithHolding[]
    const sorted = sortRows(rows, { key: 'date', dir: 'desc' })
    expect(sorted.map(row => row.id)).toEqual(['newer', 'older'])
    expect(rows.map(row => row.id)).toEqual(['older', 'newer'])
  })
})
