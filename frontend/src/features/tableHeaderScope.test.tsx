// Every data-table column header names its column with scope="col", so
// screen readers pair each cell with its header (PD-058 Task 8).
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { DividendRow } from '../types'
import type { HistoryRow } from '../lib/api/client'
import DividendsTable from './dividends/DividendsTable'
import { ImportCounts, InvalidLines } from './imports/ImportTables'
import { ConflictDialog, HoldingsModal } from './history/HistoryModals'
import { HistoryTable } from './history/HistoryTable'

const dividend = { id: 'dividend-1', date: '2026-11-03', amount: 10, holding_id: 'holding-1', script: 'TCS' } as DividendRow
const historyRow = {
  date: '2026-11-03',
  regions: { INR: { invested: 100, current: 110, source: 'cron' } },
  totals: { invested_total: 100, current_total: 110, pnl_pct: 10 },
  holdings: [{ symbol: 'TCS.NS', script: 'TCS', quantity: 1, close_price: 110, currency: 'INR' }],
} as unknown as HistoryRow

const tables: Array<[string, ReactElement]> = [
  ['DividendsTable', <DividendsTable rows={[dividend]} currency="INR" onEdit={() => {}} />],
  ['ImportCounts', <ImportCounts counts={[['Ready', 1]]} total={1} />],
  ['InvalidLines', <InvalidLines lines={[{ line: 2, reason: 'bad date' }]} />],
  ['ConflictDialog', <ConflictDialog conflict={{ date: '2026-11-03', existing: {}, incoming: {} }} onResolve={async () => {}} onSkip={() => {}} />],
  ['HoldingsModal', <HoldingsModal row={historyRow} prev={null} region="INR" onClose={() => {}} />],
  ['HistoryTable', <HistoryTable rows={[historyRow]} currency="INR" onDelete={() => {}} />],
]

describe.each(tables)('%s', (_, table) => {
  it('scopes every column header', () => {
    render(table)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(0)
    for (const header of headers) expect(header).toHaveAttribute('scope', 'col')
  })
})
