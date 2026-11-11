import type { HistoryHolding } from '../../lib/api/client'
import type { HoldingWithPrice } from '../../types'

export type HoldingWithPreviousClose = HoldingWithPrice & {
  previous_close_price?: number
}

type PriceKeyInput = {
  symbol?: string | null
  script?: string | null
  currency?: string | null
}

const norm = (value: string | null | undefined) => (value ?? '').trim().toUpperCase()

export function priceMovementKey(keyed: PriceKeyInput): string {
  return [norm(keyed.symbol), (keyed.script ?? '').trim(), norm(keyed.currency)].join('|')
}

export function attachPreviousClosePrices(
  holdings: HoldingWithPrice[],
  previousHoldings: HistoryHolding[] | null | undefined,
): HoldingWithPreviousClose[] {
  if (!previousHoldings?.length) return holdings

  const closeByKey = new Map(
    previousHoldings.map(previousHolding => [priceMovementKey(previousHolding), previousHolding.close_price]),
  )

  return holdings.map(holding => {
    const previous = closeByKey.get(priceMovementKey(holding))
    return previous === undefined ? holding : { ...holding, previous_close_price: previous }
  })
}

export type PriceMovementTone = 'pos' | 'neg'

export interface PriceMovement {
  change: number
  pct: number
  tone: PriceMovementTone | null
}

export function priceMovement(
  current: number | null | undefined,
  previous: number | null | undefined,
): PriceMovement | null {
  if (current === undefined || current === null || current <= 0) return null
  if (previous === undefined || previous === null || previous <= 0) return null

  const change = current - previous
  return {
    change,
    pct: (change / previous) * 100,
    tone: change > 0 ? 'pos' : change < 0 ? 'neg' : null,
  }
}

export function priceMovementTone(
  current: number | null | undefined,
  previous: number | null | undefined,
): PriceMovementTone | null {
  return priceMovement(current, previous)?.tone ?? null
}

// A holding's daily movement against its previous close: the History
// snapshot's close when one matched (attachPreviousClosePrices lays it over
// any other value), else the close the prices response carries. There is no
// purchase-cost fallback: current − average cost is the lifetime gain, not
// the day's, so a holding without a previous close has no movement.
export function holdingMovement(holding: HoldingWithPreviousClose): PriceMovement | null {
  return priceMovement(holding.current_price, holding.previous_close_price)
}

// One holding's day gain: its movement × the shares held now. null when the
// holding has no previous close or no live price.
export function holdingDayGain(holding: HoldingWithPreviousClose): number | null {
  const movement = holdingMovement(holding)
  return movement === null ? null : movement.change * (holding.stocks_owned ?? 0)
}

// Sum of the day gains of a group of holdings (one currency). Returns null
// when any active holding has no day gain (partial = unreliable total) or
// the group holds nothing, so the caller shows no figure rather than a wrong one.
export function computeGroupDayGain(holdings: HoldingWithPreviousClose[]): number | null {
  let sum: number | null = null
  for (const holding of holdings) {
    if ((holding.stocks_owned ?? 0) <= 0) continue
    const gain = holdingDayGain(holding)
    if (gain === null) return null
    sum = (sum ?? 0) + gain
  }
  return sum
}
