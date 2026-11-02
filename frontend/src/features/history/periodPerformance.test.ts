import { describe, expect, it } from 'vitest'
import { monthlyInvestment, periodPerformance } from './historyShared'
import { historyRow } from './historyTestRows'

// The owner's October 2026 sheet: 30 Sep (the latest row before October,
// which include_previous loads), a mid-month row, and 30 Oct.
const october = [
  historyRow('2026-09-30', { INR: [880021.32, 1086274.39], EUR: [7064.13, 8459.51] }, [716420, 987120]),
  historyRow('2026-10-15', { INR: [885419.70, 1104496.26], EUR: [7308.82, 8726.46] }, [716420, 973080]),
  historyRow('2026-10-30', { INR: [898847.70, 1118139.13], EUR: [7540.05, 8722.36] }, [716420, 938880]),
]

describe('periodPerformance', () => {
  it("reproduces the owner's October table for every column", () => {
    expect(periodPerformance(october, '2026-10-01')).toEqual([
      { column: 'INR', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 23.44, closingPnlPct: 24.40, pnlChangePp: 0.96, moneyInvested: 18826.38, performancePct: 1.20 },
      { column: 'EUR', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 19.75, closingPnlPct: 15.68, pnlChangePp: -4.07, moneyInvested: 475.92, performancePct: -2.52 },
      { column: 'GOLD', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 37.79, closingPnlPct: 31.05, pnlChangePp: -6.74, moneyInvested: 0, performancePct: -4.89 },
    ])
  })

  it('does not depend on the order the rows arrive in', () => {
    expect(periodPerformance([...october].reverse(), '2026-10-01'))
      .toEqual(periodPerformance(october, '2026-10-01'))
  })

  it("opens on the month's first row when nothing comes before it", () => {
    const [inr] = periodPerformance(october.slice(1), '2026-10-01')
    expect(inr).toMatchObject({ column: 'INR', openingDate: '2026-10-15', closingDate: '2026-10-30' })
  })

  // The owner's June 2025: EUR is empty on 01-06 and first invested on 30-06,
  // so it opens from zero rather than being left out.
  it('opens a column from zero when it was empty at the start of the month', () => {
    const rows = [
      historyRow('2025-06-01', { INR: [564361.86, 717252.59] }),
      historyRow('2025-06-30', { INR: [565721.16, 733476.39], EUR: [599.58, 626.95] }),
    ]
    const eur = periodPerformance(rows, '2025-06-01').find(perf => perf.column === 'EUR')
    expect(eur).toEqual({
      column: 'EUR', openingDate: '2025-06-01', closingDate: '2025-06-30', closingTentative: false,
      openingPnlPct: null, closingPnlPct: 4.56, pnlChangePp: null, moneyInvested: 599.58, performancePct: null,
    })
  })

  it('reports a column sold out during the month with a closing of zero', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 110], EUR: [50, 60] }),
      historyRow('2026-10-30', { INR: [100, 120] }),
    ]
    const eur = periodPerformance(rows, '2026-10-01').find(perf => perf.column === 'EUR')
    expect(eur).toMatchObject({ openingPnlPct: 20, closingPnlPct: null, pnlChangePp: null, moneyInvested: -50 })
  })

  it('leaves out a column empty at both ends, and everything for a single row', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 110], EUR: [0, 0] }),
      historyRow('2026-10-30', { INR: [100, 120], EUR: [0, 0] }),
    ]
    expect(periodPerformance(rows, '2026-10-01').map(perf => perf.column)).toEqual(['INR'])
    expect(periodPerformance(rows.slice(0, 1), '2026-10-01')).toEqual([])
  })

  it('reads a sale at an unchanged price as no performance', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 200] }),
      historyRow('2026-10-30', { INR: [50, 100] }),
    ]
    expect(periodPerformance(rows, '2026-10-01')[0].performancePct).toBe(0)
  })

  it('reports a sale as negative money invested', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 200] }),
      historyRow('2026-10-30', { INR: [50, 100] }),
    ]
    expect(periodPerformance(rows, '2026-10-01')[0].moneyInvested).toBe(-50)
  })

  it('flags a closing row that is the live, unsnapshotted day', () => {
    const live = { ...historyRow('2026-10-31', { INR: [100, 120] }), tentative: true }
    const [inr] = periodPerformance([historyRow('2026-09-30', { INR: [100, 110] }), live], '2026-10-01')
    expect(inr.closingTentative).toBe(true)
  })
})

describe('monthlyInvestment', () => {
  it("gives October 2026 the History card's investment delta and closing invested", () => {
    const months = monthlyInvestment(october, 2026, 'INR')
    expect(months).toHaveLength(12)
    expect(months[9]).toEqual({ month0: 9, delta: 18826.38, invested: 898847.70 })
  })

  it('shows a single-row first month as a line point only, and nothing without a row', () => {
    const months = monthlyInvestment(october, 2026, 'INR')
    expect(months[8]).toEqual({ month0: 8, delta: null, invested: 880021.32 }) // 30-09 only
    expect(months[0]).toEqual({ month0: 0, delta: null, invested: null })
    expect(months[10]).toEqual({ month0: 10, delta: null, invested: null })
  })

  it("chains each month's opening to the previous month's closing row", () => {
    const rows = [
      historyRow('2025-12-31', { INR: [100, 110] }), // the include_previous row
      historyRow('2026-01-31', { INR: [150, 160] }),
      historyRow('2026-03-15', { INR: [120, 150] }), // nothing in February
    ]
    const deltas = monthlyInvestment(rows, 2026, 'INR').map(month => month.delta)
    expect(deltas.slice(0, 3)).toEqual([50, null, -30])
  })

  // The owner's June 2025: EUR first invested on 30-06 (PRD-006 §5).
  it('opens a currency from zero in the month it is first bought', () => {
    const rows = [
      historyRow('2025-06-01', { INR: [564361.86, 717252.59] }),
      historyRow('2025-06-30', { INR: [565721.16, 733476.39], EUR: [599.58, 626.95] }),
    ]
    expect(monthlyInvestment(rows, 2025, 'EUR')[5]).toEqual({ month0: 5, delta: 599.58, invested: 599.58 })
  })

  it('reads gold off the overlay', () => {
    expect(monthlyInvestment(october, 2026, 'GOLD')[9]).toEqual({ month0: 9, delta: 0, invested: 716420 })
  })
})
