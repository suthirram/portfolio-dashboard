import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { api, type HistoryRow } from '../../lib/api/client'
import { useTheme } from '../../lib/useTheme'
import {
  REGIONS, REGION_LABELS, REGION_COLOURS, CURRENCY_BY_REGION, CURRENCY_SYMBOL,
  chartTooltipProps, fmtCurrency, fmtAxisAmount, niceDomain,
  type RegionKey,
} from './HistoryPage'

// Full-history chart: the entire dataset for one currency, invested vs
// current, from 2000-01-01 to today. Rendered at a fixed pixel-per-point
// width inside a horizontally-scrollable container so every plotted day is
// visible regardless of how many snapshots exist. Reached by clicking the
// "Invested vs Current" mini-chart on the History page.

const HISTORY_START = '2000-01-01'
// Pixels of chart width per data point. Wide enough that daily plots don't
// smear together; the container scrolls horizontally past the viewport.
const PX_PER_POINT = 14
const MIN_CHART_WIDTH = 900

// fullSeries builds an oldest-first invested/current series for one region
// using the FULL ISO date (unlike HistoryPage's perCurrencyChartData, which
// slices to MM-DD — that collides across years on a multi-year view).
function fullSeries(rows: HistoryRow[], region: RegionKey) {
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

export default function HistoryChartPage() {
  const { theme, toggle: toggleTheme } = useTheme()
  const params = useParams<{ region: string }>()
  const region: RegionKey = isRegionKey(params.region) ? params.region : 'INR'

  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const data = useMemo(() => fullSeries(rows, region), [rows, region])
  const amountDomain = useMemo(
    () => niceDomain(data.flatMap(d => [d.invested, d.current])),
    [data],
  )
  // Width grows with the number of points so every day gets horizontal room;
  // the wrapping div scrolls when it exceeds the viewport.
  const chartWidth = Math.max(MIN_CHART_WIDTH, data.length * PX_PER_POINT)
  const hasData = data.some(d => (d.invested ?? 0) !== 0 || (d.current ?? 0) !== 0)
  const firstDate = data.length ? data[0].date : null
  const lastDate = data.length ? data[data.length - 1].date : null

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-primary)' }}>
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
          {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
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
