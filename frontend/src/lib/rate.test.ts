import { describe, expect, it } from 'vitest'
import { formatRate, rateTone } from './rate'

describe('formatRate', () => {
  it('renders a fraction as a percentage and a missing rate as a dash', () => {
    expect(formatRate(0.1234)).toBe('12.34%')
    expect(formatRate(-0.0432)).toBe('-4.32%')
    expect(formatRate(null)).toBe('—')
    expect(formatRate(undefined)).toBe('—')
  })
})

describe('rateTone', () => {
  it('maps the sign to the table tone classes', () => {
    expect(rateTone(0.1)).toBe('pos')
    expect(rateTone(-0.1)).toBe('neg')
    expect(rateTone(0)).toBe('neutral')
    expect(rateTone(null)).toBe('')
  })
})
