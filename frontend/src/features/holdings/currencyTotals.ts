import type { HoldingWithPrice } from '../../types'
import type { CurrencyCode } from './groupByCurrency'

export interface GroupTotals {
  cost: number
  costEur: number
  value: number
  valueEur: number
  unreal: number
  unrealEur: number
  real: number
  realEur: number
}

export const emptyTotals = (): GroupTotals => ({
  cost: 0, costEur: 0, value: 0, valueEur: 0,
  unreal: 0, unrealEur: 0, real: 0, realEur: 0,
})

type TotalRow = Pick<HoldingWithPrice,
  | 'cost_price' | 'cost_price_eur'
  | 'current_value' | 'current_value_eur'
  | 'unrealized_pnl' | 'unrealized_pnl_eur'
  | 'realized_pnl' | 'realized_pnl_eur'>

export function sumTotals(rows: TotalRow[] | null | undefined): GroupTotals {
  return (rows || []).reduce<GroupTotals>((acc, h) => {
    acc.cost += h.cost_price || 0
    acc.costEur += h.cost_price_eur || 0
    acc.value += h.current_value || 0
    acc.valueEur += h.current_value_eur || 0
    acc.unreal += h.unrealized_pnl || 0
    acc.unrealEur += h.unrealized_pnl_eur || 0
    acc.real += h.realized_pnl || 0
    acc.realEur += h.realized_pnl_eur || 0
    return acc
  }, emptyTotals())
}

// Pick the primary (native) and secondary (cross-currency) field from a totals
// pair. INR-native holdings use cost_price / EUR-native use cost_price_eur as
// primary; the other side becomes the secondary subscript on the card.
export function nativeView<P, E>(
  currency: CurrencyCode,
  inrField: P,
  eurField: E,
): { primary: P | E; secondary: P | E } {
  return currency === 'EUR'
    ? { primary: eurField, secondary: inrField }
    : { primary: inrField, secondary: eurField }
}

// Convenience for the symbol pair used by the card header.
export function nativeSymbols(currency: CurrencyCode): { native: string; foreign: string } {
  return currency === 'EUR'
    ? { native: '€', foreign: '₹' }
    : { native: '₹', foreign: '€' }
}
