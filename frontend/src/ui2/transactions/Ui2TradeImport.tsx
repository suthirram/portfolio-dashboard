import { useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import { ImportCounts, InvalidLines, type InvalidLine } from '../../features/imports/ImportTables'
import NameConfirmDialog, { type Answers } from '../../features/imports/NameConfirmDialog'
import { parseTradeCsv } from '../../features/transactions/tradeCsv'
import { Ui2Dialog } from '../shell/Ui2Dialog'

type Step = 'pick' | 'names' | 'preview' | 'result'
const MAX_BYTES = 1024 * 1024
const EMPTY: TradeImportPreview = { counts: { ready: 0, replace: 0, covered: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] }
const open = (preview: TradeImportPreview, answers: Answers, created: string[]) =>
  preview.names.filter(name => (name.status === 'needs_confirmation' || name.status === 'ambiguous')
    && !(name.sheet_name in answers) && !created.includes(name.sheet_name))

interface Props {
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

export function Ui2TradeImport({ holdings, userId, onClose, onImported }: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<TradeImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<InvalidLine[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [created, setCreated] = useState<string[]>([])
  const [preview, setPreview] = useState<TradeImportPreview | null>(null)
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const inrHoldings = useMemo(() => holdings.filter(holding => canonicalCurrency(holding.currency) === 'INR'), [holdings])

  const runPreview = async (sheetRows: TradeImportRow[], mappings: Answers, createList: string[]) => {
    setBusy(true)
    setError('')
    try {
      const evaluated = await api.previewTradeImport({ rows: sheetRows, mappings, create: createList }, userId)
      setPreview(evaluated)
      setStep(open(evaluated, mappings, createList).length > 0 ? 'names' : 'preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (file: File) => {
    if (file.size > MAX_BYTES) { setError('The file is larger than 1 MB — split it.'); return }
    setFileName(file.name)
    const parsed = parseTradeCsv(await file.text(), todayIST())
    setRows(parsed.rows)
    setLocalErrors(parsed.errors)
    setAnswers({})
    setCreated([])
    if (parsed.rows.length === 0) {
      setPreview(EMPTY)
      setStep('preview')
      return
    }
    await runPreview(parsed.rows, {}, [])
  }

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await api.importTrades({ rows, mappings: answers, create: created }, userId))
      setStep('result')
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.body) {
        setPreview(err.body as TradeImportPreview)
        setError('The data changed since the preview — review it again.')
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const counts = preview && { ...preview.counts, invalid: preview.counts.invalid + localErrors.length }
  const invalidLines = [
    ...localErrors,
    ...(preview?.rows.filter(row => row.status === 'invalid').map(row => ({ line: row.line, reason: row.reason ?? '' })) ?? []),
  ].sort((first, second) => first.line - second.line)

  if (step === 'names' && preview) {
    return (
      <NameConfirmDialog
        names={open(preview, answers, created)}
        holdings={inrHoldings}
        heading="Confirm symbols"
        intro="These symbols don't match a holding. Choose the holding each one means, or create a new one."
        createLabel={symbol => `Create a new holding ${symbol}`}
        onBack={() => setStep('pick')}
        onConfirm={(confirmed, newHoldings) => {
          const nextAnswers = { ...answers, ...confirmed }
          const nextCreated = [...created, ...newHoldings]
          setAnswers(nextAnswers)
          setCreated(nextCreated)
          void runPreview(rows, nextAnswers, nextCreated)
        }}
      />
    )
  }

  const title = step === 'preview' ? 'Preview import' : step === 'result' ? 'Import complete' : 'Import transactions'

  return (
    <Ui2Dialog title={title} onClose={onClose}>
      <p className="ui2-note">
        Buys and sells into <strong>₹ INR</strong> holdings · dates read as <strong>DD/MM/YYYY</strong>
        {fileName && ` · ${fileName}`}
      </p>
      {error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{error}</p>}

      {step === 'pick' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0' }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              aria-label="Choose CSV file"
              onChange={event => { const file = event.target.files?.[0]; if (file) void pick(file) }}
            />
          </div>
          {busy && <p className="ui2-note" aria-live="polite">Validating…</p>}
          <p className="ui2-note">
            Required columns: Symbol, Type, Quantity, Value, Exchange, Execution date and time.
          </p>
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'preview' && counts && preview && (
        <div>
          <ImportCounts
            total={counts.total + localErrors.length}
            counts={[
              ['Ready to import', counts.ready],
              ['Replaces an identical trade', counts.replace],
              ['Covered by the opening balance', counts.covered],
              ['Invalid', counts.invalid],
            ]}
          />
          <InvalidLines lines={invalidLines} />
          {preview.warnings.map((warning, index) => (
            <p key={index} className="ui2-note" role="alert">{warning.message}</p>
          ))}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={() => setStep('pick')}>Choose another file</button>
            <button
              type="button"
              className="ui2-btn ui2-btn-primary"
              disabled={busy || counts.invalid > 0 || counts.ready + counts.replace === 0}
              onClick={confirm}
            >
              {busy ? 'Importing…' : `Confirm import`}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div>
          <p role="status">
            <strong>{result.imported} imported</strong> · {result.replaced} replaced · {result.covered} covered by an opening balance
            {result.created_holdings > 0 && ` · ${result.created_holdings} new holdings`}
          </p>
          <p className="ui2-note">Your holdings have been updated.</p>
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => { onImported(); onClose() }}>Done</button>
          </div>
        </div>
      )}
    </Ui2Dialog>
  )
}
