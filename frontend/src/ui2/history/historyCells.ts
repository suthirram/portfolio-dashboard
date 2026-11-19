// The UI_2.0 History table's cell model (PD-059 slice 13). Every figure comes
// from the classic History helpers, so both interfaces show the same numbers;
// this module only shapes them per asset group for the handoff's layout.
import type { HistoryRow } from '../../lib/api/client'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, MIN_YEAR, MONTHS, goldCurrentDirection, goldInvestedWentUp, holdingRegion,
  regionCurrentDirection, regionDailyVolatility, regionInvestedWentUp, regionPnLPct,
  type RegionKey,
} from '../../features/history/historyShared'

export type HistoryAsset = RegionKey | 'GOLD'
export type AssetFilter = 'ALL' | HistoryAsset
export type Direction = 'up' | 'down' | 'flat'

export const ASSET_LABELS: Record<HistoryAsset, string> = {
  INR: 'India · INR',
  EUR: 'Europe · EUR',
  GOLD: 'Gold · INR',
}

export const FILTER_LABELS: Record<AssetFilter, string> = {
  ALL: 'All assets',
  INR: 'INR',
  EUR: 'EUR',
  GOLD: 'Gold',
}

// Gold is valued in rupees, like the classic table's gold group.
export const ASSET_SYMBOL: Record<HistoryAsset, string> = {
  INR: CURRENCY_SYMBOL.INR,
  EUR: CURRENCY_SYMBOL.EUR,
  GOLD: CURRENCY_SYMBOL.INR,
}

// The legend wording for each P/L tint, read by screen readers as well.
export const DIRECTION_CUE: Record<Direction | 'none', string> = {
  up: '↑ Up',
  down: '↓ Down',
  flat: '＝ Unchanged',
  none: 'No baseline',
}

export const DIRECTION_TITLE: Record<Direction | 'none', string> = {
  up: 'Value increased versus prior day',
  down: 'Value decreased versus prior day',
  flat: 'Value unchanged versus prior day',
  none: 'No prior record to compare',
}

export interface AssetCells {
  // null = no gold position that day; a currency without a bucket reads 0,
  // exactly as the classic table shows it.
  invested: number | null
  current: number | null
  volatility: number | null
  pnlPct: number | null
  direction: Direction | null
  newInvestment: boolean
  // Dividends exist on the currency groups only (null for gold).
  dividendsToDate: number | null
  dividendsOnDay: number
  // The value opens the per-stock breakdown only when the day holds stock.
  hasHoldings: boolean
}

// assetCells computes one asset group's cells for newestFirst[index]; the
// row after it is the prior day, as every classic helper expects.
export function assetCells(newestFirst: HistoryRow[], index: number, asset: HistoryAsset): AssetCells {
  const row = newestFirst[index]
  const prev = newestFirst[index + 1]
  if (asset === 'GOLD') {
    const gold = row.gold
    return {
      invested: gold ? gold.invested : null,
      current: gold ? gold.current : null,
      volatility: gold ? gold.volatility_pct : null,
      pnlPct: gold ? gold.pnl_pct : null,
      direction: goldCurrentDirection(gold, prev?.gold),
      newInvestment: goldInvestedWentUp(newestFirst, index),
      dividendsToDate: null,
      dividendsOnDay: 0,
      hasHoldings: false,
    }
  }
  const bucket = row.regions[asset]
  const dividends = row.dividends?.[CURRENCY_BY_REGION[asset]]
  return {
    invested: bucket?.invested ?? 0,
    current: bucket?.current ?? 0,
    volatility: regionDailyVolatility(newestFirst, index, asset),
    pnlPct: regionPnLPct(row, asset),
    direction: regionCurrentDirection(newestFirst, index, asset),
    newInvestment: regionInvestedWentUp(newestFirst, index, asset),
    dividendsToDate: dividends ? dividends.to_date : null,
    dividendsOnDay: dividends ? dividends.on_day : 0,
    hasHoldings: !!row.holdings?.some(holding => holdingRegion(holding) === asset && holding.quantity > 0),
  }
}

// visibleAssets is the asset groups the table and charts show: the filter's
// one, or every group, gold only for a row set that carries a gold overlay.
export function visibleAssets(filter: AssetFilter, hasGold: boolean): HistoryAsset[] {
  const all: HistoryAsset[] = hasGold ? ['INR', 'EUR', 'GOLD'] : ['INR', 'EUR']
  return filter === 'ALL' ? all : all.filter(asset => asset === filter)
}

// rowSource labels the date cell the way the handoff does.
export function rowSource(row: HistoryRow): string {
  if (row.tentative) return 'Not yet snapshotted'
  const sources = new Set(Object.values(row.regions).map(snapshot => snapshot.source))
  if (sources.size === 1 && sources.has('manual')) return 'Manual record'
  if (sources.has('manual')) return 'Partly manual'
  return 'Daily snapshot'
}

// signedFixed renders a value to 2 dp with an explicit sign and a U+2212
// minus, like the handoff: "+1.24" / "−1.01" / "0.00".
export function signedFixed(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(2)}`
}

// signedPercent renders "+1.24%" / "−1.01%".
export function signedPercent(value: number): string {
  return `${signedFixed(value)}%`
}

export interface MonthOption {
  year: number
  month0: number
  label: string
}

// The handoff's select spells the month out ("November 2026").
const LONG_MONTH = new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' })

export function longMonthLabel(year: number, month0: number): string {
  return `${LONG_MONTH.format(new Date(Date.UTC(year, month0, 1)))} ${year}`
}

// monthOptions lists every month from January of MIN_YEAR to `latest`,
// oldest first, for the handoff's month select.
export function monthOptions(latest: { year: number; month0: number }): MonthOption[] {
  const options: MonthOption[] = []
  for (let year = MIN_YEAR; year <= latest.year; year++) {
    const lastMonth = year === latest.year ? latest.month0 : MONTHS.length - 1
    for (let month0 = 0; month0 <= lastMonth; month0++) {
      options.push({ year, month0, label: longMonthLabel(year, month0) })
    }
  }
  return options
}
