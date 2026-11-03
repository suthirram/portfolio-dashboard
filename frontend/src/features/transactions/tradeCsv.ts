// Reads a broker order-history export (Groww's columns, PRD-008 §4) into
// trade rows for the import preview. Dates are always day-first; a time
// after the date is ignored (only the day is imported). Rows whose order did
// not execute are skipped, not errors.
import { parseCsv } from '../../lib/csv'
import { normaliseDate } from '../../lib/formDates'
import { parseMoneyCell } from '../../lib/formNumbers'
import type { InvalidLine } from '../imports/ImportTables'
import type { TradeImportRow } from '../../types'

export const MAX_ROWS = 5000
const COLUMNS = {
  stock_name: 'stock name', symbol: 'symbol', isin: 'isin', type: 'type', quantity: 'quantity', value: 'value',
  exchange: 'exchange', executed: 'execution date and time', status: 'order status',
} as const
const REQUIRED = ['symbol', 'type', 'quantity', 'value', 'exchange', 'executed'] as const
const HEADER = 'Stock name, Symbol, ISIN, Type, Quantity, Value, Exchange, Exchange Order Id, Execution date and time, Order status'

export interface TradeCsv { rows: TradeImportRow[]; errors: InvalidLine[]; skipped: InvalidLine[]; total: number }

const normaliseHeader = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, ' ')

export function parseTradeCsv(text: string, today: string): TradeCsv {
  const all = parseCsv(text)
  const headerIndex = all.findIndex(record => record.some(cell => cell.trim() !== ''))
  if (headerIndex < 0) return { rows: [], errors: [{ line: 1, reason: 'The file is empty' }], skipped: [], total: 0 }
  const header = all[headerIndex].map(normaliseHeader)
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(name)])) as Record<keyof typeof COLUMNS, number>
  const missing = REQUIRED.filter(key => col[key] < 0).map(key => COLUMNS[key])
  if (missing.length) {
    return { rows: [], errors: [{ line: headerIndex + 1, reason: `Missing column(s): ${missing.join(', ')}. Expected header: ${HEADER}` }], skipped: [], total: 0 }
  }

  const cell = (cells: string[], key: keyof typeof COLUMNS) => (col[key] >= 0 ? (cells[col[key]] ?? '').trim() : '')
  const rows: TradeImportRow[] = []
  const errors: InvalidLine[] = []
  const skipped: InvalidLine[] = []
  let total = 0
  for (let i = headerIndex + 1; i < all.length; i++) {
    const cells = all[i]
    if (cells.every(value => value.trim() === '')) continue
    total++
    const line = i + 1
    const status = cell(cells, 'status')
    if (status && status.toLowerCase() !== 'executed') {
      skipped.push({ line, reason: `Order status is ${status}` })
      continue
    }
    const rawDate = cell(cells, 'executed')
    const date = normaliseDate(rawDate)
    const symbol = cell(cells, 'symbol').toUpperCase()
    const type = cell(cells, 'type').toLowerCase()
    const exchange = cell(cells, 'exchange').toUpperCase()
    const quantity = parseMoneyCell(cell(cells, 'quantity'))
    const amount = parseMoneyCell(cell(cells, 'value'))
    const reasons: string[] = []
    if (!date) reasons.push(`Date "${rawDate}" is not a DD/MM/YYYY date (a time like 03:30 PM is optional)`)
    else if (date > today) reasons.push('Date is in the future')
    if (!symbol) reasons.push('Symbol is empty')
    if (type !== 'buy' && type !== 'sell') reasons.push(`Type "${cell(cells, 'type')}" is not BUY or SELL`)
    if (exchange !== 'NSE' && exchange !== 'BSE') reasons.push(`Exchange "${cell(cells, 'exchange')}" is not NSE or BSE`)
    if (!(quantity > 0)) reasons.push(`Quantity "${cell(cells, 'quantity')}" is not a positive number`)
    if (!(amount > 0)) reasons.push(`Value "${cell(cells, 'value')}" is not a positive amount`)
    if (reasons.length) {
      errors.push({ line, reason: reasons.join('; ') })
      continue
    }
    const isin = cell(cells, 'isin')
    rows.push({
      line, date, symbol, stock_name: cell(cells, 'stock_name') || symbol,
      exchange: exchange as TradeImportRow['exchange'], type: type as TradeImportRow['type'], quantity, amount,
      ...(isin ? { isin } : {}),
    })
  }
  if (total > MAX_ROWS) errors.push({ line: 0, reason: `More than ${MAX_ROWS} rows — split the file` })
  return { rows, errors, skipped, total }
}
