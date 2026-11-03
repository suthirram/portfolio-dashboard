import { describe, expect, it } from 'vitest'
import { parseCsv, sniffDelimiter } from './csv'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and blank lines', () => {
    expect(parseCsv('﻿a,"1,250.50",c\r\n\r\n"he said ""hi""",x\n')).toEqual([
      ['a', '1,250.50', 'c'], [''], ['he said "hi"', 'x'],
    ])
  })
  it('keeps a final line without newline', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
  })
  it('reads a tab-separated file, keeping commas inside cells', () => {
    expect(parseCsv('Stock name\tValue\nHCL TECHNOLOGIES LTD\t1,777\n')).toEqual([
      ['Stock name', 'Value'], ['HCL TECHNOLOGIES LTD', '1,777'],
    ])
  })
})

describe('sniffDelimiter', () => {
  it('picks the separator the header uses most', () => {
    expect(sniffDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(sniffDelimiter('\nStock name\tSymbol\tType\n')).toBe('\t')
    expect(sniffDelimiter('a;b;c')).toBe(';')
    expect(sniffDelimiter('single')).toBe(',')
  })
})
