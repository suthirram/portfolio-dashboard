import { useState } from 'react'
import { api, ApiError, type GoldTransaction } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { initialForm, toInput, validateGoldForm, type FormState } from '../../features/gold/GoldTxnModal'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

// The handoff's goldEditor: required fields first, the bill-comparison
// fields optional. Parsing and validation are the Classic modal's, so both
// interfaces accept and reject exactly the same input.
const NUMBER_FIELDS: ReadonlyArray<{ key: keyof FormState; label: string; required: boolean }> = [
  { key: 'gm_price', label: 'Per-gram purchase rate · INR', required: true },
  { key: 'grams_bought', label: 'Weight bought · grams', required: true },
  { key: 'actual_paid', label: 'Actual paid · INR', required: true },
  { key: 'quote_price', label: 'Price in quote · INR', required: false },
  { key: 'bill_amount', label: 'Amount per bill · INR', required: false },
  { key: 'billed_weight', label: 'Billed weight · grams', required: false },
]

export function Ui2GoldEditor({ txn, onClose, onSaved }: {
  txn: GoldTransaction | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(txn))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (key: keyof FormState) => (value: string) => setForm(previous => ({ ...previous, [key]: value }))

  const save = async () => {
    const invalid = validateGoldForm(form)
    if (invalid) { setErr(invalid); return }
    setBusy(true)
    setErr('')
    try {
      const body = toInput(form)
      if (txn) await api.updateGoldTransaction(txn.id, body)
      else await api.createGoldTransaction(body)
      onSaved()
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Ui2Dialog title={txn ? 'Edit gold purchase' : 'Add gold purchase'} onClose={onClose} busy={busy}>
      <form onSubmit={event => { event.preventDefault(); void save() }}>
        <div className="asset-form">
          <label className="full">
            Purchase date *
            <input type="date" value={form.date} onChange={event => set('date')(event.target.value)} required />
          </label>
          {NUMBER_FIELDS.map(field => (
            <label key={field.key}>
              {field.label}{field.required && ' *'}
              <DecimalInput value={form[field.key]} onValueChange={set(field.key)} />
            </label>
          ))}
          <label className="full">
            Chennai rate / remark
            <input value={form.chennai_rate} placeholder="Rate, Ditto, or a note"
              onChange={event => set('chennai_rate')(event.target.value)} />
          </label>
        </div>
        <p className="asset-note">Optional fields can remain blank. Calculated bill-comparison values appear after saving.</p>
        {err && <p className="asset-error" role="alert">{err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save purchase'}
          </button>
        </div>
      </form>
    </Ui2Dialog>
  )
}
