import type React from 'react'
import type { Summary } from '../types'

const fmt = (n: number, currency = '₹') =>
  `${currency}${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtEur = (n: number) =>
  `€${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ChangeRow is one native-currency line in the grouped daily-change card:
// the move vs the previous close in that currency's own units. pct is null
// when the previous close was zero.
interface ChangeRow {
  name: string
  symbol: string
  value: number
  pct: number | null
}

// ChangeLine renders one currency as a full-width tinted row: a currency
// badge on the left, the ▲/▼ native delta and a percent chip on the right.
// The tint (green/red) makes gainers/losers scannable at a glance.
function ChangeLine({ row }: { row: ChangeRow }) {
  const up = row.value >= 0
  const cls = up ? 'pos' : 'neg'
  const arrow = up ? '▲' : '▼'
  const pct = row.pct == null ? '—' : `${up ? '+' : '-'}${Math.abs(row.pct).toFixed(2)}%`
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '5px 10px', marginTop: 6, borderRadius: 'var(--radius-sm)',
      background: up ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
      fontVariantNumeric: 'tabular-nums', minWidth: 0,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{row.symbol}</span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>{row.name}</span>
      </span>
      <span className={cls} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{arrow} {fmt(row.value, row.symbol)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap' }}>{pct}</span>
      </span>
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
  accent?: boolean
}

function Card({ label, inr, eur, positive, negative, highlight, accent }: CardProps) {
  const sign = inr < 0 ? '-' : ''
  const cls = positive ? 'pos' : negative ? 'neg' : ''

  return (
    <div style={cardStyle(highlight)}>
      <div style={cardLabelStyle}>{label}</div>
      <div style={{
        fontSize: accent ? 28 : 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        ...(accent ? { color: 'var(--blue)' } : {}),
      }} className={cls}>
        {sign}{fmt(inr)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }} className={cls}>
        {sign}{fmtEur(eur)}
      </div>
    </div>
  )
}

// ChangeCard is the grouped daily-change card (replacing the Unrealised /
// Realised P&L cards). It stacks one native line per currency that has a
// prior-snapshot value (India ₹ / EUR € / USD $) — only the currencies the
// user actually holds — at a fixed card width regardless of line count.
function ChangeCard({ rows, date }: { rows: ChangeRow[]; date?: string }) {
  return (
    <div style={cardStyle(false)}>
      <div style={cardLabelStyle}>Change vs Prev Close</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>—</div>
      ) : (
        rows.map(r => <ChangeLine key={r.name} row={r} />)
      )}
      {date && rows.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>vs {date} close</div>
      )}
    </div>
  )
}

// PnLRow is one tinted line in the combined P&L card: a label on the left,
// the INR amount with its EUR equivalent on the right, coloured by sign.
function PnLRow({ label, inr, eur }: { label: string; inr: number; eur: number }) {
  const up = inr >= 0
  const cls = up ? 'pos' : 'neg'
  const sign = inr < 0 ? '-' : ''
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '5px 10px', marginTop: 6, borderRadius: 'var(--radius-sm)',
      background: up ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
      fontVariantNumeric: 'tabular-nums', minWidth: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span className={cls} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{sign}{fmt(inr)}</span>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap' }}>{sign}{fmtEur(eur)}</span>
      </span>
    </div>
  )
}

// PnLCard groups realised and unrealised P&L into a single card, mirroring
// the change card's row layout.
function PnLCard({ unrealInr, unrealEur, realInr, realEur }: {
  unrealInr: number; unrealEur: number; realInr: number; realEur: number
}) {
  return (
    <div style={cardStyle(false)}>
      <div style={cardLabelStyle}>Profit &amp; Loss</div>
      <PnLRow label="Unrealised" inr={unrealInr} eur={unrealEur} />
      <PnLRow label="Realised" inr={realInr} eur={realEur} />
    </div>
  )
}

const cardStyle = (highlight?: boolean): React.CSSProperties => ({
  background: highlight ? 'var(--card-highlight-bg)' : 'var(--bg-card)',
  border: `1px solid ${highlight ? 'var(--card-highlight-border)' : 'var(--border)'}`,
  borderRadius: 'var(--radius)',
  padding: '16px 20px',
  flex: '1 1 200px',
  minWidth: 180,
  overflow: 'hidden',
})

const cardLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
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
    previous_close_date,
    per_currency,
  } = summary

  const totalPnL = total_unrealized + total_realized
  const totalPnLEur = total_unrealized_eur + total_realized_eur

  // Daily change vs previous close, grouped into one card with one native
  // line per currency the user holds — India ₹, EUR €, USD $. A line is
  // built only when that currency has a per-currency entry (i.e. a prior
  // snapshot with value in it), so single-currency users see just one line.
  const CCY_META: { code: string; name: string; symbol: string }[] = [
    { code: 'INR', name: 'INR', symbol: '₹' },
    { code: 'EUR', name: 'EUR', symbol: '€' },
    { code: 'USD', name: 'USD', symbol: '$' },
  ]
  const changeRows: ChangeRow[] = CCY_META.flatMap(({ code, name, symbol }) => {
    const c = per_currency?.find(x => x.currency === code)
    return c ? [{ name, symbol, value: c.change_value ?? 0, pct: c.change_pct ?? null }] : []
  })

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
        <Card label="Current Value" inr={total_current_value} eur={total_current_value_eur} highlight accent />
        <ChangeCard rows={changeRows} date={previous_close_date} />
        <PnLCard unrealInr={total_unrealized} unrealEur={total_unrealized_eur}
          realInr={total_realized} realEur={total_realized_eur} />
        <Card label="Total P&L" inr={totalPnL} eur={totalPnLEur}
          positive={totalPnL >= 0} negative={totalPnL < 0} />
      </div>
    </div>
  )
}
