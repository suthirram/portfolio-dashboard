import type { CSSProperties } from 'react'
import type { GoldMetrics } from '../../lib/api/client'
import { formatRate } from '../../lib/rate'

interface Props {
  metrics: GoldMetrics | null
}

const rupee = (amount: number | null | undefined) => {
  if (amount == null) return '—'
  const sign = amount < 0 ? '-' : ''
  return `${sign}₹${Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

const grams = (weight: number | null | undefined) =>
  weight == null ? '—' : `${weight.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`

// The PRD-003 §6 metrics table, live from the ledger + latest price +
// GOLDBEES. Null (unknowable) values render "—", never fake zeros.
export default function GoldMetricsPanel({ metrics }: Props) {
  const rows: Array<{ label: string; value: string; signed?: number | null }> = [
    { label: 'Total amount invested', value: rupee(metrics?.invested) },
    { label: 'Current value', value: rupee(metrics?.current) },
    { label: 'Total gold', value: grams(metrics?.grams) },
    { label: 'Avg cost per gram', value: rupee(metrics?.avg_per_gram) },
    { label: 'P/L from GOLDBEES (excl. tax)', value: rupee(metrics?.bees_pl), signed: metrics?.bees_pl },
    { label: 'Nett P/L excluding bees', value: rupee(metrics?.nett_ex_bees), signed: metrics?.nett_ex_bees },
    { label: 'Nett P/L including bees', value: rupee(metrics?.nett_in_bees), signed: metrics?.nett_in_bees },
    { label: 'XIRR of physical', value: formatRate(metrics?.xirr), signed: metrics?.xirr },
  ]

  const cell: CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 14 }
  const labelCell: CSSProperties = { ...cell, color: 'var(--text-secondary)' }
  const valueCell: CSSProperties = { ...cell, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }
  const colorFor = (value: number | null | undefined) =>
    value == null || value === 0 ? undefined : value > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'

  return (
    <section aria-label="Gold metrics" style={{
      marginTop: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, textAlign: 'center' }}>Metrics</h2>
      <table id={"metricsTable"} style={{ width: '100%', margin: '0 auto', borderCollapse: 'collapse', maxWidth: 520 }}>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td style={labelCell}>{row.label}</td>
              <td style={{ ...valueCell, color: colorFor(row.signed) }}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
