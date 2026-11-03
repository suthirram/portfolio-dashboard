// The trades CSV import (PD-051): choose a broker export → confirm unknown
// symbols (map, create or leave) → preview → one atomic commit. Built from
// the dividend import's shared pieces (features/imports).
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
import { ImportCounts, InvalidLines, type InvalidLine } from '../imports/ImportTables'
import NameConfirmDialog, { type Answers } from '../imports/NameConfirmDialog'
import { parseTradeCsv } from './tradeCsv'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const EMPTY: TradeImportPreview = { counts: { ready: 0, replace: 0, covered: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] }
const open = (preview: TradeImportPreview, answers: Answers, created: string[]) =>
  preview.names.filter(name => (name.status === 'needs_confirmation' || name.status === 'ambiguous')
    && !(name.sheet_name in answers) && !created.includes(name.sheet_name))

export default function TradeImportModal({ holdings, userId, onClose, onImported }: {
  holdings: Holding[]; userId?: string; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<TradeImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<InvalidLine[]>([])
  const [skipped, setSkipped] = useState<InvalidLine[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [created, setCreated] = useState<string[]>([])
  const [preview, setPreview] = useState<TradeImportPreview | null>(null)
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Trades import into INR holdings only (NSE / BSE).
  const inrHoldings = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === 'INR'), [holdings])

  const runPreview = async (sheetRows: TradeImportRow[], mappings: Answers, create: string[]) => {
    setBusy(true)
    setErr('')
    try {
      const evaluated = await api.previewTradeImport({ rows: sheetRows, mappings, create }, userId)
      setPreview(evaluated)
      setStep(open(evaluated, mappings, create).length > 0 ? 'names' : 'preview')
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
    const parsed = parseTradeCsv(await file.text(), todayIST())
    setRows(parsed.rows)
    setLocalErrors(parsed.errors)
    setSkipped(parsed.skipped)
    setAnswers({})
    setCreated([])
    if (parsed.rows.length === 0) {
      setPreview(EMPTY)
      setStep('preview')
      return
    }
    await runPreview(parsed.rows, {}, [])
  }

  const counts = preview && { ...preview.counts, invalid: preview.counts.invalid + localErrors.length }
  const invalidLines = [
    ...localErrors,
    ...(preview?.rows.filter(row => row.status === 'invalid').map(row => ({ line: row.line, reason: row.reason ?? '' })) ?? []),
  ].sort((first, second) => first.line - second.line)

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      setResult(await api.importTrades({ rows, mappings: answers, create: created }, userId))
      setStep('result')
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && error.body) {
        setPreview(error.body as TradeImportPreview)
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
      <NameConfirmDialog names={open(preview, answers, created)} holdings={inrHoldings} heading="Confirm symbols"
        intro="These symbols don't match a holding. Choose the holding each one means, or create a new one. Your answers are remembered for next time."
        createLabel={symbol => `Create a new holding ${symbol}`}
        onBack={() => setStep('pick')}
        onConfirm={(confirmed, newHoldings) => {
          const nextAnswers = { ...answers, ...confirmed }
          const nextCreated = [...created, ...newHoldings]
          setAnswers(nextAnswers)
          setCreated(nextCreated)
          void runPreview(rows, nextAnswers, nextCreated)
        }} />
    )
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import trades">
      <div style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{step === 'result' ? 'Import complete' : step === 'preview' ? 'Preview import' : 'Import trades'}</h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Buys and sells into <strong>₹ INR</strong> holdings · dates read as <strong>DD/MM/YYYY</strong> (1/11/2024 = 1 Nov 2024), a time like 03:30 PM is optional{fileName && ` · ${fileName}`}
        </p>
        {err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{err}</p>}

        {step === 'pick' && (
          <>
            <label htmlFor="trades-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="trades-csv" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" style={{ display: 'none' }} onChange={e => void pick(e.target.files?.[0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              A broker order history with the columns <code>Stock name, Symbol, ISIN, Type, Quantity, Value, Exchange, Execution date and time, Order status</code> (comma- or tab-separated). Nothing is saved until you confirm.
            </p>
            {busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {step === 'preview' && counts && preview && (
          <>
            <ImportCounts total={counts.total + localErrors.length}
              counts={[['Ready to import', counts.ready], ['Replaces an identical trade', counts.replace], ['Covered by the opening balance', counts.covered], ['Invalid', counts.invalid]]} />
            {counts.replace > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>A row with the same holding, day, type, quantity and value as a saved trade replaces it — nothing is duplicated.</p>}
            {counts.covered > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Rows on or before a holding&apos;s opening date are already in its opening balance and are not imported.</p>}
            {skipped.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{skipped.length} rows skipped: the order did not execute.</p>}
            <InvalidLines lines={invalidLines} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {(Object.keys(answers).length > 0 || created.length > 0) && (
                <button className="btn" onClick={() => { setAnswers({}); setCreated([]); void runPreview(rows, {}, []) }}>Change symbols</button>
              )}
              <button className="btn" onClick={() => setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={counts.invalid > 0 || counts.ready + counts.replace === 0 || busy} onClick={confirm}>Confirm import</button>
            </div>
          </>
        )}

        {step === 'result' && result && (
          <>
            <p role="status" style={{ color: 'var(--green)', margin: 0 }}>
              <strong>{result.imported} imported</strong> · {result.replaced} replaced · {result.covered} covered by an opening balance
              {result.created_holdings > 0 && ` · ${result.created_holdings} new holdings`}
            </p>
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
