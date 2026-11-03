import { describe, expect, it } from 'vitest'
import { msUntilNextIstMidnight } from './useIstDay'

describe('msUntilNextIstMidnight', () => {
  it('counts to the next 00:00 IST (18:30 UTC)', () => {
    expect(msUntilNextIstMidnight(new Date('2026-06-30T18:00:00Z'))).toBe(30 * 60 * 1000)
    expect(msUntilNextIstMidnight(new Date('2026-06-30T18:30:00Z'))).toBe(24 * 3600 * 1000)
    expect(msUntilNextIstMidnight(new Date('2026-07-01T06:30:00Z'))).toBe(12 * 3600 * 1000)
  })
})
