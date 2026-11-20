import { useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { toast } from '../../lib/toast'
import { enteredPrices } from '../../features/gold/goldPrices'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

// MissingPricesAlert is the handoff's asset-alert above the ledger: it stays
// while any day since the first purchase lacks a price, and reopens the
// dialog after the user skipped it.
export function MissingPricesAlert({ count, onReview }: { count: number; onReview: () => void }) {
  return (
    <div className="ui2-notice" role="status">
      <div>
        <strong>{count} daily {count === 1 ? 'price needs' : 'prices need'} attention</strong>
        <span>Days since your first purchase with no recorded rate.</span>
      </div>
      <button type="button" className="ui2-btn" onClick={onReview}>Review missing prices</button>
    </div>
  )
}

// Ui2MissingPrices is the handoff's goldGapDialog: enter the rates you know,
// skip the rest. Nothing is inferred. After a save the dialog stays open on
// the days still missing, and closes with a toast once every day is filled.
export function Ui2MissingPrices({ missing, onSkip, onSaved }: {
  missing: string[]
  onSkip: () => void
  onSaved: () => Promise<void>
}) {
  const [entered, setEntered] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const { prices, invalidDate } = enteredPrices(missing, entered)
    if (invalidDate) { setErr(`Price for ${formatDate(invalidDate)} must be a number > 0`); return }
    if (prices.length === 0) { setErr('Enter at least one known rate, or skip for now.'); return }
    setErr('')
    setSaving(true)
    try {
      await api.putGoldPrices(prices)
      const allFilled = prices.length === missing.length
      await onSaved()
      if (allFilled) toast('All price gaps filled', 'success')
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Ui2Dialog title="Complete missing daily prices" onClose={onSkip} busy={saving}>
      <form onSubmit={event => { event.preventDefault(); void save() }}>
        <p className="asset-note">
          {missing.length} {missing.length === 1 ? 'date is' : 'dates are'} missing. Enter known rates or skip for now; no price is inferred.
        </p>
        <div className="asset-form">
          {missing.map(date => (
            <label key={date}>
              {formatDate(date)} · INR / gram
              <DecimalInput placeholder="Enter recorded rate" value={entered[date] ?? ''}
                onValueChange={value => setEntered(previous => ({ ...previous, [date]: value }))} />
            </label>
          ))}
        </div>
        {err && <p className="asset-error" role="alert">{err}</p>}
        <div className="asset-modal-actions">
          <button type="button" className="ui2-btn" onClick={onSkip} disabled={saving}>Skip for now</button>
          <button type="submit" className="ui2-btn ui2-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save entered prices'}
          </button>
        </div>
      </form>
    </Ui2Dialog>
  )
}
