import { useState } from 'react'
import type { CSSProperties } from 'react'
import { api, ApiError, type GoldTransaction, type GoldTransactionInput } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'

interface Props {
  /** Row being edited; null = create. */
  txn: GoldTransaction | null
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  date: string
  gm_price: string
  grams_bought: string
  quote_price: string
  bill_amount: string
  actual_paid: string
  billed_weight: string
  chennai_rate: string
}

const num = (v: number | null | undefined) => (v == null ? '' : String(v))

function initialForm(txn: GoldTransaction | null): FormState {
  if (!txn) {
    return {
      // UTC "today" is fine as a default (owner call): it is never ahead
      // of the server's IST calendar, so the future-date rule can't trip.
      date: new Date().toISOString().slice(0, 10),
      gm_price: '', grams_bought: '', quote_price: '', bill_amount: '',
      actual_paid: '', billed_weight: '', chennai_rate: '',
    }
  }
  return {
    date: txn.date,
    gm_price: num(txn.gm_price),
    grams_bought: num(txn.grams_bought),
    quote_price: num(txn.quote_price),
    bill_amount: num(txn.bill_amount),
    actual_paid: num(txn.actual_paid),
    billed_weight: num(txn.billed_weight),
    chennai_rate: txn.chennai_rate ?? '', // free-text remark
  }
}

// Weights are decimals, never grouped integers: "2.500" means 2.5 g, not
// 2,500 g — the auto heuristic would read the 3 trailing digits as
// grouping and corrupt the ledger. Money keeps auto ("59,500" is a
// grouped rupee amount).
const weight = { singleSeparator: 'decimal' as const }

/** Client-side mirror of the server's entered-field rules (PRD-003 §5). */
export function validateGoldForm(f: FormState): string | null {
  if (!f.date) return 'Date is required'
  if (!(parseDecimalInput(f.gm_price) > 0)) return 'Per-gram price must be > 0'
  if (!(parseDecimalInput(f.grams_bought, weight) > 0)) return 'Weight must be > 0'
  // Empty parses to 0, which would pass the >= 0 rule and submit a zero-
  // rupee purchase; a required field must be explicitly present.
  const paid = parseDecimalInput(f.actual_paid)
  if (f.actual_paid.trim() === '' || !Number.isFinite(paid) || paid < 0) return 'Actual amount paid must be >= 0'
  for (const [name, value, opts] of [
    ['Gold price in quote', f.quote_price, undefined],
    ['Amount according to bill', f.bill_amount, undefined],
    ['Billed weight', f.billed_weight, weight],
  ] as const) {
    if (value.trim() !== '' && !Number.isFinite(parseDecimalInput(value, opts))) {
      return `${name} is not a number`
    }
  }
  return null
}

function toInput(f: FormState): GoldTransactionInput {
  const opt = (v: string, opts?: typeof weight) => (v.trim() === '' ? null : parseDecimalInput(v, opts))
  return {
    date: f.date,
    gm_price: parseDecimalInput(f.gm_price),
    grams_bought: parseDecimalInput(f.grams_bought, weight),
    actual_paid: parseDecimalInput(f.actual_paid),
    quote_price: opt(f.quote_price),
    bill_amount: opt(f.bill_amount),
    billed_weight: opt(f.billed_weight, weight),
    // Free-text remark ("Ditto", a rate, a note) — sent verbatim, blank → null.
    chennai_rate: f.chennai_rate.trim() === '' ? null : f.chennai_rate.trim(),
  }
}

export default function GoldTxnModal({ txn, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initialForm(txn))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof FormState) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const invalid = validateGoldForm(form)
    if (invalid) { setErr(invalid); return }
    setBusy(true)
    setErr(null)
    try {
      const body = toInput(form)
      if (txn) await api.updateGoldTransaction(txn.id, body)
      else await api.createGoldTransaction(body)
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const label: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }
  const input: CSSProperties = {
    width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  }
  const field = (name: string, key: keyof FormState, required = false) => (
    <div>
      <label style={label} htmlFor={`gold-${key}`}>{name}{required && ' *'}</label>
      <DecimalInput id={`gold-${key}`} style={input} value={form[key]} onValueChange={set(key)} />
    </div>
  )

  return (
    <div className="modal-overlay" role="dialog" aria-label={txn ? 'Edit gold purchase' : 'Add gold purchase'} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="modal-card" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 24, width: 520, maxWidth: '100%',
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          {txn ? 'Edit gold purchase' : 'Add gold purchase'}
        </h2>

        {err && (
          <div style={{
            background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)',
            padding: '8px 10px', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 13,
          }}>{err}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={label} htmlFor="gold-date">Date *</label>
            <input id="gold-date" type="date" style={input} value={form.date}
              onChange={e => set('date')(e.target.value)} />
          </div>
          {field('Per-gram price', 'gm_price', true)}
          {field('Weight (g)', 'grams_bought', true)}
          {field('Actual amount paid', 'actual_paid', true)}
          {field('Gold price in quote', 'quote_price')}
          {field('Amount according to bill', 'bill_amount')}
          {field('Billed weight (g)', 'billed_weight')}
          <div>
            <label style={label} htmlFor="gold-chennai_rate">Chennai rate (remark)</label>
            <input id="gold-chennai_rate" type="text" style={input}
              value={form.chennai_rate} onChange={e => set('chennai_rate')(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={busy} className="btn btn-lg">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary btn-lg"
            style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
