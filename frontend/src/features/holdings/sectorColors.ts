import { createContext, useContext } from 'react'
import type { HoldingWithPrice } from '../../types'
import type { ThemeName } from '../../lib/useTheme'
import { groupBySector } from './classification'
import { groupByCurrency, type CurrencyCode } from './groupByCurrency'
import { sectorAllocation } from './sectorAllocationData'
import { SECTOR_PALETTES, STATUS_HUES, type SectorSlot } from './sectorPalette'

/** Sector bucket key → colour, for one currency. */
export type SectorColorMap = Map<string, string>

/** Neighbouring pie slices must differ in hue by at least this much (one hue family). */
export const MIN_NEIGHBOUR_HUE = 40

/** The current currency section's sector colours, read by badges inside its tables. */
export const SectorColorsContext = createContext<SectorColorMap | undefined>(undefined)

/** The colour for a classification bucket: its sector colour in this section, else the bucket's own. */
export function useSectorColor(bucket: { key: string; color: string }): string {
  return useContext(SectorColorsContext)?.get(bucket.key) ?? bucket.color
}

export function hueDistance(left: number, right: number): number {
  const difference = Math.abs(left - right) % 360
  return Math.min(difference, 360 - difference)
}

/**
 * Gives each sector key in `order` its own colour, taking palette slots most
 * distinct first. The first `pieLength` keys are the pie's slices in drawing
 * order: a sector there takes the earliest unused slot whose hue is at least
 * MIN_NEIGHBOUR_HUE from both slices beside it, counted around the circle (the
 * first and last slices touch), wherever that neighbour's hue is already known:
 * a fixed-colour slice always, a sector once assigned. Non-sector keys (Needs
 * review, ETF, Mutual fund, Unclassified) keep their own colours and only
 * constrain their neighbours. Colours repeat only past the palette's length.
 */
export function assignSectorColors(order: string[], pieLength: number, palette: SectorSlot[],
  statusHues: Record<string, number | null>): SectorColorMap {
  const colors: SectorColorMap = new Map()
  const hues = new Map<string, number | null>()
  const used = new Set<number>()
  const hueOf = (key: string | undefined) => key === undefined ? null
    : key.startsWith('sector:') ? hues.get(key) ?? null : statusHues[key] ?? null
  order.forEach((key, index) => {
    if (!key.startsWith('sector:') || colors.has(key)) return
    const neighbours = index < pieLength && pieLength > 1
      ? [hueOf(order[(index - 1 + pieLength) % pieLength]), hueOf(order[(index + 1) % pieLength])]
      : []
    const nearest = (slot: SectorSlot) => Math.min(360,
      ...neighbours.filter((hue): hue is number => hue !== null).map(hue => hueDistance(slot.hue, hue)))
    const free = palette.map((slot, slotIndex) => ({ slot, slotIndex })).filter(({ slotIndex }) => !used.has(slotIndex))
    const chosen = free.find(({ slot }) => nearest(slot) >= MIN_NEIGHBOUR_HUE)
      ?? free.reduce<typeof free[number] | undefined>((best, option) =>
        best === undefined || nearest(option.slot) > nearest(best.slot) ? option : best, undefined)
      ?? { slot: palette[colors.size % palette.length], slotIndex: -1 }
    if (chosen.slotIndex >= 0) used.add(chosen.slotIndex)
    colors.set(key, chosen.slot.hex)
    hues.set(key, chosen.slot.hue)
  })
  return colors
}

/**
 * Sector colours for each currency section (owner decision, 2026-11-16): the
 * currency's pie, its sector tables and its badges share one mapping, assigned
 * in pie order (largest priced value first) so the biggest sectors get the most
 * distinct colours and pie neighbours never share a hue family. Sectors with no
 * slice (closed or unpriced) follow alphabetically. Colours are not stable
 * across loads; they follow the portfolio.
 */
export function sectorColorsByCurrency(holdings: HoldingWithPrice[], theme: ThemeName): Map<CurrencyCode, SectorColorMap> {
  const result = new Map<CurrencyCode, SectorColorMap>()
  for (const group of groupByCurrency(holdings)) {
    const pie = group.currency === 'OTHER' ? [] : sectorAllocation(holdings, group.currency).buckets.map(bucket => bucket.key)
    const rest = groupBySector(group.holdings).map(sector => sector.key).filter(key => !pie.includes(key))
    result.set(group.currency, assignSectorColors([...pie, ...rest], pie.length, SECTOR_PALETTES[theme], STATUS_HUES[theme]))
  }
  return result
}
