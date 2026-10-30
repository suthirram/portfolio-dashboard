import { describe, expect, it } from 'vitest'
import {
  dividendsPath,
  holdingPath,
  holdingTransactionsPath,
  holdingsPath,
  isActingAs,
  pricesPath,
  summaryPath,
  transactionPath,
  transactionsPath,
} from './actAsRouting'

describe('act-as path helpers', () => {
  it('hit the self endpoints when no userId is provided', () => {
    expect(holdingsPath()).toBe('/holdings')
    expect(holdingPath('h1')).toBe('/holdings/h1')
    expect(pricesPath()).toBe('/prices')
    expect(summaryPath()).toBe('/summary')
    expect(transactionsPath()).toBe('/transactions')
  })

  it('rewrite to /admin/users/:id/... when acting as another user', () => {
    expect(holdingsPath('u9')).toBe('/admin/users/u9/holdings')
    expect(holdingPath('h1', 'u9')).toBe('/admin/users/u9/holdings/h1')
    expect(pricesPath('u9')).toBe('/admin/users/u9/prices')
    expect(summaryPath('u9')).toBe('/admin/users/u9/summary')
    expect(transactionsPath('u9')).toBe('/admin/users/u9/transactions')
  })

  it('treats empty / whitespace-only userId as no act-as', () => {
    expect(holdingsPath('')).toBe('/holdings')
    expect(holdingsPath('   ')).toBe('/holdings')
    expect(transactionsPath('   ')).toBe('/transactions')
    expect(isActingAs('')).toBe(false)
    expect(isActingAs('   ')).toBe(false)
    expect(isActingAs(undefined)).toBe(false)
  })

  it('isActingAs returns true for a real id', () => {
    expect(isActingAs('u9')).toBe(true)
  })
})

describe('dividend + ledger write paths', () => {
  it('maps own vs act-as', () => {
    expect(dividendsPath()).toBe('/dividends')
    expect(dividendsPath('u1')).toBe('/admin/users/u1/dividends')
    expect(holdingTransactionsPath('h1')).toBe('/holdings/h1/transactions')
    expect(holdingTransactionsPath('h1', 'u1')).toBe('/admin/users/u1/holdings/h1/transactions')
    expect(transactionPath('t1', ' ')).toBe('/transactions/t1')
    expect(transactionPath('t1', 'u1')).toBe('/admin/users/u1/transactions/t1')
  })
})
