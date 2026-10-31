import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import type { DividendCurrency } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '8px 10px', color: 'var(--text-primary)', width: '100%', fontSize: 13,
}

export default function DeleteAllDialog({ currency, count, userId, onClose, onDeleted }: {
  currency: DividendCurrency; count: number; userId?: string; onClose: () => void; onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const confirm = async () => {
    setBusy(true)
    try {
      await api.deleteAllDividends(currency, userId)
      onDeleted()
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }
  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label={`Delete all ${currency} dividends`}>
      <div style={{ ...modalCard, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Delete all {currency} dividends?</h2>
        <p style={{ fontSize: 13, margin: 0 }}><strong>{count} dividends</strong> will be deleted, including ones entered in a holding's ledger.</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Holdings, buys, sells and dividends in the other currency are not affected. Dividend totals on the dashboard and in History update straight away.</p>
        <label htmlFor="delete-all-confirm" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Type DELETE to confirm</label>
        <input id="delete-all-confirm" style={INPUT} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-row-danger" disabled={typed !== 'DELETE' || busy} onClick={confirm}>Delete {count} dividends</button>
        </div>
      </div>
    </div>
  )
}
