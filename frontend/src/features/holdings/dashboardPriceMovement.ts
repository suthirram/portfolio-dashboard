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

export function priceMovementKey(h: PriceKeyInput): string {
  return [norm(h.symbol), (h.script ?? '').trim(), norm(h.currency)].join('|')
}

export function attachPreviousClosePrices(
  holdings: HoldingWithPrice[],
  previousHoldings: HistoryHolding[] | null | undefined,
): HoldingWithPreviousClose[] {
  if (!previousHoldings?.length) return holdings

  const closeByKey = new Map(
    previousHoldings.map(h => [priceMovementKey(h), h.close_price]),
  )

  return holdings.map(h => {
    const previous = closeByKey.get(priceMovementKey(h))
    return previous === undefined ? h : { ...h, previous_close_price: previous }
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
