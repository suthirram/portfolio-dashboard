import type { ThemeName } from '../../lib/useTheme'

/** One sector colour: its hex and OKLCH hue in degrees (for keeping pie neighbours apart). */
export interface SectorSlot { hex: string; hue: number }

/**
 * Thirty sector colours per theme, most-distinguishable first: each slot is the
 * candidate farthest (OKLab) from every earlier slot and from the reserved status
 * colours (Needs review, ETF, Mutual fund, Unclassified), inside the theme's
 * lightness band and at >= 3:1 contrast against its card surface. Generated with
 * the dataviz palette validator, 2026-11-16 (docs/cookbook/sector-colors-repeat.md).
 *
 * Worst all-pairs OKLab Delta E x100 (15 = readily told apart): dark 15.6 / light 13.1 /
 * cyberpunk 17.2 over the first 8 slots, falling to 8.4 / 6.7 / 8.9 over all 30. Past
 * about a dozen sectors neighbours look alike, so every dot keeps its text label.
 */
export const SECTOR_PALETTES: Record<ThemeName, SectorSlot[]> = {
  dark: [
    { hex: '#e14513', hue: 36 }, { hex: '#17a92a', hue: 144 }, { hex: '#56d1c8', hue: 189 }, { hex: '#b73095', hue: 340 }, { hex: '#ee939e', hue: 12 },
    { hex: '#85700b', hue: 96 }, { hex: '#88d433', hue: 132 }, { hex: '#7850da', hue: 292 }, { hex: '#aea048', hue: 100 }, { hex: '#009eaf', hue: 208 },
    { hex: '#fd86fa', hue: 328 }, { hex: '#ee5399', hue: 356 }, { hex: '#198560', hue: 164 }, { hex: '#f6861e', hue: 56 }, { hex: '#a75460', hue: 12 },
    { hex: '#9d6eb0', hue: 316 }, { hex: '#1c6fd2', hue: 256 }, { hex: '#80c1fe', hue: 248 }, { hex: '#59b387', hue: 160 }, { hex: '#c0784a', hue: 52 },
    { hex: '#c955c8', hue: 328 }, { hex: '#d43063', hue: 8 }, { hex: '#cd778d', hue: 4 }, { hex: '#a6c87a', hue: 128 }, { hex: '#2adb94', hue: 160 },
    { hex: '#72901e', hue: 124 }, { hex: '#af5504', hue: 52 }, { hex: '#e1a1de', hue: 328 }, { hex: '#f66e60', hue: 28 }, { hex: '#7fb125', hue: 128 },
  ],
  cyberpunk: [
    { hex: '#4f991b', hue: 136 }, { hex: '#f75a2e', hue: 36 }, { hex: '#fca6cc', hue: 352 }, { hex: '#209af7', hue: 248 }, { hex: '#44dc6b', hue: 148 },
    { hex: '#c32775', hue: 356 }, { hex: '#cead59', hue: 88 }, { hex: '#9b641a', hue: 69 }, { hex: '#36b4a6', hue: 184 }, { hex: '#c778a1', hue: 348 },
    { hex: '#a8a7f5', hue: 284 }, { hex: '#0a7ca6', hue: 232 }, { hex: '#6963ec', hue: 280 }, { hex: '#a23db8', hue: 320 }, { hex: '#cc2b0e', hue: 32 },
    { hex: '#fc78e1', hue: 336 }, { hex: '#068665', hue: 168 }, { hex: '#8981cb', hue: 288 }, { hex: '#fd8d78', hue: 32 }, { hex: '#9c8d34', hue: 100 },
    { hex: '#fe5c90', hue: 4 }, { hex: '#92b824', hue: 124 }, { hex: '#b25d64', hue: 16 }, { hex: '#aad388', hue: 132 }, { hex: '#d64fb1', hue: 340 },
    { hex: '#cc7f57', hue: 48 }, { hex: '#56b4e1', hue: 232 }, { hex: '#1f9bba', hue: 220 }, { hex: '#6a7b27', hue: 120 }, { hex: '#aad814', hue: 124 },
  ],
  light: [
    { hex: '#1c6402', hue: 140 }, { hex: '#970c48', hue: 4 }, { hex: '#d346a3', hue: 344 }, { hex: '#04a322', hue: 144 }, { hex: '#8e5308', hue: 64 },
    { hex: '#594388', hue: 296 }, { hex: '#d02d27', hue: 28 }, { hex: '#9b259b', hue: 328 }, { hex: '#0f9b89', hue: 181 }, { hex: '#8d8b32', hue: 108 },
    { hex: '#9065c0', hue: 304 }, { hex: '#be6974', hue: 12 }, { hex: '#97507b', hue: 344 }, { hex: '#3d38bd', hue: 276 }, { hex: '#277e50', hue: 156 },
    { hex: '#bc1d6f', hue: 356 }, { hex: '#711da4', hue: 308 }, { hex: '#10568c', hue: 248 }, { hex: '#8f2b0d', hue: 36 }, { hex: '#72700d', hue: 108 },
    { hex: '#e2406f', hue: 8 }, { hex: '#793765', hue: 340 }, { hex: '#b954cf', hue: 320 }, { hex: '#7e479c', hue: 312 }, { hex: '#aa5c40', hue: 40 },
    { hex: '#a33947', hue: 16 }, { hex: '#548f33', hue: 136 }, { hex: '#ae459a', hue: 336 }, { hex: '#258101', hue: 140 }, { hex: '#b663ab', hue: 332 },
  ],
}

/**
 * OKLCH hues of the fixed-colour pie slices per theme, so a sector slice next to
 * one never shares its hue family. Unclassified is grey (no hue).
 */
export const STATUS_HUES: Record<ThemeName, Record<string, number | null>> = {
  dark: { needs_review: 84, etf: 262, mutual_fund: 294, unclassified: null },
  cyberpunk: { needs_review: 101, etf: 209, mutual_fund: 309, unclassified: null },
  light: { needs_review: 58, etf: 261, mutual_fund: 293, unclassified: null },
}
