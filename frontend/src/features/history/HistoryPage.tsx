import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  api,
  type DateConflict,
  type HistoryRangeInfo,
  type HistoryRow,
  type PasteHistoryReport,
  type RegionSnapshot,
} from '../../lib/api/client'
import { ApiError } from '../../lib/api/client'

const REGIONS = ['india', 'europe', 'us'] as const
type RegionKey = typeof REGIONS[number]

const REGION_LABELS: Record<RegionKey, string> = {
  india: 'India',
  europe: 'Europe',
  us: 'US',
}

// PRD-002 §7.2: orange = India, blue = Europe, US is a third family.
const REGION_COLOURS: Record<RegionKey, { invested: string; current: string }> = {
  india:  { invested: '#fdba74', current: '#f97316' },  // orange-300 / 500
  europe: { invested: '#93c5fd', current: '#2563eb' },  // blue-300 / 600
  us:     { invested: '#86efac', current: '#16a34a' },  // green-300 / 600
}

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
    india:  { invested: '', current: '' },
    europe: { invested: '', current: '' },
    us:     { invested: '', current: '' },
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
  const now = new Date()
  const [year, setYear] = useState(now.getUTCFullYear())
  const [month, setMonth] = useState(now.getUTCMonth())
  const [rangeInfo, setRangeInfo] = useState<HistoryRangeInfo | null>(null)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [currency, setCurrency] = useState('INR')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [editRow, setEditRow] = useState<HistoryRow | null>(null)
  // Sequential conflict queue: head opens as a modal.
  const [conflictQueue, setConflictQueue] = useState<DateConflict[]>([])

  // Load year range once.
  useEffect(() => {
    void api.historyRange().then(setRangeInfo).catch(() => setRangeInfo(null))
  }, [])

  const reload = async () => {
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
  }

  useEffect(() => { void reload() }, [year, month])

  const years = useMemo(() => {
    if (!rangeInfo) return [now.getUTCFullYear()]
    const out: number[] = []
    for (let y = rangeInfo.earliest_year; y <= rangeInfo.latest_year; y++) out.push(y)
    return out
  }, [rangeInfo, now])

  // Three charts, one per currency. Compute series per region.
  const chartsByRegion = useMemo(() => ({
    india:  perCurrencyChartData(rows, 'india'),
    europe: perCurrencyChartData(rows, 'europe'),
    us:     perCurrencyChartData(rows, 'us'),
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
        <span style={{ width: 80 }} />
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
            <HistoryTable rows={rows} currency={currency} onDelete={handleDelete} onEdit={r => setEditRow(r)} />
            <div style={{ height: 16 }} />
            {REGIONS.map(r => (
              <CurrencyChartPanel key={r} region={r} data={chartsByRegion[r]} />
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

export const CURRENCY_BY_REGION: Record<RegionKey, 'INR' | 'EUR' | 'USD'> = {
  india:  'INR',
  europe: 'EUR',
  us:     'USD',
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

function CurrencyChartPanel({ region, data }: { region: RegionKey; data: any[] }) {
  const cur = CURRENCY_BY_REGION[region]
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
        {REGION_LABELS[region]} — invested vs current ({cur}) and daily P/L %
      </h2>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="amt" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} unit="%" />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="amt" dataKey="invested" name={`Invested (${cur})`} stroke={REGION_COLOURS[region].invested} strokeDasharray="4 2" dot={false} />
            <Line yAxisId="amt" dataKey="current"  name={`Current (${cur})`}  stroke={REGION_COLOURS[region].current}  dot={false} />
            <Line yAxisId="pct" dataKey="pnl_pct"  name="P/L %"               stroke="#a855f7" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// perCurrencyChartData produces oldest-first chart series for one region.
// pnl_pct on a per-region basis is (current - invested) / invested * 100.
export function perCurrencyChartData(rows: HistoryRow[], region: RegionKey) {
  const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return oldestFirst.map(r => {
    const rs = r.regions[region]
    const invested = rs?.invested ?? 0
    const current  = rs?.current  ?? 0
    const pnl_pct  = invested > 0 ? ((current - invested) / invested) * 100 : null
    return { date: r.date.slice(5), invested, current, pnl_pct }
  })
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
export function HistoryTable({ rows, currency: _currency, onDelete, onEdit }: {
  rows: HistoryRow[]
  currency: string
  onDelete: (date: string) => void
  onEdit?: (row: HistoryRow) => void
}) {
  const isAllManual = (regions: Record<string, RegionSnapshot>) =>
    Object.values(regions).every(r => r.source === 'manual')

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, borderRight: '2px solid var(--border)' }}>Date</th>
            {REGIONS.map((r, idx) => (
              <CurrencyHeaderGroup key={r} region={r} last={idx === REGIONS.length - 1} />
            ))}
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const sources = new Set(Object.values(r.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            return (
              <tr key={r.date} title={`Source: ${sourceLabel}`}>
                <td style={{ ...td, borderRight: '2px solid var(--border)', fontWeight: 600 }}>{r.date}</td>
                {REGIONS.map((region, idx) => (
                  <CurrencyRowCells
                    key={region}
                    rows={rows}
                    i={i}
                    region={region}
                    last={idx === REGIONS.length - 1}
                  />
                ))}
                <td style={{ ...td, display: 'flex', gap: 8 }}>
                  {onEdit && (
                    <button onClick={() => onEdit(r)} style={btnLinkBlueStyle}>Edit</button>
                  )}
                  {isAllManual(r.regions) && (
                    <button onClick={() => onDelete(r.date)} style={btnLinkStyle}>Delete</button>
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

function CurrencyHeaderGroup({ region: _region, last }: { region: RegionKey; last: boolean }) {
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  return (
    <>
      <th style={th}>Amount invested</th>
      <th style={th}>Actual value</th>
      <th style={th}>Daily volatlity</th>
      <th style={{ ...th, ...sep }}>P/L%</th>
    </>
  )
}

function CurrencyRowCells({ rows, i, region, last }: {
  rows: HistoryRow[]
  i: number
  region: RegionKey
  last: boolean
}) {
  const r = rows[i]
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const rs = r.regions[region]
  const invested = rs?.invested ?? 0
  const current  = rs?.current  ?? 0
  const vol      = regionDailyVolatility(rows, i, region)
  const pnl      = regionPnLPct(r, region)
  const wentUp   = regionInvestedWentUp(rows, i, region)
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  const investedStyle: React.CSSProperties = {
    ...td,
    background: wentUp ? 'rgba(34,197,94,0.18)' : undefined, // green-500/18%
    fontWeight: wentUp ? 600 : undefined,
  }
  const volColor = vol === null ? undefined : vol >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  const pnlColor = pnl === null ? undefined : pnl >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  return (
    <>
      <td style={investedStyle}>{fmtCurrency(invested, sym)}</td>
      <td style={td}>{fmtCurrency(current, sym)}</td>
      <td style={{ ...td, color: volColor }}>
        {vol === null ? '—' : vol.toFixed(2)}
      </td>
      <td style={{ ...td, ...sep, color: pnlColor }}>
        {pnl === null ? '—' : `${pnl.toFixed(2)}%`}
      </td>
    </>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
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
const btnLinkStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--red, #dc2626)',
  cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
}
const btnLinkBlueStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--blue, #2563eb)',
  cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13,
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

// Paste parser: TSV (tabs) or CSV. Expected columns:
// date, india_invested, india_current, europe_invested, europe_current, us_invested, us_current
// Header row is optional; if first cell parses as a date we assume no header.
export function parsePasteText(text: string): { date: string; regions: Record<string, { invested: number; current: number }> }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  // Detect delimiter from first line.
  const out: { date: string; regions: Record<string, { invested: number; current: number }> }[] = []
  for (const line of lines) {
    const cells = line.split(/\t|,/).map(c => c.trim())
    if (!isDate(cells[0])) continue // skip header
    const [date, ii, ic, ei, ec, ui, uc] = cells
    const regions: Record<string, { invested: number; current: number }> = {}
    const set = (key: string, inv: string, cur: string) => {
      const a = Number(inv), b = Number(cur)
      if (Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0)) {
        regions[key] = { invested: a, current: b }
      }
    }
    set('india',  ii, ic)
    set('europe', ei, ec)
    set('us',     ui, uc)
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
    india:  { invested: String(row.regions.india?.invested  ?? ''), current: String(row.regions.india?.current  ?? '') },
    europe: { invested: String(row.regions.europe?.invested ?? ''), current: String(row.regions.europe?.current ?? '') },
    us:     { invested: String(row.regions.us?.invested     ?? ''), current: String(row.regions.us?.current     ?? '') },
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
          Saving will override any cron-written value with the manual value below.
          Regions you leave at zero will be saved as zero.
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

  const submit = async () => {
    setBusy(true)
    try {
      const rows = parsePasteText(text)
      const r = await onSubmit({ month: monthLabel, rows })
      setReport(r)
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
          Columns (TSV or CSV): date, india_invested, india_current, europe_invested, europe_current, us_invested, us_current
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={10}
          style={{ width: '100%', fontFamily: 'monospace', padding: 8, boxSizing: 'border-box' }}/>
        {report && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <div>Applied: {report.applied.length}</div>
            <div>Conflicts: {report.conflicts.length}</div>
            <div>Rejected: {report.rejected.length}</div>
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
    india: false, europe: false, us: false,
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
