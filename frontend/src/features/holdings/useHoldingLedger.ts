import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, Transaction, TransactionInput, TransactionType } from '../../types'
import { parseDecimalInput, parseSeededDecimal } from '../../lib/formNumbers'
import { normaliseDate, todayIST } from '../../lib/formDates'
import { currencySymbol } from '../../lib/currency'

// Ordered for the type picker; opening is managed via the holding's opening
// balance, but is shown read-only in the list when present.
export const NEW_TYPES: TransactionType[] = ['buy', 'sell', 'dividend', 'split', 'bonus', 'merger']

export const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening', buy: 'Buy', sell: 'Sell', dividend: 'Dividend',
  split: 'Split', bonus: 'Bonus', merger: 'Merger',
}

interface FormState {
  type: TransactionType
  date: string // yyyy-mm-dd
  quantity: string
  price: string // optional per-share price; convenience to compute amount = price × shares
  amount: string
  ratio: string
  realized: string // opening only: realised P&L seed
  notes: string
}

// Dates default to the IST calendar day: a UTC slice shows yesterday between
// 00:00 and 05:30 IST.
const emptyForm = (): FormState => ({ type: 'buy', date: todayIST(), quantity: '', price: '', amount: '', ratio: '', realized: '', notes: '' })

export interface LedgerProps {
  // Holding, not HoldingWithPrice: every field this editor reads
  // (currency, script, and the four derived position fields) is stored on
  // the holding itself, so the portfolio-wide view can open it without
  // fetching live prices first.
  holding: Holding
  onClose: () => void
  // Called after any ledger mutation so the parent refreshes holdings/prices
  // (the position is recomputed server-side).
  onChanged: () => void
  // Set in admin act-as: reads and writes go to the target's ledger (PD-048).
  userId?: string
}

export function useHoldingLedger({ holding, onChanged, userId }: Omit<LedgerProps, 'onClose'>) {
  const currencySign = currencySymbol(holding.currency)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!holding.id) return
    setLoading(true)
    try {
      const data = await api.listTransactions(holding.id, userId)
      setTransactions(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [holding.id, userId])

  useEffect(() => { void load() }, [load])

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
    setErr('')
  }

  // Optional per-share price is a convenience: when both shares and price are
  // present, auto-fill the total amount (= price × shares). Amount stays
  // editable so the user can fold in brokerage/charges afterwards (e.g. enter
  // NAV 41.1086 × 279.733 = 11499.43, then bump to the 11500 actually debited).
  const recompute = (next: Partial<FormState>) => setForm(previousForm => {
    const merged = { ...previousForm, ...next }
    const quantity = parseDecimalInput(merged.quantity, { singleSeparator: 'decimal' })
    const pricePerShare = parseDecimalInput(merged.price)
    if (merged.price.trim() !== '' && Number.isFinite(quantity) && Number.isFinite(pricePerShare) && quantity > 0) {
      merged.amount = (quantity * pricePerShare).toFixed(2)
    }
    return merged
  })

  const startEdit = (transaction: Transaction) => {
    setEditingId(transaction.id || null)
    setForm({
      type: (transaction.type as TransactionType) || 'buy',
      date: transaction.date ? transaction.date.slice(0, 10) : todayIST(),
      quantity: transaction.quantity != null ? String(transaction.quantity) : '',
      price: '',
      amount: transaction.amount != null ? String(transaction.amount) : '',
      ratio: transaction.ratio != null && transaction.ratio !== 0 ? String(transaction.ratio) : '',
      realized: transaction.realized_seed != null ? String(transaction.realized_seed) : '',
      notes: transaction.notes || '',
    })
  }

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<boolean> => {
    e.preventDefault()
    if (!holding.id) return false
    setErr('')

    const quantity = parseDecimalInput(form.quantity, { singleSeparator: 'decimal' })
    if (!Number.isFinite(quantity) || quantity < 0) { setErr('Enter a valid share quantity'); return false }
    // Untouched fields keep the stored number: re-parsing String(1.234) under
    // the default rule would save the grouped integer 1234.
    const editing = editingId ? transactions.find(transaction => transaction.id === editingId) : undefined
    const amount = parseSeededDecimal(form.amount, editing?.amount)
    if (!Number.isFinite(amount) || amount < 0) { setErr('Enter a valid amount'); return false }
    const ratio = parseDecimalInput(form.ratio, { singleSeparator: 'decimal' })
    if (!Number.isFinite(ratio) || ratio < 0) { setErr('Enter a valid ratio'); return false }
    const realizedSeed = parseSeededDecimal(form.realized, editing?.realized_seed, { allowNegative: true })
    if (!Number.isFinite(realizedSeed)) { setErr('Enter a valid realised P&L seed'); return false }

    const date = normaliseDate(form.date)
    if (!date) {
      setErr('Enter a valid date')
      return false
    }

    const payload: TransactionInput = {
      type: form.type,
      // Send a full RFC3339 timestamp; the backend parses date-time.
      date: date + 'T00:00:00.000Z',
      quantity,
      amount,
      notes: form.notes.trim() || undefined,
    }
    if (form.type === 'split' || form.type === 'bonus') {
      payload.ratio = ratio
    }
    if (form.type === 'opening') {
      payload.realized_seed = realizedSeed
    }

    setSaving(true)
    try {
      if (editingId) {
        await api.updateTransaction(editingId, payload, userId)
      } else {
        await api.createTransaction(holding.id, payload, userId)
      }
      resetForm()
      await load()
      onChanged()
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setErr('')
    setSaving(true)
    try {
      await api.deleteTransaction(id, userId)
      setConfirm(null)
      await load()
      onChanged()
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  const money = (value?: number | null) =>
    value == null || value === 0 ? '—' : currencySign + Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatQuantity = (value?: number | null) => (value == null || value === 0 ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 3 }))

  // Replay the ledger (mirrors backend RecomputePosition) and return a map of
  // transaction id → average cost per share after that event executes.
  const runningAvgCosts = (() => {
    const sorted = transactions.toSorted((left, right) => {
      const leftOpening = left.type === 'opening', rightOpening = right.type === 'opening'
      if (leftOpening !== rightOpening) return leftOpening ? -1 : 1
      return (left.date || '').localeCompare(right.date || '')
    })
    let totalQuantity = 0, totalBasis = 0
    const averageCostById = new Map<string, number>()
    for (const transaction of sorted) {
      const quantity = transaction.quantity ?? 0
      const amount = transaction.amount ?? 0
      switch (transaction.type) {
        case 'opening':
        case 'buy':
          if (quantity > 0) { totalQuantity += quantity; totalBasis += amount }
          break
        case 'sell': {
          const averageCost = totalQuantity > 0 ? totalBasis / totalQuantity : 0
          const removed = Math.min(quantity, totalQuantity)
          totalQuantity -= removed
          totalBasis -= averageCost * removed
          break
        }
        case 'split':
        case 'bonus':
          if ((transaction.ratio ?? 0) > 0) totalQuantity *= transaction.ratio!
          break
        // dividend / merger: no position change
      }
      if (transaction.id) averageCostById.set(transaction.id, totalQuantity > 0 ? totalBasis / totalQuantity : 0)
    }
    return averageCostById
  })()

  // Quantity/amount are irrelevant for split/bonus/merger; show ratio instead.
  const isCorporate = form.type === 'split' || form.type === 'bonus'
  const isMerger = form.type === 'merger'
  const isOpening = form.type === 'opening'

  const liveQuantity = parseDecimalInput(form.quantity, { singleSeparator: 'decimal' })
  const liveAmount = parseDecimalInput(form.amount)
  const impliedCostPerShare =
    !isCorporate && !isMerger && form.type !== 'dividend' &&
    Number.isFinite(liveQuantity) && liveQuantity > 0 &&
    Number.isFinite(liveAmount) && liveAmount > 0
      ? liveAmount / liveQuantity
      : null

  return { currencySign, transactions, loading, err, form, setForm, editingId, saving, confirm, setConfirm, resetForm,
    recompute, startEdit, submit, remove, money, formatQuantity, runningAvgCosts, isCorporate, isMerger, isOpening, impliedCostPerShare }
}
