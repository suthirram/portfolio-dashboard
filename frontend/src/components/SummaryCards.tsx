import type { CurrencyChange, Summary } from '../types'

const fmt = (n: number, currency = '₹') =>
  `${currency}${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtEur = (n: number) =>
  `€${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CCY_SYMBOL: Record<string, string> = { INR: '₹', EUR: '€', USD: '$' }

// DailyChange is the increase/decrease vs the previous close, shown under
// the Current Value card. value is in INR base; pct is null when the
// previous close was zero.
interface DailyChange {
  value: number
  pct: number | null
  date?: string
}

// ChangeLine renders a coloured ▲/▼ delta + percent + the close date.
function ChangeLine({ change }: { change: DailyChange }) {
  const up = change.value >= 0
  const cls = up ? 'pos' : 'neg'
  const arrow = up ? '▲' : '▼'
  const pct = change.pct == null ? '' : ` (${up ? '+' : '-'}${Math.abs(change.pct).toFixed(2)}%)`
  return (
    <div style={{ fontSize: 12, marginTop: 6, fontVariantNumeric: 'tabular-nums' }} className={cls}>
      {arrow} {fmt(change.value)}{pct}
      {change.date && (
        <span style={{ color: 'var(--text-muted)' }}> vs {change.date} close</span>
      )}
    </div>
  )
}

interface CardProps {
  label: string
  inr: number
  eur: number
  positive?: boolean
  negative?: boolean
  highlight?: boolean
  change?: DailyChange
}

function Card({ label, inr, eur, positive, negative, highlight, change }: CardProps) {
  const sign = inr < 0 ? '-' : ''
  const cls = positive ? 'pos' : negative ? 'neg' : ''

  return (
    <div style={{
      background: highlight ? 'var(--card-highlight-bg)' : 'var(--bg-card)',
      border: `1px solid ${highlight ? 'var(--card-highlight-border)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      flex: '1 1 180px',
      minWidth: 160,
    }}>
      <div style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} className={cls}>
        {sign}{fmt(inr)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }} className={cls}>
        {sign}{fmtEur(eur)}
      </div>
      {change && <ChangeLine change={change} />}
    </div>
  )
}

// PerCurrencyStrip shows the native-amount change per currency (₹/€/$)
// vs the previous close — no FX conversion, so each is its own price move.
function PerCurrencyStrip({ items }: { items: CurrencyChange[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
      {items.map(c => {
        const sym = CCY_SYMBOL[c.currency ?? ''] ?? ''
        const change = c.change_value ?? 0
        const up = change >= 0
        const pct = c.change_pct == null ? '' : ` (${up ? '+' : '-'}${Math.abs(c.change_pct).toFixed(2)}%)`
        return (
          <span key={c.currency}>
            <span style={{ color: 'var(--text-secondary)' }}>{sym} </span>
            <span className={up ? 'pos' : 'neg'}>{up ? '▲' : '▼'} {fmt(change, sym)}{pct}</span>
          </span>
        )
      })}
    </div>
  )
}

interface SummaryCardsProps {
  summary: Summary | null
  loading: boolean
}

export default function SummaryCards({ summary, loading }: SummaryCardsProps) {
  if (!summary) return null
  const {
    total_cost = 0,
    total_current_value = 0,
    total_unrealized = 0,
    total_realized = 0,
    total_cost_eur = 0,
    total_current_value_eur = 0,
    total_unrealized_eur = 0,
    total_realized_eur = 0,
    eur_rate = 0,
    change_value,
    change_pct,
    previous_close_date,
    per_currency,
  } = summary

  const totalPnL = total_unrealized + total_realized
  const totalPnLEur = total_unrealized_eur + total_realized_eur

  // Daily change is present only when the user has a prior snapshot.
  const dailyChange = change_value != null
    ? { value: change_value, pct: change_pct ?? null, date: previous_close_date }
    : undefined

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          Portfolio Overview
        </h2>
        {eur_rate > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
            1 EUR = ₹{(1 / eur_rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
        )}
        {loading && <div className="spinner" style={{ width: 14, height: 14 }} />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Card label="Total Invested" inr={total_cost} eur={total_cost_eur} highlight />
        <Card label="Current Value" inr={total_current_value} eur={total_current_value_eur} highlight
          change={dailyChange} />
        <Card label="Unrealised P&L" inr={total_unrealized} eur={total_unrealized_eur}
          positive={total_unrealized >= 0} negative={total_unrealized < 0} />
        <Card label="Realised P&L" inr={total_realized} eur={total_realized_eur}
          positive={total_realized >= 0} negative={total_realized < 0} />
        <Card label="Total P&L" inr={totalPnL} eur={totalPnLEur}
          positive={totalPnL >= 0} negative={totalPnL < 0} />
      </div>
      {per_currency && per_currency.length > 0 && <PerCurrencyStrip items={per_currency} />}
    </div>
  )
}
