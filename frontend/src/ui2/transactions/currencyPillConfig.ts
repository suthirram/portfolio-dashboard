import type { ThemeName } from '../../lib/useTheme'

export type CurrencyCode = 'INR' | 'EUR'

export interface CurrencyPillPalette {
  bg: string
  text: string
  border: string
  flagRing: string
  glow?: string
}

export const CURRENCY_PILL_COLOURS: Record<ThemeName, Record<CurrencyCode, CurrencyPillPalette>> = {
  light: {
    INR: { bg: 'rgba(217, 119, 6, 0.10)', text: '#9a3412', border: 'rgba(217, 119, 6, 0.24)', flagRing: 'rgba(0, 0, 0, 0.08)' },
    EUR: { bg: 'rgba(37, 99, 235, 0.10)', text: '#1e3a8a', border: 'rgba(37, 99, 235, 0.24)', flagRing: 'rgba(0, 0, 0, 0.08)' },
  },
  dark: {
    INR: { bg: 'rgba(252, 211, 77, 0.12)', text: '#fcd34d', border: 'rgba(252, 211, 77, 0.25)', flagRing: 'rgba(255, 255, 255, 0.14)' },
    EUR: { bg: 'rgba(96, 165, 250, 0.12)', text: '#60a5fa', border: 'rgba(96, 165, 250, 0.25)', flagRing: 'rgba(255, 255, 255, 0.14)' },
  },
  cyberpunk: {
    INR: { bg: 'rgba(255, 230, 0, 0.12)', text: '#ffe600', border: 'rgba(255, 158, 0, 0.48)', flagRing: 'rgba(255, 230, 0, 0.35)', glow: '0 0 10px rgba(255, 230, 0, 0.22)' },
    EUR: { bg: 'rgba(0, 229, 255, 0.12)', text: '#00e5ff', border: 'rgba(43, 127, 255, 0.48)', flagRing: 'rgba(0, 229, 255, 0.35)', glow: '0 0 10px rgba(0, 229, 255, 0.22)' },
  },
}
