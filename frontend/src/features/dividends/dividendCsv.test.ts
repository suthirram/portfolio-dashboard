import { describe, expect, it } from 'vitest'
import { parseDividendCsv } from './dividendCsv'

const TODAY = '2026-10-30'

describe('parseDividendCsv', () => {
  it('reads the owner sheet, keeping in-sheet repeats', () => {
    const csv = 'Date,Share Name,Dividend,CUMULATIVE\n1/1/2020,TCS,300,300\n1/1/2020,TCS,300,600\n15/03/2020,Jio Platforms,"₹1,250.50","1,850.50"\n'
    const r = parseDividendCsv(csv, TODAY)
    expect(r.errors).toEqual([])
    expect(r.total).toBe(3)
    expect(r.rows).toEqual([
      { line: 2, date: '2020-01-01', share_name: 'TCS', amount: 300, cumulative: 300 },
      { line: 3, date: '2020-01-01', share_name: 'TCS', amount: 300, cumulative: 600 },
      { line: 4, date: '2020-03-15', share_name: 'Jio Platforms', amount: 1250.5, cumulative: 1850.5 },
    ])
  })
  it('reads European-style amounts on an EUR sheet', () => {
    const csv = 'Date,Share Name,Dividend,CUMULATIVE\n10/02/2020,SAP,"1.250,50","1.250,50"\n11/02/2020,SAP,"40,5","1.291,00"\n'
    const r = parseDividendCsv(csv, TODAY)
    expect(r.errors).toEqual([])
    expect(r.rows.map(x => [x.amount, x.cumulative])).toEqual([[1250.5, 1250.5], [40.5, 1291]])
  })
  it('accepts any header case and order, CUMULATIVE optional', () => {
    const r = parseDividendCsv(' dividend , SHARE  NAME,date\n300,TCS,1/2/2020\n', TODAY)
    expect(r.rows).toEqual([{ line: 2, date: '2020-02-01', share_name: 'TCS', amount: 300 }])
  })
  it('reports a missing column once', () => {
    const r = parseDividendCsv('Date,Share Name\n1/1/2020,TCS\n', TODAY)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0].reason).toMatch(/Missing column\(s\): dividend/)
  })
  it('flags bad lines with true line numbers and does not send them', () => {
    const csv = 'Date,Share Name,Dividend\n\n31/02/2021,ITC,410\n2/6/2022,HDFC,abc\n3/7/2022,,10\n1/1/2099,TCS,5\n'
    const r = parseDividendCsv(csv, TODAY)
    expect(r.rows).toEqual([])
    expect(r.total).toBe(4)
    expect(r.errors.map(e => e.line)).toEqual([3, 4, 5, 6])
    expect(r.errors[3].reason).toBe('Date is in the future')
  })
})
