import { describe, expect, it } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { sectorAllocation } from './sectorAllocationData'
import { MIN_NEIGHBOUR_HUE, assignSectorColors, hueDistance, sectorColorsByCurrency } from './sectorColors'
import { SECTOR_PALETTES, STATUS_HUES } from './sectorPalette'

const holding = (symbol: string, sector: string | null, value: number, overrides: Partial<HoldingWithPrice> = {}): HoldingWithPrice => ({
  id: symbol, symbol, script: symbol, currency: 'INR', type: 'stock', stocks_owned: 1, current_price: value,
  current_value: value, current_value_eur: value / 100, cost_price: 10000,
  classification: { symbol, status: 'resolved', source: 'user', sector }, ...overrides,
})

const YAHOO_SECTORS = ['Technology', 'Financial Services', 'Consumer Cyclical', 'Consumer Defensive', 'Energy',
  'Healthcare', 'Industrials', 'Basic Materials', 'Utilities', 'Communication Services', 'Real Estate']
const darkHue = new Map(SECTOR_PALETTES.dark.map(slot => [slot.hex, slot.hue]))

// Deterministic pseudo-random values, so failures reproduce.
function random(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
}

describe('sector colours', () => {
  it('gives an owner’s eight sectors eight different colours (the reported bug: they shared three)', () => {
    const rows = YAHOO_SECTORS.slice(0, 8).map((sector, index) => holding(`S${index}`, sector, 100 - index))
    const colors = sectorColorsByCurrency(rows, 'dark').get('INR')!
    expect(colors.size).toBe(8)
    expect(new Set(colors.values()).size).toBe(8)
  })

  it('keeps colours unique up to the 30-colour palette', () => {
    const rows = Array.from({ length: 30 }, (_, index) => holding(`S${index}`, `Sector ${index}`, 1000 - index))
    const colors = [...sectorColorsByCurrency(rows, 'dark').get('INR')!.values()]
    expect(new Set(colors).size).toBe(30)
  })

  it('gives the largest slice the most distinct colour first', () => {
    const rows = [holding('SMALL', 'Energy', 10), holding('BIG', 'Technology', 90)]
    expect(sectorColorsByCurrency(rows, 'dark').get('INR')!.get('sector:technology')).toBe(SECTOR_PALETTES.dark[0].hex)
  })

  it('never puts the same hue family next to itself in a pie, including the wrap-around and status slices', () => {
    const next = random(7)
    const statusKinds: Partial<HoldingWithPrice>[] = [{ type: 'etf' }, { type: 'mutual_fund' },
      { classification: { status: 'needs_review' } }]
    for (let round = 0; round < 200; round++) {
      const sectorCount = 2 + Math.floor(next() * 20)
      const rows = Array.from({ length: sectorCount }, (_, index) => holding(`S${index}`, `Sector ${index}`, 1 + next() * 1000))
      statusKinds.forEach((kind, index) => { if (next() < 0.5) rows.push(holding(`F${index}`, null, 1 + next() * 1000, kind)) })
      const colors = sectorColorsByCurrency(rows, 'dark').get('INR')!
      const slices = sectorAllocation(rows, 'INR').buckets
      const hueOf = (key: string) => key.startsWith('sector:') ? darkHue.get(colors.get(key)!)! : STATUS_HUES.dark[key]
      slices.forEach((slice, index) => {
        const neighbour = slices[(index + 1) % slices.length]
        if (slices.length < 3 && index === slices.length - 1) return
        if (!slice.key.startsWith('sector:') && !neighbour.key.startsWith('sector:')) return
        const [left, right] = [hueOf(slice.key), hueOf(neighbour.key)]
        if (left === null || right === null) return
        expect(hueDistance(left, right), `${slice.label} next to ${neighbour.label}, round ${round}`).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_HUE)
      })
    }
  })

  it('scopes colours to each currency, and covers sectors that have no pie slice', () => {
    const rows = [holding('TCS', 'Technology', 50), holding('SAP', 'Technology', 50, { currency: 'EUR', current_value_eur: 50 }),
      holding('OLD', 'Energy', 0, { stocks_owned: 0, current_value: 0 })]
    const byCurrency = sectorColorsByCurrency(rows, 'dark')
    expect(byCurrency.get('INR')!.get('sector:technology')).toBeDefined()
    expect(byCurrency.get('EUR')!.get('sector:technology')).toBeDefined()
    // Energy is closed (no slice) but still gets a colour of its own in INR.
    expect(byCurrency.get('INR')!.get('sector:energy')).not.toBe(byCurrency.get('INR')!.get('sector:technology'))
  })

  it('matches sector labels case-insensitively', () => {
    const colors = sectorColorsByCurrency([holding('A', 'Technology', 60), holding('B', 'technology', 40)], 'dark').get('INR')!
    expect(colors.size).toBe(1)
  })

  it('uses the active theme’s palette', () => {
    const rows = [holding('TCS', 'Technology', 50)]
    expect(sectorColorsByCurrency(rows, 'light').get('INR')!.get('sector:technology')).toBe(SECTOR_PALETTES.light[0].hex)
    expect(sectorColorsByCurrency(rows, 'cyberpunk').get('INR')!.get('sector:technology')).toBe(SECTOR_PALETTES.cyberpunk[0].hex)
  })

  it('keeps fixed-colour buckets out of the sector map', () => {
    const colors = assignSectorColors(['sector:a', 'etf', 'sector:b'], 3, SECTOR_PALETTES.dark, STATUS_HUES.dark)
    expect([...colors.keys()]).toEqual(['sector:a', 'sector:b'])
  })
})

describe('sector palettes', () => {
  it('have thirty distinct colours per theme', () => {
    for (const slots of Object.values(SECTOR_PALETTES)) {
      expect(slots).toHaveLength(30)
      expect(new Set(slots.map(slot => slot.hex)).size).toBe(30)
    }
  })
})
