import { useState } from 'react'
import { api, ApiError, type GoldTransaction } from '../../lib/api/client'
import { formatDayMonthYearName } from '../../lib/formDates'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { GOLD_COLUMNS, goldCell, grams, nimmiTone } from './goldColumns'
import './gold.css'

// The handoff's goldDetail: every one of the 15 columns, entered and
// calculated, with Edit and Delete. Delete asks first, in place of the
// details, so only one dialog is ever open.
export function Ui2GoldDetails({ txn, onClose, onEdit, onDeleted }: {
  txn: GoldTransaction
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const remove = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.deleteGoldTransaction(txn.id)
      onDeleted()
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  if (confirming) {
    return (
      <Ui2Dialog title="Delete purchase?" onClose={() => setConfirming(false)} busy={busy}>
        <p className="asset-note">
          Remove the {grams(txn.grams_bought)} purchase from {formatDayMonthYearName(txn.date)}? This cannot be undone.
        </p>
        {err && <p className="asset-error" role="alert">{err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
          <button type="button" className="ui2-btn ui2-btn-danger" onClick={() => void remove()} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete purchase'}
          </button>
        </div>
      </Ui2Dialog>
    )
  }

  return (
    <Ui2Dialog title={`Purchase · ${formatDayMonthYearName(txn.date)}`} onClose={onClose} wide>
      <div className="gold-detail">
        {GOLD_COLUMNS.map(column => (
          <div key={column.key}>
            <span title={column.kind === 'computed' ? 'Calculated value' : 'Entered value'}>{column.label}</span>
            <strong className={column.key === 'nimmi_loss' && txn.nimmi_loss > 0 ? nimmiTone(txn) : undefined}>
              {goldCell(txn, column.key)}
            </strong>
          </div>
        ))}
      </div>
      <div className="asset-modal-actions">
        <button type="button" className="ui2-btn asset-danger" onClick={() => setConfirming(true)}>Delete purchase</button>
        <button type="button" className="ui2-btn ui2-btn-primary" onClick={onEdit}>Edit purchase</button>
      </div>
    </Ui2Dialog>
  )
}
