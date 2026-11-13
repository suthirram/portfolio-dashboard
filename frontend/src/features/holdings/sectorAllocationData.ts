import type { HoldingWithPrice } from '../../types'
import type { SupportedCurrency } from '../../lib/currency'
import { groupBySector, type ClassificationBucket } from './classification'
import { groupByCurrency } from './groupByCurrency'
import { filterByView } from './holdingViews'
import { nativeView } from './currencyTotals'

export interface SectorAllocationBucket extends ClassificationBucket {
  value: number
  count: number
  share: number
}

/** Native current values only; missing quotes never fall back to invested cost. */
export function sectorAllocation(holdings: HoldingWithPrice[], currency: SupportedCurrency) {
  const currencies = groupByCurrency(filterByView(holdings, 'active'))
  const rows = currencies.find(group => group.currency === currency)?.holdings ?? []
  const currentValue = (holding: HoldingWithPrice) => {
    const value = nativeView(currency, holding.current_value, holding.current_value_eur).primary
    if (holding.price_error || !Number.isFinite(holding.current_price) || (holding.current_price ?? 0) <= 0 ||
        value == null || !Number.isFinite(value) || value < 0) return null
    return value
  }
  let unpriced = 0
  for (const holding of rows) if (currentValue(holding) === null) unpriced++
  const groups = groupBySector(rows).map(group => ({
    key: group.key, label: group.label, color: group.color, count: group.holdings.length,
    value: group.holdings.reduce((sum, holding) => sum + (currentValue(holding) ?? 0), 0),
  })).filter(group => group.value > 0)
  const total = groups.reduce((sum, group) => sum + group.value, 0)
  const buckets: SectorAllocationBucket[] = groups.map(group => ({ ...group, share: group.value / total * 100 }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
  return { buckets, total, unpriced, unsupported: currencies.find(group => group.currency === 'OTHER')?.holdings.length ?? 0 }
}
