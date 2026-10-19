// The app's supported currencies. Mirrors domain.CurrencyINR/CurrencyEUR
// and the Holding input enum; CurrencyOf (snapshot.go) excludes anything
// else, so this list is the whole supported set — not a display subset.
export const SUPPORTED_CURRENCIES = ['INR', 'EUR'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

const SYMBOLS: Record<SupportedCurrency, string> = { INR: '₹', EUR: '€' }

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code)
}

// canonicalCurrency upper-cases a stored code and applies the blank -> INR
// default (Holding.Currency's documented default, matching CurrencyOf).
// Unrecognised codes are returned as-is: two different legacy codes must
// stay two buckets, or a subtotal would sum across currencies.
export function canonicalCurrency(raw: string | null | undefined): string {
  const code = (raw || '').trim().toUpperCase()
  return code === '' ? 'INR' : code
}

// currencySymbol returns the symbol for a supported currency and the code
// itself for anything else, so a legacy row reads "USD 5,310.00" instead of
// "₹5,310.00". Falling back to ₹ would mislabel real money — which is what
// the ternaries this replaced did for every non-EUR code.
export function currencySymbol(raw: string | null | undefined): string {
  const code = canonicalCurrency(raw)
  return isSupportedCurrency(code) ? SYMBOLS[code] : code
}

// compareCurrencies orders supported currencies first (INR, EUR), then any
// other code alphabetically, so bucket order is stable and legacy codes
// sort last rather than interleaving.
export function compareCurrencies(a: string, b: string): number {
  const rank = (c: string) => (isSupportedCurrency(c) ? SUPPORTED_CURRENCIES.indexOf(c) : SUPPORTED_CURRENCIES.length)
  return rank(a) - rank(b) || a.localeCompare(b)
}
