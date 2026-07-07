import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, FocusEvent, SetStateAction } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  api,
  type DateConflict,
  type GoldHistoryOverlay,
  type HistoryHolding,
  type HistoryRow,
  type PasteHistoryReport,
  type RegionSnapshot,
} from '../../lib/api/client'
import { ApiError } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { EditIcon, TrashIcon } from '../../components/Icon'
import { groupIndian, parseDecimalInput, sanitizeDecimalInput } from '../../lib/formNumbers'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import { useAuthOptional } from '../auth/AuthContext'

// Snapshot buckets are keyed by currency after PR7 design-review
// (2026-06-16); the backend's CurrencyOf decides which bucket a
// holding falls into based on Exchange first, Currency fallback.
export const REGIONS = ['INR', 'EUR'] as const
export type RegionKey = typeof REGIONS[number]

export const REGION_LABELS: Record<RegionKey, string> = {
  INR: 'India (INR)',
  EUR: 'Europe (EUR)',
}

// PRD-002 §7.2 + PR7 design review: saffron (INR), blue (EUR).
// Palettes are theme-aware: brighter hues for dark backgrounds, darker
// hues for light. The previous single palette was muddy on white and
// faded on near-black.
export type LinePalette = Record<RegionKey, { invested: string; current: string }>
export const REGION_COLOURS: Record<ThemeName, LinePalette> = {
  dark: {
    INR: { invested: '#fcd34d', current: '#f97316' }, // amber-300 / orange-500
    EUR: { invested: '#60a5fa', current: '#3b82f6' }, // blue-400 / 500
  },
  light: {
    INR: { invested: '#d97706', current: '#9a3412' }, // amber-600 / orange-800
    EUR: { invested: '#2563eb', current: '#1e3a8a' }, // blue-600  / 900
  },
}

const PNL_LINE_COLOUR: Record<ThemeName, string> = {
  dark:  '#c084fc', // purple-400, pops on dark
  light: '#6d28d9', // purple-700, readable on white
}

const VOL_LINE_COLOUR: Record<ThemeName, string> = {
  dark:  '#2dd4bf', // teal-400, distinct from the amber/blue/red/purple lines
  light: '#0f766e', // teal-700, readable on white
}

// Per-theme background tints for each currency group in the table.
// `header` lands behind the column-group header cells; `cell` is the
// per-data-cell tint that propagates the group identity down the column.
const REGION_TINTS: Record<ThemeName, Record<RegionKey, { header: string; cell: string }>> = {
  light: {
    INR: { header: '#FFEDD5', cell: '#FFF7ED' }, // orange-100 / orange-50
    EUR: { header: '#DBEAFE', cell: '#EFF6FF' }, // blue-100   / blue-50
  },
  dark: {
    INR: { header: 'rgba(251,146,60,0.22)', cell: 'rgba(251,146,60,0.10)' },
    EUR: { header: 'rgba(96,165,250,0.22)', cell: 'rgba(96,165,250,0.10)' },
  },
}

// PRICE_DIR_TINT tints the "P/L%" cell by the day-over-day price move:
// mild green up, mild red down, mild blue unchanged. Semi-transparent so it
// reads on both themes; overrides the per-currency group tint on that cell.
const PRICE_DIR_TINT: Record<'up' | 'down' | 'flat', string> = {
  up:   'rgba(34,197,94,0.18)',  // green
  down: 'rgba(239,68,68,0.18)',  // red
  flat: 'rgba(59,130,246,0.18)', // blue
}

// NEW_INVESTMENT_TINT marks the "Amount invested" cell on a day the user
// added holdings (invested rose vs the prior day). Mild purple — kept
// distinct from the green/red/blue price-direction tints above.
const NEW_INVESTMENT_TINT = 'rgba(168,85,247,0.18)' // purple

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
  }
}

// parseFormAmount tolerates both decimal conventions so a value typed into an
// amount form parses the same regardless of the user's locale habits. The last
// separator is the decimal when both '.' and ',' are present; otherwise a single
// separator is treated as decimal unless it looks like a thousands group.
// Empty -> 0. Distinct from the paste parser, where comma is always grouping.
//   "23456.45" -> 23456.45   "23456,45"  -> 23456.45
//   "23,456.45" -> 23456.45  "23.456,45" -> 23456.45
//   "1,234" -> 1234          "1,234,567" -> 1234567
export function parseFormAmount(s: string): number {
  return parseDecimalInput(s)
}
export { groupIndian }

// groupedInitial formats a stored numeric value for an input's initial display.
function groupedInitial(v: number | undefined): string {
  return v == null ? '' : groupIndian(String(v))
}

// sanitizeAmount drops anything that can't be part of a numeric amount. The
// DecimalInput component also blocks those keystrokes before they reach state.
export function sanitizeAmount(s: string): string {
  return sanitizeDecimalInput(s)
}

// formError validates the amount fields before submit. A field that is
// non-empty but does not parse to a finite number is rejected (rather than
// silently skipped) so a typo can never drop a region on save.
function formError(form: RegionFormState): string | null {
  for (const r of REGIONS) {
    for (const key of ['invested', 'current'] as const) {
      const raw = form[r][key].trim()
      if (raw !== '' && !Number.isFinite(parseFormAmount(raw))) {
        return `Enter a valid ${key} amount for ${REGION_LABELS[r]}.`
      }
    }
  }
  return null
}

// regroupHandler returns an onBlur handler that normalises a typed amount and
// re-applies Indian grouping, so freshly entered values match the prefilled
// ones (e.g. "2345678" → "23,45,678"). Empty stays empty.
function regroupHandler(setForm: Dispatch<SetStateAction<RegionFormState>>) {
  return (r: RegionKey, key: keyof RegionFormValue) =>
    (e: FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim()
      const parsed = parseFormAmount(raw)
      const grouped = raw === '' || !Number.isFinite(parsed) ? raw : groupIndian(String(parsed))
      setForm(f => ({ ...f, [r]: { ...f[r], [key]: grouped } }))
    }
}

// formToBody collects the regions the user actually touched. A region is
// included when either field is non-blank (a blank field counts as 0), so an
// explicit 0 — e.g. resetting a value from 1 to 0 — overrides rather than being
// dropped. A region with BOTH fields blank is untouched and left unchanged.
export function formToBody(form: RegionFormState): Record<string, { invested: number; current: number }> {
  const out: Record<string, { invested: number; current: number }> = {}
  for (const r of REGIONS) {
    const investedRaw = form[r].invested.trim()
    const currentRaw = form[r].current.trim()
    if (investedRaw === '' && currentRaw === '') continue // untouched region
    out[r] = { invested: parseFormAmount(investedRaw), current: parseFormAmount(currentRaw) }
  }
  return out
}

// changedRegions keeps only the regions whose values differ from the original
// row. Saving an edit that touched one currency then doesn't re-assert (and
// flip to manual) the untouched ones, and a no-op save sends nothing.
export function changedRegions(
  body: Record<string, { invested: number; current: number }>,
  original: Record<string, RegionSnapshot>,
): Record<string, { invested: number; current: number }> {
  const out: Record<string, { invested: number; current: number }> = {}
  for (const [r, v] of Object.entries(body)) {
    const o = original[r]
    if (!o || o.invested !== v.invested || o.current !== v.current) out[r] = v
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
  // Per-currency Holdings modal: the clicked row, the prior trading day's row
  // (for yesterday's price), and the currency clicked. null = closed.
  const [holdingsView, setHoldingsView] = useState<{ row: HistoryRow; prev: HistoryRow | null; region: RegionKey } | null>(null)
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

  // One chart per currency. Compute series per bucket.
  const chartsByRegion = useMemo(() => ({
    INR: perCurrencyChartData(rows, 'INR'),
    EUR: perCurrencyChartData(rows, 'EUR'),
  }), [rows])
  // Gold gets its own panel (INR-denominated) from the per-row overlay,
  // shown only when at least one row carries gold data.
  const goldChart = useMemo(() => goldChartData(rows), [rows])
  const hasGoldChart = useMemo(() => rows.some(r => r.gold), [rows])

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

      <main style={{ width: "100%", maxWidth: "1800px", margin: '0 auto', padding: '24px 28px' }}>
        <section style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Year</span>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Month</span>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
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
              onSelectRegion={(row, prev, region) => setHoldingsView({ row, prev, region })}
              canForceDelete={canForceDelete} />
            <div style={{ height: 16 }} />
            {REGIONS.filter(r => regionHasData(chartsByRegion[r])).map(r => (
              <CurrencyChartPanel key={r} region={r} data={chartsByRegion[r]} theme={theme} />
            ))}
            {hasGoldChart && <GoldChartPanel data={goldChart} theme={theme} />}
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
      {holdingsView && <HoldingsModal
        row={holdingsView.row}
        prev={holdingsView.prev}
        region={holdingsView.region}
        onClose={() => setHoldingsView(null)}
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
export const CURRENCY_BY_REGION: Record<RegionKey, 'INR' | 'EUR'> = {
  INR: 'INR',
  EUR: 'EUR',
}

export const CURRENCY_SYMBOL: Record<'INR' | 'EUR', string> = {
  INR: '₹',
  EUR: '€',
}

// fmtCurrency formats amount with the currency symbol and 2dp using Indian
// digit grouping (lakh/crore), e.g. "₹10,19,620.00", regardless of the
// browser locale. An amount of 0 renders as "₹0.00" rather than the em dash
// used elsewhere, because in the per-currency layout an absent value collapses
// the whole row group instead.
export function fmtCurrency(amount: number, sym: string): string {
  return sym + amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

// ---- Chart ----

// ChartTriptych renders the three side-by-side mini-charts shared by the
// currency and gold panels: invested vs current value, P/L %, and daily
// volatility %. Each surface has its own y-axis range so it is read
// independently — P/L % and daily volatility are not crushed by the amount
// axis. `sym` denominates the amount tooltips; `palette` colours the two
// amount lines; `onExpand` (when set) makes the amount chart clickable.
function ChartTriptych({ data, sym, palette, theme, onExpand, expandLabel }: {
  data: any[]
  sym: string
  palette: { invested: string; current: string }
  theme: ThemeName
  onExpand?: () => void
  expandLabel?: string
}) {
  const pnlColour = PNL_LINE_COLOUR[theme]
  const volColour = VOL_LINE_COLOUR[theme]
  // Recharts' default value-axis domain is [0, max], which flattens series
  // that oscillate in a narrow band far above zero. Derive a padded domain
  // from the actual data so the fluctuations fill the chart.
  const amountDomain = useMemo(() => niceDomain(data.flatMap(d => [d.invested, d.current])), [data])
  const pnlDomain = useMemo(() => niceDomain(data.map(d => d.pnl_pct)), [data])
  // Daily volatility swings both ways around 0, so centre the axis on zero.
  const volDomain = useMemo(() => symmetricDomain(data.map(d => d.daily_vol)), [data])
  const expandProps = onExpand
    ? {
        style: { height: 220, cursor: 'pointer' } as React.CSSProperties,
        onClick: onExpand, role: 'button', tabIndex: 0,
        'aria-label': expandLabel, title: 'Open full history (2000–today) with horizontal scroll',
        onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand() } },
      }
    : { style: { height: 220 } as React.CSSProperties }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Invested vs Current</span>
          {onExpand && <span style={{ fontSize: 10, color: 'var(--blue)' }}>click to expand →</span>}
        </div>
        <div {...expandProps}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={amountDomain ?? ['auto', 'auto']}
                tickFormatter={fmtAxisAmount} width={64} />
              <Tooltip {...chartTooltipProps} formatter={(v) => fmtCurrency(Number(v), sym)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="invested" name={`Invested (${sym})`} stroke={palette.invested} strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls />
              <Line dataKey="current"  name={`Current (${sym})`}  stroke={palette.current}  strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>P/L %</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={pnlDomain ?? ['auto', 'auto']} />
              <Tooltip {...chartTooltipProps} formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="pnl_pct" name="P/L %" stroke={pnlColour} strokeWidth={2.5} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>Daily volatility %</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" domain={volDomain ?? ['auto', 'auto']} />
              <Tooltip {...chartTooltipProps} formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="2 2" />
              <Line dataKey="daily_vol" name="Daily volatility %" stroke={volColour} strokeWidth={2.5} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 8, padding: 16, marginBottom: 16,
}
const panelTitle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)',
}

// CurrencyChartPanel: the invested/current/P-L/volatility triptych for one
// currency, with the amount chart expandable to the full-history page.
function CurrencyChartPanel({ region, data, theme }: { region: RegionKey; data: any[]; theme: ThemeName }) {
  const navigate = useNavigate()
  const cur = CURRENCY_BY_REGION[region]
  return (
    <div style={panelStyle}>
      <h2 style={panelTitle}>{REGION_LABELS[region]} ({cur})</h2>
      <ChartTriptych data={data} sym={CURRENCY_SYMBOL[cur]} palette={REGION_COLOURS[theme][region]}
        theme={theme} onExpand={() => navigate(`/history/chart/${region}`)}
        expandLabel={`Expand full ${REGION_LABELS[region]} invested vs current history`} />
    </div>
  )
}

// Physical gold is INR-denominated; a distinct amber/yellow palette keeps it
// apart from INR's saffron. No expand target — gold has no full-history page.
const GOLD_PALETTE: Record<ThemeName, { invested: string; current: string }> = {
  dark:  { invested: '#fde047', current: '#eab308' }, // yellow-300 / 500
  light: { invested: '#ca8a04', current: '#854d0e' }, // yellow-600 / 800
}

// GoldChartPanel: the same triptych fed by the per-row gold overlay (§8).
function GoldChartPanel({ data, theme }: { data: any[]; theme: ThemeName }) {
  return (
    <div style={panelStyle}>
      <h2 style={panelTitle}>Gold (₹)</h2>
      <ChartTriptych data={data} sym="₹" palette={GOLD_PALETTE[theme]} theme={theme} />
    </div>
  )
}

// goldChartData shapes the per-row gold overlay into the chart series (same
// shape as perCurrencyChartData). Rows without an overlay emit nulls so the
// line bridges the gap rather than plunging to zero.
export function goldChartData(rows: HistoryRow[]) {
  const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return oldestFirst.map(r => ({
    date: r.date.slice(5),
    invested: r.gold ? r.gold.invested : null,
    current: r.gold ? r.gold.current : null,
    pnl_pct: r.gold ? r.gold.pnl_pct : null,
    daily_vol: r.gold ? r.gold.volatility_pct : null,
  }))
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
  // daily_vol is the per-currency day-over-day % change of the current
  // value vs the previous data point, net of the change in invested so a
  // contribution/withdrawal doesn't read as a market move. null on the
  // first point and whenever either side of the baseline is absent or the
  // prior current is zero (divide-by-zero / no baseline).
  let prevCurrent: number | null = null
  let prevInvested: number | null = null
  return oldestFirst.map(r => {
    const rs = r.regions[region]
    const invested = rs ? rs.invested : null
    const current  = rs ? rs.current  : null
    const pnl_pct  = rs && rs.invested > 0 ? ((rs.current - rs.invested) / rs.invested) * 100 : null
    const daily_vol = current != null && prevCurrent != null && prevCurrent !== 0
        && invested != null && prevInvested != null
      ? ((current - prevCurrent - (invested - prevInvested)) / prevCurrent) * 100
      : null
    prevCurrent = current
    prevInvested = invested
    return { date: r.date.slice(5), invested, current, pnl_pct, daily_vol }
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

// symmetricDomain returns a [-m, +m] range centred on zero so a signed series
// (daily volatility %) renders with the zero line in the middle of the chart.
// m is the padded, nicely-rounded magnitude of the largest swing either way.
// Returns undefined when there are no finite values.
export function symmetricDomain(values: (number | null | undefined)[]): [number, number] | undefined {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (finite.length === 0) return undefined
  const maxAbs = Math.max(...finite.map(Math.abs))
  if (maxAbs === 0) return [-1, 1]
  const pad = maxAbs * 0.08
  const step = niceStep((maxAbs + pad) / 3)
  const m = Math.ceil((maxAbs + pad) / step) * step
  return [-m, m]
}

// regionHasData reports whether a region's chart series has any non-zero
// invested or current value. Used to hide a currency's charts entirely when
// the profile never held that currency (e.g. USD for the super admin).
export function regionHasData(data: { invested: number | null; current: number | null }[]): boolean {
  return data.some(d => (d.invested ?? 0) !== 0 || (d.current ?? 0) !== 0)
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
  return n === 0 ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

// regionDailyVolatility is the per-currency day-over-day % used by the
// table column. Rows newest-first. Per-currency by design: the history UI
// never combines currencies (PortfolioSnapshot.Totals is a same-currency-
// only aggregate, not FX-converted), so volatility is computed per bucket.
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

// regionCurrentDirection compares the region's current (market) value to
// the prior day's, driving the "P/L%" cell tint: 'up' / 'down' / 'flat'.
// Returns null when there is no prior data point for the region to compare
// against (first row, or the region is absent on either day) — the cell
// then keeps its plain per-currency group tint. Rows newest-first, so
// rows[i+1] is the prior day.
//
// Deliberately separate from regionDailyVolatility: that one treats an
// absent region as 0 (so a vanished bucket reads as a -100% move), whereas
// the tint must show "no comparison" (null) when either day lacks the
// region. Keep the two in sync only where that difference does not matter.
export function regionCurrentDirection(
  rows: HistoryRow[], i: number, region: RegionKey,
): 'up' | 'down' | 'flat' | null {
  const prev = rows[i + 1]
  if (!prev) return null
  const prevRs = prev.regions[region]
  const curRs = rows[i].regions[region]
  if (!prevRs || !curRs) return null
  const delta = curRs.current - prevRs.current
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
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
export function HistoryTable({ rows, currency: _currency, onDelete, onEdit, onSelectRegion, theme = 'dark', canForceDelete = false }: {
  rows: HistoryRow[]
  currency: string
  onDelete: (date: string) => void
  onEdit?: (row: HistoryRow) => void
  // Clicking a currency-group cell opens the Holdings modal scoped to that
  // currency. prev is the prior trading day's row (for yesterday's price), or
  // null when this is the oldest row loaded.
  onSelectRegion?: (row: HistoryRow, prev: HistoryRow | null, region: RegionKey) => void
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
  // The gold column group appears only when the backend attached an overlay
  // to at least one row — i.e. a gold-enabled user with a valued position
  // (PRD-003 §8). Non-gold users never see it.
  const hasGold = useMemo(() => rows.some(r => r.gold), [rows])

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
            {hasGold && <GoldHeaderGroup />}
            <th style={actionTh}></th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => {
            const i = indexOfDate.get(r.date)!
            const sources = new Set(Object.values(r.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            const prev = byDateDesc[i + 1] ?? null
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
                    onSelectRegion={onSelectRegion ? () => onSelectRegion(r, prev, region) : undefined}
                  />
                ))}
                {hasGold && <GoldRowCells gold={r.gold} />}
                <td style={actionTd}>
                  <div style={actionCell}>
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
                  </div>
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

function CurrencyRowCells({ rows, i, region, last, theme, onSelectRegion }: {
  rows: HistoryRow[]
  i: number
  region: RegionKey
  last: boolean
  theme: ThemeName
  onSelectRegion?: () => void
}) {
  const r = rows[i]
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const rs = r.regions[region]
  const invested = rs?.invested ?? 0
  const current  = rs?.current  ?? 0
  const vol      = regionDailyVolatility(rows, i, region)
  const pnl      = regionPnLPct(r, region)
  const wentUp   = regionInvestedWentUp(rows, i, region)
  const dir      = regionCurrentDirection(rows, i, region)
  const tint = REGION_TINTS[theme][region].cell
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  // The cell group opens the per-currency Holdings modal only when this row has
  // at least one positive holding in this currency. The whole group is
  // mouse-clickable, but only the first cell carries the button semantics +
  // keyboard focus, so a screen reader hears one "View <currency> holdings"
  // button per group rather than four identical tab stops.
  const hasHoldings = !!r.holdings?.some(h => holdingRegion(h) === region && h.quantity > 0)
  const selectable = !!onSelectRegion && hasHoldings
  const mouseProps = selectable ? { onClick: () => onSelectRegion!() } : {}
  const buttonProps = selectable
    ? {
        ...mouseProps,
        role: 'button',
        tabIndex: 0,
        'aria-label': `View ${region} holdings`,
        title: `View ${region} holdings`,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRegion!() }
        },
      }
    : {}
  const base: React.CSSProperties = { ...td, background: tint, cursor: selectable ? 'pointer' : undefined }
  // New-investment override beats the group tint to keep the signal loud:
  // a day the user added holdings gets a mild purple "Amount invested" cell.
  const investedStyle: React.CSSProperties = {
    ...base,
    background: wentUp ? NEW_INVESTMENT_TINT : tint,
    fontWeight: wentUp ? 600 : undefined,
  }
  // P/L% cell tints by the day-over-day price move: mild green up, mild red
  // down, mild blue unchanged; plain group tint when there is no prior day
  // to compare against. Text stays the default colour — the background is
  // the single signal here (its own +/- sign still reads the P/L), so it
  // does not clash with the price-direction tint.
  const pnlStyle: React.CSSProperties = {
    ...base,
    ...sep,
    background: dir ? PRICE_DIR_TINT[dir] : tint,
  }
  const volColor = vol === null ? undefined : vol >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  return (
    <>
      <td {...buttonProps} style={investedStyle}>{fmtCurrency(invested, sym)}</td>
      <td {...mouseProps} style={base}>{fmtCurrency(current, sym)}</td>
      <td {...mouseProps} style={{ ...base, color: volColor }}>
        {vol === null ? '—' : vol.toFixed(2)}
      </td>
      <td {...mouseProps} style={pnlStyle}>
        {pnl === null ? '—' : `${pnl.toFixed(2)}%`}
      </td>
    </>
  )
}

// Physical gold is tracked in INR and forms one column group (PRD-003 §8),
// after the per-currency groups. A muted amber tint sets it apart without
// competing with the saffron/blue/red currency tints.
const GOLD_TINT = 'rgba(217,119,6,0.10)'

function GoldHeaderGroup() {
  const hdr: React.CSSProperties = { ...th, background: GOLD_TINT }
  return (
    <>
      <th style={{ ...hdr, borderLeft: '2px solid var(--border)' }}>Gold invested</th>
      <th style={hdr}>Gold value</th>
      <th style={hdr}>Daily volatility</th>
      <th style={hdr}>P/L%</th>
    </>
  )
}

function GoldRowCells({ gold }: { gold?: GoldHistoryOverlay }) {
  const base: React.CSSProperties = { ...td, background: GOLD_TINT }
  const first: React.CSSProperties = { ...base, borderLeft: '2px solid var(--border)' }
  // Rows before the first purchase (or before any price existed) carry no
  // overlay — the whole group reads em dashes rather than fake zeros.
  if (!gold) {
    return (
      <>
        <td style={first}>—</td><td style={base}>—</td><td style={base}>—</td><td style={base}>—</td>
      </>
    )
  }
  const volColor = gold.volatility_pct === 0 ? undefined
    : gold.volatility_pct > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  return (
    <>
      <td style={first}>{fmtCurrency(gold.invested, '₹')}</td>
      <td style={base}>{fmtCurrency(gold.current, '₹')}</td>
      <td style={{ ...base, color: volColor }}>{gold.volatility_pct.toFixed(2)}</td>
      <td style={base}>{gold.pnl_pct === null ? '—' : `${gold.pnl_pct.toFixed(2)}%`}</td>
    </>
  )
}

// holdingRegion maps a holding's currency code to its table currency group,
// defaulting unknown/blank to INR (the Holding.Currency default).
export function holdingRegion(h: HistoryHolding): RegionKey {
  const code = (h.currency || 'INR').toUpperCase()
  // Only INR and EUR are tracked; anything else (incl. legacy USD) → INR.
  return code === 'EUR' ? 'EUR' : 'INR'
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
const sortHeaderBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', padding: 0, margin: 0,
  font: 'inherit', color: 'inherit', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)' }
const actionTh: React.CSSProperties = { ...th, width: 72, minWidth: 72, textAlign: 'center' }
const actionTd: React.CSSProperties = { ...td, width: 72, minWidth: 72, textAlign: 'center', verticalAlign: 'middle' }
const actionCell: React.CSSProperties = { display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'center' }

// ---- Modals ----

// selectStyle keeps the Year/Month dropdowns theme-aware. Without an explicit
// background/colour, native <select> falls back to the browser default (white
// on black text), which reads as light-mode in the dark theme.
const selectStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-primary)',
}
// Recharts renders its tooltip with a hard-coded white background; in dark mode
// the (theme-set) white text then sits on white. Force a theme-aware surface.
export const chartTooltipProps = {
  contentStyle: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)',
  } as React.CSSProperties,
  labelStyle: { color: 'var(--text-secondary)' } as React.CSSProperties,
  itemStyle: { color: 'var(--text-primary)' } as React.CSSProperties,
}
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
  const [error, setError] = useState('')
  const regroup = regroupHandler(setForm)

  const submit = async () => {
    const err = formError(form)
    if (err) { setError(err); return }
    setError('')
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
                <DecimalInput value={form[r].invested}
                  onValueChange={value => setForm(f => ({ ...f, [r]: { ...f[r], invested: value } }))}
                  onBlur={regroup(r, 'invested')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
              <label style={{ flex: 1 }}>
                Current
                <DecimalInput value={form[r].current}
                  onValueChange={value => setForm(f => ({ ...f, [r]: { ...f[r], current: value } }))}
                  onBlur={regroup(r, 'current')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
            </div>
          </fieldset>
        ))}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
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
//        | [Daily vol] | [P/L %]
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
    const [, ii, ic, ei, ec] = cells
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
    INR: { invested: groupedInitial(row.regions.INR?.invested), current: groupedInitial(row.regions.INR?.current) },
    EUR: { invested: groupedInitial(row.regions.EUR?.invested), current: groupedInitial(row.regions.EUR?.current) },
  }
  const [form, setForm] = useState<RegionFormState>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const regroup = regroupHandler(setForm)

  const submit = async () => {
    const err = formError(form)
    if (err) { setError(err); return }
    setError('')
    // Only send the regions that actually changed; a no-op edit closes without
    // hitting the backend.
    const body = changedRegions(formToBody(form), row.regions)
    if (Object.keys(body).length === 0) { onCancel(); return }
    setBusy(true)
    try {
      await onSubmit(row.date, body)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={modalBackdrop}>
      <div style={modalCard}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Edit row — {row.date}</h2>
        <p style={{ margin: '0 0 12px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Saving overrides any cron-written value with the manual value below.
          Only the regions you change are saved; enter <em>0</em> to reset a
          value. A region left exactly as it was (both fields untouched) is not
          re-saved.
        </p>
        {REGIONS.map(r => (
          <fieldset key={r} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <legend style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {REGION_LABELS[r]} ({CURRENCY_SYMBOL[CURRENCY_BY_REGION[r]]})
            </legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1 }}>
                Invested
                <DecimalInput value={form[r].invested}
                  onValueChange={value => setForm(f => ({ ...f, [r]: { ...f[r], invested: value } }))}
                  onBlur={regroup(r, 'invested')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
              <label style={{ flex: 1 }}>
                Current
                <DecimalInput value={form[r].current}
                  onValueChange={value => setForm(f => ({ ...f, [r]: { ...f[r], current: value } }))}
                  onBlur={regroup(r, 'current')}
                  style={{ display: 'block', width: '100%', padding: 6, marginTop: 4 }}/>
              </label>
            </div>
          </fieldset>
        ))}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>{error}</div>}
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
          {' '}<code>EUR invested</code> | <code>EUR current</code>.
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
    INR: false, EUR: false,
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

// HoldingsModal shows the per-stock breakdown for one currency on a clicked
// history row: each stock's yesterday vs current close, the price change, and
// the daily % move. Only positive holdings in the selected currency are shown
// (negative/zero positions are excluded). Yesterday's price comes from the
// prior trading day's row matched by symbol (— when that stock has no prior
// line). Reuses the shared modal chrome (dimmed backdrop + scrollable card).
export function HoldingsModal({ row, prev, region, onClose }: {
  row: HistoryRow
  prev: HistoryRow | null
  region: RegionKey
  onClose: () => void
}) {
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const inRegion = (h: HistoryHolding) => holdingRegion(h) === region
  // Key by symbol+script so two holdings that share a symbol (e.g. a dual
  // listing) don't collide on the React key or the yesterday-price lookup.
  const keyFor = (h: HistoryHolding) => `${h.symbol} ${h.script}`
  // Only real (positive-quantity) holdings in this currency.
  const holdings = (row.holdings ?? []).filter(h => inRegion(h) && h.quantity > 0)
  const prevByKey = new Map(
    (prev?.holdings ?? []).filter(inRegion).map(h => [keyFor(h), h]),
  )
  const priceFmt = (n: number) => fmtCurrency(n, sym)

  return (
    <div style={modalBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modalCard} role="dialog" aria-modal="true" aria-label="Holdings">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Holdings</h2>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.date} · {region}</span>
        </div>
        {holdings.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No {region} holdings for this row.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Script name</th>
                  <th style={{ ...th, textAlign: 'right' }}>Yesterday price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Current price</th>
                  <th style={{ ...th, textAlign: 'right' }}>Change value</th>
                  <th style={{ ...th, textAlign: 'right' }}>Daily change</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map(h => {
                  const cur = h.close_price
                  const y = prevByKey.get(keyFor(h))?.close_price
                  const yesterday = y ?? null
                  const change = yesterday === null ? null : cur - yesterday
                  const pct = yesterday === null || yesterday === 0 ? null : ((cur - yesterday) / yesterday) * 100
                  // Green up, red down, blue unchanged; neutral only when there
                  // is no prior price to compare against.
                  const color = change === null
                    ? undefined
                    : change > 0 ? 'var(--green, #16a34a)'
                    : change < 0 ? 'var(--red, #dc2626)'
                    : 'var(--blue, #2563eb)'
                  const num: React.CSSProperties = { ...td, textAlign: 'right' }
                  return (
                    <tr key={keyFor(h)}>
                      <td style={td}>{h.script || h.symbol}</td>
                      <td style={num}>{yesterday === null ? '—' : priceFmt(yesterday)}</td>
                      <td style={num}>{priceFmt(cur)}</td>
                      <td style={{ ...num, color }}>{change === null ? '—' : priceFmt(change)}</td>
                      <td style={{ ...num, color }}>{pct === null ? '—' : `${pct.toFixed(2)}%`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondaryStyle}>Close</button>
        </div>
      </div>
    </div>
  )
}
