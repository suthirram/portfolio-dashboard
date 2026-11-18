import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../../lib/api/client'
import {
  regionDailyVolatility, regionPnLPct,
} from '../../features/history/historyShared'
import {
  assetCells, longMonthLabel, monthOptions, rowSource, shortDate, signedPercent, visibleAssets,
} from './historyCells'
import { linePath } from './Ui2MiniChart'

const row = (date: string, inr: { invested: number; current: number }, extra: Partial<HistoryRow> = {}): HistoryRow => ({
  date,
  regions: { INR: { ...inr, source: 'cron' } },
  totals: { invested_total: inr.invested, current_total: inr.current, pnl_pct: 0 },
  ...extra,
})

// Newest first, as the table and every classic helper read them.
const rows: HistoryRow[] = [
  row('2026-11-16', { invested: 1200, current: 1300 }, {
    holdings: [{ symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 650, price_date: '2026-11-16', current: 1300 }],
    dividends: { INR: { to_date: 40, on_day: 15 } },
    gold: { invested: 500, current: 520, pnl_pct: 4, volatility_pct: 1 },
  }),
  row('2026-11-15', { invested: 1000, current: 1350 }, {
    gold: { invested: 500, current: 515, pnl_pct: 3, volatility_pct: 0 },
  }),
]

describe('assetCells', () => {
  it('reuses the classic helpers for a currency group', () => {
    const cells = assetCells(rows, 0, 'INR')
    expect(cells.invested).toBe(1200)
    expect(cells.current).toBe(1300)
    expect(cells.volatility).toBe(regionDailyVolatility(rows, 0, 'INR'))
    expect(cells.pnlPct).toBe(regionPnLPct(rows[0], 'INR'))
    expect(cells.direction).toBe('down')
    expect(cells.newInvestment).toBe(true)
    expect(cells.dividendsToDate).toBe(40)
    expect(cells.dividendsOnDay).toBe(15)
    expect(cells.hasHoldings).toBe(true)
  })

  it('has no baseline on the oldest row', () => {
    const cells = assetCells(rows, 1, 'INR')
    expect(cells.direction).toBeNull()
    expect(cells.newInvestment).toBe(false)
    expect(cells.volatility).toBeNull()
    expect(cells.hasHoldings).toBe(false)
  })

  it('reads a currency missing from the row as zero, like the classic table', () => {
    const cells = assetCells(rows, 0, 'EUR')
    expect(cells.invested).toBe(0)
    expect(cells.current).toBe(0)
    expect(cells.dividendsToDate).toBeNull()
  })

  it('takes gold from the overlay, with no dividends and no breakdown', () => {
    const cells = assetCells(rows, 0, 'GOLD')
    expect(cells).toMatchObject({
      invested: 500, current: 520, volatility: 1, pnlPct: 4,
      direction: 'up', newInvestment: false, dividendsToDate: null, hasHoldings: false,
    })
  })

  it('marks the day gold first appears as a new investment, like a currency', () => {
    const firstGold = [
      row('2026-11-16', { invested: 1, current: 1 }, { gold: { invested: 500, current: 510, pnl_pct: 2, volatility_pct: 0 } }),
      row('2026-11-15', { invested: 1, current: 1 }),
    ]
    expect(assetCells(firstGold, 0, 'GOLD').newInvestment).toBe(true)
    // The oldest row has no prior row at all: no baseline, no tint.
    expect(assetCells(firstGold.slice(0, 1), 0, 'GOLD').newInvestment).toBe(false)
  })

  it('shows dashes for a day without gold', () => {
    const noGold = [row('2026-11-16', { invested: 1, current: 1 })]
    expect(assetCells(noGold, 0, 'GOLD')).toMatchObject({ invested: null, current: null, pnlPct: null, direction: null })
  })
})

describe('visibleAssets', () => {
  it('shows every group for All, gold only when present', () => {
    expect(visibleAssets('ALL', true)).toEqual(['INR', 'EUR', 'GOLD'])
    expect(visibleAssets('ALL', false)).toEqual(['INR', 'EUR'])
  })

  it('narrows to the chosen group', () => {
    expect(visibleAssets('EUR', true)).toEqual(['EUR'])
    expect(visibleAssets('GOLD', true)).toEqual(['GOLD'])
  })
})

describe('rowSource', () => {
  it('labels live, manual, mixed and cron rows', () => {
    expect(rowSource({ ...rows[0], tentative: true })).toBe('Not yet snapshotted')
    expect(rowSource(row('2026-11-01', { invested: 1, current: 1 }))).toBe('Daily snapshot')
    expect(rowSource({ ...rows[0], regions: { INR: { invested: 1, current: 1, source: 'manual' } } })).toBe('Manual record')
    expect(rowSource({
      ...rows[0],
      regions: { INR: { invested: 1, current: 1, source: 'manual' }, EUR: { invested: 1, current: 1, source: 'cron' } },
    })).toBe('Partly manual')
  })
})

describe('formatting', () => {
  it('writes the handoff short date and signed percentages', () => {
    expect(shortDate('2026-11-06')).toBe('06 Nov')
    expect(signedPercent(1.236)).toBe('+1.24%')
    expect(signedPercent(-1.01)).toBe('−1.01%')
    expect(signedPercent(0)).toBe('0.00%')
  })

  it('lists every month from January 2020 to the current month', () => {
    const options = monthOptions({ year: 2026, month0: 10 })
    expect(options[0]).toEqual({ year: 2020, month0: 0, label: 'January 2020' })
    expect(options[options.length - 1]).toEqual({ year: 2026, month0: 10, label: 'November 2026' })
    expect(options).toHaveLength(6 * 12 + 11)
    expect(longMonthLabel(2026, 1)).toBe('February 2026')
  })
})

describe('linePath', () => {
  it('lifts the pen over a missing day instead of drawing to zero', () => {
    const path = linePath([1, null, 3, 4], index => index * 10, value => value)
    expect(path).toBe('M0.0,1.0 M20.0,3.0 L30.0,4.0')
  })
})
