import type { HoldingWithPrice } from '../../types'

export type HoldingView = 'active' | 'all' | 'nil'

export const isActive = (h: Pick<HoldingWithPrice, 'stocks_owned'>) =>
  (h.stocks_owned ?? 0) > 0

export const isNil = (h: Pick<HoldingWithPrice, 'stocks_owned'>) =>
  (h.stocks_owned ?? 0) === 0

export function filterByView<T extends Pick<HoldingWithPrice, 'stocks_owned'>>(
  holdings: T[] | null | undefined,
  view: HoldingView,
): T[] {
  const all = holdings || []
  if (view === 'all') return all
  if (view === 'nil') return all.filter(isNil)
  return all.filter(isActive)
}

export function viewCounts(holdings: Pick<HoldingWithPrice, 'stocks_owned'>[] | null | undefined) {
  const all = holdings || []
  const active = all.filter(isActive).length
  return { active, nil: all.length - active, all: all.length }
}
