import { describe, expect, it } from 'vitest'
import { parseTradeCsv } from './tradeCsv'

// Lines from the owner's Groww export (tab-separated, as pasted), including
// both date shapes the column mixes.
const HEADER = 'Stock name\tSymbol\tISIN\tType\tQuantity\tValue\tExchange\tExchange Order Id\tExecution date and time\tOrder status'
const file = (...lines: string[]) => [HEADER, ...lines].join('\n') + '\n'

describe('parseTradeCsv', () => {
  it('reads both date shapes day-first, with the time when given', () => {
    const parsed = parseTradeCsv(file(
      'KALYAN JEWELLERS IND LTD\tKALYANKJIL\tINE303R01014\tBUY\t3\t2010\tNSE\t1200000000136474\t1/11/2024\tExecuted',
      'VISHAL MEGA MART LIMITED\tVMM\tINE01EA01019\tSELL\t190\t20896.2\tNSE\t1.3E+15\t19-12-2024 10:11 AM\tExecuted',
    ), '2026-11-03')
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toEqual([
      { line: 2, date: '2024-11-01', symbol: 'KALYANKJIL', stock_name: 'KALYAN JEWELLERS IND LTD', exchange: 'NSE', type: 'buy', quantity: 3, amount: 2010, isin: 'INE303R01014' },
      { line: 3, date: '2024-12-19', symbol: 'VMM', stock_name: 'VISHAL MEGA MART LIMITED', exchange: 'NSE', type: 'sell', quantity: 190, amount: 20896.2, isin: 'INE01EA01019' },
    ])
  })

  it('reads a comma-separated export the same way', () => {
    const parsed = parseTradeCsv('Stock name,Symbol,Type,Quantity,Value,Exchange,Execution date and time\nITC LTD,ITC,BUY,1,427,NSE,10/2/2025\n', '2026-11-03')
    expect(parsed.rows[0]).toMatchObject({ date: '2025-02-10', symbol: 'ITC', quantity: 1, amount: 427 })
  })

  it('skips orders that did not execute, and rejects bad lines with the reason', () => {
    const parsed = parseTradeCsv(file(
      'ITC LTD\tITC\tINE154A01025\tBUY\t1\t400\tNSE\t1\t7/4/2025\tCancelled',
      'ITC LTD\tITC\tINE154A01025\tHOLD\t1\t400\tNYSE\t1\t31/02/2025\tExecuted',
      'ITC LTD\tITC\tINE154A01025\tBUY\t1\t400\tNSE\t1\t4/12/2026\tExecuted',
    ), '2026-11-03')
    expect(parsed.skipped).toEqual([{ line: 2, reason: 'Order status is Cancelled' }])
    expect(parsed.errors.map(error => error.line)).toEqual([3, 4])
    expect(parsed.errors[0].reason).toContain('Date "31/02/2025" is not a DD/MM/YYYY date')
    expect(parsed.errors[0].reason).toContain('Type "HOLD" is not BUY or SELL')
    expect(parsed.errors[0].reason).toContain('Exchange "NYSE" is not NSE or BSE')
    expect(parsed.errors[1].reason).toBe('Date is in the future')
    expect(parsed.total).toBe(3)
  })

  it('names the missing columns', () => {
    const parsed = parseTradeCsv('Symbol,Type\nITC,BUY\n', '2026-11-03')
    expect(parsed.errors[0].reason).toMatch(/^Missing column\(s\): quantity, value, exchange, execution date and time/)
  })
})
