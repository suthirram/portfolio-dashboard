import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, HoldingInput } from '../../types'

// The inception baseline shown as the default when a holding has no opening date.
const DEFAULT_OPENING_DATE = '2026-06-15'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '6px 10px',
  color: 'var(--text-primary)', outline: 'none', fontSize: 13,
}
const LABEL: CSSProperties = { color: 'var(--text-secondary)', fontSize: 13 }

// holdingInput rebuilds the HoldingInput the PUT expects from an existing
// holding, carrying only the editable identity fields plus the opening date.
// Position fields are derived server-side and deliberately omitted.
function holdingInput(h: Holding, openingDate: string): HoldingInput {
  return {
    script: h.script ?? '',
    symbol: h.symbol,
    exchange: h.exchange ?? 'OTHER',
    type: h.type ?? 'stock',
    // Position fields are derived server-side and ignored by the holding PUT;
    // echo the current values to satisfy the input shape.
    stocks_owned: h.stocks_owned ?? 0,
    avg_cost_price: h.avg_cost_price ?? 0,
    realized_pnl: h.realized_pnl ?? 0,
    currency: h.currency,
    notes: h.notes,
    opening_date: openingDate,
  }
}

interface Props {
  /** Holdings that have an opening balance but no user-set opening date. */
  holdings: Holding[]
  /** Admin act-as target; undefined for the caller's own portfolio. */
  userId?: string
  /** Skip for now — dismiss without saving. */
  onSkip: () => void
  /** All dates saved — caller should refresh. */
  onSaved: () => void
}

export default function OpeningDateModal({ holdings, userId, onSkip, onSaved }: Props) {
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdings.map(h => [h.id ?? '', h.opening_date || DEFAULT_OPENING_DATE])),
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const setDate = (id: string, value: string) => setDates(d => ({ ...d, [id]: value }))

  const saveAll = async () => {
    setErr('')
    setSaving(true)
    try {
      for (const h of holdings) {
        const id = h.id ?? ''
        const date = dates[id]
        if (!date) { setErr('Set a date for every holding'); setSaving(false); return }
        await api.updateHolding(id, holdingInput(h, date), userId)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 28, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Set opening dates</h2>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
          These holdings have an opening balance with no date set. Set the date you first
          held each so your history values correctly.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {holdings.map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={LABEL}>{h.script || h.symbol}</span>
              <input
                type="date"
                style={INPUT}
                value={dates[h.id ?? ''] ?? DEFAULT_OPENING_DATE}
                onChange={e => setDate(h.id ?? '', e.target.value)}
              />
            </div>
          ))}
        </div>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 14 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          <button onClick={onSkip} disabled={saving} style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 'var(--radius-sm)',
          }}>Skip for now</button>
          <button onClick={saveAll} disabled={saving} style={{
            background: 'var(--blue)', color: '#fff', padding: '8px 18px',
            borderRadius: 'var(--radius-sm)', fontWeight: 600, opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Save all'}</button>
        </div>
      </div>
    </div>
  )
}
