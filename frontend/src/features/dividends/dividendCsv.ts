import { parseCsv } from '../../lib/csv'
import { normaliseDate } from '../../lib/formDates'
import { parseMoneyCell } from '../../lib/formNumbers'
import type { DividendImportRow } from '../../types'

export const MAX_ROWS = 5000
const COLUMNS = { date: 'date', share_name: 'share name', amount: 'dividend', cumulative: 'cumulative' } as const
const REQUIRED = ['date', 'share_name', 'amount'] as const

export interface DividendCsvError { line: number; reason: string }
export interface DividendCsv { rows: DividendImportRow[]; errors: DividendCsvError[]; total: number }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// parseDividendCsv reads a Date,Share Name,Dividend[,CUMULATIVE] file. rows
// are the parseable lines (sent to the server); errors are lines the browser
// can already reject; total counts every data line.
export function parseDividendCsv(text: string, today: string): DividendCsv {
  const all = parseCsv(text)
  const h = all.findIndex(r => r.some(c => c.trim() !== ''))
  if (h < 0) return { rows: [], errors: [{ line: 1, reason: 'The file is empty' }], total: 0 }
  const header = all[h].map(norm)
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, n]) => [k, header.indexOf(n)])) as Record<keyof typeof COLUMNS, number>
  const missing = REQUIRED.filter(k => col[k] < 0).map(k => COLUMNS[k])
  if (missing.length) {
    return { rows: [], errors: [{ line: h + 1, reason: `Missing column(s): ${missing.join(', ')}. Expected header: Date,Share Name,Dividend,CUMULATIVE` }], total: 0 }
  }

  const rows: DividendImportRow[] = []
  const errors: DividendCsvError[] = []
  let total = 0
  for (let i = h + 1; i < all.length; i++) {
    const cells = all[i]
    if (cells.every(c => c.trim() === '')) continue
    total++
    const line = i + 1
    const rawDate = cells[col.date] ?? ''
    const date = normaliseDate(rawDate)
    const share_name = (cells[col.share_name] ?? '').trim().replace(/\s+/g, ' ')
    const amount = parseMoneyCell(cells[col.amount] ?? '')
    const cum = col.cumulative >= 0 ? parseMoneyCell(cells[col.cumulative] ?? '') : NaN
    const reasons: string[] = []
    if (!date) reasons.push(`Date "${rawDate}" is not a valid DD/MM/YYYY date`)
    else if (date > today) reasons.push('Date is in the future')
    if (!share_name) reasons.push('Share Name is empty')
    if (!(amount > 0)) reasons.push(`Dividend "${cells[col.amount] ?? ''}" is not a positive number`)
    if (reasons.length) {
      errors.push({ line, reason: reasons.join('; ') })
      continue
    }
    rows.push({ line, date, share_name, amount, ...(Number.isFinite(cum) && cum > 0 ? { cumulative: cum } : {}) })
  }
  if (total > MAX_ROWS) errors.push({ line: 0, reason: `More than ${MAX_ROWS} rows — split the file` })
  return { rows, errors, total }
}
