import { useState, useRef } from 'react'
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
  onClick?: () => void
}

function Card({ label, inr, eur, positive, negative, highlight, accent, onClick }: CardProps) {
  const sign = inr < 0 ? '-' : ''
  const cls = positive ? 'pos' : negative ? 'neg' : ''

  return (
    <div className={cardClass(highlight)} style={{ ...cardStyle, ...(onClick ? { cursor: 'pointer' } : {}) }} onClick={onClick}>
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

interface BreakdownRow { name: string; symbol: string; value: number; signed?: number | null; bg?: string }

function BreakdownLine({ row }: { row: BreakdownRow }) {
  const val = row.symbol === '€' ? fmtEur(row.value) : fmt(row.value, row.symbol)
  const cls = row.signed == null || row.signed === 0 ? '' : row.signed > 0 ? 'pos' : 'neg'
  const sign = row.signed != null && row.signed < 0 ? '-' : ''
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '5px 10px', marginTop: 6, borderRadius: 'var(--radius-sm)',
      background: cls === 'pos' ? 'rgba(34,197,94,0.10)' : cls === 'neg' ? 'rgba(239,68,68,0.10)' : (row.bg ?? 'var(--bg-card)'),
      fontVariantNumeric: 'tabular-nums', minWidth: 0,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{row.symbol}</span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>{row.name}</span>
      </span>
      <span className={cls} style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>{sign}{val}</span>
    </div>
  )
}

function InvestedBreakdownCard({ stocksInr, stocksEur, goldInvestedInr, onClick }: {
  stocksInr?: number; stocksEur?: number; goldInvestedInr?: number | null; onClick: () => void
}) {
  const rows: BreakdownRow[] = [
    ...(stocksInr != null ? [{ name: 'INR', symbol: '₹', value: stocksInr, bg: 'var(--breakdown-inr-bg)' }] : []),
    ...(stocksEur != null && stocksEur > 0 ? [{ name: 'EUR', symbol: '€', value: stocksEur, bg: 'var(--breakdown-eur-bg)' }] : []),
    ...(goldInvestedInr != null ? [{ name: 'Gold', symbol: '₹', value: goldInvestedInr, bg: 'var(--breakdown-gold-bg)' }] : []),
  ]
  return (
    <div className="card card-highlight" style={{ ...cardStyle, cursor: 'pointer' }} onClick={onClick}>
      <div style={cardLabelStyle}>Total Invested</div>
      {rows.map(r => <BreakdownLine key={r.name + r.symbol} row={r} />)}
    </div>
  )
}

function CurrentBreakdownCard({ stocksInr, stocksEur, goldCurrentInr, onClick }: {
  stocksInr?: number
  stocksEur?: number
  goldCurrentInr?: number | null
  onClick: () => void
}) {
  const rows: BreakdownRow[] = []
  if (stocksInr != null) rows.push({ name: 'INR', symbol: '₹', value: stocksInr, bg: 'var(--breakdown-inr-bg)' })
  if (stocksEur != null && stocksEur > 0) rows.push({ name: 'EUR', symbol: '€', value: stocksEur, bg: 'var(--breakdown-eur-bg)' })
  if (goldCurrentInr != null) rows.push({ name: 'Gold', symbol: '₹', value: goldCurrentInr, bg: 'var(--breakdown-gold-bg)' })

  return (
    <div className="card card-highlight" style={{ ...cardStyle, cursor: 'pointer' }} onClick={onClick}>
      <div style={cardLabelStyle}>Current Value</div>
      {rows.map(r => <BreakdownLine key={r.name + r.symbol} row={r} />)}
    </div>
  )
}

// ChangeCard is the grouped daily-change card (replacing the Unrealised /
// Realised P&L cards). It stacks one native line per currency that has a
// prior-snapshot value (India ₹ / EUR € / USD $) — only the currencies the
// user actually holds — at a fixed card width regardless of line count.
function ChangeCard({ rows, date }: { rows: ChangeRow[]; date?: string }) {
  return (
    <div className="card" style={cardStyle}>
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
function PnLCard({ unrealInr, unrealEur, realInr, realEur, onClick }: {
  unrealInr: number; unrealEur: number; realInr: number; realEur: number; onClick?: () => void
}) {
  return (
    <div className="card" style={{ ...cardStyle, ...(onClick ? { cursor: 'pointer' } : {}) }} onClick={onClick}>
      <div style={cardLabelStyle}>Profit &amp; Loss</div>
      <PnLRow label="Unrealised" inr={unrealInr} eur={unrealEur} />
      <PnLRow label="Realised" inr={realInr} eur={realEur} />
    </div>
  )
}

function PnLBreakdownCard({ stocksInr, stocksEur, goldNettPL, onClick }: {
  stocksInr?: number; stocksEur?: number; goldNettPL?: number | null; onClick: () => void
}) {
  const rows: BreakdownRow[] = [
    ...(stocksInr != null ? [{ name: 'INR', symbol: '₹', value: stocksInr, signed: stocksInr }] : []),
    ...(stocksEur != null ? [{ name: 'EUR', symbol: '€', value: stocksEur, signed: stocksEur }] : []),
    ...(goldNettPL != null ? [{ name: 'Gold', symbol: '₹', value: goldNettPL, signed: goldNettPL }] : []),
  ]
  return (
    <div className="card" style={{ ...cardStyle, cursor: 'pointer' }} onClick={onClick}>
      <div style={cardLabelStyle}>Unrealised P/L</div>
      {rows.map(r => <BreakdownLine key={r.name + r.symbol} row={r} />)}
    </div>
  )
}

// FlipCard wraps a toggleable card: rotates out (0→90°), swaps content at the
// midpoint, then rotates in (−90→0°), giving a realistic single-axis flip.
function FlipCard({ onFlip, children }: { onFlip: () => void; children: React.ReactNode }) {
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const busy = useRef(false)

  const handleClick = () => {
    if (busy.current) return
    busy.current = true
    setPhase('out')
    setTimeout(() => {
      onFlip()
      setPhase('in')
      setTimeout(() => { setPhase('idle'); busy.current = false }, 180)
    }, 180)
  }

  const cls = phase === 'out' ? 'card-flipping-out' : phase === 'in' ? 'card-flipping-in' : ''
  return (
    <div className={cls} style={{ flex: '1 1 200px', minWidth: 120, minHeight: 174, display: 'flex', flexDirection: 'column' }} onClick={handleClick}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  )
}

// Card chrome (background, border, radius, hover elevation) comes from the
// .card / .card-highlight classes; only layout stays inline.
const cardClass = (highlight?: boolean) => (highlight ? 'card card-highlight' : 'card')

const cardStyle: React.CSSProperties = {
  padding: '16px 20px',
  flex: '1 1 174px',
  minWidth: 180,
  overflow: 'hidden',
}


const cardLabelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500,
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
}

interface SummaryCardsProps {
  summary: Summary | null
  loading: boolean
  goldCurrentInr?: number | null
  goldInvestedInr?: number | null
  goldNettPL?: number | null
  stocksInvestedInr?: number
  stocksInvestedEur?: number
  stocksCurrentInr?: number
  stocksCurrentEur?: number
  stocksUnrealisedInr?: number
  stocksUnrealisedEur?: number
}

export default function SummaryCards({ summary, loading, goldCurrentInr, goldInvestedInr, goldNettPL, stocksInvestedInr, stocksInvestedEur, stocksCurrentInr, stocksCurrentEur, stocksUnrealisedInr, stocksUnrealisedEur }: SummaryCardsProps) {
  const [showInvestedBreakdown, setShowInvestedBreakdown] = useState(false)
  const [showCurrentBreakdown, setShowCurrentBreakdown] = useState(false)
  const [showPnLBreakdown, setShowPnLBreakdown] = useState(false)

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
        <FlipCard onFlip={() => setShowInvestedBreakdown(v => !v)}>
          {showInvestedBreakdown ? (
            <InvestedBreakdownCard
              stocksInr={stocksInvestedInr} stocksEur={stocksInvestedEur}
              goldInvestedInr={goldInvestedInr}
              onClick={() => {}}
            />
          ) : (
            <Card label="Total Invested" inr={total_cost} eur={total_cost_eur} highlight />
          )}
        </FlipCard>
        <FlipCard onFlip={() => setShowCurrentBreakdown(v => !v)}>
          {showCurrentBreakdown ? (
            <CurrentBreakdownCard
              stocksInr={stocksCurrentInr}
              stocksEur={stocksCurrentEur}
              goldCurrentInr={goldCurrentInr}
              onClick={() => {}}
            />
          ) : (
            <Card label="Current Value" inr={total_current_value} eur={total_current_value_eur} highlight accent />
          )}
        </FlipCard>
        <ChangeCard rows={changeRows} date={previous_close_date} />
        <FlipCard onFlip={() => setShowPnLBreakdown(v => !v)}>
          {showPnLBreakdown ? (
            <PnLBreakdownCard
              stocksInr={stocksUnrealisedInr} stocksEur={stocksUnrealisedEur}
              goldNettPL={goldNettPL}
              onClick={() => {}}
            />
          ) : (
            <PnLCard unrealInr={total_unrealized} unrealEur={total_unrealized_eur}
              realInr={total_realized} realEur={total_realized_eur} />
          )}
        </FlipCard>
        <Card label="Total P&L" inr={totalPnL} eur={totalPnLEur}
          positive={totalPnL >= 0} negative={totalPnL < 0} />
      </div>
    </div>
  )
}
