// "Month in review" (handoff): the classic period performance card's figures
// (periodPerformance, PD-049) in the reference's layout.
import type { HistoryRow } from '../../lib/api/client'
import { formatDayMonthName } from '../../lib/formDates'
import {
  PERFORMANCE_COLUMN_SYMBOL, fmtSignedCurrency, periodPerformance, type PeriodPerformance,
} from '../../features/history/historyShared'
import { ASSET_LABELS, signedPercent } from './historyCells'

const tone = (value: number | null) => value === null ? '' : value > 0 ? 'u2-positive' : value < 0 ? 'u2-negative' : ''

// A metric row: its label, the column's value (null renders "—") and how a
// present value reads.
const METRICS: {
  label: string
  value: (perf: PeriodPerformance) => number | null
  text: (value: number, perf: PeriodPerformance) => string
}[] = [
  { label: 'Opening P/L', value: perf => perf.openingPnlPct, text: signedPercent },
  { label: 'Closing P/L', value: perf => perf.closingPnlPct, text: signedPercent },
  { label: 'P/L change', value: perf => perf.pnlChangePp, text: value => signedPercent(value).replace('%', ' pp') },
  {
    label: 'Investment delta',
    value: perf => perf.moneyInvested,
    text: (value, perf) => fmtSignedCurrency(value, PERFORMANCE_COLUMN_SYMBOL[perf.column]),
  },
  { label: 'Approx. performance', value: perf => perf.performancePct, text: signedPercent },
]

export function Ui2MonthReview({ rows, monthStart, monthLabel }: {
  rows: HistoryRow[]
  monthStart: string
  monthLabel: string
}) {
  const columns = periodPerformance(rows, monthStart)
  if (columns.length === 0) return null
  const { openingDate, closingDate, closingTentative } = columns[0]
  return (
    <section className="ui2-panel u2h-month-summary" aria-labelledby="u2h-month-review">
      <div className="u2h-intro">
        <div>
          <h2 id="u2h-month-review">Month in review</h2>
          <p>
            {formatDayMonthName(openingDate)} – {formatDayMonthName(closingDate)}{closingTentative ? ' (live)' : ''} · {monthLabel}
          </p>
        </div>
      </div>
      <table className="ui2-table" aria-label="Monthly performance summary">
        <thead>
          <tr>
            <th scope="col">PERFORMANCE</th>
            {columns.map(perf => <th key={perf.column} scope="col">{ASSET_LABELS[perf.column]}</th>)}
          </tr>
        </thead>
        <tbody>
          {METRICS.map(metric => (
            <tr key={metric.label}>
              <th scope="row">{metric.label}</th>
              {columns.map(perf => {
                const value = metric.value(perf)
                return <td key={perf.column} className={tone(value)}>{value === null ? '—' : metric.text(value, perf)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="u2h-method-note">
        Approximate performance: money added during the month counts as added at its end, and a sale
        is valued at the bucket&apos;s current-to-cost ratio. Dividends are not included.
      </p>
    </section>
  )
}
