import { describe, expect, it } from 'vitest'
import {
  holdingPath,
  holdingsPath,
  isActingAs,
  pricesPath,
  summaryPath,
} from './actAsRouting'

describe('act-as path helpers', () => {
  it('hit the self endpoints when no userId is provided', () => {
    expect(holdingsPath()).toBe('/holdings')
    expect(holdingPath('h1')).toBe('/holdings/h1')
    expect(pricesPath()).toBe('/prices')
    expect(summaryPath()).toBe('/summary')
  })

  it('rewrite to /admin/users/:id/... when acting as another user', () => {
    expect(holdingsPath('u9')).toBe('/admin/users/u9/holdings')
    expect(holdingPath('h1', 'u9')).toBe('/admin/users/u9/holdings/h1')
    expect(pricesPath('u9')).toBe('/admin/users/u9/prices')
    expect(summaryPath('u9')).toBe('/admin/users/u9/summary')
  })

  it('treats empty / whitespace-only userId as no act-as', () => {
    expect(holdingsPath('')).toBe('/holdings')
    expect(holdingsPath('   ')).toBe('/holdings')
    expect(isActingAs('')).toBe(false)
    expect(isActingAs('   ')).toBe(false)
    expect(isActingAs(undefined)).toBe(false)
  })

  it('isActingAs returns true for a real id', () => {
    expect(isActingAs('u9')).toBe(true)
  })
})
