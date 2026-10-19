import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Holding, TransactionType, TransactionWithHolding } from '../../types'
import { useAllTransactions } from './useAllTransactions'
import TransactionsAllTable from './TransactionsAllTable'
import TransactionsModal, { TYPE_LABEL } from '../holdings/TransactionsModal'
import { useAuthOptional } from '../auth/AuthContext'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { formatMoney } from '../../lib/currency'
import {
  applyFilters,
  currencyFacet,
  currencySubtotals,
  defaultSort,
  emptyFilters,
  sortRows,
  toggleSort,
  typeFacet,
  type Filters,
  type SortKey,
} from './transactionFilters'

const INPUT: CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '7px 10px',
  color: 'var(--text-primary)', outline: 'none', fontSize: 13,
}
const LABEL: CSSProperties = {
  display: 'block', color: 'var(--text-secondary)', fontSize: 10, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
}

interface Props {
  // Set by the admin act-as route; absent for a user's own ledger.
  actAsUserId?: string
  actAsLabel?: string
}

export default function TransactionsPage({ actAsUserId, actAsLabel }: Props) {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const { transactions, holdings, loading, error, refresh } = useAllTransactions(actAsUserId)

  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [sort, setSort] = useState(defaultSort())
  const [editing, setEditing] = useState<Holding | null>(null)

  const patch = (next: Partial<Filters>) => setFilters(f => ({ ...f, ...next }))

  const toggleIn = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value]

  // Facets come from the full ledger, so a chip never disappears just
  // because the current filter excluded its last row.
  const types = useMemo(() => typeFacet(transactions), [transactions])
  const currencies = useMemo(() => currencyFacet(transactions), [transactions])

  const visible = useMemo(
    () => sortRows(applyFilters(transactions, filters), sort),
    [transactions, filters, sort],
  )
  const subtotals = useMemo(() => currencySubtotals(visible), [visible])

  const filtered = visible.length !== transactions.length
  const holdingsById = useMemo(
    () => new Map(holdings.map(h => [h.id, h])),
    [holdings],
  )

  const openEditor = (row: TransactionWithHolding) => {
    const holding = holdingsById.get(row.holding_id || '')
    if (holding) setEditing(holding)
  }

  return (
    <div className="page-art page-art-history" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to={actAsUserId ? `/admin/users/${actAsUserId}` : '/'} className="btn-icon"
            aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>All transactions</h1>
          {actAsLabel && (
            <span className="pill" style={{
              background: 'var(--blue-dim)', color: 'var(--blue)',
              border: '1px solid var(--blue)', padding: '3px 8px',
              borderRadius: 'var(--radius-sm)', fontSize: 11,
            }}>{actAsLabel} · read-only</span>
          )}
        </div>
        <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ width: '100%', maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
          Every ledger event across all holdings, newest first. Positions are derived
          from this ledger (average cost), so editing happens in the owning holding.
        </p>

        {/* Filters */}
        <section style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '13px 14px',
          display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end',
        }}>
          <div>
            <label style={LABEL} htmlFor="txn-search">Search</label>
            <input id="txn-search" style={{ ...INPUT, minWidth: 210 }} value={filters.search}
              placeholder="Script, symbol or notes"
              onChange={e => patch({ search: e.target.value })} />
          </div>

          <div>
            <label style={LABEL} htmlFor="txn-holding">Holding</label>
            <select id="txn-holding" style={{ ...INPUT, cursor: 'pointer', minWidth: 150 }}
              value={filters.holdingIds[0] ?? ''}
              onChange={e => patch({ holdingIds: e.target.value ? [e.target.value] : [] })}>
              <option value="">All holdings</option>
              {holdings.map(h => <option key={h.id} value={h.id}>{h.script}</option>)}
            </select>
          </div>

          {types.length > 1 && (
            <div>
              <span style={LABEL}>Type</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {types.map(t => (
                  <Chip key={t} on={filters.types.includes(t)}
                    onClick={() => patch({ types: toggleIn<TransactionType>(filters.types, t) })}>
                    {TYPE_LABEL[t] || t}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {currencies.length > 1 && (
            <div>
              <span style={LABEL}>Currency</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {currencies.map(c => (
                  <Chip key={c} on={filters.currencies.includes(c)}
                    onClick={() => patch({ currencies: toggleIn(filters.currencies, c) })}>
                    {c}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={LABEL} htmlFor="txn-from">From</label>
            <input id="txn-from" type="date" style={INPUT} value={filters.from}
              onChange={e => patch({ from: e.target.value })} />
          </div>
          <div>
            <label style={LABEL} htmlFor="txn-to">To</label>
            <input id="txn-to" type="date" style={INPUT} value={filters.to}
              onChange={e => patch({ to: e.target.value })} />
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {filtered && (
              <button className="btn btn-sm" onClick={() => setFilters(emptyFilters())}>
                Clear filters
              </button>
            )}
            {/* Count is the only "a filter is active" signal needed; it reads
                "6 of 142" whenever the set is narrowed. */}
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              <strong className="mono" style={{ color: 'var(--text-primary)' }}>{visible.length}</strong>
              {filtered && <> of <span className="mono">{transactions.length}</span></>} transactions
            </span>
          </div>
        </section>

        {/* Per-currency subtotals — never combined across currencies. */}
        {subtotals.length > 0 && (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {subtotals.map(s => (
              <div key={s.currency} className="card" style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {s.currency}
                </div>
                <SubRow label="Bought" value={formatMoney(s.bought, s.currency)} />
                <SubRow label="Sold" value={formatMoney(s.sold, s.currency)} />
                <SubRow label="Dividends" value={formatMoney(s.dividends, s.currency)} />
              </div>
            ))}
          </section>
        )}

        {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <span className="spinner" />
          </div>
        ) : transactions.length === 0 ? (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            background: 'var(--bg-secondary)', padding: 44, textAlign: 'center',
            display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
              No transactions yet
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Record a buy, sell or dividend from a holding's ledger and it shows up here.
            </span>
          </div>
        ) : (
          <TransactionsAllTable
            rows={visible}
            sort={sort}
            onSort={(key: SortKey) => setSort(s => toggleSort(s, key))}
            // No editing in act-as: there is no act-as ledger write path.
            onEdit={actAsUserId ? undefined : openEditor}
          />
        )}
      </main>

      {editing && (
        <TransactionsModal
          holding={editing}
          onClose={() => setEditing(null)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  )
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-pressed={on} className="btn btn-sm"
    style={{ borderRadius: 999 }}>{children}</button>
)

const SubRow = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, color: 'var(--text-secondary)' }}>
    <span>{label}</span>
    <span className="mono" style={{ color: 'var(--text-primary)' }}>{value}</span>
  </div>
)
