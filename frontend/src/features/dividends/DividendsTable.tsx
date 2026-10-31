import type { CSSProperties } from 'react'
import type { DividendRow } from '../../types'
import { formatDate } from '../../lib/formDates'
import { formatMoney } from '../../lib/currency'
import { EditIcon, TrashIcon } from '../../components/Icon'
import { actionCell, actionTd, actionTh, td, th } from '../history/historyShared'

const num: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const numTh: CSSProperties = { ...th, textAlign: 'right' }

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
            <th style={numTh}>Dividend</th>
            <th style={numTh}>Cumulative</th>
            <th style={numTh}>Holding cumulative</th>
            {(onEdit || onDelete) && <th style={actionTh}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ ...td, color: 'var(--text-muted)' }}>{i + 1}</td>
              <td style={td}>{formatDate(r.date)}</td>
              <td style={td}>
                <span style={{ fontWeight: 600 }}>{r.script || '—'}</span>{' '}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.symbol}</span>
              </td>
              <td style={num}>{formatMoney(r.amount, currency)}</td>
              <td style={{ ...num, color: 'var(--green)', fontWeight: 600 }}>{formatMoney(r.cumulative, currency)}</td>
              <td style={num}>{formatMoney(r.holding_cumulative, currency)}</td>
              {(onEdit || onDelete) && (
                <td style={actionTd}>
                  <div style={actionCell}>
                    {onEdit && (
                      <button className="btn-row btn-row-accent" aria-label={`Edit dividend of ${formatDate(r.date)}`} onClick={() => onEdit(r)}>
                        <EditIcon size={16} />
                      </button>
                    )}
                    {onDelete && (
                      <button className="btn-row btn-row-danger" aria-label={`Delete dividend of ${formatDate(r.date)}`} onClick={() => onDelete(r)}>
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
