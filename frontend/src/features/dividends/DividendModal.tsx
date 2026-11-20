import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { DecimalInput } from '../../components/DecimalInput'
import { formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import type { DividendCurrency, DividendRow, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
import { useDividendAction, useDividendForm } from './dividendActions'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '8px 10px', color: 'var(--text-primary)', width: '100%', fontSize: 13,
}
const LABEL: CSSProperties = { display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 5 }

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  editing: DividendRow | null
  userId?: string
  onClose: () => void
  onSaved: () => void
}

export default function DividendModal({ currency, holdings, editing, userId, onClose, onSaved }: Props) {
  const { inTab, holdingId, setHoldingId, date, setDate, amount, setAmount, saving, err, save } =
    useDividendForm({ currency, holdings, editing, userId, onSaved })
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onClose() })

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={editing ? 'Edit dividend' : 'Add dividend'}>
      <div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{editing ? 'Edit dividend' : 'Add dividend'}</h2>
        <div>
          <label style={LABEL} htmlFor="div-holding">Holding ({currency})</label>
          <select id="div-holding" style={INPUT} value={holdingId} disabled={!!editing} onChange={e => setHoldingId(e.target.value)}>
            {inTab.map(holding => <option key={holding.id} value={holding.id}>{holding.script} · {holding.symbol}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL} htmlFor="div-date">Date</label>
          <input id="div-date" type="date" style={INPUT} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL} htmlFor="div-amount">Dividend (total received)</label>
          <DecimalInput id="div-amount" style={INPUT} value={amount} onValueChange={setAmount} />
        </div>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export function DeleteDividendDialog({ row, currency, userId, onClose, onDeleted }: {
  row: DividendRow; currency: string; userId?: string; onClose: () => void; onDeleted: () => void
}) {
  const { busy, err, run: remove } = useDividendAction(() => api.deleteTransaction(row.id, userId), onDeleted)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!busy) onClose() })
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Delete dividend">
      <div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Delete dividend?</h2>
        <p style={{ fontSize: 13, margin: 0 }}>{row.script} · {formatDate(row.date)} · {formatMoney(row.amount, currency)}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>The holding's dividend total and every later running total drop by this amount.</p>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-row-danger" disabled={busy} onClick={remove}>Delete</button>
        </div>
      </div>
    </div>
  )
}
