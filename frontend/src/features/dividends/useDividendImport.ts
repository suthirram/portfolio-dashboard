// The dividend CSV import, shared by the Classic modal and the UI_2.0 dialog
// (PD-059 slice 19), mirroring useTradeImport. Classic drives it with pick();
// UI_2.0 drives it with loadFile / loadExample / validate, because its import
// accepts a pasted sheet as well as a file (owner, 2026-11-18).
import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency, currencySymbol } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type {
  DividendCurrency, DividendImportPreview, DividendImportResult, DividendImportRow, Holding,
} from '../../types'
import { parseDividendCsv, type DividendCsvError } from './dividendCsv'
import type { Answers } from '../imports/NameConfirmDialog'

export type DividendStep = 'pick' | 'names' | 'preview' | 'result'

export const EXAMPLE_CSV = 'Date,Share Name,Dividend,CUMULATIVE'
const MAX_BYTES = 1024 * 1024

// openNames are the sheet names the server could not resolve and the user has
// not answered yet.
export const openNames = (preview: DividendImportPreview, answers: Answers) =>
  preview.names.filter(name =>
    (name.status === 'needs_confirmation' || name.status === 'ambiguous') && !(name.sheet_name in answers))

export function useDividendImport(currency: DividendCurrency, holdings: Holding[], userId?: string) {
  const [step, setStep] = useState<DividendStep>('pick')
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<DividendImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<DividendCsvError[]>([])
  const [total, setTotal] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [preview, setPreview] = useState<DividendImportPreview | null>(null)
  const [result, setResult] = useState<DividendImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const inTab = useMemo(
    () => holdings.filter(holding => canonicalCurrency(holding.currency) === currency),
    [holdings, currency])
  const label = `${currencySymbol(currency)} ${currency}`

  const runPreview = async (sheetRows: DividendImportRow[], mappings: Answers) => {
    setBusy(true)
    setErr('')
    try {
      const evaluated = await api.previewDividendImport({ currency, rows: sheetRows, mappings }, userId)
      setPreview(evaluated)
      setStep(openNames(evaluated, mappings).length > 0 ? 'names' : 'preview')
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  // validate parses the sheet and asks the server to evaluate it. source lets
  // a caller validate text it has only just read, before React commits it.
  const validate = async (source?: string) => {
    const parsed = parseDividendCsv(source ?? text, todayIST())
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

  const readFile = async (file: File): Promise<string | null> => {
    if (file.size > MAX_BYTES) { setErr('The file is larger than 1 MB — split it.'); return null }
    setFileName(file.name)
    const content = await file.text()
    setText(content)
    return content
  }

  // loadFile fills the buffer and stops: the UI_2.0 dialog validates on its
  // own button, so the user can edit a pasted sheet before sending it.
  const loadFile = async (file: File | undefined) => {
    if (file) await readFile(file)
  }

  // pick is the Classic flow: choose a file and validate it at once.
  const pick = async (file: File | undefined) => {
    if (!file) return
    const content = await readFile(file)
    if (content !== null) await validate(content)
  }

  const loadExample = () => {
    setText(EXAMPLE_CSV)
    setFileName('')
    setErr('')
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

  // confirmNames records the user's answers and re-asks the server, so the
  // preview the user confirms is the one the mappings produced.
  const confirmNames = (confirmed: Answers) => {
    const next = { ...answers, ...confirmed }
    setAnswers(next)
    void runPreview(rows, next)
  }

  const changeNames = () => {
    setAnswers({})
    void runPreview(rows, {})
  }

  return {
    step, setStep, fileName, text, setText, rows, answers, preview, result, busy, err,
    inTab, label, counts, invalidLines,
    pick, loadFile, loadExample, validate, runPreview, confirm, confirmNames, changeNames,
  }
}
