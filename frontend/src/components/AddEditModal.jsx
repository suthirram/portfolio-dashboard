import React, { useState, useEffect } from 'react'
import { api } from '../api/client.js'

const EXCHANGES = ['NSE', 'BSE', 'NYSE', 'NASDAQ', 'OTHER']
const TYPES = ['stock', 'etf']

const empty = {
  script: '', symbol: '', exchange: 'NSE', type: 'stock',
  stocks_owned: '', avg_cost_price: '', realized_pnl: '', notes: '',
}

const INPUT = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)',
  outline: 'none', transition: 'border-color 0.15s',
}
const LABEL = { display: 'block', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }
const ROW2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }

export default function AddEditModal({ holding, onClose, onSaved }) {
  const isEdit = Boolean(holding)
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [livePrice, setLivePrice] = useState(null)

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
      })
    } else {
      setForm(empty)
    }
    setLivePrice(null)
  }, [holding])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleLookup = async () => {
    if (!form.symbol) return
    setLookupLoading(true)
    try {
      const data = await api.getMarketPrice(form.symbol)
      setLivePrice(data)
    } catch (e) {
      setLivePrice({ error: e.message })
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!form.script.trim()) { setErr('Script name is required'); return }

    setLoading(true)
    try {
      const payload = {
        script: form.script.trim(),
        symbol: form.symbol.trim(),
        exchange: form.exchange,
        type: form.type,
        stocks_owned: parseFloat(form.stocks_owned) || 0,
        avg_cost_price: parseFloat(form.avg_cost_price) || 0,
        realized_pnl: parseFloat(form.realized_pnl) || 0,
        notes: form.notes.trim(),
      }
      let saved
      if (isEdit) {
        saved = await api.updateHolding(holding.id, payload)
      } else {
        saved = await api.createHolding(payload)
      }
      onSaved(saved)
    } catch (e) {
      setErr(e.message)
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
                  <div style={{ marginTop: 4, fontSize: 11, color: livePrice.error ? 'var(--red)' : 'var(--green)' }}>
                    {livePrice.error ? `Error: ${livePrice.error}` : `✓ ₹${livePrice.price?.toLocaleString('en-IN')} ${livePrice.currency || ''}`}
                  </div>
                )}
              </div>
            </div>

            <div style={ROW2}>
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
            </div>

            <div style={ROW2}>
              <div>
                <label style={LABEL}>Shares Owned</label>
                <input style={INPUT} type="number" min="0" step="any" value={form.stocks_owned} onChange={set('stocks_owned')} placeholder="0" />
              </div>
              <div>
                <label style={LABEL}>Avg Cost Price (₹)</label>
                <input style={INPUT} type="number" min="0" step="any" value={form.avg_cost_price} onChange={set('avg_cost_price')} placeholder="0.00" />
              </div>
            </div>

            <div>
              <label style={LABEL}>Realised P&L (₹)</label>
              <input style={INPUT} type="number" step="any" value={form.realized_pnl} onChange={set('realized_pnl')} placeholder="Profit/loss from shares already sold" />
            </div>

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
