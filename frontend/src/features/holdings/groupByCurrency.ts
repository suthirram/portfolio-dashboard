export type CurrencyCode = 'INR' | 'EUR' | 'OTHER'

type Currencied = { currency?: string | null }

// Render currencies in a stable order regardless of how holdings happen to be
// sorted in the input list — INR first (largest cohort in the data set), EUR
// second, anything unrecognised last.
export const CURRENCY_ORDER: CurrencyCode[] = ['INR', 'EUR', 'OTHER']

export const normaliseCurrency = (raw: string | null | undefined): CurrencyCode => {
  const c = (raw || '').toUpperCase()
  return c === 'INR' || c === 'EUR' ? c : 'OTHER'
}

export interface CurrencyGroup<T> {
  currency: CurrencyCode
  holdings: T[]
}

export function groupByCurrency<T extends Currencied>(
  holdings: T[] | null | undefined,
): CurrencyGroup<T>[] {
  const buckets = new Map<CurrencyCode, T[]>()
  for (const h of holdings || []) {
    const key = normaliseCurrency(h.currency)
    const list = buckets.get(key)
    if (list) list.push(h)
    else buckets.set(key, [h])
  }
  return CURRENCY_ORDER
    .filter(c => buckets.has(c))
    .map(c => ({ currency: c, holdings: buckets.get(c)! }))
}
