// The History page's modals: manual add, edit-override, paste-month,
// conflict resolution, and the per-currency holdings breakdown. Split out
// of HistoryPage.tsx; HistoryPage re-exports them so imports keep working.
import { useState } from 'react'
import type {
  DateConflict,
  HistoryHolding,
  HistoryRow,
  PasteHistoryReport,
} from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, REGION_LABELS,
  changedRegions, emptyForm, fmt,
  fmtCurrency, formError, formToBody, groupedInitial, holdingRegion,
  modalBackdrop, modalCard, parsePasteText, regroupHandler, td, th,
  type RegionFormState, type RegionKey,
} from './historyShared'

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
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
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
          <button onClick={onCancel} disabled={busy} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
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
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
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
          <button onClick={onCancel} disabled={busy} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button>
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
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
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
          <button onClick={onCancel} disabled={busy} className="btn">Close</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? 'Processing…' : 'Submit'}</button>
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
    <div className="modal-overlay" style={modalBackdrop}>
      <div className="modal-card" style={modalCard}>
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
          <button onClick={onSkip} className="btn">Skip</button>
          <button onClick={submit} className="btn-primary">Confirm</button>
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
  const keyFor = (h: HistoryHolding) => `${h.symbol} ${h.script}`
  // Only real (positive-quantity) holdings in this currency.
  const holdings = (row.holdings ?? []).filter(h => inRegion(h) && h.quantity > 0)
  const prevByKey = new Map(
    (prev?.holdings ?? []).filter(inRegion).map(h => [keyFor(h), h]),
  )
  const priceFmt = (n: number) => fmtCurrency(n, sym)

  return (
    <div className="modal-overlay" style={modalBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" style={modalCard} role="dialog" aria-modal="true" aria-label="Holdings">
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
          <button onClick={onClose} className="btn">Close</button>
        </div>
      </div>
    </div>
  )
}
