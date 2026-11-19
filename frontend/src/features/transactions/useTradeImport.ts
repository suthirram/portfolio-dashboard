import { useMemo, useState } from 'react'
import { api, ApiError } from '../../lib/api/client'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { Holding, TradeImportPreview, TradeImportResult, TradeImportRow } from '../../types'
import type { InvalidLine } from '../imports/ImportTables'
import type { Answers } from '../imports/NameConfirmDialog'
import { parseTradeCsv } from './tradeCsv'

export type TradeStep = 'pick' | 'names' | 'preview' | 'result'

const MAX_BYTES = 1024 * 1024
const EMPTY: TradeImportPreview = { counts: { ready: 0, replace: 0, covered: 0, invalid: 0, total: 0 }, names: [], rows: [], warnings: [] }

// Returns names that still need a decision from the user.
export const pendingNames = (preview: TradeImportPreview, answers: Answers, created: string[]) =>
  preview.names.filter(name =>
    (name.status === 'needs_confirmation' || name.status === 'ambiguous') &&
    !(name.sheet_name in answers) && !created.includes(name.sheet_name),
  )

export interface TradeImportController {
  step: TradeStep
  fileName: string
  rows: TradeImportRow[]
  localErrors: InvalidLine[]
  skipped: InvalidLine[]
  answers: Answers
  created: string[]
  preview: TradeImportPreview | null
  result: TradeImportResult | null
  busy: boolean
  error: string
  inrHoldings: Holding[]
  counts: (Omit<TradeImportPreview['counts'], 'invalid'> & { invalid: number }) | null
  invalidLines: InvalidLine[]
  setStep: (step: TradeStep) => void
  setAnswers: (answers: Answers) => void
  setCreated: (created: string[]) => void
  pick: (file: File) => Promise<void>
  runPreview: (sheetRows: TradeImportRow[], mappings: Answers, createList: string[]) => Promise<void>
  confirm: () => Promise<void>
}

// Shared import controller used by both Classic and UI_2.0 dialog shells.
// Keeps validation, state machine, and error-handling in one place so fixes
// cannot diverge between account modes (DD-015 §1.4 / CLAUDE.md §Code reuse).
export function useTradeImport(holdings: Holding[], userId?: string): TradeImportController {
  const [step, setStep] = useState<TradeStep>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<TradeImportRow[]>([])
  const [localErrors, setLocalErrors] = useState<InvalidLine[]>([])
  const [skipped, setSkipped] = useState<InvalidLine[]>([])
  const [answers, setAnswers] = useState<Answers>({})
  const [created, setCreated] = useState<string[]>([])
  const [preview, setPreview] = useState<TradeImportPreview | null>(null)
  const [result, setResult] = useState<TradeImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const inrHoldings = useMemo(
    () => holdings.filter(holding => canonicalCurrency(holding.currency) === 'INR'),
    [holdings],
  )

  const runPreview = async (sheetRows: TradeImportRow[], mappings: Answers, createList: string[]) => {
    setBusy(true)
    setError('')
    try {
      const evaluated = await api.previewTradeImport({ rows: sheetRows, mappings, create: createList }, userId)
      setPreview(evaluated)
      setStep(pendingNames(evaluated, mappings, createList).length > 0 ? 'names' : 'preview')
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

  const counts = preview
    ? { ...preview.counts, invalid: preview.counts.invalid + localErrors.length }
    : null

  const invalidLines = [
    ...localErrors,
    ...(preview?.rows
      .filter(row => row.status === 'invalid')
      .map(row => ({ line: row.line, reason: row.reason ?? '' })) ?? []),
  ].sort((first, second) => first.line - second.line)

  return {
    step, fileName, rows, localErrors, skipped, answers, created,
    preview, result, busy, error,
    inrHoldings, counts, invalidLines,
    setStep, setAnswers, setCreated,
    pick, runPreview, confirm,
  }
}
