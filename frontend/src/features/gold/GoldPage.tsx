import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type GoldPrice, type GoldTransaction } from '../../lib/api/client'
import { EditIcon, PlusIcon, TrashIcon } from '../../components/Icon'
import GoldTxnModal from './GoldTxnModal'
import GoldPricesPanel from './GoldPricesPanel'
import MissingPricesModal from './MissingPricesModal'

// The full PRD-003 §5 column set: entered fields interleaved with the
// server-computed columns (shaded), in the owner's spreadsheet order.
const fmt = (v: number | null | undefined, digits = 2) =>
  v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: digits })

export default function GoldPage() {
  const [rows, setRows] = useState<GoldTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; txn: GoldTransaction | null }>({ open: false, txn: null })
  const [busy, setBusy] = useState<number | null>(null)
  const [prices, setPrices] = useState<GoldPrice[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [promptSkipped, setPromptSkipped] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      // Transactions, recent prices, and the gap list load together — the
      // gap list drives the blocking prompt (PRD-003 §7).
      const [txns, priceRows, gaps] = await Promise.all([
        api.listGoldTransactions(),
        api.listGoldPrices(),
        api.listGoldMissingDates(),
      ])
      setRows(txns)
      setPrices(priceRows)
      setMissing(gaps.missing)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load gold data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const remove = async (t: GoldTransaction) => {
    if (!confirm(`Delete the ${t.date} purchase of ${t.grams_bought} g?`)) return
    setBusy(t.id)
    try {
      await api.deleteGoldTransaction(t.id)
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Delete failed')
    } finally {
      setBusy(null)
    }
  }

  const th: CSSProperties = {
    padding: '8px 10px', textAlign: 'right', fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: CSSProperties = {
    padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 13,
    textAlign: 'right', whiteSpace: 'nowrap',
  }
  const computed: CSSProperties = { background: 'var(--bg-card)' }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
        padding: '0 28px', height: 'var(--nav-height)', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13 }}>← Dashboard</Link>
          <h1 style={{ fontSize: 17, fontWeight: 700 }}>Gold</h1>
        </div>
        <button onClick={() => setModal({ open: true, txn: null })} style={{
          background: 'var(--blue)', color: '#fff', padding: '6px 16px',
          fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <PlusIcon size={14} /> Add purchase
        </button>
      </header>

      <main style={{ padding: 28, maxWidth: 1600, margin: '0 auto' }}>
        {err && (
          <div style={{
            background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)',
            padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13,
          }}>{err}</div>
        )}

        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflowX: 'auto',
        }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><span className="spinner" /></div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
              No gold purchases yet. Add the first one.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Date</th>
                  <th style={th}>gm Price</th>
                  <th style={th}>Weight</th>
                  <th style={{ ...th, ...computed }}>Gold cost</th>
                  <th style={{ ...th, ...computed }}>3%</th>
                  <th style={{ ...th, ...computed }}>Total expected</th>
                  <th style={th}>Price in quote</th>
                  <th style={{ ...th, ...computed }}>3% (quote)</th>
                  <th style={th}>Amt per bill</th>
                  <th style={th}>Actual paid</th>
                  <th style={{ ...th, ...computed }}>Nett per gram</th>
                  <th style={{ ...th, ...computed }}>Nett reduction</th>
                  <th style={th}>Billed weight</th>
                  <th style={{ ...th, ...computed }}>LOSS due to NIMMI</th>
                  <th style={th}>Chennai rate</th>
                  <th style={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, textAlign: 'left' }}>{t.date}</td>
                    <td style={td}>{fmt(t.gm_price)}</td>
                    <td style={td}>{fmt(t.grams_bought, 3)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.gold_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.gst_on_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.total_expected)}</td>
                    <td style={td}>{fmt(t.quote_price)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.gst_on_quote)}</td>
                    <td style={td}>{fmt(t.bill_amount)}</td>
                    <td style={td}>{fmt(t.actual_paid)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.nett_per_gram)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(t.nett_reduction)}</td>
                    <td style={td}>{fmt(t.billed_weight, 3)}</td>
                    <td style={{ ...td, ...computed, color: t.nimmi_loss > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {fmt(t.nimmi_loss)}
                    </td>
                    <td style={td}>{fmt(t.chennai_rate)}</td>
                    <td style={td}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button aria-label={`Edit ${t.date}`} disabled={busy === t.id}
                          onClick={() => setModal({ open: true, txn: t })}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}>
                          <EditIcon size={14} />
                        </button>
                        <button aria-label={`Delete ${t.date}`} disabled={busy === t.id}
                          onClick={() => void remove(t)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2 }}>
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && <GoldPricesPanel prices={prices} onSaved={() => void load()} />}
      </main>

      {modal.open && (
        <GoldTxnModal txn={modal.txn} onClose={() => setModal({ open: false, txn: null })} onSaved={() => void load()} />
      )}

      {/* Blocking gap prompt (PRD-003 §7): only once the page has loaded, the
          user hasn't dismissed it this visit, and gaps remain. */}
      {!loading && !promptSkipped && missing.length > 0 && (
        <MissingPricesModal
          missing={missing}
          onSkip={() => setPromptSkipped(true)}
          onSaved={() => { setPromptSkipped(true); void load() }}
        />
      )}
    </div>
  )
}
