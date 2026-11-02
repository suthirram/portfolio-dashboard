// The History page's month performance card (PD-049): per currency and gold,
// the P/L % the month opened and closed at, the change in percentage points,
// and the flow-adjusted investment performance.
import type { CSSProperties, ReactNode } from 'react'
import { formatDayMonth } from '../../lib/formDates'
import type { HistoryRow } from '../../lib/api/client'
import type { ThemeName } from '../../lib/useTheme'
import {
  GOLD_TINT, PRICE_DIR_TINT, REGION_TINTS, periodPerformance,
  type PerformanceColumn, type PeriodPerformance,
} from './historyShared'

const COLUMN_LABELS: Record<PerformanceColumn, string> = {
  INR: '🇮🇳 India',
  EUR: '🇪🇺 Europe',
  GOLD: '🥇 Gold',
}

// Each column wears the same tint as its group in the month table below, so
// the card reads as a summary of those columns.
function columnTint(theme: ThemeName, column: PerformanceColumn): { header: string; cell: string } {
  return column === 'GOLD' ? { header: GOLD_TINT, cell: GOLD_TINT } : REGION_TINTS[theme][column]
}

// U+2212 minus, matching the owner's sheet ("−4.07 pp").
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`

const direction = (value: number) => value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
const DIRECTION_COLOUR = { up: 'var(--green)', down: 'var(--red)', flat: 'var(--text-secondary)' }
const DIRECTION_MARKER = { up: '🟢', down: '🔴', flat: '⚪' }

function ChangeChip({ changePp }: { changePp: number }) {
  const dir = direction(changePp)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
      background: PRICE_DIR_TINT[dir], color: DIRECTION_COLOUR[dir], fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {DIRECTION_MARKER[dir]} {signed(changePp)} pp
    </span>
  )
}

function Performance({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return <span style={{ color: DIRECTION_COLOUR[direction(value)] }}>{signed(value)}%</span>
}

const METRICS: { label: string; emphasis?: boolean; cell: (perf: PeriodPerformance) => ReactNode }[] = [
  { label: 'Opening P/L', cell: perf => `${perf.openingPnlPct.toFixed(2)}%` },
  { label: 'Closing P/L', cell: perf => `${perf.closingPnlPct.toFixed(2)}%` },
  { label: 'P/L change', cell: perf => <ChangeChip changePp={perf.pnlChangePp} /> },
  { label: 'Approx. investment performance*', emphasis: true, cell: perf => <Performance value={perf.performancePct} /> },
]

const cellBase: CSSProperties = { padding: '10px 16px', borderBottom: '1px solid var(--border)' }
// The side borders that outline one currency column as its own block.
const blockEdges: CSSProperties = { borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }

export function PeriodPerformanceCard({ rows, monthStart, monthLabel, theme }: {
  rows: HistoryRow[]
  monthStart: string
  monthLabel: string
  theme: ThemeName
}) {
  const columns = periodPerformance(rows, monthStart)
  if (columns.length === 0) return null
  return (
    <section style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 16,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)', textAlign: 'center' }}>
        {monthLabel} performance
      </h2>
      <div style={{ overflowX: 'auto' }}>
        {/* `separate` + horizontal border-spacing turns each currency column
            into its own rounded block, a table inside the table. */}
        <table aria-label={`${monthLabel} performance`} style={{
          borderCollapse: 'separate', borderSpacing: '10px 0',
          fontSize: 13, width: '100%', minWidth: 580, tableLayout: 'fixed',
        }}>
          <thead>
            <tr>
              <th style={{ ...cellBase, width: '26%', textAlign: 'left', fontSize: 11, fontWeight: 500,
                letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Metric</th>
              {columns.map(perf => (
                <th key={perf.column} style={{
                  ...cellBase, ...blockEdges, borderTop: '1px solid var(--border)', borderRadius: '8px 8px 0 0',
                  textAlign: 'center', background: columnTint(theme, perf.column).header,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{COLUMN_LABELS[perf.column]}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDayMonth(perf.openingDate)} → {formatDayMonth(perf.closingDate)}{perf.closingTentative ? ' (live)' : ''}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((metric, i) => {
              const last = i === METRICS.length - 1
              // The rule above the bottom line is drawn as the previous row's
              // bottom border: in the separate model a top border would stack.
              const rowBottom = i === METRICS.length - 2 ? '2px solid var(--border-light)' : '1px solid var(--border)'
              return (
                <tr key={metric.label}>
                  <th scope="row" style={{ ...cellBase, borderBottom: last ? '1px solid transparent' : rowBottom,
                    textAlign: 'left', fontWeight: metric.emphasis ? 600 : 500,
                    color: metric.emphasis ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {metric.label}
                  </th>
                  {columns.map(perf => (
                    <td key={perf.column} style={{
                      ...cellBase, ...blockEdges, borderBottom: last ? '1px solid var(--border)' : rowBottom,
                      ...(last ? { borderRadius: '0 0 8px 8px' } : {}),
                      textAlign: 'center', background: columnTint(theme, perf.column).cell,
                      fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)',
                      fontSize: metric.emphasis ? 16 : 13, fontWeight: metric.emphasis ? 700 : 400,
                    }}>
                      {metric.cell(perf)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
        * Approximate: money added during the month counts as added at its end, and a sale is
        valued at the bucket&apos;s current-to-cost ratio. Dividends are not included.
      </p>
    </section>
  )
}
