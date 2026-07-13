import type { CSSProperties } from 'react'
import type { GoldMetrics } from '../../lib/api/client'

interface Props {
  metrics: GoldMetrics | null
}

const rupee = (v: number | null | undefined) => {
  if (v == null) return '—'
  const sign = v < 0 ? '-' : ''
  return `${sign}₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const grams = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`

const pct = (v: number | null | undefined) =>
  v == null ? '—' : `${(v * 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

// The PRD-003 §6 metrics table, live from the ledger + latest price +
// GOLDBEES. Null (unknowable) values render "—", never fake zeros.
export default function GoldMetricsPanel({ metrics: m }: Props) {
  const rows: Array<{ label: string; value: string; signed?: number | null }> = [
    { label: 'Total amount invested', value: rupee(m?.invested) },
    { label: 'Current value', value: rupee(m?.current) },
    { label: 'Total gold', value: grams(m?.grams) },
    { label: 'Avg cost per gram', value: rupee(m?.avg_per_gram) },
    { label: 'P/L from GOLDBEES (excl. tax)', value: rupee(m?.bees_pl), signed: m?.bees_pl },
    { label: 'Nett P/L excluding bees', value: rupee(m?.nett_ex_bees), signed: m?.nett_ex_bees },
    { label: 'Nett P/L including bees', value: rupee(m?.nett_in_bees), signed: m?.nett_in_bees },
    { label: 'XIRR of physical', value: pct(m?.xirr), signed: m?.xirr },
  ]

  const cell: CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }
  const labelCell: CSSProperties = { ...cell, color: 'var(--text-secondary)' }
  const valueCell: CSSProperties = { ...cell, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }
  const colorFor = (v: number | null | undefined) =>
    v == null || v === 0 ? undefined : v > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'

  return (
    <section aria-label="Gold metrics" style={{
      marginTop: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>Metrics</h2>
      <table id={"metricsTable"} style={{ width: '100%', margin: '0 auto', borderCollapse: 'collapse', maxWidth: 520 }}>
        <tbody>
          {rows.map(r => (
            <tr key={r.label}>
              <td style={labelCell}>{r.label}</td>
              <td style={{ ...valueCell, color: colorFor(r.signed) }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
