import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type GoldMetrics, type GoldPrice, type GoldTransaction } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import { formatDate } from '../../lib/formDates'
import ThemePicker from '../../components/ThemePicker'
import { useAuthOptional } from '../auth/AuthContext'
import { ArrowLeftIcon, EditIcon, PlusIcon, TrashIcon } from '../../components/Icon'
import GoldTxnModal from './GoldTxnModal'
import GoldPricesPanel from './GoldPricesPanel'
import GoldMetricsPanel from './GoldMetricsPanel'
import MissingPricesModal from './MissingPricesModal'

// The full PRD-003 §5 column set: entered fields interleaved with the
// server-computed columns (shaded), in the owner's spreadsheet order.
const fmt = (value: number | null | undefined, digits = 2) =>
  value == null ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: digits })

export default function GoldPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const [rows, setRows] = useState<GoldTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; txn: GoldTransaction | null }>({ open: false, txn: null })
  const [busy, setBusy] = useState<number | null>(null)
  const [prices, setPrices] = useState<GoldPrice[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [metrics, setMetrics] = useState<GoldMetrics | null>(null)
  const [promptSkipped, setPromptSkipped] = useState(false)

  // fetchAll refreshes every gold slice at once. The gap list drives the
  // blocking prompt (PRD-003 §7), metrics is the live summary (§6).
  const fetchAll = useCallback(async () => {
    const [txns, priceRows, gaps, goldMetrics] = await Promise.all([
      api.listGoldTransactions(),
      api.listGoldPrices(),
      api.listGoldMissingDates(),
      api.getGoldMetrics(),
    ])
    setRows(txns)
    setPrices(priceRows)
    setMissing(gaps.missing)
    setMetrics(goldMetrics)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      await fetchAll()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load gold data')
    } finally {
      setLoading(false)
    }
  }, [fetchAll])

  // refresh re-pulls data without the full-page spinner — used after a save
  // so the missing-price prompt re-renders with the days still left blank
  // instead of the whole page flashing to a loading state. Clears the error
  // banner up front (like load) so a stale failure does not linger after a
  // later refresh succeeds.
  const refresh = useCallback(async () => {
    setErr(null)
    try {
      await fetchAll()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to refresh gold data')
    }
  }, [fetchAll])

  useEffect(() => { void load() }, [load])

  const remove = async (txn: GoldTransaction) => {
    if (!confirm(`Delete the ${formatDate(txn.date)} purchase of ${txn.grams_bought} g?`)) return
    setBusy(txn.id)
    try {
      await api.deleteGoldTransaction(txn.id)
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
    <div className="page-art page-art-gold" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/" className="btn-icon" aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700 }}>Gold</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

          <button onClick={() => setModal({ open: true, txn: null })} className="btn-primary">
            <PlusIcon size={14} /> Add purchase
          </button>
          <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
        </div>
      </header>

      <main className="page-main" style={{ maxWidth: 2000, margin: '0 auto' }}>
        <GoldMetricsPanel metrics={metrics} />
        {err && (
          <div className="alert-danger">{err}</div>
        )}

        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflowX: 'auto', marginTop: 24,
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
                  <th scope="col" style={{ ...th, textAlign: 'left' }}>Date</th>
                  <th scope="col" style={th}>gm Price</th>
                  <th scope="col" style={th}>Weight</th>
                  <th scope="col" style={{ ...th, ...computed }}>Gold cost</th>
                  <th scope="col" style={{ ...th, ...computed }}>3%</th>
                  <th scope="col" style={{ ...th, ...computed }}>Total expected</th>
                  <th scope="col" style={th}>Price in quote</th>
                  <th scope="col" style={{ ...th, ...computed }}>3% (quote)</th>
                  <th scope="col" style={th}>Amt per bill</th>
                  <th scope="col" style={th}>Actual paid</th>
                  <th scope="col" style={{ ...th, ...computed }}>Nett per gram</th>
                  <th scope="col" style={{ ...th, ...computed }}>Nett reduction</th>
                  <th scope="col" style={th}>Billed weight</th>
                  <th scope="col" style={{ ...th, ...computed }}>LOSS due to NIMMI</th>
                  <th scope="col" style={th}>Chennai rate</th>
                  <th scope="col" style={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map(txn => (
                  <tr key={txn.id}>
                    <td style={{ ...td, textAlign: 'left' }}>{formatDate(txn.date)}</td>
                    <td style={td}>{fmt(txn.gm_price)}</td>
                    <td style={td}>{fmt(txn.grams_bought, 3)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.gold_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.gst_on_cost)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.total_expected)}</td>
                    <td style={td}>{fmt(txn.quote_price)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.gst_on_quote)}</td>
                    <td style={td}>{fmt(txn.bill_amount)}</td>
                    <td style={td}>{fmt(txn.actual_paid)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.nett_per_gram)}</td>
                    <td style={{ ...td, ...computed }}>{fmt(txn.nett_reduction)}</td>
                    <td style={td}>{fmt(txn.billed_weight, 3)}</td>
                    <td style={{ ...td, ...computed, color: txn.nimmi_loss > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {fmt(txn.nimmi_loss)}
                    </td>
                    <td style={td}>{txn.chennai_rate || '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button aria-label={`Edit ${formatDate(txn.date)}`} disabled={busy === txn.id}
                          onClick={() => setModal({ open: true, txn })}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}>
                          <EditIcon size={14} />
                        </button>
                        <button aria-label={`Delete ${formatDate(txn.date)}`} disabled={busy === txn.id}
                          onClick={() => void remove(txn)}
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

        {!loading && <GoldPricesPanel prices={prices} onSaved={() => void refresh()} />}
      </main>

      {modal.open && (
        <GoldTxnModal txn={modal.txn} onClose={() => setModal({ open: false, txn: null })} onSaved={() => void refresh()} />
      )}

      {/* Blocking gap prompt (PRD-003 §7): only once the page has loaded, the
          user hasn't dismissed it this visit, and gaps remain. Saving fills
          only the days the user typed and refreshes — the prompt re-renders
          with the days still blank, re-asking, until they are all filled or
          the user skips. */}
      {!loading && !promptSkipped && missing.length > 0 && (
        <MissingPricesModal
          missing={missing}
          onSkip={() => setPromptSkipped(true)}
          onSaved={() => void refresh()}
        />
      )}
    </div>
  )
}
