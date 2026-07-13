import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'

interface Props {
  /** Calendar days (YYYY-MM-DD) since the first purchase with no price row. */
  missing: string[]
  onSkip: () => void
  /** Prices saved — caller should re-check gaps and refresh. */
  onSaved: () => void
}

/** Blocking prompt (PRD-003 §7): fill every missing day's per-gram price,
 * then one bulk PUT. Same pattern as the dashboard's opening-date prompt. */
export default function MissingPricesModal({ missing, onSkip, onSaved }: Props) {
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (date: string, v: string) => setPrices(p => ({ ...p, [date]: v }))

  // Only the days the user actually filled are sent; blanks are left for a
  // later visit rather than rejected, so a long gap can be closed piecemeal.
  const filled = (): GoldPrice[] => {
    const out: GoldPrice[] = []
    for (const date of missing) {
      const raw = prices[date]
      if (raw == null || raw.trim() === '') continue
      out.push({ date, price_per_gram: parseDecimalInput(raw) })
    }
    return out
  }

  const invalid = (): string | null => {
    for (const p of filled()) {
      if (!Number.isFinite(p.price_per_gram) || p.price_per_gram <= 0) {
        return `Price for ${p.date} must be a number > 0`
      }
    }
    return null
  }

  const save = async () => {
    const bad = invalid()
    if (bad) { setErr(bad); return }
    const rows = filled()
    if (rows.length === 0) { setErr('Enter at least one price, or skip.'); return }
    setErr('')
    setSaving(true)
    try {
      await api.putGoldPrices(rows)
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const input: CSSProperties = {
    width: 140, background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none',
  }

  return (
    <div className="modal-overlay" role="dialog" aria-label="Fill missing gold prices" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="modal-card" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 440, maxWidth: '100%',
        maxHeight: '90dvh', display: 'flex', flexDirection: 'column',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Daily gold price missing</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          {missing.length} {missing.length === 1 ? 'day has' : 'days have'} no per-gram price.
          Fill what you know — the rest can wait.
        </p>

        {err && (
          <div className="alert-danger">{err}</div>
        )}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {missing.map(date => (
            <div key={date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <label htmlFor={`price-${date}`} style={{ fontSize: 13, color: 'var(--text-primary)' }}>{date}</label>
              <DecimalInput id={`price-${date}`} style={input} placeholder="₹ / gram"
                value={prices[date] ?? ''} onValueChange={v => set(date, v)} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onSkip} disabled={saving} className="btn btn-lg">
            Skip for now
          </button>
          <button onClick={save} disabled={saving} className="btn-primary btn-lg"
            style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save all'}
          </button>
        </div>
      </div>
    </div>
  )
}
