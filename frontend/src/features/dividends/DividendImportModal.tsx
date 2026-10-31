import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol, formatMoney } from '../../lib/currency'
import { formatDate, todayIST } from '../../lib/formDates'
import type { DividendCurrency, DividendImportPreview, DividendImportResult, DividendImportRow, Holding } from '../../types'
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
import NameConfirmDialog, { type Answers } from './NameConfirmDialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const open = (preview: DividendImportPreview, answers: Answers) =>
  preview.names.filter(name => (name.status === 'needs_confirmation' || name.status === 'ambiguous') && !(name.sheet_name in answers))

export default function DividendImportModal({ currency, holdings, userId, onClose, onImported }: {
  currency: DividendCurrency; holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<DividendImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<DividendCsvError[]>([])
  const [total, setTotal] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [preview, setPreview] = useState<DividendImportPreview | null>(null)
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inTab = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === currency), [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`

  const runPreview = async (sheetRows: DividendImportRow[], mappings: Answers) => {
    setBusy(true)
    setErr('')
    try {
      const evaluated = await api.previewDividendImport({ currency, rows: sheetRows, mappings }, userId)
      setPreview(evaluated)
      setStep(open(evaluated, mappings).length > 0 ? 'names' : 'preview')
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) { setErr('The file is larger than 1 MB — split it.'); return }
    setFileName(file.name)
    const parsed = parseDividendCsv(await file.text(), todayIST())
    setRows(parsed.rows)
    setLocalErrors(parsed.errors)
    setTotal(parsed.total)
    setAnswers({})
    if (parsed.rows.length === 0) {
      setPreview({ counts: { ready: 0, duplicate: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] })
      setStep('preview')
      return
    }
    await runPreview(parsed.rows, {})
  }

  const counts = preview && {
    ready: preview.counts.ready,
    duplicate: preview.counts.duplicate,
    invalid: preview.counts.invalid + localErrors.length,
    total: Math.max(total, preview.counts.total + localErrors.length),
  }
  const invalidLines = [
    ...localErrors.map(localError => ({ line: localError.line, reason: localError.reason })),
    ...(preview?.rows.filter(row => row.status === 'invalid').map(row => ({ line: row.line, reason: row.reason ?? '' })) ?? []),
  ].sort((first, second) => first.line - second.line)

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      setResult(await api.importDividends({ currency, rows, mappings: answers }, userId))
      setStep('result')
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.body) {
        setPreview(error.body as DividendImportPreview)
        setErr('The data changed since the preview — review it again.')
      } else {
        setErr(error instanceof Error ? error.message : String(error))
      }
    } finally {
      setBusy(false)
    }
  }

  if (step === 'names' && preview) {
    return (
      <NameConfirmDialog names={open(preview, answers)} holdings={inTab} currencyLabel={label} onBack={() => setStep('pick')}
        onConfirm={confirmed => { const next = { ...answers, ...confirmed }; setAnswers(next); void runPreview(rows, next) }} />
    )
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import dividends">
      <div style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{step === 'result' ? 'Import complete' : step === 'preview' ? 'Preview import' : 'Import dividends'}</h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Importing into <strong>{label}</strong> · dates read as <strong>DD/MM/YYYY</strong> (1/2/2020 = 1 Feb 2020){fileName && ` · ${fileName}`}
        </p>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}

        {step === 'pick' && (
          <>
            <label htmlFor="dividend-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="dividend-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => void pick(e.target.files?.[0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Expected header (any order, any case; CUMULATIVE optional): <code>Date,Share Name,Dividend,CUMULATIVE</code>. Nothing is saved until you confirm.</p>
            {busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {step === 'preview' && counts && preview && (
          <>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 320 }}>
              <thead><tr><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                <tr><td style={td}>Ready to import</td><td style={{ ...td, textAlign: 'right' }}>{counts.ready}</td></tr>
                <tr><td style={td}>Already exists</td><td style={{ ...td, textAlign: 'right' }}>{counts.duplicate}</td></tr>
                <tr><td style={td}>Invalid</td><td style={{ ...td, textAlign: 'right' }}>{counts.invalid}</td></tr>
                <tr><td style={{ ...td, fontWeight: 700 }}>Total</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{counts.total}</td></tr>
              </tbody>
            </table>
            {counts.invalid > 0 && (
              <>
                <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}><strong>{counts.invalid} rows need fixing</strong> before you can import. Nothing has been saved.</p>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th style={th}>Line</th><th style={th}>Problem</th></tr></thead>
                  <tbody>{invalidLines.map(invalidLine => <tr key={invalidLine.line}><td style={td}>{invalidLine.line}</td><td style={td}>{invalidLine.reason}</td></tr>)}</tbody>
                </table>
              </>
            )}
            {preview.warnings.map(warning => (
              <p key={warning.line} style={{ color: 'var(--yellow)', fontSize: 12, margin: 0 }}>⚠ Line {warning.line}: {warning.message}. Import is still allowed.</p>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {Object.keys(answers).length > 0 && <button className="btn" onClick={() => { setAnswers({}); void runPreview(rows, {}) }}>Change names</button>}
              <button className="btn" onClick={() => setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={counts.invalid > 0 || busy} onClick={confirm}>Confirm import</button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <p style={{ color: 'var(--green)', margin: 0 }}><strong>{result.imported} imported</strong> into {label}.</p>
            {result.duplicates.length > 0 && (
              <>
                <p role="status" style={{ color: 'var(--yellow)', margin: 0 }}>⚠ <strong>{result.duplicates.length} duplicates are discarded</strong> — already saved.</p>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th style={th}>Line</th><th style={th}>Date</th><th style={th}>Share</th><th style={{ ...th, textAlign: 'right' }}>Dividend</th></tr></thead>
                  <tbody>{result.duplicates.map(duplicate => (
                    <tr key={duplicate.line}><td style={td}>{duplicate.line}</td><td style={td}>{formatDate(duplicate.date)}</td><td style={td}>{duplicate.share_name}</td><td style={{ ...td, textAlign: 'right' }}>{formatMoney(duplicate.amount, currency)}</td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => { onImported(); onClose() }}>Done</button>
            </div>
          </>
        )}

        {step !== 'result' && (
          <div>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
