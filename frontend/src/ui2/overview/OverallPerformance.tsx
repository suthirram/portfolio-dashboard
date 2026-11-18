import { useEffect, useMemo, useState } from 'react'
import { api, type OverallPoint } from '../../lib/api/client'
import { formatDate, todayIST } from '../../lib/formDates'
import {
  flowAdjustedReturnPct, fmtCurrency, pnlPct,
} from '../../features/history/historyShared'
import './overallPerformance.css'

type Period = '1W' | '1M' | '3M' | '1Y' | 'All'
type DisplayCurrency = 'INR' | 'EUR'
type Metric = 'value' | 'pl' | 'movement'

interface OverallChartPoint extends OverallPoint {
  invested: number | null
  current: number | null
  pnl_pct: number | null
  movement_pct: number | null
}

const PERIODS: Period[] = ['1W', '1M', '3M', '1Y', 'All']
const PERIOD_DAYS: Record<Exclude<Period, 'All'>, number> = {
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '1Y': 365,
}
const METRICS: { value: Metric; label: string }[] = [
  { value: 'value', label: 'Invested vs current' },
  { value: 'pl', label: 'P/L %' },
  { value: 'movement', label: 'Daily movement' },
]

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function rangeFor(period: Period, today: string): { from: string; to: string; requestFrom: string } {
  const from = period === 'All' ? '2000-01-01' : addDays(today, 1 - PERIOD_DAYS[period])
  // Fetch one preceding day so the first visible movement uses the same
  // previous-close definition as subsequent points.
  return { from, to: today, requestFrom: addDays(from, -1) }
}

function weekKey(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  const mondayOffset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - mondayOffset)
  return date.toISOString().slice(0, 10)
}

export function overallDisplayPoints(points: OverallPoint[], currency: DisplayCurrency): OverallChartPoint[] {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date))
  let previous: OverallChartPoint | undefined

  return sorted.map(point => {
    const investedValue = currency === 'INR' ? point.invested_inr : point.invested_eur
    const currentValue = currency === 'INR' ? point.current_inr : point.current_eur
    const invested = typeof investedValue === 'number' ? investedValue : null
    const current = typeof currentValue === 'number' ? currentValue : null
    const pnl_pct = invested === null || current === null ? null : pnlPct(invested, current)
    const movement_pct = !previous || previous.invested === null || previous.current === null ||
      invested === null || current === null
      ? null
      : flowAdjustedReturnPct(previous.current, current, previous.invested, invested)
    const displayPoint: OverallChartPoint = { ...point, invested, current, pnl_pct, movement_pct }
    previous = displayPoint
    return displayPoint
  })
}

function thinWeekly(points: OverallChartPoint[]): OverallChartPoint[] {
  const byWeek = new Map<string, OverallChartPoint>()
  for (const point of points) byWeek.set(weekKey(point.date), point)
  return [...byWeek.values()]
}

function valueForMetric(point: OverallChartPoint, metric: Metric): number | null {
  if (metric === 'pl') return point.pnl_pct
  if (metric === 'movement') return point.movement_pct
  return point.current
}

function pointStatus(point: OverallChartPoint, goldUnavailable: boolean): string[] {
  const status: string[] = []
  if (goldUnavailable) status.push('Gold data unavailable; complete total withheld')
  if (point.missing_rate) status.push('FX rate unavailable')
  if (point.fx_carried && !point.missing_rate) status.push('FX rate carried; review in History')
  if (point.gold_unvalued) status.push('Gold held without a recorded price')
  return status
}

function formatNumber(value: number | null | undefined, currency: DisplayCurrency): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return fmtCurrency(value, currency === 'INR' ? '₹' : '€')
}

function svgPath(points: OverallChartPoint[], key: keyof OverallChartPoint, xPosition: (index: number) => number,
  yPosition: (value: number) => number): string {
  let drawing = false
  return points.map((point, index) => {
    const value = point[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      drawing = false
      return ''
    }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return `${command}${xPosition(index)},${yPosition(value)}`
  }).filter(Boolean).join(' ')
}

function OverallGraph({ points, currency, metric }: {
  points: OverallChartPoint[]; currency: DisplayCurrency; metric: Metric
}) {
  const isValue = metric === 'value'
  const values = points.flatMap(point => isValue
    ? [point.current, point.invested]
    : [valueForMetric(point, metric)])
    .filter((value): value is number => value !== null && Number.isFinite(value))
  if (!values.length) return null

  let low = Math.min(...values)
  let high = Math.max(...values)
  if (metric === 'movement') {
    low = Math.min(low, 0)
    high = Math.max(high, 0)
  }
  const padding = Math.max((high - low) * 0.12, isValue ? 100 : 0.1)
  low -= padding
  high += padding
  const xPosition = (index: number) => 65 + index * 565 / Math.max(points.length - 1, 1)
  const yPosition = (value: number) => 185 - (value - low) / (high - low) * 150
  const label = (value: number) => isValue
    ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : `${value.toFixed(1)}%`
  const currentKey: keyof OverallChartPoint = metric === 'value' ? 'current' : metric === 'pl' ? 'pnl_pct' : 'movement_pct'
  const ariaMetric = metric === 'value' ? 'invested amount and current value'
    : metric === 'pl' ? 'profit and loss percentage' : 'daily movement percentage'
  const firstDate = points[0]?.date
  const lastDate = points[points.length - 1]?.date

  return <svg className="ui2-overall__svg" viewBox="0 0 680 230" role="img"
    aria-label={`Overall ${ariaMetric} in ${currency}, ${firstDate ? formatDate(firstDate) : ''} to ${lastDate ? formatDate(lastDate) : ''}`}>
    <title>Overall {ariaMetric} in {currency}</title>
    <desc>Unavailable values create visible gaps. Open View chart data for the daily values and status.</desc>
    {[0, 0.5, 1].map(step => {
      const value = low + (high - low) * step
      return <g key={step}>
        <path d={`M65 ${yPosition(value)}H630`} className="grid" />
        <text x="56" y={yPosition(value) + 4} textAnchor="end">{label(value)}</text>
      </g>
    })}
    {isValue && <path d={svgPath(points, 'invested', xPosition, yPosition)} className="invested-path" />}
    <path d={svgPath(points, currentKey, xPosition, yPosition)} className="value-path" />
    {firstDate && <text x="65" y="218">{formatDate(firstDate)}</text>}
    {lastDate && <text x="630" y="218" textAnchor="end">{formatDate(lastDate)}</text>}
  </svg>
}

export default function OverallPerformance({ isActingAs = false }: { isActingAs?: boolean }) {
  const [period, setPeriod] = useState<Period>('1M')
  const [currency, setCurrency] = useState<DisplayCurrency>('INR')
  const [metric, setMetric] = useState<Metric>('value')
  const [response, setResponse] = useState<{ points: OverallPoint[]; gold_unavailable: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const range = useMemo(() => rangeFor(period, todayIST()), [period])

  useEffect(() => {
    if (isActingAs) {
      setResponse(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    api.getOverallHistory(range.requestFrom, range.to)
      .then(result => { if (!cancelled) setResponse(result) })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range.requestFrom, range.to, isActingAs])

  const displayPoints = useMemo(() => {
    const points = overallDisplayPoints(response?.points ?? [], currency)
    // The endpoint contract says all values are absent when Gold cannot be
    // read. Enforce that boundary in the UI too, so malformed data can never
    // present a stock-only series as complete overall worth.
    return response?.gold_unavailable
      ? points.map(point => ({ ...point, invested: null, current: null, pnl_pct: null, movement_pct: null }))
      : points
  }, [response, currency])
  const visibleDaily = useMemo(() => displayPoints.filter(point => point.date >= range.from), [displayPoints, range.from])
  const chartPoints = useMemo(
    () => period === '1Y' || period === 'All' ? thinWeekly(visibleDaily) : visibleDaily,
    [visibleDaily, period],
  )
  const hasMetricValues = chartPoints.some(point => valueForMetric(point, metric) !== null)
  const carriedDays = visibleDaily.filter(point => point.fx_carried && !point.missing_rate).length

  // The read endpoint is owner-scoped. Hiding the chart in act-as avoids
  // showing the administrator's own totals inside another user's portfolio.
  if (isActingAs) return null

  return (
    <section className="ui2-overall" aria-labelledby="ui2-overall-title">
      <header className="ui2-overall__header">
        <div>
          <h2 id="ui2-overall-title">Overall performance</h2>
          <p>INR equities + EUR equities + physical gold · {currency} display</p>
        </div>
        <label className="ui2-overall__currency">
          Display currency
          <select aria-label="Overall chart display currency" value={currency}
            onChange={event => setCurrency(event.target.value as DisplayCurrency)}>
            <option value="INR">INR</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
      </header>

      <div className="ui2-overall__controls">
        <div className="ui2-overall__segments" role="group" aria-label="Overall chart period">
          {PERIODS.map(option => <button key={option} type="button" aria-pressed={period === option}
            className={period === option ? 'selected' : undefined} onClick={() => setPeriod(option)}>{option}</button>)}
        </div>
        <div className="ui2-overall__segments" role="group" aria-label="Overall chart metric">
          {METRICS.map(option => <button key={option.value} type="button" aria-pressed={metric === option.value}
            className={metric === option.value ? 'selected' : undefined}
            onClick={() => setMetric(option.value)}>{option.label}</button>)}
        </div>
      </div>

      {response?.gold_unavailable && (
        <p className="ui2-overall__notice" role="status">
          Gold data is unavailable, so complete overall values cannot be shown. No partial stock total is displayed.
        </p>
      )}
      {carriedDays > 0 && !response?.gold_unavailable && (
        <p className="ui2-overall__notice" role="status">
          {carriedDays} {carriedDays === 1 ? 'day uses' : 'days use'} a carried EUR/INR rate. Review flagged days in History.
        </p>
      )}

      <div className="ui2-overall__chart" aria-busy={loading}>
        {loading ? <p role="status">Loading overall history…</p> : error ?
          <p className="ui2-overall__error" role="alert">Unable to load overall history: {error}</p> :
            !hasMetricValues ? <div className="ui2-overall__unavailable" role="status">
              <strong>Overall value unavailable</strong>
              <p>A complete portfolio cannot be valued from the available data. No partial total or substitute zero is shown.</p>
            </div> :
              <OverallGraph points={chartPoints} currency={currency} metric={metric} />}
      </div>

      {metric === 'value' && hasMetricValues && <div className="ui2-overall__legend" aria-label="Chart series">
        <span><i className="current-line" aria-hidden="true" />Current value</span>
        <span><i className="invested-line" aria-hidden="true" />Invested amount</span>
      </div>}

      <p className="ui2-overall__note">
        {period === '1Y' || period === 'All'
          ? 'Weekly drawing points; daily movement is computed before thinning.'
          : 'Daily sample points.'} Gaps are unavailable values.
      </p>

      {!loading && !error && visibleDaily.length > 0 && <details className="ui2-overall__data">
        <summary>View chart data</summary>
        <div className="ui2-overall__table-wrap">
          <table>
            <caption>Daily overall values · {currency}</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Invested</th><th scope="col">Current</th><th scope="col">Status</th></tr></thead>
            <tbody>{visibleDaily.map(point => <tr key={point.date}>
              <th scope="row">{formatDate(point.date)}</th>
              <td>{formatNumber(point.invested, currency)}</td>
              <td>{formatNumber(point.current, currency)}</td>
              <td>{pointStatus(point, response?.gold_unavailable ?? false).join('; ') || 'Complete'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </section>
  )
}
