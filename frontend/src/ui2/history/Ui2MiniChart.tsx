// One History mini chart, drawn as the handoff's SVG (snapshotGraph) rather
// than Recharts so it matches the reference 1:1. The series come from the
// classic chart helpers (perCurrencyChartData / goldChartData), so the
// plotted numbers equal the classic charts'.
export type MiniChartKind = 'value' | 'pl' | 'volatility'

export interface MiniChartPoint {
  date: string
  invested: number | null
  current: number | null
  pnl_pct: number | null
  daily_vol: number | null
}

const TITLES: Record<MiniChartKind, string> = {
  value: 'Invested vs current',
  pl: 'P/L %',
  volatility: 'Daily volatility %',
}

const NOTES: Record<MiniChartKind, (unit: string) => string> = {
  value: unit => `Both series share the same ${unit} scale and snapshot dates.`,
  pl: () => 'Gain or loss relative to the recorded invested amount.',
  volatility: () => 'Daily change net of money added or withdrawn, versus the preceding snapshot. The first record has no baseline.',
}

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

// Plot area of the 460 × 175 viewBox, as in the reference.
const LEFT = 48
const RIGHT = 413
const WIDTH = RIGHT - LEFT
const BOTTOM = 140
const HEIGHT = 110

function seriesOf(points: MiniChartPoint[], kind: MiniChartKind): (number | null)[] {
  if (kind === 'value') return points.map(point => point.current)
  if (kind === 'pl') return points.map(point => point.pnl_pct)
  return points.map(point => point.daily_vol)
}

function isIsolatedPoint(values: (number | null)[], index: number): boolean {
  if (values[index] === null) return false
  const previousConnected = index > 0 && values[index - 1] !== null
  const nextConnected = index < values.length - 1 && values[index + 1] !== null
  return !previousConnected && !nextConnected
}

// linePath joins consecutive values and lifts the pen over a gap, so a day
// without data reads as a break rather than a fall to zero.
export function linePath(values: (number | null)[], xAt: (index: number) => number, yAt: (value: number) => number): string {
  let drawing = false
  return values.map((value, index) => {
    if (value === null) { drawing = false; return '' }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return `${command}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`
  }).filter(Boolean).join(' ')
}

export function Ui2MiniChart({ points, kind, unit, label, markers = true, onExpand }: {
  points: MiniChartPoint[]
  kind: MiniChartKind
  // The amount currency ("INR" / "EUR"); the % charts ignore it.
  unit: string
  // Names the asset and period for the accessible chart label.
  label: string
  // Dense point markers with tooltips; isolated valid values remain marked
  // when this is off so gaps and one-point series stay visible.
  markers?: boolean
  // Makes the chart a button that opens the zoomable full-history page.
  onExpand?: () => void
}) {
  const values = seriesOf(points, kind)
  const invested = kind === 'value' ? points.map(point => point.invested) : []
  const finite = [...values, ...invested].filter((value): value is number => value !== null && Number.isFinite(value))
  const title = TITLES[kind]
  const format = (value: number) => kind === 'value' ? COMPACT.format(value) : `${value.toFixed(2)}%`
  const last = values.length ? values[values.length - 1] : null

  let chart: JSX.Element
  if (finite.length === 0) {
    chart = <p className="u2h-graph-empty">No data for this period.</p>
  } else {
    let min = Math.min(...finite)
    let max = Math.max(...finite)
    if (kind === 'volatility') { min = Math.min(min, 0); max = Math.max(max, 0) }
    const pad = Math.max((max - min) * 0.15, kind === 'value' ? 1 : 0.05)
    min -= pad
    max += pad
    const xAt = (index: number) => LEFT + index * WIDTH / Math.max(points.length - 1, 1)
    const yAt = (value: number) => BOTTOM - (value - min) / (max - min) * HEIGHT
    const amountSuffix = kind === 'value' ? ` ${unit}` : ''
    chart = (
      <svg viewBox="0 0 460 175" role="img" aria-label={`${title} for ${label}`}>
        {[0, 0.5, 1].map(step => {
          const value = min + (max - min) * step
          return (
            <g key={step}>
              <path d={`M${LEFT} ${yAt(value)}H${RIGHT}`} stroke="var(--u2-border)" strokeDasharray="3 5" />
              <text x={LEFT - 5} y={yAt(value) + 3} textAnchor="end" fill="var(--u2-muted)" fontSize="9">{format(value)}</text>
            </g>
          )
        })}
        {kind === 'volatility' && (
          <path d={`M${LEFT} ${yAt(0)}H${RIGHT}`} stroke="var(--u2-muted)" strokeDasharray="4 4" opacity=".7" />
        )}
        {kind === 'value' && (
          <path className="u2h-invested-line" d={linePath(invested, xAt, yAt)} />
        )}
        <path className={kind === 'volatility' ? 'u2h-move-line' : 'u2h-current-line'} d={linePath(values, xAt, yAt)} />
        {values.map((value, index) => value === null || (!markers && !isIsolatedPoint(values, index)) ? null : (
          // Inside the expand button the markers stay out of the tab order:
          // a focusable element inside a button is invalid nesting.
          <circle key={index} cx={xAt(index)} cy={yAt(value)} r="3" fill="var(--u2-accent)" tabIndex={onExpand ? undefined : 0}>
            <title>{`${points[index].date} · ${format(value)}${amountSuffix}`}</title>
          </circle>
        ))}
        {kind === 'value' && invested.map((value, index) => value === null || markers || !isIsolatedPoint(invested, index) ? null : (
          <circle key={`invested-${index}`} cx={xAt(index)} cy={yAt(value)} r="3" fill="var(--u2-muted)" tabIndex={onExpand ? undefined : 0}>
            <title>{`${points[index].date} · ${format(value)}${amountSuffix} invested`}</title>
          </circle>
        ))}
        <text x={LEFT} y="165" fill="var(--u2-muted)" fontSize="9">{points[0]?.date ?? ''}</text>
        <text x={RIGHT} y="165" textAnchor="end" fill="var(--u2-muted)" fontSize="9">{points[points.length - 1]?.date ?? ''}</text>
      </svg>
    )
  }

  const tone = kind === 'value' || last === null ? '' : last < 0 ? 'u2-negative' : 'u2-positive'
  return (
    <section className="u2h-graph">
      <div className="u2h-graph-title">
        <h3>{title}</h3>
        <span className={tone}>{last === null ? '—' : format(last)}{kind === 'value' && last !== null ? ` ${unit}` : ''}</span>
      </div>
      {onExpand
        ? (
          <button type="button" className="u2h-graph-expand" onClick={onExpand}
            aria-label={`Open the full ${label} invested vs current history`}>
            {chart}
          </button>
        )
        : chart}
      {kind === 'value' && (
        <div className="u2h-legend-lines">
          <span><i className="u2h-legend-line" />Current value</span>
          <span><i className="u2h-legend-line u2h-legend-invested" />Invested amount</span>
        </div>
      )}
      <p>{NOTES[kind](unit)}</p>
    </section>
  )
}
