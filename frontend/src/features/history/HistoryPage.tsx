// The /history page: month picker, the HistoryTable, per-currency chart
// panels (plus gold), and the add/edit/paste/conflict/holdings modals.
// The table lives in HistoryTable.tsx, the modals in HistoryModals.tsx, and
// the shared constants/helpers/styles in historyShared.ts; everything that
// was historically exported from this module is re-exported below so
// existing imports (tests, HistoryChartPage) keep working unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  api,
  type DateConflict,
  type HistoryRow,
  type PasteHistoryReport,
} from '../../lib/api/client'
import { ApiError } from '../../lib/api/client'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { useAuthOptional } from '../auth/AuthContext'
import { ArrowLeftIcon } from '../../components/Icon'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, GOLD_PALETTE, MIN_YEAR, MONTHS,
  PNL_LINE_COLOUR, REGIONS, REGION_COLOURS, REGION_LABELS, VOL_LINE_COLOUR,
  chartTooltipProps, fmtAxisAmount,
  fmtCurrency, goldChartData, monthRange, niceDomain, perCurrencyChartData,
  regionHasData, selectStyle, symmetricDomain,
  type RegionKey,
} from './historyShared'
import { HistoryTable } from './HistoryTable'
import {
  AddRowModal, ConflictDialog, EditRowModal, HoldingsModal, PasteModal,
} from './HistoryModals'

// Everything the module historically exported, preserved for existing
// importers (HistoryPage.test.tsx, HistoryChartPage.tsx, …).
export {
  REGIONS, REGION_LABELS, REGION_COLOURS, CURRENCY_BY_REGION, CURRENCY_SYMBOL,
  monthRange, fmtCurrency, fmtAxisAmount, chartTooltipProps,
  goldChartData, perCurrencyChartData, niceDomain, symmetricDomain, regionHasData,
  parseFormAmount, groupIndian, sanitizeAmount, formToBody, changedRegions,
  regionDailyVolatility, regionPnLPct, regionInvestedWentUp,
  regionCurrentDirection, goldCurrentDirection, holdingRegion,
  parseAmount, normaliseDate, parsePasteText,
} from './historyShared'
export type { RegionKey, LinePalette } from './historyShared'
export { HistoryTable } from './HistoryTable'
export {
  AddRowModal, EditRowModal, PasteModal, ConflictDialog, HoldingsModal,
} from './HistoryModals'

const CHARTS_ON_TOP_KEY = 'pd_history_charts_top'

export default function HistoryPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
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
  // Layout preference: charts above the table. Persisted per browser.
  const [chartsOnTop, setChartsOnTop] = useState(() => {
    try { return window.localStorage?.getItem(CHARTS_ON_TOP_KEY) === '1' } catch { return false }
  })
  const toggleChartsOnTop = () => {
    setChartsOnTop(v => {
      const next = !v
      try { window.localStorage?.setItem(CHARTS_ON_TOP_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

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
    <div className="page-art page-art-history" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav" style={{
        padding: '0 28px',
        height: 'var(--nav-height, 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/" className="btn-icon" aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Historical data</h1>
        </div>
        <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ width: "100%", maxWidth: "1800px", margin: '0 auto', padding: '24px 28px' }}>
        <section style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
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
          <button onClick={toggleChartsOnTop} aria-pressed={chartsOnTop} className="btn"
            title={chartsOnTop ? 'Show the table first' : 'Show the charts first'}
            style={chartsOnTop ? { color: 'var(--blue)', borderColor: 'var(--blue)', background: 'var(--blue-dim)' } : undefined}>
            {chartsOnTop ? '↓ Charts below' : '↑ Charts on top'}
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-primary">+ Add row</button>
          <button onClick={() => setPasteOpen(true)} className="btn">Paste month</button>
        </section>

        {error && <div className="alert-danger">Error: {error}</div>}

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

        {rows.length > 0 && (() => {
          const table = (
            <HistoryTable rows={rows} currency={currency} theme={theme}
              onDelete={handleDelete} onEdit={r => setEditRow(r)}
              onSelectRegion={(row, prev, region) => setHoldingsView({ row, prev, region })}
              canForceDelete={canForceDelete} />
          )
          const charts = (
            <>
              {REGIONS.filter(r => regionHasData(chartsByRegion[r])).map(r => (
                <CurrencyChartPanel key={r} region={r} data={chartsByRegion[r]} theme={theme} />
              ))}
              {hasGoldChart && <GoldChartPanel data={goldChart} theme={theme} />}
            </>
          )
          return chartsOnTop
            ? <>{charts}<div style={{ height: 16 }} />{table}</>
            : <>{table}<div style={{ height: 16 }} />{charts}</>
        })()}
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

// ---- Chart panels ----

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
  // Remount the charts whenever the plotted range changes (month switch) so
  // the left-to-right line-draw animation re-runs instead of morphing the
  // previous month's line into the new one.
  const chartKey = data.length ? `${data[0].date}:${data.length}` : 'empty'
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
            <ComposedChart key={chartKey} data={data}>
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
            <ComposedChart key={chartKey} data={data}>
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
            <ComposedChart key={chartKey} data={data}>
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

// GoldChartPanel: the same triptych fed by the per-row gold overlay (§8).
function GoldChartPanel({ data, theme }: { data: any[]; theme: ThemeName }) {
  return (
    <div style={panelStyle}>
      <h2 style={panelTitle}>Gold (₹)</h2>
      <ChartTriptych data={data} sym="₹" palette={GOLD_PALETTE[theme]} theme={theme} />
    </div>
  )
}
