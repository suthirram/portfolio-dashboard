import { useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../../lib/api/client'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { Holding, HoldingType } from '../../types'
import { ownerSectorLabels } from './classification'

interface Props {
  holding: Holding
  ownerHoldings: Holding[]
  userId?: string
  /** Escape or a backdrop click: leave the review. */
  onClose: () => void
  /** The Review later button; defaults to onClose. A queue passes "skip to the next holding". */
  onReviewLater?: () => void
  onConfirmed: (holding: Holding) => void | Promise<void>
  restoreFocusTo?: HTMLElement | null
}

export default function ClassificationReview({ holding, ownerHoldings, userId, onClose, onReviewLater = onClose, onConfirmed, restoreFocusTo }: Props) {
  const [type, setType] = useState<HoldingType>(holding.type ?? 'stock')
  const [sector, setSector] = useState(holding.classification?.sector ??
    (holding.classification?.status === 'resolved' ? '' : holding.classification?.provider_sector ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const id = useId()
  const close = () => { if (!saving) onClose() }
  useDialogFocus(root, close, true, restoreFocusTo)
  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (!holding.id || saving) return
    setSaving(true); setError('')
    try {
      const updated = await api.confirmClassification(holding.id, { type, sector: type === 'stock' ? sector.trim() || null : null }, userId)
      await onConfirmed(updated)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally { setSaving(false) }
  }
  return createPortal(<div className="modal-overlay classification-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      tabIndex={-1} className="modal-card classification-card">
      <h2 id={`${id}-title`}>Review classification</h2>
      <p id={`${id}-description`}>Confirm this holding’s type and sector, or review it later.</p>
      <div className="classification-identity"><strong>{holding.script}</strong><div>{holding.symbol}</div>
        <div>Yahoo: {holding.classification?.provider_sector || 'No company sector found'}</div>
        {holding.classification?.suggested_type && <div>Suggested type: {holding.classification.suggested_type.replace('_', ' ')}</div>}
      </div>
      <form onSubmit={confirm}>
        <label htmlFor={`${id}-type`}>Holding type</label>
        <select id={`${id}-type`} value={type} disabled={saving} onChange={event => setType(event.target.value as HoldingType)}>
          <option value="stock">Stock</option><option value="etf">ETF</option><option value="mutual_fund">Mutual fund</option>
        </select>
        {type === 'stock' && <>
          <label htmlFor={`${id}-sector`}>Sector</label>
          <input id={`${id}-sector`} value={sector} onChange={event => setSector(event.target.value)} disabled={saving}
            list={`${id}-labels`} maxLength={60} autoComplete="off" aria-describedby={`${id}-help`} />
          <datalist id={`${id}-labels`}>{ownerSectorLabels(ownerHoldings).map(label => <option key={label} value={label} />)}</datalist>
          <p id={`${id}-help`}>Pick one of this owner’s sectors or type a new label. Leave empty for an unclassified stock.</p>
        </>}
        {type !== 'stock' && <p>Funds have their own bucket, without a breakdown of underlying sectors.</p>}
        <p>Saved on this holding only. Other holdings keep their own labels.</p>
        {error && <div role="alert" className="classification-error">{error}</div>}
        <div className="classification-actions">
          <button type="button" className="btn btn-lg" onClick={() => { if (!saving) onReviewLater() }} disabled={saving}>Review later</button>
          <button type="submit" className="btn-primary btn-lg" disabled={saving || !holding.id}>
            {saving ? 'Confirming…' : 'Confirm classification'}
          </button>
        </div>
      </form>
    </div>
  </div>, document.body)
}
