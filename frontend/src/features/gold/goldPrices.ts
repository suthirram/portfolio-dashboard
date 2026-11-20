import type { GoldPrice } from '../../lib/api/client'
import { parseDecimalInput } from '../../lib/formNumbers'

// Shared gold-price input rules (PRD-003 §7) for the Classic panels and the
// UI_2.0 page, so both accept and reject exactly the same entries.

// localToday is the user's calendar day; the server rejects future dates
// (IST), and a date input capped at this never sends one.
export function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// pricePerGram parses one entered rate; null unless it is a number above 0.
export function pricePerGram(raw: string): number | null {
  const value = parseDecimalInput(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

// enteredPrices collects the days the user actually filled, in the order
// given. Blank days are left for later rather than rejected, so a long gap
// can be closed piecemeal; invalidDate names the first unusable entry.
export function enteredPrices(dates: string[], entered: Record<string, string>): {
  prices: GoldPrice[]
  invalidDate: string | null
} {
  const prices: GoldPrice[] = []
  for (const date of dates) {
    const raw = entered[date]
    if (raw == null || raw.trim() === '') continue
    const value = pricePerGram(raw)
    if (value == null) return { prices: [], invalidDate: date }
    prices.push({ date, price_per_gram: value })
  }
  return { prices, invalidDate: null }
}

// pricesByMonth groups the series into YYYY-MM months, newest month and
// newest day first, for the "View all months" list.
export function pricesByMonth(prices: GoldPrice[]): Array<{ month: string; prices: GoldPrice[] }> {
  const months = new Map<string, GoldPrice[]>()
  for (const price of [...prices].sort((first, second) => second.date.localeCompare(first.date))) {
    const month = price.date.slice(0, 7)
    months.set(month, [...(months.get(month) ?? []), price])
  }
  return [...months].map(([month, monthPrices]) => ({ month, prices: monthPrices }))
}
