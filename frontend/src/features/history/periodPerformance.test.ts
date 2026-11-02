import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../../lib/api/client'
import { periodPerformance } from './historyShared'

// historyRow builds a cron row from per-currency [invested, current] pairs
// and an optional gold [invested, current].
function historyRow(date: string, regions: Record<string, [number, number]>, gold?: [number, number]): HistoryRow {
  return {
    date,
    regions: Object.fromEntries(Object.entries(regions).map(([currency, [invested, current]]) =>
      [currency, { invested, current, source: 'cron' }])),
    totals: { invested_total: 0, current_total: 0, pnl_pct: null },
    gold: gold && { invested: gold[0], current: gold[1], volatility_pct: 0, pnl_pct: null },
  }
}

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
        openingPnlPct: 23.44, closingPnlPct: 24.40, pnlChangePp: 0.96, performancePct: 1.20 },
      { column: 'EUR', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 19.75, closingPnlPct: 15.68, pnlChangePp: -4.07, performancePct: -2.52 },
      { column: 'GOLD', openingDate: '2026-09-30', closingDate: '2026-10-30', closingTentative: false,
        openingPnlPct: 37.79, closingPnlPct: 31.05, pnlChangePp: -6.74, performancePct: -4.89 },
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

  it('leaves a column out when it has fewer than two rows with money invested', () => {
    const rows = [
      historyRow('2026-09-30', { INR: [100, 110], EUR: [0, 0] }),
      historyRow('2026-10-30', { INR: [100, 120], EUR: [50, 55] }),
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

  it('flags a closing row that is the live, unsnapshotted day', () => {
    const live = { ...historyRow('2026-10-31', { INR: [100, 120] }), tentative: true }
    const [inr] = periodPerformance([historyRow('2026-09-30', { INR: [100, 110] }), live], '2026-10-01')
    expect(inr.closingTentative).toBe(true)
  })
})
