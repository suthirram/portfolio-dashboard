import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'
import { canonicalCurrency, formatMoney } from '../../lib/currency'
import { formatDate, todayIST } from '../../lib/formDates'
import type { DividendCurrency, DividendRow, Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

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
  const inTab = holdings.filter(h => canonicalCurrency(h.currency) === currency)
  const [holdingId, setHoldingId] = useState(editing?.holding_id ?? inTab[0]?.id ?? '')
  const [date, setDate] = useState(editing?.date ?? todayIST())
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const value = parseDecimalInput(amount)
    if (!holdingId || !date || !(value > 0)) {
      setErr('Choose a holding, a date and a positive amount.')
      return
    }
    setSaving(true)
    setErr('')
    // quantity is required by TransactionInput but unused for a dividend.
    const body = { type: 'dividend' as const, date: `${date}T00:00:00Z`, quantity: 0, amount: value, notes: editing?.notes }
    try {
      if (editing) await api.updateTransaction(editing.id, body, userId)
      else await api.createTransaction(holdingId, body, userId)
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={editing ? 'Edit dividend' : 'Add dividend'}>
      <div style={{ ...modalCard, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{editing ? 'Edit dividend' : 'Add dividend'}</h2>
        <div>
          <label style={LABEL} htmlFor="div-holding">Holding ({currency})</label>
          <select id="div-holding" style={INPUT} value={holdingId} disabled={!!editing} onChange={e => setHoldingId(e.target.value)}>
            {inTab.map(h => <option key={h.id} value={h.id}>{h.script} · {h.symbol}</option>)}
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
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const remove = async () => {
    setBusy(true)
    try {
      await api.deleteTransaction(row.id, userId)
      onDeleted()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Delete dividend">
      <div style={{ ...modalCard, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
