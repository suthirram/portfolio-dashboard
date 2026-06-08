import React from 'react'

const fmt = (n, currency = '₹') =>
  `${currency}${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtEur = (n) =>
  `€${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function Card({ label, inr, eur, positive, negative, highlight }) {
  const sign = inr < 0 ? '-' : ''
  const cls = positive ? 'pos' : negative ? 'neg' : ''

  return (
    <div style={{
      background: highlight ? 'linear-gradient(135deg, #1e2a4a 0%, #1a1d30 100%)' : 'var(--bg-card)',
      border: `1px solid ${highlight ? '#2e4a8a' : 'var(--border)'}`,
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
    </div>
  )
}

export default function SummaryCards({ summary, loading }) {
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
  } = summary

  const totalPnL = total_unrealized + total_realized
  const totalPnLEur = total_unrealized_eur + total_realized_eur

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
        <Card label="Current Value" inr={total_current_value} eur={total_current_value_eur} highlight />
        <Card label="Unrealised P&L" inr={total_unrealized} eur={total_unrealized_eur}
          positive={total_unrealized >= 0} negative={total_unrealized < 0} />
        <Card label="Realised P&L" inr={total_realized} eur={total_realized_eur}
          positive={total_realized >= 0} negative={total_realized < 0} />
        <Card label="Total P&L" inr={totalPnL} eur={totalPnLEur}
          positive={totalPnL >= 0} negative={totalPnL < 0} />
      </div>
    </div>
  )
}
