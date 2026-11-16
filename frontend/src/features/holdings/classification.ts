import type { Holding } from '../../types'
import type { CurrencyCode } from './groupByCurrency'

export interface ClassificationBucket { key: string; label: string; color: string }
export interface SectorSelection { currency: CurrencyCode; key: string }
type ClassifiedHolding = Pick<Holding, 'symbol' | 'type' | 'classification'>
// A sector's colour is assigned per currency by sectorColors.ts; this neutral
// fallback only shows where no colour map is supplied.
const SECTOR_FALLBACK_COLOR = 'var(--text-secondary)'
const canonical = (symbol?: string | null) => (symbol ?? '').trim().toUpperCase()
const cleanLabel = (label: string) => label.trim().replace(/\s+/g, ' ')

export function classificationBucket(holding: ClassifiedHolding): ClassificationBucket {
  const classification = holding.classification
  if (!classification || classification.status !== 'resolved' || !classification.symbol ||
      canonical(classification.symbol) !== canonical(holding.symbol)) {
    return { key: 'needs_review', label: 'Needs review', color: 'var(--yellow)' }
  }
  if (holding.type === 'etf') return { key: 'etf', label: 'ETF', color: 'var(--blue)' }
  if (holding.type === 'mutual_fund') return { key: 'mutual_fund', label: 'Mutual fund', color: 'var(--purple)' }
  const label = cleanLabel(classification.sector ?? '')
  if (!label) return { key: 'unclassified', label: 'Unclassified stock', color: 'var(--text-muted)' }
  return { key: `sector:${label.toLowerCase()}`, label, color: SECTOR_FALLBACK_COLOR }
}

export function groupBySector<T extends ClassifiedHolding>(holdings: T[]): (ClassificationBucket & { holdings: T[] })[] {
  const groups = new Map<string, ClassificationBucket & { holdings: T[] }>()
  for (const holding of holdings) {
    const bucket = classificationBucket(holding)
    const group = groups.get(bucket.key)
    if (group) group.holdings.push(holding)
    else groups.set(bucket.key, { ...bucket, holdings: [holding] })
  }
  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label))
}

export function ownerSectorLabels(holdings: ClassifiedHolding[]): string[] {
  return groupBySector(holdings).filter(group => group.key.startsWith('sector:')).map(group => group.label)
}

export function sectorSectionId(currency: CurrencyCode, bucketKey: string): string {
  return `sector-${currency}-${encodeURIComponent(bucketKey)}`
}
