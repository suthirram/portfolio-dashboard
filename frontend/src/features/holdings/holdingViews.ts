export type HoldingView = 'active' | 'all' | 'nil'

type Qty = { stocks_owned?: number | null }

// "active" = strictly positive quantity. Zero, null, and undefined are all
// treated as nil (fully-exited or never-set) so the two views partition the
// list with no overlap or gap.
export const isActive = (h: Qty) => (h.stocks_owned ?? 0) > 0
export const isNil = (h: Qty) => (h.stocks_owned ?? 0) === 0

export function filterByView<T extends Qty>(
  holdings: T[] | null | undefined,
  view: HoldingView,
): T[] {
  const all = holdings || []
  if (view === 'all') return [...all]
  if (view === 'nil') return all.filter(isNil)
  return all.filter(isActive)
}

export function viewCounts(holdings: Qty[] | null | undefined) {
  const all = holdings || []
  const active = all.filter(isActive).length
  return { active, nil: all.length - active, all: all.length }
}
