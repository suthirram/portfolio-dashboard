import type { HistoryRow } from '../../lib/api/client'

// historyRow builds a cron row from per-currency [invested, current] pairs
// and an optional gold [invested, current].
export function historyRow(date: string, regions: Record<string, [number, number]>, gold?: [number, number]): HistoryRow {
  return {
    date,
    regions: Object.fromEntries(Object.entries(regions).map(([currency, [invested, current]]) =>
      [currency, { invested, current, source: 'cron' }])),
    totals: { invested_total: 0, current_total: 0, pnl_pct: null },
    gold: gold && { invested: gold[0], current: gold[1], volatility_pct: 0, pnl_pct: null },
  }
}
