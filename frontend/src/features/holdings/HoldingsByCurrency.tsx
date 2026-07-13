import { useState } from 'react'
import type { CurrencyChange, HoldingWithPrice } from '../../types'
import HoldingsTable from './HoldingsTable'
import { filterByView, viewCounts, type HoldingView } from './holdingViews'
import { groupByCurrency, type CurrencyCode } from './groupByCurrency'
import { sumTotals, nativeView, nativeSymbols } from './currencyTotals'
import type { HoldingWithPreviousClose } from './dashboardPriceMovement'

interface Props {
  holdings: HoldingWithPreviousClose[]
  loading: boolean
  onEdit: (holding: HoldingWithPrice) => void
  onDelete: (id: string) => void
  onTransactions?: (holding: HoldingWithPrice) => void
  // Native-amount daily change per currency (from /api/summary). Rendered as
  // a "Today" stat inside the matching currency group card.
  perCurrency?: CurrencyChange[]
}

// A group's CurrencyCode maps to a backend per-currency bucket: INR/EUR are
// 1:1; the OTHER bucket is currently only USD holdings.
const GROUP_TO_BUCKET: Record<CurrencyCode, string> = {
  INR: 'INR',
  EUR: 'EUR',
  OTHER: 'USD',
}

const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  INR: 'Indian Rupee',
  EUR: 'Euro',
  OTHER: 'Other',
}

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹',
  EUR: '€',
  OTHER: '',
}

const fmt = (n: number, sym: string) => {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return (n < 0 ? `-${sym}` : sym) + abs
}


export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions, perCurrency }: Props) {
  const [view, setView] = useState<HoldingView>('active')

  const counts = viewCounts(holdings)
  const visible = filterByView(holdings, view)
  const groups = groupByCurrency(visible)

  const changeByBucket = new Map((perCurrency ?? []).map(c => [c.currency, c]))

  const segBtn = (key: HoldingView, label: string, count: number) => (
    <button
      key={key}
      type="button"
      className="seg-btn"
      aria-pressed={view === key}
      onClick={() => setView(key)}>
      {label}
      <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', opacity: 0.8 }}>
        {count}
      </span>
    </button>
  )

  return (
    <>
      <div className="seg-group" style={{ marginBottom: 12 }}>
        {segBtn('active', 'Holdings', counts.active)}
        {segBtn('all', 'All', counts.all)}
        {segBtn('nil', 'Nil', counts.nil)}
      </div>

      {groups.length === 0 && !loading && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: 48, textAlign: 'center', color: 'var(--text-muted)',
        }}>
          {counts.all === 0
            ? 'No holdings yet. Click "Add Holding" to get started.'
            : view === 'nil'
              ? 'No nil holdings. Fully-exited positions (0 shares) will appear here.'
              : 'No active holdings — all positions exited. Switch to "Nil" to see them.'}
        </div>
      )}

      {groups.map(g => {
        const totals = sumTotals(g.holdings)
        const native = g.currency === 'EUR' ? 'EUR' : 'INR'
        const { native: nativeSym, foreign: foreignSym } = nativeSymbols(g.currency)
        const cost = nativeView(g.currency, totals.cost, totals.costEur)
        const value = nativeView(g.currency, totals.value, totals.valueEur)
        const unreal = nativeView(g.currency, totals.unreal, totals.unrealEur)
        const real = nativeView(g.currency, totals.real, totals.realEur)
        const change = changeByBucket.get(GROUP_TO_BUCKET[g.currency])

        return (
          <section key={g.currency} style={{ marginBottom: 24 }}>
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {CURRENCY_SYMBOL[g.currency]} {CURRENCY_LABEL[g.currency]}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {g.holdings.length} {g.holdings.length === 1 ? 'holding' : 'holdings'}
              </span>
            </header>

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 12,
              display: 'flex', flexWrap: 'wrap', gap: 16,
            }}>
              <Stat label={`Cost (${native})`} primary={fmt(cost.primary, nativeSym)} secondary={fmt(cost.secondary, foreignSym)} />
              <Stat label={`Current value (${native})`} primary={fmt(value.primary, nativeSym)} secondary={fmt(value.secondary, foreignSym)} />
              <Stat label="Unrealised" primary={fmt(unreal.primary, nativeSym)} secondary={fmt(unreal.secondary, foreignSym)} tone={unreal.primary >= 0 ? 'pos' : 'neg'} />
              <Stat label="Realised" primary={fmt(real.primary, nativeSym)} secondary={fmt(real.secondary, foreignSym)} tone={real.primary >= 0 ? 'pos' : 'neg'} />
              {change && <ChangeStat change={change} symbol={nativeSym} />}
            </div>

            <HoldingsTable
              holdings={g.holdings}
              loading={loading}
              onEdit={onEdit}
              onDelete={onDelete}
              onTransactions={onTransactions}
              view="all"
              nativeCurrency={g.currency === 'EUR' ? 'EUR' : 'INR'}
            />
          </section>
        )
      })}
    </>
  )
}

// ChangeStat shows the native-amount move vs the previous close (no FX), as a
// "Today" entry inside the currency group card. pct is null when the previous
// close was zero.
function ChangeStat({ change, symbol }: { change: CurrencyChange; symbol: string }) {
  const value = change.change_value ?? 0
  const up = value >= 0
  const pct = change.change_pct == null ? '—' : `${up ? '+' : '-'}${Math.abs(change.change_pct).toFixed(2)}%`
  return (
    <Stat
      label="Today"
      primary={`${up ? '▲' : '▼'} ${fmt(Math.abs(value), symbol)}`}
      secondary={pct}
      tone={up ? 'pos' : 'neg'}
    />
  )
}

function Stat({ label, primary, secondary, tone }: {
  label: string; primary: string; secondary: string; tone?: 'pos' | 'neg'
}) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 120 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div className={tone ? `mono ${tone}` : 'mono'} style={{ fontSize: 18, fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {primary}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap' }}>
        ({secondary})
      </div>
    </div>
  )
}
