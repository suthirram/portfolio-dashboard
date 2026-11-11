import type { CSSProperties } from 'react'
import type { TransactionWithHolding } from '../../types'
import { TYPE_LABEL } from '../holdings/TransactionsModal'
import { EditIcon } from '../../components/Icon'
import { formatDate } from '../../lib/formDates'
import { formatMoney, formatQuantity } from '../../lib/currency'
import {
  impliedCostPerShare,
  type Sort,
  type SortKey,
  visibleColumns,
} from './transactionFilters'

// Per-type accent for the type pill. Buy/sell/dividend borrow the app's
// semantic colours (money in, money out, income); corporate actions get the
// neutral-but-distinct purple/yellow so they don't read as P&L.
const TYPE_TINT: Record<string, { bg: string; color: string }> = {
  buy:      { bg: 'var(--blue-dim)',  color: 'var(--blue)' },
  sell:     { bg: 'var(--red-dim)',   color: 'var(--red)' },
  dividend: { bg: 'var(--green-dim)', color: 'var(--green)' },
  opening:  { bg: 'rgba(167, 139, 250, 0.14)', color: 'var(--purple)' },
  split:    { bg: 'rgba(251, 191, 36, 0.14)',  color: 'var(--yellow)' },
  bonus:    { bg: 'rgba(251, 191, 36, 0.14)',  color: 'var(--yellow)' },
  merger:   { bg: 'var(--bg-card-hover)',      color: 'var(--text-secondary)' },
}

interface Props {
  rows: TransactionWithHolding[]
  sort: Sort
  onSort: (key: SortKey) => void
  // Act-as omits editing entirely (there is no act-as ledger write path), so
  // the column is absent rather than disabled — a dead control would imply
  // the capability exists.
  onEdit?: (row: TransactionWithHolding) => void
  // The rows that decide which optional columns show (default: rows). The
  // page passes every filtered row, so paging never adds or drops a column.
  columnRows?: TransactionWithHolding[]
}

export default function TransactionsAllTable({ rows, sort, onSort, onEdit, columnRows = rows }: Props) {
  const cols = visibleColumns(columnRows)
  const span = 3 + Number(cols.quantity) + 1 + Number(cols.impliedCost)
    + Number(cols.ratio) + Number(cols.realizedSeed) + Number(cols.openingDate)
    + Number(cols.notes) + (onEdit ? 1 : 0)

  return (
    <div className="table-scroll" style={{
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      background: 'var(--bg-secondary)', overflowX: 'auto',
    }}>
      <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <SortTh col="date" sort={sort} onSort={onSort} align="left">Date</SortTh>
            <SortTh col="holding" sort={sort} onSort={onSort} align="left">Holding</SortTh>
            <SortTh col="type" sort={sort} onSort={onSort} align="left">Type</SortTh>
            {cols.quantity && <Th>Shares</Th>}
            <SortTh col="amount" sort={sort} onSort={onSort}>Amount</SortTh>
            {cols.impliedCost && <Th>Implied cost/sh</Th>}
            {cols.ratio && <Th>Ratio</Th>}
            {cols.realizedSeed && <Th>Realised seed</Th>}
            {cols.openingDate && <Th>Opening date</Th>}
            {cols.notes && <Th style={{ textAlign: 'left' }}>Notes</Th>}
            <Th style={{ textAlign: 'center', width: 54 }}>Cur</Th>
            {onEdit && <Th style={{ textAlign: 'center', width: 60 }}>Edit</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={span} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                No transactions match these filters.
              </td>
            </tr>
          )}
          {rows.map(txn => {
            const implied = impliedCostPerShare(txn)
            const tint = TYPE_TINT[txn.type || ''] ?? TYPE_TINT.merger
            return (
              <tr key={txn.id} style={{ borderTop: '1px solid var(--border)' }}>
                <Td style={{ textAlign: 'left' }} className="mono">{formatDate(txn.date)}</Td>
                <Td style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{txn.script || '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{txn.symbol}</div>
                </Td>
                <Td style={{ textAlign: 'left' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                    fontSize: 11, fontWeight: 600, background: tint.bg, color: tint.color,
                  }}>{TYPE_LABEL[txn.type || ''] || txn.type}</span>
                </Td>
                {cols.quantity && <Td className="mono">{formatQuantity(txn.quantity)}</Td>}
                <Td className="mono">{formatMoney(txn.amount, txn.currency)}</Td>
                {cols.impliedCost && (
                  <Td className="mono">{implied === null ? '—' : formatMoney(implied, txn.currency)}</Td>
                )}
                {cols.ratio && <Td className="mono">{txn.ratio ? `${txn.ratio}×` : '—'}</Td>}
                {cols.realizedSeed && <Td className="mono">{formatMoney(txn.realized_seed, txn.currency)}</Td>}
                {cols.openingDate && (
                  <Td className="mono">
                    {txn.type !== 'opening'
                      ? '—'
                      : txn.opening_date
                        ? formatDate(txn.opening_date)
                        // Same state the dashboard's blocking prompt keys on.
                        : <span style={{ color: 'var(--yellow)' }}>Not set</span>}
                  </Td>
                )}
                {cols.notes && (
                  <Td style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'normal', maxWidth: 220 }}>
                    {txn.notes || '—'}
                  </Td>
                )}
                <Td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>{txn.currency}</Td>
                {onEdit && (
                  <Td style={{ textAlign: 'center' }}>
                    <button onClick={() => onEdit(txn)} className="btn-row btn-row-accent"
                      title={`Edit in ${txn.script || 'holding'}'s ledger`}
                      aria-label={`Edit in ${txn.script || 'holding'}'s ledger`}>
                      <EditIcon size={12} />
                    </button>
                  </Td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const TH_BASE: CSSProperties = {
  padding: '9px 11px', textAlign: 'right', fontWeight: 500, fontSize: 10,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)',
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) => (
  <th style={{ ...TH_BASE, ...style }}>{children}</th>
)

// A sortable header carries aria-sort so the active column and its direction
// are announced, not just tinted.
function SortTh({ col, sort, onSort, align, children }: {
  col: SortKey
  sort: Sort
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  const active = sort.key === col
  return (
    <th style={{ ...TH_BASE, textAlign: align ?? 'right' }}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => onSort(col)} style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
        color: active ? 'var(--blue)' : 'inherit',
      }}>
        {children}{active && (sort.dir === 'desc' ? ' ▾' : ' ▴')}
      </button>
    </th>
  )
}

const Td = ({ children, style, className }: { children?: React.ReactNode; style?: CSSProperties; className?: string }) => (
  <td className={className} style={{ padding: '9px 11px', textAlign: 'right', ...style }}>{children}</td>
)
