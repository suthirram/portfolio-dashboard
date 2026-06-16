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

export function monthRange(year: number, month0: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month0, 1))
  const to = new Date(Date.UTC(year, month0 + 1, 0))
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

  // Chart data: sort rows oldest-first so x-axis flows left-to-right.
  const chartData = useMemo(() => {
    const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    return oldestFirst.map(r => ({
      date: r.date.slice(5), // MM-DD
      india_invested:  r.regions.india?.invested  ?? 0,
      india_current:   r.regions.india?.current   ?? 0,
      europe_invested: r.regions.europe?.invested ?? 0,
      europe_current:  r.regions.europe?.current  ?? 0,
      us_invested:     r.regions.us?.invested     ?? 0,
      us_current:      r.regions.us?.current      ?? 0,
      pnl_pct:         r.totals.pnl_pct,
    }))
  }, [rows])

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
      setConflictQueue(report.conflicts)
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
            <ChartPanel data={chartData} />
            <HistoryTable rows={rows} currency={currency} onDelete={handleDelete} />
          </>
        )}
      </main>

      {addOpen && <AddRowModal onSubmit={handleAddSaved} onCancel={() => setAddOpen(false)} />}
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

// ---- Chart ----

function ChartPanel({ data }: { data: any[] }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, marginBottom: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
        Invested vs current by region — and daily P/L %
      </h2>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="amt" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} unit="%" />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="amt" dataKey="india_invested"  name="India invested"  stroke={REGION_COLOURS.india.invested}  strokeDasharray="4 2" dot={false} />
            <Line yAxisId="amt" dataKey="india_current"   name="India current"   stroke={REGION_COLOURS.india.current}   dot={false} />
            <Line yAxisId="amt" dataKey="europe_invested" name="Europe invested" stroke={REGION_COLOURS.europe.invested} strokeDasharray="4 2" dot={false} />
            <Line yAxisId="amt" dataKey="europe_current"  name="Europe current"  stroke={REGION_COLOURS.europe.current}  dot={false} />
            <Line yAxisId="amt" dataKey="us_invested"     name="US invested"     stroke={REGION_COLOURS.us.invested}     strokeDasharray="4 2" dot={false} />
            <Line yAxisId="amt" dataKey="us_current"      name="US current"      stroke={REGION_COLOURS.us.current}      dot={false} />
            <Line yAxisId="pct" dataKey="pnl_pct"         name="Total P/L %"     stroke="#a855f7" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---- Table ----

function fmt(n: number) {
  return n === 0 ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function HistoryTable({ rows, currency, onDelete }: {
  rows: HistoryRow[]
  currency: string
  onDelete: (date: string) => void
}) {
  const isAllManual = (regions: Record<string, RegionSnapshot>) =>
    Object.values(regions).every(r => r.source === 'manual')

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={th}>Date</th>
            <th style={th}>India inv.</th>
            <th style={th}>India cur.</th>
            <th style={th}>Europe inv.</th>
            <th style={th}>Europe cur.</th>
            <th style={th}>US inv.</th>
            <th style={th}>US cur.</th>
            <th style={th}>Total inv.</th>
            <th style={th}>Total cur.</th>
            <th style={th}>P/L %</th>
            <th style={th}>Source</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const sources = new Set(Object.values(r.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            return (
              <tr key={r.date}>
                <td style={td}>{r.date}</td>
                <td style={td}>{fmt(r.regions.india?.invested ?? 0)}</td>
                <td style={td}>{fmt(r.regions.india?.current  ?? 0)}</td>
                <td style={td}>{fmt(r.regions.europe?.invested ?? 0)}</td>
                <td style={td}>{fmt(r.regions.europe?.current  ?? 0)}</td>
                <td style={td}>{fmt(r.regions.us?.invested ?? 0)}</td>
                <td style={td}>{fmt(r.regions.us?.current  ?? 0)}</td>
                <td style={td}>{fmt(r.totals.invested_total)} {currency}</td>
                <td style={td}>{fmt(r.totals.current_total)} {currency}</td>
                <td style={td}>{r.totals.pnl_pct === null ? '—' : r.totals.pnl_pct.toFixed(2)}</td>
                <td style={td}>{sourceLabel}</td>
                <td style={td}>
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
