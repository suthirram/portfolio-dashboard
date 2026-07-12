import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { api, type HistoryRow } from '../../lib/api/client'
import { nextThemeLabel, useTheme } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'
import {
  REGIONS, REGION_LABELS, REGION_COLOURS, CURRENCY_BY_REGION, CURRENCY_SYMBOL,
  chartTooltipProps, fmtCurrency, fmtAxisAmount, niceDomain,
  type RegionKey,
} from './historyShared'

// Full-history chart: the entire dataset for one currency, invested vs
// current, from 2000-01-01 to today. Rendered at a fixed pixel-per-point
// width inside a horizontally-scrollable container so every plotted day is
// visible regardless of how many snapshots exist. Reached by clicking the
// "Invested vs Current" mini-chart on the History page.

const HISTORY_START = '2000-01-01'
// Zoom = pixels of chart width per data point. Higher = more horizontal
// room per plot (zoom in), lower = denser (zoom out). Clamped to [ZOOM_MIN,
// ZOOM_MAX]; the container scrolls horizontally past the viewport.
const ZOOM_MIN = 4
const ZOOM_MAX = 48
const ZOOM_STEP = 4
const ZOOM_DEFAULT = 14
const MIN_CHART_WIDTH = 900

type Granularity = 'day' | 'week'

// weekKey returns the Monday (ISO week start) of a YYYY-MM-DD date as its
// own YYYY-MM-DD, so all days in a week collapse to one bucket keyed by that
// Monday.
export function weekKey(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// toWeekly collapses a daily oldest-first series to one point per ISO week,
// keeping the LAST (most recent) day's invested/current in each week —
// weekly close, the natural down-sample for a value series.
export function toWeekly(daily: { date: string; invested: number | null; current: number | null }[]) {
  const byWeek = new Map<string, { date: string; invested: number | null; current: number | null }>()
  for (const p of daily) byWeek.set(weekKey(p.date), { ...p, date: weekKey(p.date) })
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// fullSeries builds an oldest-first invested/current series for one region
// using the FULL ISO date (unlike HistoryPage's perCurrencyChartData, which
// slices to MM-DD — that collides across years on a multi-year view).
export function fullSeries(rows: HistoryRow[], region: RegionKey) {
  const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return oldestFirst.map(r => {
    const rs = r.regions[region]
    return {
      date: r.date,
      invested: rs ? rs.invested : null,
      current: rs ? rs.current : null,
    }
  })
}

function isRegionKey(s: string | undefined): s is RegionKey {
  return !!s && (REGIONS as readonly string[]).includes(s)
}

const zoomBtnStyle: React.CSSProperties = {
  width: 28, height: 28, fontSize: 16, lineHeight: 1, cursor: 'pointer',
  border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg-card)', color: 'var(--text-primary)',
}

export default function HistoryChartPage() {
  const auth = useAuthOptional()
  const { theme, toggle: toggleTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const params = useParams<{ region: string }>()
  const region: RegionKey = isRegionKey(params.region) ? params.region : 'INR'

  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const today = new Date().toISOString().slice(0, 10)
    api.listHistory(HISTORY_START, today)
      .then(list => { if (!cancelled) setRows(list.rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const cur = CURRENCY_BY_REGION[region]
  const sym = CURRENCY_SYMBOL[cur]
  const palette = REGION_COLOURS[theme][region]

  const daily = useMemo(() => fullSeries(rows, region), [rows, region])
  const data = useMemo(
    () => granularity === 'week' ? toWeekly(daily) : daily,
    [daily, granularity],
  )
  const amountDomain = useMemo(
    () => niceDomain(data.flatMap(d => [d.invested, d.current])),
    [data],
  )
  // Width grows with the number of points × the zoom factor so every plot
  // gets horizontal room; the wrapping div scrolls when it exceeds the
  // viewport.
  const chartWidth = Math.max(MIN_CHART_WIDTH, data.length * zoom)
  const hasData = data.some(d => (d.invested ?? 0) !== 0 || (d.current ?? 0) !== 0)
  const firstDate = data.length ? data[0].date : null
  const lastDate = data.length ? data[data.length - 1].date : null

  return (
    <div style={{ minHeight: '100dvh' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        padding: '0 28px',
        height: 'var(--nav-height, 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <Link to="/history" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
          ← Historical data
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          {REGION_LABELS[region]} — Invested vs Current
        </h1>
        <button onClick={toggleTheme} style={{
          background: 'var(--bg-card)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 12px', cursor: 'pointer', fontSize: 13,
        }} aria-label="Toggle theme">
          {nextThemeLabel(theme, auth?.user?.premium)}
        </button>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 28px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
          Full dataset {firstDate && lastDate ? `(${firstDate} → ${lastDate})` : '(2000 → today)'}.
          Scroll horizontally to see every plotted day.
        </p>

        {error && <div style={{ color: 'var(--red)', marginBottom: 12 }}>Error: {error}</div>}
        {loading && <div style={{ color: 'var(--text-secondary)' }}>Loading full history…</div>}

        {!loading && !error && !hasData && (
          <div style={{
            padding: 32, textAlign: 'center', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)',
          }}>
            No {REGION_LABELS[region]} history recorded yet.
          </div>
        )}

        {!loading && !error && hasData && (
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 8, padding: 16,
          }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center',
              flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {(['week', 'day'] as Granularity[]).map(g => (
                  <button key={g} onClick={() => setGranularity(g)} style={{
                    padding: '5px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
                    background: granularity === g ? 'var(--blue)' : 'transparent',
                    color: granularity === g ? '#fff' : 'var(--text-primary)',
                  }} aria-pressed={granularity === g}>
                    {g === 'week' ? 'Weekly' : 'Daily'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Zoom</span>
                <button onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                  disabled={zoom <= ZOOM_MIN} style={zoomBtnStyle} aria-label="Zoom out (shrink)">−</button>
                <button onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX} style={zoomBtnStyle} aria-label="Zoom in">+</button>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {data.length} points · {granularity === 'week' ? 'weekly close' : 'daily'}
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ width: chartWidth, height: 460 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 48, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-45}
                      textAnchor="end" height={60} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis tick={{ fontSize: 11 }} domain={amountDomain ?? ['auto', 'auto']}
                      tickFormatter={fmtAxisAmount} width={72} />
                    <Tooltip {...chartTooltipProps} formatter={(v) => fmtCurrency(Number(v), sym)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="invested" name={`Invested (${cur})`} stroke={palette.invested}
                      strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                    <Line dataKey="current" name={`Current (${cur})`} stroke={palette.current}
                      strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
