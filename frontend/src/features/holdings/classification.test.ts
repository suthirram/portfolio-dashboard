import { describe, expect, it } from 'vitest'
import { classificationBucket, groupBySector, ownerSectorLabels, sectorColor } from './classification'
import type { Holding } from '../../types'

const stock = (sector: string | null): Holding => ({ currency: 'INR', symbol: 'TCS.NS', type: 'stock',
  classification: { symbol: 'TCS.NS', status: 'resolved', source: 'user', sector } })

describe('classification buckets', () => {
  it('keeps legacy, pending and stale metadata in review', () => {
    expect(classificationBucket({}).key).toBe('needs_review')
    expect(classificationBucket({ ...stock('Technology'), symbol: 'ITC.NS' }).key).toBe('needs_review')
    expect(classificationBucket({ ...stock('Technology'), classification: { status: 'needs_review' } }).key).toBe('needs_review')
  })
  it('keeps confirmed funds and unclassified stocks separate from labels with the same names', () => {
    expect(classificationBucket({ ...stock(null), type: 'etf' }).key).toBe('etf')
    expect(classificationBucket({ ...stock(null), type: 'mutual_fund' }).key).toBe('mutual_fund')
    expect(classificationBucket(stock(null)).key).toBe('unclassified')
    expect(classificationBucket(stock('ETF')).key).toBe('sector:etf')
  })
  it('groups case-insensitively and derives suggestions only from the supplied owner', () => {
    const holdings = [stock('Technology'), stock('technology'), stock('FMCG'), stock(null), {}]
    expect(groupBySector(holdings).find(group => group.key === 'sector:technology')?.holdings).toHaveLength(2)
    expect(ownerSectorLabels(holdings)).toEqual(['FMCG', 'Technology'])
    expect(ownerSectorLabels([stock('Banking')])).toEqual(['Banking'])
    expect(sectorColor('Technology')).toBe(sectorColor('technology'))
  })
})
