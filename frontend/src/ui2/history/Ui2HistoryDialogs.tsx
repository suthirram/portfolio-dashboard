// UI_2.0 History dialogs (PD-059 slice 14), laid out from the handoff's
// snapshotForm / pasteSnapshots / snapshotDrill / Full-history charts. Every
// rule is the classic one: the form helpers (formError, formToBody,
// changedRegions), the paste and conflict hooks, the positive-holdings
// filter, and the page's handlers from useHistoryMonth.
import { useEffect, useState } from 'react'
import { api, type DateConflict, type HistoryRow } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDayMonthName, todayIST } from '../../lib/formDates'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, REGIONS, changedRegions, emptyForm, fmtCurrency, formError, formToBody,
  groupedInitial, positiveRegionHoldings, regroupHandler,
  type RegionFormState, type RegionKey,
} from '../../features/history/historyShared'
import {
  useConflictPicks, usePasteSubmit, type ConflictResolve, type PasteSubmit,
} from '../../features/history/HistoryModals'
import { HISTORY_START } from '../../features/history/HistoryChartPage'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { ASSET_LABELS, visibleAssets, type HistoryAsset } from './historyCells'
import { Ui2AssetCharts } from './Ui2AssetCharts'

type Amounts = Record<string, { invested: number; current: number }>

function formFromRow(row?: HistoryRow): RegionFormState {
  if (!row) return emptyForm()
  const form = emptyForm()
  for (const region of REGIONS) {
    form[region] = {
      invested: groupedInitial(row.regions[region]?.invested),
      current: groupedInitial(row.regions[region]?.current),
    }
  }
  return form
}

// Ui2RecordDialog adds or edits one asset group of one day (owner: the
// handoff's single-group form, INR or EUR; gold comes from the Gold ledger).
// Edit pre-fills the chosen group from the row and sends only a change.
export function Ui2RecordDialog({ row, onAdd, onEdit, onDelete, onClose }: {
  // Absent = add a new record.
  row?: HistoryRow
  onAdd: (input: { date: string; regions: Amounts }) => Promise<void>
  onEdit: (date: string, regions: Amounts) => Promise<void>
  // Present when the delete rule allows it (all-manual row, or super admin).
  onDelete?: (date: string) => void
  onClose: () => void
}) {
  const [date, setDate] = useState(() => row?.date ?? todayIST())
  const [asset, setAsset] = useState<RegionKey>('INR')
  const [form, setForm] = useState<RegionFormState>(() => formFromRow(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const regroup = regroupHandler(setForm)
  const symbol = CURRENCY_SYMBOL[CURRENCY_BY_REGION[asset]]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Only the chosen group is validated and sent.
    const single: RegionFormState = { ...emptyForm(), [asset]: form[asset] }
    const invalid = formError(single)
    if (invalid) { setError(invalid); return }
    const body = formToBody(single)
    if (Object.keys(body).length === 0) { setError('Enter the invested amount and the snapshot value.'); return }
    setError('')
    if (row) {
      const changed = changedRegions(body, row.regions)
      if (Object.keys(changed).length === 0) { onClose(); return }
      setBusy(true)
      try { await onEdit(row.date, changed) } finally { setBusy(false) }
    } else {
      setBusy(true)
      try { await onAdd({ date, regions: body }) } finally { setBusy(false) }
    }
  }

  const setAmount = (key: 'invested' | 'current') => (value: string) =>
    setForm(previousForm => ({ ...previousForm, [asset]: { ...previousForm[asset], [key]: value } }))

  return (
    <Ui2Dialog title={row ? 'Edit daily record' : 'Add daily record'} onClose={onClose} busy={busy}>
      <form className="ui2-form" onSubmit={submit} noValidate>
        <label>
          Date
          <input type="date" value={date} readOnly={!!row} required max={todayIST()}
            onChange={e => setDate(e.target.value)} />
        </label>
        <label>
          Asset group
          <select value={asset} onChange={e => setAsset(e.target.value as RegionKey)}>
            {REGIONS.map(region => <option key={region} value={region}>{ASSET_LABELS[region]}</option>)}
          </select>
        </label>
        <div className="ui2-formrow">
          <label>
            Invested amount ({symbol})
            <DecimalInput value={form[asset].invested} onValueChange={setAmount('invested')}
              onBlur={regroup(asset, 'invested')} />
          </label>
          <label>
            Snapshot value ({symbol})
            <DecimalInput value={form[asset].current} onValueChange={setAmount('current')}
              onBlur={regroup(asset, 'current')} />
          </label>
        </div>
        {error && <p className="ui2-form-error" role="alert">{error}</p>}
        <p className="ui2-dialog-note">
          Saving records this asset group for the date as a manual value, which the daily snapshot does not
          overwrite. Gold is recorded from the Gold page.
        </p>
        <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy}>
          {busy ? 'Saving…' : row ? 'Update record' : 'Save record'}
        </button>
        {row && onDelete && (
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn ui2-btn-danger" disabled={busy}
              onClick={() => onDelete(row.date)}>Delete record</button>
          </div>
        )}
      </form>
    </Ui2Dialog>
  )
}

// Ui2PasteDialog keeps today's paste format (owner, C8) in the handoff's
// dialog; parsing, sending and the report come from usePasteSubmit.
export function Ui2PasteDialog({ month, onSubmit, onClose }: {
  month: string
  onSubmit: PasteSubmit
  onClose: () => void
}) {
  const { text, setText, busy, report, clientSkipped, submit } = usePasteSubmit(month, onSubmit)
  return (
    <Ui2Dialog title="Paste monthly records" onClose={onClose} busy={busy}>
      <form className="ui2-form" onSubmit={e => { e.preventDefault(); void submit() }}>
        <p className="ui2-subtitle">
          Paste tab-separated rows for {month} from Google Sheets or Excel. Dates already present ask before they change.
        </p>
        <label style={{ marginTop: 16 }}>
          Rows · Date, INR invested, INR current, EUR invested, EUR current
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={`${month}-01\t142288\t112335\t2610\t4144`} />
        </label>
        {report && (
          <div className="ui2-paste-report" role="status">
            <p className="u2-positive">Applied: {report.applied.length}</p>
            <p>Need confirmation: {report.conflicts.length}</p>
            <p className="u2-negative">Rejected: {report.rejected.length}</p>
            {clientSkipped > 0 && <p className="u2-muted">Skipped (unrecognised date or format): {clientSkipped}</p>}
            {report.rejected.length > 0 && (
              <ul>
                {report.rejected.map(rejected => <li key={rejected.date}>{rejected.date}: {rejected.reason}</li>)}
              </ul>
            )}
          </div>
        )}
        <p className="ui2-dialog-note">
          Dates accept YYYY-MM-DD or dd/mm/yyyy. Currency symbols and thousands separators are removed; extra
          trailing columns are ignored. Pasted values are manual records.
        </p>
        <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy}>
          {busy ? 'Importing…' : 'Import rows'}
        </button>
      </form>
    </Ui2Dialog>
  )
}

const pair = (amounts?: { invested: number; current: number }, symbol = '') =>
  amounts ? `${fmtCurrency(amounts.invested, symbol)} / ${fmtCurrency(amounts.current, symbol)}` : '—'

// Ui2ConflictDialog asks, per currency, whether a pasted or added value
// replaces the stored one (useConflictPicks).
export function Ui2ConflictDialog({ conflict, onResolve, onSkip }: {
  conflict: DateConflict
  onResolve: ConflictResolve
  onSkip: () => void
}) {
  const { picks, toggle, submit } = useConflictPicks(conflict, onResolve)
  return (
    <Ui2Dialog title={`Record exists · ${formatDayMonthName(conflict.date)}`} onClose={onSkip}>
      <p className="ui2-subtitle">
        Tick a currency to replace its stored value with the new one. Unticked currencies keep what is stored.
      </p>
      <table className="ui2-table ui2-dialog-table">
        <thead>
          <tr><th scope="col">Asset group</th><th scope="col">Stored</th><th scope="col">New</th><th scope="col">Replace</th></tr>
        </thead>
        <tbody>
          {REGIONS.map(region => {
            const existing = conflict.existing[region]
            const incoming = conflict.incoming[region]
            if (!existing && !incoming) return null
            const symbol = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
            return (
              <tr key={region}>
                <th scope="row">{ASSET_LABELS[region]}</th>
                <td>{pair(existing, symbol)}{existing ? <small> · {existing.source}</small> : null}</td>
                <td>{pair(incoming, symbol)}</td>
                <td>
                  <input type="checkbox" checked={!!picks[region]} disabled={!incoming} onChange={() => toggle(region)}
                    aria-label={`Replace ${ASSET_LABELS[region]}`} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="ui2-dialog-actions">
        <button type="button" className="ui2-btn" onClick={onSkip}>Skip</button>
        <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => void submit()}>Confirm</button>
      </div>
    </Ui2Dialog>
  )
}

const QUANTITY = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

// Ui2BreakdownDialog is the handoff's snapshot drill-down (owner: its columns
// only): the group's invested and value that day, then each held stock's
// quantity and value at that day's close.
export function Ui2BreakdownDialog({ row, region, onClose }: {
  row: HistoryRow
  region: RegionKey
  onClose: () => void
}) {
  const symbol = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const bucket = row.regions[region]
  const holdings = positiveRegionHoldings(row, region)
  return (
    <Ui2Dialog title={`${formatDayMonthName(row.date)} snapshot`} onClose={onClose}>
      <p className="ui2-subtitle">{ASSET_LABELS[region]} · {row.date}</p>
      <div className="ui2-detailgrid ui2-breakdown-totals">
        <div><span>Invested</span><strong>{bucket ? fmtCurrency(bucket.invested, symbol) : '—'}</strong></div>
        <div><span>Snapshot value</span><strong>{bucket ? fmtCurrency(bucket.current, symbol) : '—'}</strong></div>
      </div>
      {holdings.length === 0
        ? <p className="ui2-subtitle ui2-breakdown-empty">No {region} holdings recorded for this day.</p>
        : (
          <table className="ui2-table ui2-dialog-table">
            <thead><tr><th scope="col">Holding</th><th scope="col">Quantity</th><th scope="col">Value</th></tr></thead>
            <tbody>
              {holdings.map(holding => (
                <tr key={`${holding.symbol} ${holding.script}`}>
                  <th scope="row">{holding.script || holding.symbol}</th>
                  <td>{QUANTITY.format(holding.quantity)}</td>
                  <td>{fmtCurrency(holding.current ?? holding.quantity * holding.close_price, symbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Ui2Dialog>
  )
}

// Ui2FullHistoryDialog draws the mini charts over every stored day (owner:
// daily lines, no point markers). The value charts still open the zoomable
// full-history page.
export function Ui2FullHistoryDialog({ onExpand, onClose }: {
  onExpand: (asset: HistoryAsset) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api.listHistory(HISTORY_START, todayIST())
      .then(list => { if (!cancelled) setRows(list.rows) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])
  const hasGold = !!rows?.some(row => row.gold)
  return (
    <Ui2Dialog title="Full-history charts" onClose={onClose} wide>
      {error && <p className="ui2-form-error" role="alert">Unable to load the full history: {error}</p>}
      {!error && rows === null && <p className="ui2-subtitle" role="status">Loading the full history…</p>}
      {rows !== null && rows.length === 0 && <p className="ui2-subtitle">No history recorded yet.</p>}
      {rows !== null && rows.length > 0 && (
        <Ui2AssetCharts rows={rows} assets={visibleAssets('ALL', hasGold)} periodLabel="Full history"
          markers={false} onExpand={onExpand} />
      )}
    </Ui2Dialog>
  )
}
