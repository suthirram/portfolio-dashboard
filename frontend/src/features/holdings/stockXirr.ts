// Pure lookups over the /xirr view (PD-055): the dashboard reads one rate
// per currency group and one per holding row.
import type { StockXirrCurrency, StockXirrHolding, StockXirrView } from '../../types'

export interface XirrIndex {
  asOf: string
  byHolding: Record<string, StockXirrHolding>
  byCurrency: Partial<Record<StockXirrCurrency['currency'], StockXirrCurrency>>
}

export function indexXirr(view: StockXirrView | null): XirrIndex | null {
  if (!view) return null
  const byHolding: XirrIndex['byHolding'] = {}
  for (const holding of view.holdings) byHolding[holding.holding_id] = holding
  const byCurrency: XirrIndex['byCurrency'] = {}
  for (const bucket of view.currencies) byCurrency[bucket.currency] = bucket
  return { asOf: view.as_of, byHolding, byCurrency }
}

const DAY_MS = 24 * 60 * 60 * 1000

// underAYear flags a rate measured over less than 365 days: annualizing a
// short window magnifies it (+6% in ten days reads as hundreds of percent).
export function underAYear(since: string | null | undefined, asOf: string): boolean {
  if (!since) return false
  return (Date.parse(asOf) - Date.parse(since)) / DAY_MS < 365
}

// xirrNote is the hover text explaining a rate's caveats, '' when none.
export function xirrNote(since: string | null | undefined, asOf: string, undated: boolean): string {
  const notes: string[] = []
  if (underAYear(since, asOf)) notes.push('Measured over less than a year — the annualised rate swings widely.')
  if (undated) notes.push('An opening balance has no date set; it is counted from when it was recorded.')
  return notes.join(' ')
}
