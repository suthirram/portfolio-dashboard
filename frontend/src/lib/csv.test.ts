import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
    expect(parseCsv('﻿a,"1,250.50",c\r\n\r\n"he said ""hi""",x\n')).toEqual([
      ['a', '1,250.50', 'c'], [''], ['he said "hi"', 'x'],
    ])
  })
  it('keeps a final line without newline', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
  })
})
