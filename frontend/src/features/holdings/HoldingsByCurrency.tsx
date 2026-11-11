import { useState } from 'react'
import type { HoldingWithPrice } from '../../types'
import HoldingsTable from './HoldingsTable'
import { filterByView, viewCounts, type HoldingView } from './holdingViews'
import { groupByCurrency, type CurrencyCode } from './groupByCurrency'
import { sumTotals, nativeView, nativeSymbols } from './currencyTotals'
import { computeGroupDayChange, type GroupDayChange, type HoldingWithPreviousClose } from './dashboardPriceMovement'
import { xirrNote, type XirrIndex } from './stockXirr'
import { formatRate, rateTone } from '../../lib/rate'
import { formatDate } from '../../lib/formDates'

interface Props {
  holdings: HoldingWithPreviousClose[]
  loading: boolean
  onEdit: (holding: HoldingWithPrice) => void
  onDelete: (id: string) => void
  onTransactions?: (holding: HoldingWithPrice) => void
  /** Stock XIRR (PD-055); null while loading or when /xirr failed. */
  xirr?: XirrIndex | null
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

const fmt = (amount: number, sym: string) => {
  if (!isFinite(amount)) return '—'
  const abs = Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })
  return (amount < 0 ? `-${sym}` : sym) + abs
}


export default function HoldingsByCurrency({ holdings, loading, onEdit, onDelete, onTransactions, xirr }: Props) {
  const [view, setView] = useState<HoldingView>('active')

  const counts = viewCounts(holdings)
  const visible = filterByView(holdings, view)
  const groups = groupByCurrency(visible)

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

      {groups.map(group => {
        const totals = sumTotals(group.holdings)
        const native = group.currency === 'EUR' ? 'EUR' : 'INR'
        const { native: nativeSym, foreign: foreignSym } = nativeSymbols(group.currency)
        const cost = nativeView(group.currency, totals.cost, totals.costEur)
        const value = nativeView(group.currency, totals.value, totals.valueEur)
        const unreal = nativeView(group.currency, totals.unreal, totals.unrealEur)
        const real = nativeView(group.currency, totals.real, totals.realEur)

        const dayChange = computeGroupDayChange(group.holdings)
        // OTHER groups have no XIRR bucket (the backend skips them).
        const bucket = group.currency === 'OTHER' ? undefined : xirr?.byCurrency[group.currency]

        return (
          <section key={group.currency} style={{ marginBottom: 24 }}>
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {CURRENCY_SYMBOL[group.currency]} {CURRENCY_LABEL[group.currency]}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {group.holdings.length} {group.holdings.length === 1 ? 'holding' : 'holdings'}
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
              {dayChange !== null && <ChangeStat dayChange={dayChange} symbol={nativeSym} />}
              {bucket && xirr && (
                <Stat label="XIRR" primary={formatRate(bucket.xirr)}
                  secondary={bucket.since ? `since ${formatDate(bucket.since)}` : 'no flows'}
                  tone={rateTone(bucket.xirr)}
                  title={xirrNote(bucket.since, xirr.asOf, bucket.undated_openings > 0)} />
              )}
            </div>

            <HoldingsTable
              holdings={group.holdings}
              loading={loading}
              onEdit={onEdit}
              onDelete={onDelete}
              onTransactions={onTransactions}
              view="all"
              nativeCurrency={group.currency === 'EUR' ? 'EUR' : 'INR'}
              xirr={xirr}
            />
          </section>
        )
      })}
    </>
  )
}

// ChangeStat shows the native-amount move vs the previous close (no FX), as a
// "Today" entry inside the currency group card. The gain and its percentage
// come from the holdings' own previous closes (snapshot first, else Yahoo),
// so intraday buys/sells don't inflate them and no History row is needed.
function ChangeStat({ dayChange, symbol }: { dayChange: GroupDayChange; symbol: string }) {
  const up = dayChange.gain >= 0
  const pct = dayChange.pct === null ? '—' : `${up ? '+' : '-'}${Math.abs(dayChange.pct).toFixed(2)}%`
  return (
    <Stat
      label="Today"
      primary={`${up ? '▲' : '▼'} ${fmt(Math.abs(dayChange.gain), symbol)}`}
      secondary={pct}
      tone={up ? 'pos' : 'neg'}
    />
  )
}

function Stat({ label, primary, secondary, tone, title }: {
  label: string; primary: string; secondary: string; tone?: ReturnType<typeof rateTone>; title?: string
}) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 120 }} title={title || undefined}>
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
