import { useState, useEffect } from 'react'
import type { ChangeEvent, CSSProperties, FormEvent } from 'react'
import { api } from '../../lib/api/client'
import type { Currency, Exchange, HoldingInput, HoldingType, HoldingWithPrice } from '../../types'
import { CheckIcon } from '../../components/Icon'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput } from '../../lib/formNumbers'

const EXCHANGES: Exchange[] = ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'OTHER']
const TYPES: HoldingType[] = ['stock', 'etf']

const CURRENCIES: Currency[] = ['INR', 'EUR']

interface FormState {
  script: string
  symbol: string
  exchange: Exchange
  type: HoldingType
  stocks_owned: number | string
  avg_cost_price: number | string
  realized_pnl: number | string
  notes: string
  currency: Currency
}

const empty: FormState = {
  script: '', symbol: '', exchange: 'NSE', type: 'stock',
  stocks_owned: '', avg_cost_price: '', realized_pnl: '', notes: '', currency: 'INR',
}

interface LivePrice {
  price?: number
  currency?: string
  error?: string
}

const INPUT: CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)',
  outline: 'none', transition: 'border-color 0.15s',
}
const LABEL: CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
const ROW2: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }

interface AddEditModalProps {
  holding: HoldingWithPrice | null
  onClose: () => void
  onSaved: () => void
  /** Admin act-as: save into this user's portfolio instead of the caller's. */
  userId?: string
}

export default function AddEditModal({ holding, onClose, onSaved, userId }: AddEditModalProps) {
  const isEdit = Boolean(holding)
  const [form, setForm] = useState<FormState>(empty)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null)

  useEffect(() => {
    if (holding) {
      setForm({
        script: holding.script || '',
        symbol: holding.symbol || '',
        exchange: holding.exchange || 'NSE',
        type: holding.type || 'stock',
        stocks_owned: holding.stocks_owned ?? '',
        avg_cost_price: holding.avg_cost_price ?? '',
        realized_pnl: holding.realized_pnl ?? '',
        notes: holding.notes || '',
        currency: holding.currency || 'INR',
      })
    } else {
      setForm(empty)
    }
    setLivePrice(null)
  }, [holding])

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleLookup = async () => {
    if (!form.symbol) return
    setLookupLoading(true)
    try {
      const data = await api.getMarketPrice(form.symbol)
      setLivePrice(data)
    } catch (e) {
      setLivePrice({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErr('')
    if (!form.script.trim()) { setErr('Script name is required'); return }

    const stocksOwned = parseDecimalInput(String(form.stocks_owned), { singleSeparator: 'decimal' })
    if (!Number.isFinite(stocksOwned) || stocksOwned < 0) { setErr('Enter a valid shares owned value'); return }
    const avgCostPrice = parseDecimalInput(String(form.avg_cost_price), { singleSeparator: 'decimal' })
    if (!Number.isFinite(avgCostPrice) || avgCostPrice < 0) { setErr('Enter a valid average cost price'); return }
    const realizedPnL = parseDecimalInput(String(form.realized_pnl), { allowNegative: true })
    if (!Number.isFinite(realizedPnL)) { setErr('Enter a valid realised P&L'); return }

    setLoading(true)
    try {
      const payload: HoldingInput = {
        script: form.script.trim(),
        symbol: form.symbol.trim(),
        exchange: form.exchange,
        type: form.type,
        // On create these seed the opening balance. On update the backend
        // ignores them (position is derived from the ledger), so the derived
        // values pre-filled in the form are inert here — the opening balance is
        // edited in the Transactions modal instead.
        stocks_owned: stocksOwned,
        avg_cost_price: avgCostPrice,
        realized_pnl: realizedPnL,
        currency: form.currency,
        notes: form.notes.trim(),
      }
      if (holding && holding.id) {
        await api.updateHolding(holding.id, payload, userId)
      } else {
        await api.createHolding(payload, userId)
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      backdropFilter: 'blur(4px)',
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 28, width: '100%', maxWidth: 520,
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{isEdit ? 'Edit Holding' : 'Add Holding'}</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-muted)', fontSize: 20, padding: '0 4px' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={ROW2}>
              <div>
                <label style={LABEL}>Script Name *</label>
                <input style={INPUT} value={form.script} onChange={set('script')} placeholder="e.g. TCS, GOLD BEES" />
              </div>
              <div>
                <label style={LABEL}>Yahoo Symbol</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ ...INPUT, flex: 1 }} value={form.symbol} onChange={set('symbol')} placeholder="e.g. TCS.NS, AAPL" />
                  <button type="button" onClick={handleLookup} disabled={!form.symbol || lookupLoading}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '0 10px', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}>
                    {lookupLoading ? '…' : 'Test'}
                  </button>
                </div>
                {livePrice && (
                  <div style={{
                    marginTop: 4, fontSize: 11,
                    color: livePrice.error ? 'var(--red)' : 'var(--green)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    {livePrice.error
                      ? <>Error: {livePrice.error}</>
                      : <><CheckIcon size={11} /> {livePrice.price?.toLocaleString('en-IN')} {livePrice.currency || ''}</>}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <label style={LABEL}>Exchange</label>
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.exchange} onChange={set('exchange')}>
                  {EXCHANGES.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Type</label>
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.type} onChange={set('type')}>
                  {TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL}>Currency</label>
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.currency} onChange={set('currency')}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {isEdit ? (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                Shares, average cost and realised P&L are derived from this holding's
                ledger. Edit the opening balance or record buys/sells in the
                <strong> Transactions</strong> view.
              </div>
            ) : (
              <>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Opening balance
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Your starting position. Record later buys, sells and dividends in the
                    holding's <strong>Transactions</strong> ledger — the position recomputes automatically.
                  </div>
                </div>

                <div style={ROW2}>
                  <div>
                    <label style={LABEL}>Shares Owned</label>
                    <DecimalInput style={INPUT} value={form.stocks_owned} onValueChange={value => setForm(f => ({ ...f, stocks_owned: value }))} placeholder="0" />
                  </div>
                  <div>
                    <label style={LABEL}>Avg Cost Price ({form.currency === 'EUR' ? '€' : '₹'})</label>
                    <DecimalInput style={INPUT} value={form.avg_cost_price} onValueChange={value => setForm(f => ({ ...f, avg_cost_price: value }))} placeholder="0.00" />
                  </div>
                </div>

                <div>
                  <label style={LABEL}>Realised P&L ({form.currency === 'EUR' ? '€' : '₹'})</label>
                  <DecimalInput style={INPUT} value={form.realized_pnl} allowNegative onValueChange={value => setForm(f => ({ ...f, realized_pnl: value }))} placeholder="Profit/loss from shares already sold" />
                </div>
              </>
            )}

            <div>
              <label style={LABEL}>Notes</label>
              <textarea style={{ ...INPUT, resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={set('notes')} placeholder="Optional notes…" />
            </div>
          </div>

          {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
            <button type="button" onClick={onClose}
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', padding: '8px 18px', border: '1px solid var(--border)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ background: 'var(--blue)', color: '#fff', padding: '8px 22px', fontWeight: 600, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Holding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
