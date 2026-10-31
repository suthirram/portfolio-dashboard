import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SUPPORTED_CURRENCIES, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate } from '../../lib/formDates'
import { useAuthOptional } from '../auth/AuthContext'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import type { DividendCurrency, DividendRow } from '../../types'
import { useDividends } from './useDividends'
import DividendsTable from './DividendsTable'
import DividendsAnalytics from './DividendsAnalytics'
import DividendModal, { DeleteDividendDialog } from './DividendModal'
import DeleteAllDialog from './DeleteAllDialog'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  padding: '7px 10px', color: 'var(--text-primary)', outline: 'none', fontSize: 13,
}
const card: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '11px 13px', flex: '1 1 180px' }
const cardLabel: CSSProperties = { fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }

interface Props {
  actAsUserId?: string
  actAsLabel?: string
}

// tabFrom reads the ?currency= tab, falling back to INR for anything else.
export function tabFrom(raw: string | null): DividendCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(raw ?? '') ? (raw as DividendCurrency) : 'INR'
}

export default function DividendsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const [params, setParams] = useSearchParams()
  const currency = tabFrom(params.get('currency'))
  const { view, ready, holdings, loading, error, refresh } = useDividends(currency, actAsUserId)
  const [holdingId, setHoldingId] = useState('')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<{ row: DividendRow | null } | null>(null)
  const [deleting, setDeleting] = useState<DividendRow | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  // after closes the dialog and refetches the tab.
  const after = (close: () => void) => () => { close(); void refresh() }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return view.rows.filter(r =>
      (!holdingId || r.holding_id === holdingId) &&
      (!q || r.script.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q)))
  }, [view.rows, holdingId, search])

  return (
    <div className="page-art page-art-history" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}` : '/'} className="btn-icon" aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Dividends</h1>
          {actAsLabel && (
            <span className="pill" style={{ background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)', padding: '3px 8px', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>{actAsLabel}</span>
          )}
        </div>
        <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ width: '100%', maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Currency" style={{ display: 'inline-flex', gap: 4 }}>
            {SUPPORTED_CURRENCIES.map(c => (
              <button key={c} role="tab" aria-selected={c === currency} className={c === currency ? 'btn btn-current' : 'btn'}
                onClick={() => { setParams({ currency: c }); setHoldingId('') }}>
                {currencySymbol(c)} {c}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <select aria-label="Holding" style={{ ...INPUT, cursor: 'pointer' }} value={holdingId} onChange={e => setHoldingId(e.target.value)}>
            <option value="">All holdings</option>
            {view.by_holding.map(h => <option key={h.holding_id} value={h.holding_id}>{h.script || h.symbol}</option>)}
          </select>
          <input aria-label="Search" placeholder="Search holding…" style={{ ...INPUT, minWidth: 200 }} value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn-primary" onClick={() => setEditor({ row: null })}>+ Add dividend</button>
          {view.summary.count > 0 && (
            <button className="btn btn-row-danger" onClick={() => setDeletingAll(true)}>Delete all {currency}</button>
          )}
        </div>

        {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
        {loading && <div className="spinner" style={{ width: 16, height: 16 }} />}

        {/* Nothing tab-specific (rows, totals, edit/delete) until the view is this tab's. */}
        {!ready ? null : view.summary.count === 0 ? (
          <section style={{ ...card, textAlign: 'center', padding: 40 }}>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>No {currency} dividends yet</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Upload a CSV with this header, or add a dividend by hand.</p>
            <code style={{ fontSize: 12 }}>Date,Share Name,Dividend,CUMULATIVE</code>
          </section>
        ) : (
          <>
            <section style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={card}><div style={cardLabel}>Total dividends · {currency}</div><div style={{ fontSize: 18, fontWeight: 700 }}>{formatMoney(view.summary.total, currency)}</div></div>
              <div style={card}><div style={cardLabel}>Dividends</div><div style={{ fontSize: 18, fontWeight: 700 }}>{view.summary.count}</div></div>
              <div style={card}><div style={cardLabel}>Holdings paying</div><div style={{ fontSize: 18, fontWeight: 700 }}>{view.summary.holdings}</div></div>
              <div style={card}><div style={cardLabel}>Range</div><div style={{ fontSize: 13, fontWeight: 700 }}>{formatDate(view.summary.first_date)} → {formatDate(view.summary.last_date)}</div></div>
            </section>
            {visible.length !== view.rows.length && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Showing {visible.length} of {view.rows.length}</p>
            )}
            <DividendsTable rows={visible} currency={currency} onEdit={row => setEditor({ row })} onDelete={setDeleting} />
            <DividendsAnalytics view={view} currency={currency} />
          </>
        )}
      </main>
      {editor && (
        <DividendModal currency={currency} holdings={holdings} editing={editor.row} userId={actAsUserId}
          onClose={() => setEditor(null)} onSaved={after(() => setEditor(null))} />
      )}
      {deleting && (
        <DeleteDividendDialog row={deleting} currency={currency} userId={actAsUserId}
          onClose={() => setDeleting(null)} onDeleted={after(() => setDeleting(null))} />
      )}
      {deletingAll && (
        <DeleteAllDialog currency={currency} count={view.summary.count} userId={actAsUserId}
          onClose={() => setDeletingAll(false)} onDeleted={after(() => setDeletingAll(false))} />
      )}
    </div>
  )
}
