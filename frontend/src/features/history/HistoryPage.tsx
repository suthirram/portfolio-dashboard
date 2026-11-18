// The /history page: month picker, the HistoryTable, per-currency chart
// panels (plus gold), and the add/edit/paste/conflict/holdings modals.
// The table lives in HistoryTable.tsx, the modals in HistoryModals.tsx, and
// the shared constants/helpers/styles in historyShared.ts; everything that
// was historically exported from this module is re-exported below so
// existing imports (tests, HistoryChartPage) keep working unchanged.
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useTheme, type ThemeName } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { useAuthOptional } from '../auth/AuthContext'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, GOLD_PALETTE, MIN_YEAR, MONTHS,
  PNL_LINE_COLOUR, REGIONS, REGION_COLOURS, REGION_LABELS, VOL_LINE_COLOUR,
  chartTooltipProps, fmtAxisAmount, fmtCurrency,
  niceDomain, regionHasData, symmetricDomain, type RegionKey,
} from './historyShared'
import { HistoryTable } from './HistoryTable'
import { MonthNavigator } from './MonthNavigator'
import { PeriodPerformanceCard } from './PeriodPerformanceCard'
import { useHistoryMonth } from './useHistoryMonth'
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
  regionCurrentDirection, goldCurrentDirection, holdingRegion, buildLiveRow,
  buildLiveGoldOverlay, latestGoldOverlay, tradingDateIST,
  msUntilNextLiveBoundary, isLiveWindowOpen, yearMonth0, bucketCurrency,
  pnlPct, pctChange,
  parseAmount, normaliseDate, parsePasteText,
} from './historyShared'
export type { RegionKey, LinePalette } from './historyShared'
export { HistoryTable } from './HistoryTable'
export {
  AddRowModal, EditRowModal, PasteModal, ConflictDialog, HoldingsModal,
} from './HistoryModals'

export default function HistoryPage() {
  const auth = useAuthOptional()
  const { theme, set: setTheme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const canForceDelete = auth?.user?.role === 'superadmin'
  const history = useHistoryMonth()
  const {
    year, setYear, month, setMonth, today, selectedMonthStart,
    rowsMonthStart, displayRows, currency, loading, error,
    chartsByRegion, goldChart, hasGoldChart,
    chartsOnTop, toggleChartsOnTop,
    addOpen, setAddOpen, pasteOpen, setPasteOpen, editRow, setEditRow,
    holdingsView, setHoldingsView, headConflict,
    handleAddSaved, handlePasteSubmit, handleConflictResolve, handleConflictSkip,
    handleEditSaved, handleDelete,
  } = history

  return (
    <div className="page-art page-art-history" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/" className="btn-icon" aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Historical data</h1>
        </div>
        <ThemePicker variant="inline" theme={theme} premium={auth?.user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ width: '100%', maxWidth: '1800px', margin: '0 auto' }}>
        <section className="page-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          {/* From January of MIN_YEAR to the current trading month. */}
          <MonthNavigator value={{ year, month0: month }} min={{ year: MIN_YEAR, month0: 0 }} max={today}
            onChange={next => { setYear(next.year); setMonth(next.month0) }} />

          <span style={{ flex: 1 }} />
          {/* Active look comes from the shared .btn[aria-pressed="true"] rule. */}
          <button onClick={toggleChartsOnTop} aria-pressed={chartsOnTop} className="btn"
            title={chartsOnTop ? 'Show the table first' : 'Show the charts first'}>
            {chartsOnTop ? '↓ Charts below' : '↑ Charts on top'}
          </button>
          <button onClick={() => setAddOpen(true)} className="btn-primary">+ Add row</button>
          <button onClick={() => setPasteOpen(true)} className="btn">Paste month</button>
        </section>

        {error && <div className="alert-danger">Error: {error}</div>}

        {!loading && displayRows.length === 0 && (
          <div style={{
            padding: 32, textAlign: 'center', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 8,
          }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              No data for {MONTHS[month]} {year} yet. Your first snapshot will be taken at the next 00:00 UTC run, or you can add rows manually.
            </p>
          </div>
        )}

        {/* Only when the loaded rows are the selected month's: mid-reload, or
            after a failed one, `rows` still hold the previous month. */}
        {rowsMonthStart === selectedMonthStart && (
          <PeriodPerformanceCard rows={displayRows} monthStart={selectedMonthStart}
            monthLabel={`${MONTHS[month]} ${year}`} theme={theme} />
        )}

        {displayRows.length > 0 && (() => {
          const table = (
            <HistoryTable rows={displayRows} currency={currency} theme={theme}
              onDelete={handleDelete} onEdit={row => setEditRow(row)}
              onSelectRegion={(row, prev, region) => setHoldingsView({ row, prev, region })}
              canForceDelete={canForceDelete} />
          )
          const charts = (
            <>
              {REGIONS.filter(region => regionHasData(chartsByRegion[region])).map(region => (
                <CurrencyChartPanel key={region} region={region} data={chartsByRegion[region]} theme={theme} />
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
  const amountDomain = useMemo(() => niceDomain(data.flatMap(point => [point.invested, point.current])), [data])
  const pnlDomain = useMemo(() => niceDomain(data.map(point => point.pnl_pct)), [data])
  // Daily volatility swings both ways around 0, so centre the axis on zero.
  const volDomain = useMemo(() => symmetricDomain(data.map(point => point.daily_vol)), [data])
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
              <Tooltip {...chartTooltipProps} formatter={(value) => fmtCurrency(Number(value), sym)} />
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
              <Tooltip {...chartTooltipProps} formatter={(value) => `${Number(value).toFixed(2)}%`} />
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
              <Tooltip {...chartTooltipProps} formatter={(value) => `${Number(value).toFixed(2)}%`} />
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

// GoldChartPanel: the same triptych fed by the per-row gold overlay (§8),
// expandable to the full-history page like the currency panels.
function GoldChartPanel({ data, theme }: { data: any[]; theme: ThemeName }) {
  const navigate = useNavigate()
  return (
    <div style={panelStyle}>
      <h2 style={panelTitle}>Gold (₹)</h2>
      <ChartTriptych data={data} sym="₹" palette={GOLD_PALETTE[theme]} theme={theme}
        onExpand={() => navigate('/history/chart/gold')}
        expandLabel="Expand full Gold invested vs current history" />
    </div>
  )
}
