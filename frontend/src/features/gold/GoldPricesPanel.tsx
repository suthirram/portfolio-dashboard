import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'

interface Props {
  /** The caller's price series (ascending) as last loaded. */
  prices: GoldPrice[]
  /** A price was saved — caller should reload prices + gap list. */
  onSaved: () => void
}

const fmt = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 })

// localToday keeps the quick-add default on the user's calendar day; the
// server rejects future dates (IST), and this input never sends one.
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Recent daily prices plus a single-row quick-add/edit (PRD-003 §7). Bulk
 * gap-filling is the MissingPricesModal's job; this panel is for the routine
 * "enter today's rate" case and reviewing history. */
export default function GoldPricesPanel({ prices, onSaved }: Props) {
  const [date, setDate] = useState(localToday())
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const value = parseDecimalInput(price)
    if (!date) { setErr('Pick a date'); return }
    if (!Number.isFinite(value) || value <= 0) { setErr('Price must be a number > 0'); return }
    setErr('')
    setSaving(true)
    try {
      await api.putGoldPrices([{ date, price_per_gram: value }])
      setPrice('')
      onSaved()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Newest first for review; the store returns ascending.
  const recent = [...prices].reverse().slice(0, 30)

  const input: CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '6px 10px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none',
  }

  return (
    <section style={{
      marginTop: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Daily gold price</h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
        One per-gram rate per calendar day. Re-entering a day overwrites it.
      </p>

      {err && (
        <div className="alert-danger">{err}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
          Date
          <input type="date" value={date} max={localToday()} style={input}
            onChange={e => setDate(e.target.value)} aria-label="Price date" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
          Price per gram
          <DecimalInput style={input} value={price} onValueChange={setPrice}
            placeholder="₹ / gram" aria-label="Price per gram" />
        </label>
        <button onClick={save} disabled={saving} className="btn-primary btn-lg"
          style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save price'}
        </button>
      </div>

      {recent.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No prices recorded yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {recent.map(p => (
            <div key={p.date} style={{
              display: 'flex', justifyContent: 'space-between', gap: 8,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 13,
            }}>
              <span style={{ color: 'var(--text-secondary)' }}>{p.date}</span>
              <span style={{ fontWeight: 600 }}>₹{fmt(p.price_per_gram)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
