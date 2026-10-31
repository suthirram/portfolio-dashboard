import { describe, expect, it } from 'vitest'
import { parseDecimalInput, parseMoneyCell, parseSeededDecimal } from './formNumbers'

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

describe('parseSeededDecimal', () => {
  it('returns an untouched API value as-is, never as a grouped integer', () => {
    expect(parseSeededDecimal('1.234', 1.234)).toBe(1.234)
    expect(parseSeededDecimal('1234', 1234)).toBe(1234)
  })

  it('parses an edited value with the usual rules', () => {
    expect(parseSeededDecimal('1.235', 1.234)).toBe(1235)
    expect(parseSeededDecimal('12,50', 1.234)).toBe(12.5)
    expect(parseSeededDecimal('300', undefined)).toBe(300)
  })
})

describe('parseMoneyCell', () => {
  it('reads both number styles and strips currency signs', () => {
    expect(parseMoneyCell('₹1,250.50')).toBe(1250.5)
    expect(parseMoneyCell('1.250,50')).toBe(1250.5)
    expect(parseMoneyCell('€ 40,5')).toBe(40.5)
    expect(parseMoneyCell('12,34,567.89')).toBe(1234567.89)
    expect(parseMoneyCell('')).toBe(0)
    expect(parseMoneyCell('abc')).toBeNaN()
  })
  it('reads a cell the same way as a typed amount', () => {
    for (const raw of ['1.250,50', '40,5', '1,250.50']) {
      expect(parseMoneyCell(raw)).toBe(parseDecimalInput(raw))
    }
  })
})
