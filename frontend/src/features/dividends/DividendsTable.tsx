import type { CSSProperties } from 'react'
import type { DividendRow } from '../../types'
import { formatDate } from '../../lib/formDates'
import { formatMoney } from '../../lib/currency'
import { EditIcon, TrashIcon } from '../../components/Icon'
import { actionCell, actionTd, actionTh, td, th } from '../history/historyShared'

const numberTd: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const numberTh: CSSProperties = { ...th, textAlign: 'right' }

interface Props {
  rows: DividendRow[]
  currency: string
  onEdit?: (row: DividendRow) => void
  onDelete?: (row: DividendRow) => void
}

export default function DividendsTable({ rows, currency, onEdit, onDelete }: Props) {
  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, width: 48 }}>#</th>
            <th style={th}>Date</th>
            <th style={th}>Holding</th>
            <th style={numberTh}>Dividend</th>
            <th style={numberTh}>Cumulative</th>
            <th style={numberTh}>Holding cumulative</th>
            {(onEdit || onDelete) && <th style={actionTh}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id}>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{i + 1}</td>
              <td style={td}>{formatDate(row.date)}</td>
              <td style={td}>
                <span style={{ fontWeight: 600 }}>{row.script || '—'}</span>{' '}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.symbol}</span>
              </td>
              <td style={numberTd}>{formatMoney(row.amount, currency)}</td>
              <td style={{ ...numberTd, color: 'var(--green)', fontWeight: 600 }}>{formatMoney(row.cumulative, currency)}</td>
              <td style={numberTd}>{formatMoney(row.holding_cumulative, currency)}</td>
              {(onEdit || onDelete) && (
                <td style={actionTd}>
                  <div style={actionCell}>
                    {onEdit && (
                      <button className="btn-row btn-row-accent" aria-label={`Edit dividend of ${formatDate(row.date)}`} onClick={() => onEdit(row)}>
                        <EditIcon size={16} />
                      </button>
                    )}
                    {onDelete && (
                      <button className="btn-row btn-row-danger" aria-label={`Delete dividend of ${formatDate(row.date)}`} onClick={() => onDelete(row)}>
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
