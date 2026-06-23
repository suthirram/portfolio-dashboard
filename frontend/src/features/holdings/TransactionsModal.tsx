import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { api } from '../../lib/api/client'
import type { HoldingWithPrice, Transaction, TransactionInput, TransactionType } from '../../types'
import { EditIcon, TrashIcon, PlusIcon } from '../../components/Icon'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'

// Ordered for the type picker; opening is managed via the holding's opening
// balance, but is shown read-only in the list when present.
const NEW_TYPES: TransactionType[] = ['buy', 'sell', 'dividend', 'split', 'bonus', 'merger']

const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening', buy: 'Buy', sell: 'Sell', dividend: 'Dividend',
  split: 'Split', bonus: 'Bonus', merger: 'Merger',
}

const INPUT: CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)',
  outline: 'none',
}
const LABEL: CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

interface FormState {
  type: TransactionType
  date: string // yyyy-mm-dd
  quantity: string
  amount: string
  ratio: string
  realized: string // opening only: realised P&L seed
  notes: string
}

const todayISO = () => new Date().toISOString().slice(0, 10)

const emptyForm = (): FormState => ({ type: 'buy', date: todayISO(), quantity: '', amount: '', ratio: '', realized: '', notes: '' })

interface Props {
  holding: HoldingWithPrice
  onClose: () => void
  // Called after any ledger mutation so the parent refreshes holdings/prices
  // (the position is recomputed server-side).
  onChanged: () => void
}

export default function TransactionsModal({ holding, onClose, onChanged }: Props) {
  const sym = holding.currency === 'EUR' ? '€' : '₹'
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!holding.id) return
    setLoading(true)
    try {
      const data = await api.listTransactions(holding.id)
      setTxns(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [holding.id])

  useEffect(() => { void load() }, [load])

  const resetForm = () => { setForm(emptyForm()); setEditingId(null) }

  const startEdit = (t: Transaction) => {
    setEditingId(t.id || null)
    setForm({
      type: (t.type as TransactionType) || 'buy',
      date: t.date ? t.date.slice(0, 10) : todayISO(),
      quantity: t.quantity != null ? String(t.quantity) : '',
      amount: t.amount != null ? String(t.amount) : '',
      ratio: t.ratio != null && t.ratio !== 0 ? String(t.ratio) : '',
      realized: t.realized_seed != null && t.realized_seed !== 0 ? String(t.realized_seed) : '',
      notes: t.notes || '',
    })
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!holding.id) return
    setErr('')

    const quantity = parseDecimalInput(form.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) { setErr('Enter a valid share quantity'); return }
    const amount = parseDecimalInput(form.amount)
    if (!Number.isFinite(amount) || amount < 0) { setErr('Enter a valid amount'); return }
    const ratio = parseDecimalInput(form.ratio)
    if (!Number.isFinite(ratio) || ratio < 0) { setErr('Enter a valid ratio'); return }
    const realizedSeed = parseDecimalInput(form.realized, { allowNegative: true })
    if (!Number.isFinite(realizedSeed)) { setErr('Enter a valid realised P&L seed'); return }

    const payload: TransactionInput = {
      type: form.type,
      // Send a full RFC3339 timestamp; the backend parses date-time.
      date: new Date(form.date + 'T00:00:00Z').toISOString(),
      quantity,
      amount,
      notes: form.notes.trim() || undefined,
    }
    if (form.type === 'split' || form.type === 'bonus') {
      payload.ratio = ratio
    }
    if (form.type === 'opening') {
      payload.realized_seed = realizedSeed
    }

    setSaving(true)
    try {
      if (editingId) {
        await api.updateTransaction(editingId, payload)
      } else {
        await api.createTransaction(holding.id, payload)
      }
      resetForm()
      await load()
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setErr('')
    try {
      await api.deleteTransaction(id)
      setConfirm(null)
      await load()
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const money = (n?: number | null) =>
    n == null || n === 0 ? '—' : sym + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const num = (n?: number | null) => (n == null || n === 0 ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 3 }))

  // Quantity/amount are irrelevant for split/bonus/merger; show ratio instead.
  const isCorporate = form.type === 'split' || form.type === 'bonus'
  const isMerger = form.type === 'merger'
  const isOpening = form.type === 'opening'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      backdropFilter: 'blur(4px)',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 28, width: '100%', maxWidth: 720,
        maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Transactions — {holding.script}</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-muted)', fontSize: 20, padding: '0 4px' }}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }}>
          Position recomputes from this ledger (average cost). Buy = total debited; Sell = total credited.
        </div>

        {/* Add / edit form */}
        <form onSubmit={submit} style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: 16, marginBottom: 18, background: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Type</label>
              {isOpening ? (
                // Opening type is fixed; only its values can be edited.
                <input style={{ ...INPUT, opacity: 0.7 }} value="Opening (balance)" disabled />
              ) : (
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as TransactionType }))}>
                  {NEW_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              )}
            </div>
            <div>
              <label style={LABEL}>Date</label>
              <input style={INPUT} type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>

          {!isCorporate && !isMerger && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              {form.type !== 'dividend' && (
                <div>
                  <label style={LABEL}>Shares</label>
                  <DecimalInput style={INPUT} value={form.quantity}
                    onValueChange={value => setForm(f => ({ ...f, quantity: value }))} placeholder="0" />
                </div>
              )}
              <div>
                <label style={LABEL}>
                  {form.type === 'dividend' ? `Dividend credited (${sym})`
                    : form.type === 'sell' ? `Total credited (${sym})`
                    : form.type === 'opening' ? `Total cost (${sym})`
                    : `Total debited (${sym})`}
                </label>
                <DecimalInput style={INPUT} value={form.amount}
                  onValueChange={value => setForm(f => ({ ...f, amount: value }))} placeholder="0.00" />
              </div>
            </div>
          )}

          {isOpening && (
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>Realised P&L seed ({sym})</label>
              <DecimalInput style={INPUT} value={form.realized} allowNegative
                onValueChange={value => setForm(f => ({ ...f, realized: value }))}
                placeholder="Carried realised P&L (optional)" />
            </div>
          )}

          {isCorporate && (
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>Ratio (new shares per old, e.g. 2 = 2-for-1)</label>
              <DecimalInput style={INPUT} value={form.ratio}
                onValueChange={value => setForm(f => ({ ...f, ratio: value }))} placeholder="2" />
            </div>
          )}

          {isMerger && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              Merger is recorded for audit only; model the position effect with a sell on the old
              holding and a buy on the new one.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={LABEL}>Notes</label>
            <input style={INPUT} value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            {editingId && (
              <button type="button" onClick={resetForm}
                style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', padding: '7px 16px', border: '1px solid var(--border)' }}>
                Cancel edit
              </button>
            )}
            <button type="submit" disabled={saving}
              style={{ background: 'var(--blue)', color: '#fff', padding: '7px 18px', fontWeight: 600, opacity: saving ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon size={14} /> {saving ? 'Saving…' : editingId ? 'Update transaction' : 'Add transaction'}
            </button>
          </div>
        </form>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{err}</div>}

        {/* Ledger list */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <Th style={{ textAlign: 'left' }}>Date</Th>
                <Th style={{ textAlign: 'left' }}>Type</Th>
                <Th>Shares</Th>
                <Th>Amount</Th>
                <Th>Ratio</Th>
                <Th style={{ textAlign: 'center', width: 80 }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Loading…</td></tr>
              )}
              {!loading && txns.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                  No transactions yet. Add a buy, sell or dividend above.
                </td></tr>
              )}
              {!loading && txns.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td style={{ textAlign: 'left' }}>{t.date ? t.date.slice(0, 10) : '—'}</Td>
                  <Td style={{ textAlign: 'left' }}>
                    <span style={{ fontWeight: 600 }}>{TYPE_LABEL[t.type || ''] || t.type}</span>
                    {t.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.notes}</div>}
                  </Td>
                  <Td className="mono">{num(t.quantity)}</Td>
                  <Td className="mono">{money(t.amount)}</Td>
                  <Td className="mono">{t.ratio ? `${t.ratio}×` : '—'}</Td>
                  <Td style={{ textAlign: 'center' }}>
                    {confirm === t.id ? (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => t.id && remove(t.id)} style={{ background: 'var(--red)', color: '#fff', padding: '3px 8px', fontSize: 11 }}>Yes</button>
                        <button onClick={() => setConfirm(null)} style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', padding: '3px 8px', fontSize: 11, border: '1px solid var(--border)' }}>No</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(t)} title="Edit"
                          style={{ background: 'var(--blue-dim)', color: 'var(--blue)', padding: '4px 7px', border: '1px solid rgba(79,142,247,0.2)', display: 'inline-flex' }}>
                          <EditIcon size={12} />
                        </button>
                        <button onClick={() => t.id && setConfirm(t.id)} title="Delete"
                          style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '4px 7px', border: '1px solid rgba(255,77,109,0.2)', display: 'inline-flex' }}>
                          <TrashIcon size={12} />
                        </button>
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Derived position summary */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Shares: <strong style={{ color: 'var(--text-primary)' }}>{num(holding.stocks_owned)}</strong></span>
          <span>Avg cost: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.avg_cost_price)}</strong></span>
          <span>Realised: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.realized_pnl)}</strong></span>
          <span>Dividends: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.total_dividends)}</strong></span>
        </div>
      </div>
    </div>
  )
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) => (
  <th style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', ...style }}>{children}</th>
)
const Td = ({ children, style, className }: { children?: React.ReactNode; style?: CSSProperties; className?: string }) => (
  <td className={className} style={{ padding: '9px 12px', textAlign: 'right', ...style }}>{children}</td>
)
