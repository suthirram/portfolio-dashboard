import { useState } from 'react'
import { api } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatMoney } from '../../lib/currency'
import { formatDate, todayIST } from '../../lib/formDates'
import type { DividendCurrency, DividendRow, Holding } from '../../types'
import { useDividendAction, useDividendForm } from '../../features/dividends/dividendActions'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

// The handoff's dividend dialogs (dividendEditor, assetConfirm) in Ui2Dialog.
// State, validation and writes come from dividendActions, shared with the
// Classic modals.

export function Ui2DividendEditor({ currency, holdings, editing, userId, onClose, onSaved }: {
  currency: DividendCurrency
  holdings: Holding[]
  editing: DividendRow | null
  userId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const form = useDividendForm({ currency, holdings, editing, userId, onSaved })
  return (
    <Ui2Dialog title={`${editing ? 'Edit' : 'Add'} dividend · ${currency}`} onClose={onClose} busy={form.saving}>
      <form onSubmit={event => { event.preventDefault(); void form.save() }}>
        <div className="asset-form">
          <label className="full">
            Holding
            <select value={form.holdingId} disabled={Boolean(editing)} onChange={event => form.setHoldingId(event.target.value)}>
              {form.inTab.map(holding => (
                <option key={holding.id} value={holding.id}>{holding.script} · {holding.symbol}</option>
              ))}
            </select>
          </label>
          <label>
            Payment date
            <input type="date" max={todayIST()} value={form.date} onChange={event => form.setDate(event.target.value)} required />
          </label>
          <label>
            Total received · {currency}
            <DecimalInput value={form.amount} onValueChange={form.setAmount} />
          </label>
        </div>
        <p className="asset-note">Total payment received, not a per-share dividend.</p>
        {form.err && <p className="asset-error" role="alert">{form.err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={onClose} disabled={form.saving}>Cancel</button>
          <button type="submit" className="ui2-btn ui2-btn-primary" disabled={form.saving}>
            {form.saving ? 'Saving…' : 'Save dividend'}
          </button>
        </div>
      </form>
    </Ui2Dialog>
  )
}

export function Ui2DeleteDividend({ row, currency, userId, onClose, onDeleted }: {
  row: DividendRow
  currency: string
  userId?: string
  onClose: () => void
  onDeleted: () => void
}) {
  const { busy, err, run } = useDividendAction(() => api.deleteTransaction(row.id, userId), onDeleted)
  return (
    <Ui2Dialog title="Delete dividend?" onClose={onClose} busy={busy}>
      <p style={{ lineHeight: 1.7 }}>{row.script} · {formatDate(row.date)} · {formatMoney(row.amount, currency)}</p>
      <p className="asset-note">The holding's dividend total and every later running total drop by this amount.</p>
      {err && <p className="asset-error" role="alert">{err}</p>}
      <div className="asset-modal-actions">
        <button type="button" className="ui2-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="ui2-btn ui2-btn-danger" onClick={() => void run()} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete dividend'}
        </button>
      </div>
    </Ui2Dialog>
  )
}

// Deleting a whole currency's dividends keeps the Classic safeguard: the
// button stays disabled until DELETE is typed.
export function Ui2DeleteAllDividends({ currency, count, userId, onClose, onDeleted }: {
  currency: DividendCurrency
  count: number
  userId?: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const { busy, err, run } = useDividendAction(() => api.deleteAllDividends(currency, userId), onDeleted)
  return (
    <Ui2Dialog title={`Delete all ${currency} dividends?`} onClose={onClose} busy={busy}>
      <p style={{ lineHeight: 1.7 }}>
        <strong>{count} dividends</strong> will be deleted, including ones entered in a holding's ledger.
      </p>
      <p className="asset-note">
        Holdings, buys, sells and dividends in the other currency are not affected. Dividend totals on the dashboard and in History update straight away.
      </p>
      <div className="asset-form">
        <label className="full">
          Type DELETE to confirm
          <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" />
        </label>
      </div>
      {err && <p className="asset-error" role="alert">{err}</p>}
      <div className="asset-modal-actions">
        <button type="button" className="ui2-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="ui2-btn ui2-btn-danger" onClick={() => void run()} disabled={typed !== 'DELETE' || busy}>
          Delete {count} dividends
        </button>
      </div>
    </Ui2Dialog>
  )
}
