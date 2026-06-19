import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  api,
  type DateConflict,
  type HistoryRow,
  type PasteHistoryReport,
  type RegionSnapshot,
} from '../../lib/api/client'
import { ApiError } from '../../lib/api/client'
import { EditIcon, TrashIcon } from '../../components/Icon'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'

// Snapshot buckets are keyed by currency after PR7 design-review
// (2026-06-16); the backend's CurrencyOf decides which bucket a
// holding falls into based on Exchange first, Currency fallback.
const REGIONS = ['INR', 'EUR', 'USD'] as const
type RegionKey = typeof REGIONS[number]

const REGION_LABELS: Record<RegionKey, string> = {
  INR: 'India (INR)',
  EUR: 'Europe (EUR)',
  USD: 'US (USD)',
}

// PRD-002 §7.2 + PR7 design review: saffron (INR), blue (EUR), red (USD).
// Palettes are theme-aware: brighter hues for dark backgrounds, darker
// hues for light. The previous single palette was muddy on white and
// faded on near-black.
type LinePalette = Record<RegionKey, { invested: string; current: string }>
const REGION_COLOURS: Record<ThemeName, LinePalette> = {
  dark: {
    INR: { invested: '#fcd34d', current: '#f97316' }, // amber-300 / orange-500
    EUR: { invested: '#60a5fa', current: '#3b82f6' }, // blue-400 / 500
    USD: { invested: '#f87171', current: '#ef4444' }, // red-400 / 500
  },
  light: {
    INR: { invested: '#d97706', current: '#9a3412' }, // amber-600 / orange-800
    EUR: { invested: '#2563eb', current: '#1e3a8a' }, // blue-600  / 900
    USD: { invested: '#dc2626', current: '#7f1d1d' }, // red-600   / 900
  },
}

const PNL_LINE_COLOUR: Record<ThemeName, string> = {
  dark:  '#c084fc', // purple-400, pops on dark
  light: '#6d28d9', // purple-700, readable on white
}

// Per-theme background tints for each currency group in the table.
// `header` lands behind the column-group header cells; `cell` is the
// per-data-cell tint that propagates the group identity down the column.
const REGION_TINTS: Record<ThemeName, Record<RegionKey, { header: string; cell: string }>> = {
  light: {
    INR: { header: '#FFEDD5', cell: '#FFF7ED' }, // orange-100 / orange-50
    EUR: { header: '#DBEAFE', cell: '#EFF6FF' }, // blue-100   / blue-50
    USD: { header: '#FEE2E2', cell: '#FEF2F2' }, // red-100    / red-50
  },
  dark: {
    INR: { header: 'rgba(251,146,60,0.22)', cell: 'rgba(251,146,60,0.10)' },
    EUR: { header: 'rgba(96,165,250,0.22)', cell: 'rgba(96,165,250,0.10)' },
    USD: { header: 'rgba(248,113,113,0.22)', cell: 'rgba(248,113,113,0.10)' },
  },
}


// Year selector lower bound. Lets users browse back through 2020 even
// before any snapshot exists for that year — useful for manually pasting
// backfilled history.
const MIN_YEAR = 2020

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// monthRange returns the inclusive [from, to] for the month, with `from`
// extended back by one day so the first day-of-month row has a prior row
// to compute Daily volatlity against (PR7 design review).
export function monthRange(year: number, month0: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month0, 0))   // last day of previous month
  const to   = new Date(Date.UTC(year, month0 + 1, 0))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

interface RegionFormValue {
  invested: string
  current: string
}
type RegionFormState = Record<RegionKey, RegionFormValue>

function emptyForm(): RegionFormState {
  return {
    INR: { invested: '', current: '' },
    EUR: { invested: '', current: '' },
    USD: { invested: '', current: '' },
  }
}

function formToBody(form: RegionFormState): Record<string, { invested: number; current: number }> {
  const out: Record<string, { invested: number; current: number }> = {}
  for (const r of REGIONS) {
    const inv = Number(form[r].invested)
    const cur = Number(form[r].current)
    if (Number.isFinite(inv) && Number.isFinite(cur) && (inv > 0 || cur > 0)) {
      out[r] = { invested: inv, current: cur }
    }
  }
  return out
}

export default function HistoryPage() {
  const { theme, toggle: toggleTheme } = useTheme()
  const auth = useAuthOptional()
  const canForceDelete = auth?.user?.role === 'superadmin'
  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth())
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [editRow, setEditRow] = useState<HistoryRow | null>(null)
  // Sequential conflict queue: head opens as a modal.
  const [conflictQueue, setConflictQueue] = useState<DateConflict[]>([])

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { from, to } = monthRange(year, month)
      const list = await api.listHistory(from, to)
      setRows(list.rows)
      setCurrency(list.currency || 'INR')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { void reload() }, [reload])

  const years = useMemo(() => {
    const current = now.getUTCFullYear()
    const start = Math.min(MIN_YEAR, current)
    const out: number[] = []
    for (let y = start; y <= current; y++) out.push(y)
    return out
  }, [now])

  // Three charts, one per currency. Compute series per bucket.
  const chartsByRegion = useMemo(() => ({
    INR: perCurrencyChartData(rows, 'INR'),
    EUR: perCurrencyChartData(rows, 'EUR'),
    USD: perCurrencyChartData(rows, 'USD'),
  }), [rows])

  const handleAddSaved = async (input: { date: string; regions: Record<string, { invested: number; current: number }> }) => {
    try {
      await api.addHistoryRow(input)
      setAddOpen(false)
      await reload()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Server returned conflicts. Surface via a single-date conflict.
        // The error body is the *ErrConflict shape stringified; refetch the row
        // to drive the modal instead.
        try {
          const list = await api.listHistory(input.date, input.date)
          if (list.rows[0]) {
            setConflictQueue([{
              date: input.date,
              existing: list.rows[0].regions,
              incoming: input.regions,
            }])
            setAddOpen(false)
          } else {
            // 409 said the row exists, but list returned nothing —
            // possible race between the POST and the refetch. Tell the
            // user instead of silently swallowing.
            alert('Conflict reported but row no longer exists. Try again.')
          }
        } catch {
          alert('Conflict, but failed to load existing row.')
        }
      } else {
        alert('Add failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
  }

  const handlePasteSubmit = async (input: { month: string; rows: { date: string; regions: Record<string, { invested: number; current: number }> }[] }): Promise<PasteHistoryReport> => {
    const report = await api.pasteHistory(input)
    if (report.conflicts.length) {
      // PRD-002 §7.3: dialogs open in date order. Backend may return
      // conflicts in non-deterministic order because the per-row map
      // iteration order is undefined; sort here.
      const sorted = [...report.conflicts].sort((a, b) => a.date.localeCompare(b.date))
      setConflictQueue(sorted)
    }
    if (report.applied.length) await reload()
    return report
  }

  const handleConflictResolve = async (date: string, chosen: Record<string, { invested: number; current: number }>) => {
    if (Object.keys(chosen).length > 0) {
      try {
        await api.patchHistoryRegions(date, { regions: chosen })
      } catch (e) {
        alert('Save failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
    // Advance queue
    setConflictQueue(q => q.slice(1))
    await reload()
  }

  const handleConflictSkip = () => {
    setConflictQueue(q => q.slice(1))
  }

  const handleEditSaved = async (date: string, regions: Record<string, { invested: number; current: number }>) => {
    try {
      await api.patchHistoryRegions(date, { regions })
      setEditRow(null)
      await reload()
    } catch (e) {
      alert('Edit failed: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const handleDelete = async (date: string) => {
    if (!confirm(`Delete row for ${date}?`)) return
    try {
      await api.deleteHistoryRow(date)
      await reload()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        alert('Cannot delete a cron-written row. Override individual regions instead.')
      } else {
        alert('Delete failed: ' + (e instanceof Error ? e.message : String(e)))
      }
    }
  }

  const headConflict = conflictQueue[0]

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
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 600 }}>
          ← Portfolio
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Historical data</h1>
        <button onClick={toggleTheme} style={{
          background: 'var(--bg-card)', color: 'var(--text-primary)',
          border: '1px solid var(--border)', borderRadius: 6,
          padding: '6px 12px', cursor: 'pointer', fontSize: 13,
        }} aria-label="Toggle theme">
          {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
        </button>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 28px' }}>
        <section style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Year</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Month</span>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button onClick={() => setAddOpen(true)} style={btnPrimaryStyle}>+ Add row</button>
          <button onClick={() => setPasteOpen(true)} style={btnSecondaryStyle}>Paste month</button>
        </section>

        {error && <div style={{ color: 'var(--red)', marginBottom: 12 }}>Error: {error}</div>}

        {!loading && rows.length === 0 && (
          <div style={{
            padding: 32, textAlign: 'center', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 8,
          }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              No data for {MONTHS[month]} {year} yet. Your first snapshot will be taken at the next 00:00 UTC, or you can add rows manually.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <HistoryTable rows={rows} currency={currency} theme={theme}
              onDelete={handleDelete} onEdit={r => setEditRow(r)}
              canForceDelete={canForceDelete} />
            <div style={{ height: 16 }} />
            {REGIONS.map(r => (
              <CurrencyChartPanel key={r} region={r} data={chartsByRegion[r]} theme={theme} />
            ))}
          </>
        )}
      </main>

      {addOpen && <AddRowModal onSubmit={handleAddSaved} onCancel={() => setAddOpen(false)} />}
      {editRow && <EditRowModal row={editRow} onSubmit={handleEditSaved} onCancel={() => setEditRow(null)} />}
      {pasteOpen && <PasteModal monthLabel={`${year}-${String(month + 1).padStart(2, '0')}`}
        onSubmit={async input => {
          const report = await handlePasteSubmit(input)
          if (report.conflicts.length === 0 && report.rejected.length === 0) setPasteOpen(false)
          return report
        }}
        onCancel={() => setPasteOpen(false)} />}
      {headConflict && <ConflictDialog
        conflict={headConflict}
        onResolve={handleConflictResolve}
        onSkip={handleConflictSkip}
      />}
    </div>
  )
}

// ---- Currency mapping ----
// Region → display currency. Holdings are stored per-region in the
// snapshot (DD-002 §2.1); the UI here translates to original currency
// because the user wants to read the table in native amounts (PR7
// design-review on Screenshot 2026-06-16).

// CURRENCY_BY_REGION is now identity since bucket keys are currency
// codes, but kept as a named export so callers can read the table
// without assuming key == code.
export const CURRENCY_BY_REGION: Record<RegionKey, 'INR' | 'EUR' | 'USD'> = {
  INR: 'INR',
  EUR: 'EUR',
  USD: 'USD',
}

export const CURRENCY_SYMBOL: Record<'INR' | 'EUR' | 'USD', string> = {
  INR: '₹',
  EUR: '€',
  USD: '$',
}

// fmtCurrency formats amount with the currency symbol and 2dp, e.g.
// "₹1,019,620.00". An amount of 0 renders as "₹0.00" rather than the em
// dash used elsewhere, because in the per-currency layout an absent
// value collapses the whole row group instead.
export function fmtCurrency(amount: number, sym: string): string {
  return sym + amount.toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

// ---- Chart ----

// CurrencyChartPanel renders two side-by-side mini-charts per currency:
// left = invested vs current value, right = P/L %. The viewport is
// split 50/50 so the two surfaces are read independently — P/L % has
// its own y-axis range and is not crushed by the amount axis it used to
// share with invested/current in the previous combined ComposedChart.
function CurrencyChartPanel({ region, data, theme }: { region: RegionKey; data: any[]; theme: ThemeName }) {
  const cur = CURRENCY_BY_REGION[region]
  const palette = REGION_COLOURS[theme][region]
  const pnlColour = PNL_LINE_COLOUR[theme]
  // Recharts' default value-axis domain is [0, max], which flattens
  // series that oscillate in a narrow band far above zero (invested vs
  // current both ≈₹450k render as a near-flat line). Derive a padded
  // domain from the actual data so the fluctuations fill the chart.
  const amountDomain = useMemo(
    () => niceDomain(data.flatMap(d => [d.invested, d.current])),
    [data],
  )
  const pnlDomain = useMemo(
    () => niceDomain(data.map(d => d.pnl_pct)),
    [data],
  )
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
        {REGION_LABELS[region]} ({cur})
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
            Invested vs Current
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={amountDomain ?? ['auto', 'auto']}
                  tickFormatter={fmtAxisAmount} width={64} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="invested" name={`Invested (${cur})`} stroke={palette.invested} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
                <Line dataKey="current"  name={`Current (${cur})`}  stroke={palette.current}  strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
            P/L %
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={pnlDomain ?? ['auto', 'auto']} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="pnl_pct" name="P/L %" stroke={pnlColour} strokeWidth={2.5} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

// perCurrencyChartData produces oldest-first chart series for one region.
// pnl_pct on a per-region basis is (current - invested) / invested * 100.
//
// Dates where the region has no snapshot emit `null` (a gap) rather than
// 0. Two reasons: a 0 point drags the dynamic Y-axis floor back toward
// zero — re-flattening the very fluctuation the dynamic domain exists to
// show — and it draws the line plunging to 0 on empty dates, which reads
// as "portfolio went to zero" instead of "no data". `null` lets niceDomain
// (which filters non-finite) ignore it and the Line connectNulls bridge
// the gap. The table still renders absent regions as 0 (CurrencyRowCells).
export function perCurrencyChartData(rows: HistoryRow[], region: RegionKey) {
  const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return oldestFirst.map(r => {
    const rs = r.regions[region]
    const invested = rs ? rs.invested : null
    const current  = rs ? rs.current  : null
    const pnl_pct  = rs && rs.invested > 0 ? ((rs.current - rs.invested) / rs.invested) * 100 : null
    return { date: r.date.slice(5), invested, current, pnl_pct }
  })
}

// niceDomain returns a padded, nicely-rounded [min, max] for a value
// axis so the plotted lines fill the chart instead of being crushed
// against a zero floor. Pads ~8% beyond the data range and snaps the
// bounds to a readable step. Returns undefined when there are no finite
// values (caller falls back to Recharts' 'auto' domain).
export function niceDomain(values: (number | null | undefined)[]): [number, number] | undefined {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (finite.length === 0) return undefined
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  if (lo === hi) {
    // Flat series: pad around the single value so it sits mid-chart.
    const pad = Math.abs(lo) * 0.05 || 1
    return [lo - pad, hi + pad]
  }
  const pad = (hi - lo) * 0.08
  const step = niceStep((hi - lo + 2 * pad) / 5)
  const min = Math.floor((lo - pad) / step) * step
  const max = Math.ceil((hi + pad) / step) * step
  return [min, max]
}

// niceStep rounds a raw step up to the nearest 1/2/5 × 10ⁿ — the
// classic "nice number" sequence for axis ticks.
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

// fmtAxisAmount keeps the amount axis labels compact (1.2M, 450k) so the
// wider dynamic range doesn't overflow the tick gutter.
export function fmtAxisAmount(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`
  return String(v)
}

// ---- Table ----

function fmt(n: number) {
  return n === 0 ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

// dailyVolatility computes day-over-day return % using the prior day's
// current_total. `rows` is expected newest-first (the server's order), so
// rows[i+1] is the day before rows[i]. Returns null when there is no
// prior row in the window or the prior current value is zero (divide-by-
// zero); callers render it as "—".
export function dailyVolatility(rows: HistoryRow[], i: number): number | null {
  const prev = rows[i + 1]
  if (!prev) return null
  const prevCur = prev.totals.current_total
  if (prevCur === 0) return null
  const today = rows[i].totals.current_total
  return ((today - prevCur) / prevCur) * 100
}

// regionDailyVolatility is the per-region counterpart used by the
// per-currency table column. Rows newest-first.
export function regionDailyVolatility(rows: HistoryRow[], i: number, region: RegionKey): number | null {
  const prev = rows[i + 1]
  if (!prev) return null
  const prevCur = prev.regions[region]?.current ?? 0
  if (prevCur === 0) return null
  const today = rows[i].regions[region]?.current ?? 0
  return ((today - prevCur) / prevCur) * 100
}

// regionPnLPct is the per-region P/L %.
export function regionPnLPct(r: HistoryRow, region: RegionKey): number | null {
  const inv = r.regions[region]?.invested ?? 0
  const cur = r.regions[region]?.current  ?? 0
  if (inv === 0) return null
  return ((cur - inv) / inv) * 100
}

// regionInvestedWentUp reports whether the region's invested amount on
// this row is strictly greater than the prior day's — the user-added-
// holdings highlight from PR7 design-review.
export function regionInvestedWentUp(rows: HistoryRow[], i: number, region: RegionKey): boolean {
  const prev = rows[i + 1]
  if (!prev) return false
  const prevInv = prev.regions[region]?.invested ?? 0
  const todayInv = rows[i].regions[region]?.invested ?? 0
  return todayInv > prevInv
}

// HistoryTable lays out three side-by-side groups (one per currency:
// India₹ / Europe€ / US$) each with [Amount invested | Actual value |
// Daily volatlity | P/L%]. Values render in native currency with the
// symbol prefixed. When invested goes up vs the prior day for a region,
// the row's "Amount invested" cell highlights green — the "user added
// holdings" signal from the PR7 design review.
//
// Header spelling "volatlity" matches the user's reference screenshot
// verbatim. If we ever correct the typo, update the test expectation
// in HistoryPage.test.tsx too.
export function HistoryTable({ rows, currency: _currency, onDelete, onEdit, theme = 'dark', canForceDelete = false }: {
  rows: HistoryRow[]
  currency: string
  onDelete: (date: string) => void
  onEdit?: (row: HistoryRow) => void
  theme?: ThemeName
  canForceDelete?: boolean
}) {
  // Click the Date header to flip order. Default true = oldest-first.
  const [sortAsc, setSortAsc] = useState(true)

  const isAllManual = (regions: Record<string, RegionSnapshot>) =>
    Object.values(regions).every(r => r.source === 'manual')

  // Canonical newest-first array drives the day-over-day math: the
  // volatility / invested-went-up helpers assume rows[i+1] is the prior
  // day. Display order is independent — ascending just reverses what we
  // render, while every cell still computes against the canonical index.
  const byDateDesc = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    [rows],
  )
  const indexOfDate = useMemo(() => {
    const m = new Map<string, number>()
    byDateDesc.forEach((r, i) => m.set(r.date, i))
    return m
  }, [byDateDesc])
  const display = sortAsc ? [...byDateDesc].reverse() : byDateDesc

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, borderRight: '2px solid var(--border)' }}>
              <button onClick={() => setSortAsc(s => !s)} style={sortHeaderBtn}
                aria-label="Sort by date"
                title={sortAsc ? 'Oldest first — click for newest' : 'Newest first — click for oldest'}>
                Date {sortAsc ? '▲' : '▼'}
              </button>
            </th>
            {REGIONS.map((r, idx) => (
              <CurrencyHeaderGroup key={r} region={r} last={idx === REGIONS.length - 1} theme={theme} />
            ))}
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => {
            const i = indexOfDate.get(r.date)!
            const sources = new Set(Object.values(r.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            return (
              <tr key={r.date} title={`Source: ${sourceLabel}`}>
                <td style={{ ...td, borderRight: '2px solid var(--border)', fontWeight: 600 }}>{r.date}</td>
                {REGIONS.map((region, idx) => (
                  <CurrencyRowCells
                    key={region}
                    rows={byDateDesc}
                    i={i}
                    region={region}
                    last={idx === REGIONS.length - 1}
                    theme={theme}
                  />
                ))}
                <td style={{ ...td, display: 'flex', gap: 8 }}>
                  {onEdit && (
                    <button onClick={() => onEdit(r)} style={iconBtnBlueStyle}
                      aria-label={`Edit row for ${r.date}`} title="Edit">
                      <EditIcon size={16} />
                    </button>
                  )}
                  {(isAllManual(r.regions) || canForceDelete) && (
                    <button onClick={() => onDelete(r.date)} style={iconBtnRedStyle}
                      aria-label={`Delete row for ${r.date}`}
                      title={isAllManual(r.regions) ? 'Delete' : 'Delete (super-admin override of cron row)'}>
                      <TrashIcon size={16} />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CurrencyHeaderGroup({ region, last, theme }: { region: RegionKey; last: boolean; theme: ThemeName }) {
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  const tint = REGION_TINTS[theme][region].header
  const hdr: React.CSSProperties = { ...th, background: tint }
  return (
    <>
      <th style={hdr}>Amount invested</th>
      <th style={hdr}>Actual value</th>
      <th style={hdr}>Daily volatlity</th>
      <th style={{ ...hdr, ...sep }}>P/L%</th>
    </>
  )
}

function CurrencyRowCells({ rows, i, region, last, theme }: {
  rows: HistoryRow[]
  i: number
  region: RegionKey
  last: boolean
  theme: ThemeName
}) {
  const r = rows[i]
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const rs = r.regions[region]
  const invested = rs?.invested ?? 0
  const current  = rs?.current  ?? 0
  const vol      = regionDailyVolatility(rows, i, region)
  const pnl      = regionPnLPct(r, region)
  const wentUp   = regionInvestedWentUp(rows, i, region)
  const tint = REGION_TINTS[theme][region].cell
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  const base: React.CSSProperties = { ...td, background: tint }
  // Invested-went-up override beats the group tint to keep the signal loud.
  const investedStyle: React.CSSProperties = {
    ...base,
    background: wentUp ? 'rgba(34,197,94,0.28)' : tint,
    fontWeight: wentUp ? 600 : undefined,
  }
  const volColor = vol === null ? undefined : vol >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  const pnlColor = pnl === null ? undefined : pnl >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  return (
    <>
      <td style={investedStyle}>{fmtCurrency(invested, sym)}</td>
      <td style={base}>{fmtCurrency(current, sym)}</td>
      <td style={{ ...base, color: volColor }}>
        {vol === null ? '—' : vol.toFixed(2)}
      </td>
      <td style={{ ...base, ...sep, color: pnlColor }}>
        {pnl === null ? '—' : `${pnl.toFixed(2)}%`}
      </td>
    </>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
const sortHeaderBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 0, margin: 0,
  font: 'inherit', color: 'inherit', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)' }

// ---- Modals ----

const modalBackdrop: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const modalCard: React.CSSProperties = {
  background: 'var(--bg-secondary)', borderRadius: 8, padding: 20,
  width: '90%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
}
const btnPrimaryStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--blue)', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600,
}
const btnSecondaryStyle: React.CSSProperties = {
  padding: '6px 14px', background: 'transparent', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
}
const iconBtnBlueStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--blue, #2563eb)',
  cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center',
}
const iconBtnRedStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--red, #dc2626)',
  cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center',
}

export function AddRowModal({ onSubmit, onCancel }: {
  onSubmit: (input: { date: string; regions: Record<string, { invested: number; current: number }> }) => Promise<void>
  onCancel: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [form, setForm] = useState<RegionFormState>(emptyForm())
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await onSubmit({ date, regions: formToBody(form) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={modalBackdrop}>
      <div style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Add manual row</h2>
        <label style={{ display: 'block', marginBottom: 12 }}>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ display: 'block', marginTop: 4, padding: 6, width: '100%' }}/>
        </label>
        {REGIONS.map(r => (
          <fieldset key={r} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <legend style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{REGION_LABELS[r]}</legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>
                Invested
                <input type="number" min="0" value={form[r].invested}
                  onChange={e => setForm(f => ({ ...f, [r]: { ...f[r], invested: e.target.value } }))}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
              <label style={{ flex: 1 }}>
                Current
                <input type="number" min="0" value={form[r].current}
                  onChange={e => setForm(f => ({ ...f, [r]: { ...f[r], current: e.target.value } }))}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
            </div>
          </fieldset>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} disabled={busy} style={btnSecondaryStyle}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimaryStyle}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// parsePasteText accepts TSV (tabs) — what Google Sheets / Excel
// copy-paste yields. Expected columns in order:
//
//   Date | INR invested | INR current | EUR invested | EUR current
//        | USD invested | USD current | [Daily vol] | [P/L %]
//
// Trailing columns (Daily vol, P/L %) are ignored — they are derived
// on read.
//
// Robustness in PR7 design-review follow-up:
//   * Dates accepted in YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
//     and normalised to YYYY-MM-DD.
//   * Currency symbols (₹ € $ £) and thousands separators (, _ space)
//     stripped before parsing.
//   * Empty / blank cells become 0 — a row that has at least one
//     non-zero (invested OR current) for any region is kept.
//   * Header row detected by "first cell does not parse as a date"
//     and skipped.

const CURRENCY_SYMBOLS_RE = /[₹€$£\s_,]/g

export function parseAmount(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(CURRENCY_SYMBOLS_RE, '').trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

// normaliseDate accepts the common European-style formats users paste
// from spreadsheets and returns "YYYY-MM-DD". Returns "" when the input
// can't be parsed as a date.
export function normaliseDate(s: string): string {
  const t = s.trim()
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return ''
}

export function parsePasteText(text: string): { date: string; regions: Record<string, { invested: number; current: number }> }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: { date: string; regions: Record<string, { invested: number; current: number }> }[] = []
  for (const line of lines) {
    const cells = line.split(/\t/).map(c => c.trim())
    const date = normaliseDate(cells[0] ?? '')
    if (!date) continue // skip header / malformed
    const [, ii, ic, ei, ec, ui, uc] = cells
    const regions: Record<string, { invested: number; current: number }> = {}
    const set = (key: string, inv: string | undefined, cur: string | undefined) => {
      const a = parseAmount(inv ?? '')
      const b = parseAmount(cur ?? '')
      if (Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0)) {
        regions[key] = { invested: a, current: b }
      }
    }
    set('INR', ii, ic)
    set('EUR', ei, ec)
    set('USD', ui, uc)
    out.push({ date, regions })
  }
  return out
}

// EditRowModal pre-fills the form with an existing row and submits a
// PUT /api/history/:date/regions, which flips every patched region's
// source to manual (server-side rule). Use to override cron values or
// fix an existing manual entry. PRD-002 §7.3 / DD-002 §4.4.
export function EditRowModal({ row, onSubmit, onCancel }: {
  row: HistoryRow
  onSubmit: (date: string, regions: Record<string, { invested: number; current: number }>) => Promise<void>
  onCancel: () => void
}) {
  const initial: RegionFormState = {
    INR: { invested: String(row.regions.INR?.invested ?? ''), current: String(row.regions.INR?.current ?? '') },
    EUR: { invested: String(row.regions.EUR?.invested ?? ''), current: String(row.regions.EUR?.current ?? '') },
    USD: { invested: String(row.regions.USD?.invested ?? ''), current: String(row.regions.USD?.current ?? '') },
  }
  const [form, setForm] = useState<RegionFormState>(initial)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await onSubmit(row.date, formToBody(form))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={modalBackdrop}>
      <div style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Edit row — {row.date}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Saving overrides any cron-written value with the manual value below. A
          region whose <em>both</em> fields are blank or zero is skipped — its
          existing value stays unchanged. Type at least one positive number per
          region to override it.
        </p>
        {REGIONS.map(r => (
          <fieldset key={r} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <legend style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {REGION_LABELS[r]} ({CURRENCY_SYMBOL[CURRENCY_BY_REGION[r]]})
            </legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>
                Invested
                <input type="number" min="0" value={form[r].invested}
                  onChange={e => setForm(f => ({ ...f, [r]: { ...f[r], invested: e.target.value } }))}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
              <label style={{ flex: 1 }}>
                Current
                <input type="number" min="0" value={form[r].current}
                  onChange={e => setForm(f => ({ ...f, [r]: { ...f[r], current: e.target.value } }))}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
            </div>
          </fieldset>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} disabled={busy} style={btnSecondaryStyle}>Cancel</button>
          <button onClick={submit} disabled={busy} style={btnPrimaryStyle}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export function PasteModal({ monthLabel, onSubmit, onCancel }: {
  monthLabel: string
  onSubmit: (input: { month: string; rows: ReturnType<typeof parsePasteText> }) => Promise<PasteHistoryReport>
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<PasteHistoryReport | null>(null)

  const [clientSkipped, setClientSkipped] = useState<number>(0)

  const submit = async () => {
    setBusy(true)
    setReport(null)
    setClientSkipped(0)
    try {
      const inputLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).length
      const rows = parsePasteText(text)
      const skipped = inputLines - rows.length
      setClientSkipped(skipped)
      if (rows.length === 0) {
        alert(
          'No rows recognised from the paste. Check the format hint above — ' +
          'dates must be YYYY-MM-DD or dd/mm/yyyy, columns must be tab-separated.'
        )
        return
      }
      const r = await onSubmit({ month: monthLabel, rows })
      setReport(r)
      if (r.applied.length === 0 && r.conflicts.length === 0 && r.rejected.length === 0) {
        alert('Server accepted no rows. They were likely all outside the selected month.')
      }
    } catch (e) {
      alert('Paste failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={modalBackdrop}>
      <div style={modalCard}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Paste month — {monthLabel}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Paste tab-separated rows (Google Sheets / Excel). Columns:
          {' '}<code>Date</code> | <code>INR invested</code> | <code>INR current</code> |
          {' '}<code>EUR invested</code> | <code>EUR current</code> |
          {' '}<code>USD invested</code> | <code>USD current</code>.
          {' '}Extra trailing columns (Daily vol, P/L %) are ignored.
          {' '}Dates accept <code>YYYY-MM-DD</code> or <code>dd/mm/yyyy</code>.
          {' '}Currency symbols and thousands separators are stripped automatically.
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
          style={{ width: '100%', fontFamily: 'monospace', padding: 8, boxSizing: 'border-box' }}/>
        {report && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <div style={{ color: 'var(--green)' }}>✓ Applied: {report.applied.length}</div>
            <div style={{ color: 'var(--yellow, #d97706)' }}>⚠ Conflicts (need confirmation): {report.conflicts.length}</div>
            <div style={{ color: 'var(--red)' }}>✗ Server rejected: {report.rejected.length}</div>
            {clientSkipped > 0 && (
              <div style={{ color: 'var(--text-muted)' }}>
                — Skipped on client (bad date / format): {clientSkipped}
              </div>
            )}
            {report.rejected.length > 0 && (
              <ul style={{ marginTop: 4, paddingLeft: 18, fontSize: 12 }}>
                {report.rejected.map(r => <li key={r.date}>{r.date}: {r.reason}</li>)}
              </ul>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancel} disabled={busy} style={btnSecondaryStyle}>Close</button>
          <button onClick={submit} disabled={busy} style={btnPrimaryStyle}>{busy ? 'Processing…' : 'Submit'}</button>
        </div>
      </div>
    </div>
  )
}

export function ConflictDialog({ conflict, onResolve, onSkip }: {
  conflict: DateConflict
  onResolve: (date: string, chosen: Record<string, { invested: number; current: number }>) => Promise<void>
  onSkip: () => void
}) {
  const [picks, setPicks] = useState<Record<RegionKey, boolean>>({
    INR: false, EUR: false, USD: false,
  })

  const toggle = (r: RegionKey) => setPicks(p => ({ ...p, [r]: !p[r] }))

  const submit = async () => {
    const chosen: Record<string, { invested: number; current: number }> = {}
    for (const r of REGIONS) {
      if (picks[r] && conflict.incoming[r]) {
        chosen[r] = conflict.incoming[r]
      }
    }
    await onResolve(conflict.date, chosen)
  }

  return (
    <div style={modalBackdrop}>
      <div style={modalCard}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Conflict — {conflict.date}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          For each region, tick to keep the incoming value (override). Leave unticked to keep what's already there.
        </p>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr><th style={th}>Region</th><th style={th}>Existing</th><th style={th}>Incoming</th><th style={th}>Keep incoming?</th></tr>
          </thead>
          <tbody>
            {REGIONS.map(r => {
              const ex = conflict.existing[r]
              const inc = conflict.incoming[r]
              if (!ex && !inc) return null
              return (
                <tr key={r}>
                  <td style={td}>{REGION_LABELS[r]}</td>
                  <td style={td}>{ex ? `${fmt(ex.invested)} / ${fmt(ex.current)} (${ex.source})` : '—'}</td>
                  <td style={td}>{inc ? `${fmt(inc.invested)} / ${fmt(inc.current)}` : '—'}</td>
                  <td style={td}>
                    <input type="checkbox" checked={!!picks[r]} disabled={!inc} onChange={() => toggle(r)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onSkip} style={btnSecondaryStyle}>Skip</button>
          <button onClick={submit} style={btnPrimaryStyle}>Confirm</button>
        </div>
      </div>
    </div>
  )
}
