import { describe, expect, it } from 'vitest'
import { parseDecimalInput } from './formNumbers'

describe('parseDecimalInput', () => {
  it('reads a single dot as decimal in decimal mode (fractional shares)', () => {
    // Regression: "88.924" was parsed as the grouped integer 88924 because a
    // 1-3 digit run before a 3-digit run looks like thousands grouping.
    expect(parseDecimalInput('88.924', { singleSeparator: 'decimal' })).toBe(88.924)
    expect(parseDecimalInput('2.500', { singleSeparator: 'decimal' })).toBe(2.5)
    expect(parseDecimalInput('1.234', { singleSeparator: 'decimal' })).toBe(1.234)
  })

  it('still treats a single dot as grouping in auto mode (money amounts)', () => {
    expect(parseDecimalInput('88.924')).toBe(88924)
  })

  it('handles plain and comma-decimal values in decimal mode', () => {
    expect(parseDecimalInput('100', { singleSeparator: 'decimal' })).toBe(100)
    expect(parseDecimalInput('88,924', { singleSeparator: 'decimal' })).toBe(88.924)
    expect(parseDecimalInput('', { singleSeparator: 'decimal' })).toBe(0)
  })
})
