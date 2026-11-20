import type { GoldTransaction } from '../../lib/api/client'
import { formatDate } from '../../lib/formDates'
import { money } from '../overview/Ui2SummaryCards'

type GoldKey = Exclude<keyof GoldTransaction, 'id'>
export type GoldColumnKind = 'entered' | 'computed'

// The handoff's goldFields: the PRD-003 §5 column set in the owner's
// spreadsheet order, entered fields interleaved with server-computed ones.
// The table and the Details dialog both read this list.
export const GOLD_COLUMNS: ReadonlyArray<{ key: GoldKey; label: string; kind: GoldColumnKind }> = [
  { key: 'date', label: 'Date', kind: 'entered' },
  { key: 'gm_price', label: 'gm Price', kind: 'entered' },
  { key: 'grams_bought', label: 'Weight', kind: 'entered' },
  { key: 'gold_cost', label: 'Gold cost', kind: 'computed' },
  { key: 'gst_on_cost', label: '3%', kind: 'computed' },
  { key: 'total_expected', label: 'Total expected', kind: 'computed' },
  { key: 'quote_price', label: 'Price in quote', kind: 'entered' },
  { key: 'gst_on_quote', label: '3% (quote)', kind: 'computed' },
  { key: 'bill_amount', label: 'Amt per bill', kind: 'entered' },
  { key: 'actual_paid', label: 'Actual paid', kind: 'entered' },
  { key: 'nett_per_gram', label: 'Nett per gram', kind: 'computed' },
  { key: 'nett_reduction', label: 'Nett reduction', kind: 'computed' },
  { key: 'billed_weight', label: 'Billed weight', kind: 'entered' },
  { key: 'nimmi_loss', label: 'LOSS due to NIMMI', kind: 'computed' },
  { key: 'chennai_rate', label: 'Chennai rate', kind: 'entered' },
]

export const grams = (weight: number | null | undefined) =>
  weight == null ? '—' : `${weight.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`

// goldCell renders one column the way the handoff's goldFormat does: '—' for
// an absent value, never a fake zero.
export function goldCell(txn: GoldTransaction, key: GoldKey): string {
  const value = txn[key]
  if (value == null || value === '') return '—'
  if (key === 'date') return formatDate(String(value))
  if (key === 'chennai_rate') return String(value)
  if (key === 'grams_bought' || key === 'billed_weight') return grams(Number(value))
  return money(Number(value), 'INR')
}

// nimmiTone colours the NIMMI loss: a positive loss is bad.
export const nimmiTone = (txn: GoldTransaction) => (txn.nimmi_loss > 0 ? 'u2-negative' : 'u2-positive')
