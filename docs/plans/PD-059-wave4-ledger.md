# PD-059: Wave 4 holding ledger dialog (slice 15)

* **Status**: Review updates complete, ready for merge.
* **Updated**: 2026-11-19
* **Owner**: Codex
* **Goal**: Open a holding’s dated ledger from Overview or Transactions in UI_2.0. Add, edit and delete individual events, including corrections to an existing opening and its realised seed.
* **Architecture**: Both pages call TransactionsModal. It selects the view by account mode and keys the editor by holding and owner. Both views share one hook for reads, validation, mutations and refresh. The server recomputes the holding after a write.
* **Tech stack**: React, TypeScript, existing typed API client, Ui2Dialog, DecimalInput, Vitest and Testing Library.
* **Spec links**: [PRD-015](../prds/PRD-015-ui-2.md), [DD-015](../designs/DD-015-ui-2.md), [handoff (txLedger and txEdit)](../visuals/PD-059-ui-2-reference.html), [parent plan](PD-059-ui-2.md), [status board](PD-059-ui-2-status.md).

## 1. Scope and dependencies

Slices 2 and 14 supply the interface switch and shared dialog. Both are merged.
The existing Overview and Transactions routes already open the ledger.
The event picker allows corrections to an existing opening and its realised
seed. Opening creation remains managed on the holding. Deploy through the per-account UI mode.
Switch an account to Classic or Glass to restore the inline layout.

Owner approval (2026-11-19) covers the shared-hook changes: loading refetches
when `userId` changes; delete sets `saving`, so Classic reads “Saving…” and
blocks Escape during deletion; an empty date shows “Enter a valid date”.

## 2. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/features/holdings/useHoldingLedger.ts` | Shared form state, owner-scoped reads and writes, running basis |
| Create | `frontend/src/ui2/transactions/Ui2HoldingLedger.tsx` | List, event editor and delete confirmation |
| Modify | `frontend/src/features/holdings/TransactionsModal.tsx` | Dispatch by mode and retain Classic and Glass views |
| Modify | `frontend/src/features/holdings/TransactionsModal.test.tsx` | Exercise shared entry point, payloads and error recovery |
| Modify | `frontend/src/features/holdings/AddEditModal.tsx`, `AddEditModal.test.tsx` | Show a clear Yahoo symbol test error and cover valid quotes |

## 3. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `docs/PD-059-ledger-dialog` (#350) | Amendment and board | Docs only | Reviewable inline implementation | Markdown lint and replay of the replacement blocks |
| `feat/PD-059-ledger-dialog` | Slice 15, one frontend PR | Classic and Glass retain inline views; approved hook changes are covered | UI_2.0 ledger editing and symbol validation | UI_2.0 interactions, valid and invalid Yahoo symbol responses, owner scoping |

## 4. Owner decisions

Resolved (owner, 2026-11-19): existing Opening events and their realised seed
are editable; split, bonus and merger remain available with ratio inputs;
Delete lives inside Edit; the optional Price / share helper remains. Opening
creation stays managed on the holding.

## 5. Implementation

### Task 1. Extract the shared hook without behavior changes

**Files:**

* `frontend/src/features/holdings/useHoldingLedger.ts`

* [ ] Branch from current main with `git switch -c feat/PD-059-ledger-dialog origin/main`. Extract the shared hook and keep Classic and Glass markup unchanged. Existing Classic behavior tests must remain unchanged.

* [ ] **Create the shared ledger hook** in `frontend/src/features/holdings/useHoldingLedger.ts`. One hook keeps parsing, running cost basis, owner scoping and server refresh consistent across both editors. Resetting form state also clears its validation message.

Complete new file implementing the behavior above.

```ts
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, Transaction, TransactionInput, TransactionType } from '../../types'
import { parseDecimalInput, parseSeededDecimal } from '../../lib/formNumbers'
import { todayIST } from '../../lib/formDates'
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
  }, [holding.id])

  useEffect(() => { void load() }, [load])

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
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

    const payload: TransactionInput = {
      type: form.type,
      // Send a full RFC3339 timestamp; the backend parses date-time.
      date: new Date(form.date + 'T00:00:00Z').toISOString(),
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
    try {
      await api.deleteTransaction(id, userId)
      setConfirm(null)
      await load()
      onChanged()
      return true
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      return false
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
```

* [ ] Verify the extracted hook does not change Classic behavior with `cd frontend && npm run test:run -- src/features/holdings/TransactionsModal.test.tsx`. Expected: the existing Classic tests pass.
* [ ] Commit with `git add frontend/src/features/holdings/useHoldingLedger.ts` and `git commit -m "♻️ Extract holding ledger state"`.

### Task 2. Apply the approved Classic changes

**Files:** `frontend/src/features/holdings/useHoldingLedger.ts`,
`frontend/src/features/holdings/TransactionsModal.test.tsx`

The owner approved refetching when the owner changes, showing “Saving…” and
blocking Escape during deletion, and reporting an empty date. Apply the behavior changes after extracting the hook. The complete replacement below includes them.

The load callback must refetch when the owner changes.

Current:

```ts
  }, [holding.id])
```

Replace with:

```ts
  }, [holding.id, userId])
```

The delete state activates Classic's existing busy indicator and Escape guard.

Current:

```ts
  const remove = async (id: string) => {
    setErr('')
    try {
```

Replace with:

```ts
  const remove = async (id: string) => {
    setErr('')
    setSaving(true)
    try {
```

The hook validates the date before timestamp formatting, so a cleared date
displays an inline error. Task 3 includes the complete integration tests.

The extracted hook is the current code for this task. Replace it with the
complete implementation below so every approved behavior has its final form.

Replace with:

```ts
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
```

* [ ] Verify with `cd frontend && npm run test:run -- src/features/holdings/TransactionsModal.test.tsx`.
  Expected: the Classic scenarios and empty-date regression pass.
* [ ] Commit with `git add frontend/src/features/holdings/useHoldingLedger.ts frontend/src/features/holdings/TransactionsModal.test.tsx`
  and `git commit -m "🐛 Guard Classic ledger mutations"`.

### Task 3. Add the UI_2.0 ledger view

**Files:** `frontend/src/ui2/transactions/Ui2HoldingLedger.tsx`,
`frontend/src/features/holdings/TransactionsModal.tsx`,
`frontend/src/features/holdings/TransactionsModal.test.tsx`

The complete component above uses the handoff's stacked editor and a table
wrapper that scrolls horizontally on a phone.

* [ ] **Create the UI_2.0 ledger view** in `frontend/src/ui2/transactions/Ui2HoldingLedger.tsx`. The list and editor share a dialog shell. Saving returns to the list only after a successful write. Existing openings keep their type and expose their realised seed.

Complete new file implementing the behavior above.

```tsx
import { useState } from 'react'
import type { TransactionType } from '../../types'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { NEW_TYPES, TYPE_LABEL, useHoldingLedger, type LedgerProps } from '../../features/holdings/useHoldingLedger'
import { Ui2Dialog } from '../shell/Ui2Dialog'

export function Ui2HoldingLedger({ holding, onClose, onChanged, userId }: LedgerProps) {
  const [editor, setEditor] = useState(false)
  const { currencySign, transactions, loading, err, form, setForm, editingId, saving, confirm, setConfirm, resetForm,
    recompute, startEdit, submit, remove, money, formatQuantity, isCorporate, isMerger, isOpening, impliedCostPerShare
  } = useHoldingLedger({ holding, userId, onChanged })
  const ledgerForm = <form className="ui2-form" onSubmit={async event => {
    if (await submit(event)) setEditor(false)
  }}>
    <div>
      <label>Event type<select value={form.type} disabled={isOpening} onChange={event =>
        setForm(previousForm => ({ ...previousForm, type: event.target.value as TransactionType }))}>
        {(isOpening ? ['opening'] : NEW_TYPES).map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
      </select></label>
      <label>Date<input type="date" required value={form.date} onChange={event => setForm(previousForm => ({ ...previousForm, date: event.target.value }))} /></label>
    </div>
    {!isCorporate && !isMerger && <>
      {form.type !== 'dividend' && <div>
        <label>Shares (not used for dividends)<DecimalInput value={form.quantity} onValueChange={quantity => recompute({ quantity })} /></label>
        <label>Price / share ({currencySign}, optional)<DecimalInput value={form.price} onValueChange={price => recompute({ price })} /></label>
      </div>}
      <label>Total amount · {currencySign}<DecimalInput value={form.amount} onValueChange={amount => setForm(previousForm => ({ ...previousForm, amount }))} /></label>
      {impliedCostPerShare !== null && <p className="ui2-dialog-note">Implied cost/share: {money(impliedCostPerShare)}</p>}
    </>}
    {isCorporate && <label>Ratio (new shares per old)<DecimalInput value={form.ratio} onValueChange={ratio => setForm(previousForm => ({ ...previousForm, ratio }))} /></label>}
    {isOpening && <label>Realised P&amp;L seed ({currencySign})<DecimalInput allowNegative value={form.realized}
      onValueChange={realized => setForm(previousForm => ({ ...previousForm, realized }))} /></label>}
    {isMerger && <p className="ui2-dialog-note">Merger records an audit event. Record a sell and a buy for changes to the position.</p>}
    <label>Notes<input value={form.notes} onChange={event => setForm(previousForm => ({ ...previousForm, notes: event.target.value }))} /></label>
    <p className="ui2-dialog-note">A buy is the total debited and a sell the total credited, fees included.</p>
    <button className="ui2-btn ui2-btn-primary" style={{ width: '100%' }} disabled={saving}>Save event</button>
    <button type="button" className="ui2-btn" disabled={saving} onClick={() => { resetForm(); setConfirm(null); setEditor(false) }}>Cancel</button>
  </form>
  const title = editor
    ? `${editingId ? 'Edit' : 'Add'} event · ${holding.script}`
    : `${holding.script} · transaction ledger`
  return <Ui2Dialog key={editor ? 'editor' : 'list'} title={title} busy={saving} onClose={onClose} wide>
    {err && <p role="alert" className="ui2-form-error">{err}</p>}
    {editor ? <>
      {ledgerForm}
      {editingId && (confirm === editingId
        ? <div className="ui2-dialog-actions">
            <button className="ui2-btn" disabled={saving} onClick={() => setConfirm(null)}>Keep event</button>
            <button className="ui2-btn ui2-btn-danger" disabled={saving} onClick={async () => {
              if (await remove(editingId)) { resetForm(); setEditor(false) }
            }}>Confirm delete</button>
          </div>
        : <button className="ui2-btn ui2-btn-danger" disabled={saving} onClick={() => setConfirm(editingId)}>Delete event</button>)}
    </> : <>
      <p className="ui2-subtitle">{holding.symbol} · {holding.currency}</p>
      <p className="ui2-dialog-note">Opening balances are managed on the holding. These events belong to this holding.</p>
      <div style={{ maxWidth: '100%', overflowX: 'auto' }}><table className="ui2-table" style={{ minWidth: '32rem' }}>
        <thead><tr>{['Date', 'Type', 'Shares', 'Amount', ''].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{transactions.toSorted((left, right) => (right.date || '').localeCompare(left.date || '')).map(transaction =>
          <tr key={transaction.id}>
            <td>{transaction.date ? formatDate(transaction.date) : '—'}</td><td>{(TYPE_LABEL[transaction.type || ''] || transaction.type)}</td>
            <td>{formatQuantity(transaction.quantity)}</td><td>{money(transaction.amount)}</td>
            <td><button className="ui2-btn" onClick={() => { startEdit(transaction); setEditor(true) }}
              aria-label={`Edit ${(TYPE_LABEL[transaction.type || ''] || transaction.type)} on ${transaction.date ? formatDate(transaction.date) : 'unknown date'}`}>Edit</button></td>
          </tr>)}</tbody>
      </table></div>
      {loading ? <p>Loading…</p> : !err && !transactions.length && <p>No transactions yet.</p>}
      <div className="ui2-dialog-actions"><button className="ui2-btn ui2-btn-primary" onClick={() => {
        resetForm(); setEditor(true)
      }}>Add event</button></div>
    </>}
  </Ui2Dialog>
}
```

* [ ] **Update the existing modal entry point** in `frontend/src/features/holdings/TransactionsModal.tsx`. Keep the existing callers and inline Classic and Glass layout. Move the shared state out of the renderer and select the UI_2.0 view at this boundary.

Current file on main, included to identify the full replacement boundary.

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { api } from '../../lib/api/client'
import type { Holding, Transaction, TransactionInput, TransactionType } from '../../types'
import { EditIcon, TrashIcon, PlusIcon } from '../../components/Icon'
import { DecimalInput } from '../../components/DecimalInput'
import { parseDecimalInput, parseSeededDecimal } from '../../lib/formNumbers'
import { formatDate, todayIST } from '../../lib/formDates'
import { currencySymbol } from '../../lib/currency'
import { useDialogFocus } from '../../lib/useDialogFocus'

// Ordered for the type picker; opening is managed via the holding's opening
// balance, but is shown read-only in the list when present.
const NEW_TYPES: TransactionType[] = ['buy', 'sell', 'dividend', 'split', 'bonus', 'merger']

export const TYPE_LABEL: Record<string, string> = {
  opening: 'Opening', buy: 'Buy', sell: 'Sell', dividend: 'Dividend',
  split: 'Split', bonus: 'Bonus', merger: 'Merger',
}

const INPUT: CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)',
  outline: 'none',
}
const LABEL: CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

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

interface Props {
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

export default function TransactionsModal({ holding, onClose, onChanged, userId }: Props) {
  const sym = currencySymbol(holding.currency)
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onClose() })

  const load = useCallback(async () => {
    if (!holding.id) return
    setLoading(true)
    try {
      const data = await api.listTransactions(holding.id, userId)
      setTxns(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [holding.id])

  useEffect(() => { void load() }, [load])

  const resetForm = () => { setForm(emptyForm()); setEditingId(null) }

  // Optional per-share price is a convenience: when both shares and price are
  // present, auto-fill the total amount (= price × shares). Amount stays
  // editable so the user can fold in brokerage/charges afterwards (e.g. enter
  // NAV 41.1086 × 279.733 = 11499.43, then bump to the 11500 actually debited).
  const recompute = (next: Partial<FormState>) => setForm(previousForm => {
    const merged = { ...previousForm, ...next }
    const qty = parseDecimalInput(merged.quantity, { singleSeparator: 'decimal' })
    const px = parseDecimalInput(merged.price)
    if (merged.price.trim() !== '' && Number.isFinite(qty) && Number.isFinite(px) && qty > 0) {
      merged.amount = (qty * px).toFixed(2)
    }
    return merged
  })

  const startEdit = (txn: Transaction) => {
    setEditingId(txn.id || null)
    setForm({
      type: (txn.type as TransactionType) || 'buy',
      date: txn.date ? txn.date.slice(0, 10) : todayIST(),
      quantity: txn.quantity != null ? String(txn.quantity) : '',
      price: '',
      amount: txn.amount != null ? String(txn.amount) : '',
      ratio: txn.ratio != null && txn.ratio !== 0 ? String(txn.ratio) : '',
      realized: txn.realized_seed != null && txn.realized_seed !== 0 ? String(txn.realized_seed) : '',
      notes: txn.notes || '',
    })
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!holding.id) return
    setErr('')

    const quantity = parseDecimalInput(form.quantity, { singleSeparator: 'decimal' })
    if (!Number.isFinite(quantity) || quantity < 0) { setErr('Enter a valid share quantity'); return }
    // Untouched fields keep the stored number: re-parsing String(1.234) under
    // the default rule would save the grouped integer 1234.
    const editing = editingId ? txns.find(txn => txn.id === editingId) : undefined
    const amount = parseSeededDecimal(form.amount, editing?.amount)
    if (!Number.isFinite(amount) || amount < 0) { setErr('Enter a valid amount'); return }
    const ratio = parseDecimalInput(form.ratio, { singleSeparator: 'decimal' })
    if (!Number.isFinite(ratio) || ratio < 0) { setErr('Enter a valid ratio'); return }
    const realizedSeed = parseSeededDecimal(form.realized, editing?.realized_seed, { allowNegative: true })
    if (!Number.isFinite(realizedSeed)) { setErr('Enter a valid realised P&L seed'); return }

    const payload: TransactionInput = {
      type: form.type,
      // Send a full RFC3339 timestamp; the backend parses date-time.
      date: new Date(form.date + 'T00:00:00Z').toISOString(),
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setErr('')
    try {
      await api.deleteTransaction(id, userId)
      setConfirm(null)
      await load()
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const money = (value?: number | null) =>
    value == null || value === 0 ? '—' : sym + Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatQuantity = (value?: number | null) => (value == null || value === 0 ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 3 }))

  // Replay the ledger (mirrors backend RecomputePosition) and return a map of
  // transaction id → avg cost per share after that event executes.
  const runningAvgCosts = (() => {
    const sorted = txns.toSorted((left, right) => {
      const leftOpening = left.type === 'opening', rightOpening = right.type === 'opening'
      if (leftOpening !== rightOpening) return leftOpening ? -1 : 1
      return (left.date || '').localeCompare(right.date || '')
    })
    let totalQty = 0, totalBasis = 0
    const avgCostById = new Map<string, number>()
    for (const txn of sorted) {
      const qty = txn.quantity ?? 0
      const amt = txn.amount ?? 0
      switch (txn.type) {
        case 'opening':
        case 'buy':
          if (qty > 0) { totalQty += qty; totalBasis += amt }
          break
        case 'sell': {
          const avg = totalQty > 0 ? totalBasis / totalQty : 0
          const removed = Math.min(qty, totalQty)
          totalQty -= removed
          totalBasis -= avg * removed
          break
        }
        case 'split':
        case 'bonus':
          if ((txn.ratio ?? 0) > 0) totalQty *= txn.ratio!
          break
        // dividend / merger: no position change
      }
      if (txn.id) avgCostById.set(txn.id, totalQty > 0 ? totalBasis / totalQty : 0)
    }
    return avgCostById
  })()

  // Quantity/amount are irrelevant for split/bonus/merger; show ratio instead.
  const isCorporate = form.type === 'split' || form.type === 'bonus'
  const isMerger = form.type === 'merger'
  const isOpening = form.type === 'opening'

  const liveQty = parseDecimalInput(form.quantity, { singleSeparator: 'decimal' })
  const liveAmt = parseDecimalInput(form.amount)
  const impliedCostPerShare =
    !isCorporate && !isMerger && form.type !== 'dividend' &&
    Number.isFinite(liveQty) && liveQty > 0 &&
    Number.isFinite(liveAmt) && liveAmt > 0
      ? liveAmt / liveQty
      : null

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Transactions — ${holding.script}`} className="modal-card" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 720,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Transactions — {holding.script}</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-muted)', fontSize: 20, padding: '0 4px' }}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }}>
          Position recomputes from this ledger (average cost). Buy = total debited; Sell = total credited.
        </div>

        {/* Add / edit form */}
        <form onSubmit={submit} style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: 16, marginBottom: 18, background: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Type</label>
              {isOpening ? (
                // Opening type is fixed; only its values can be edited.
                <input style={{ ...INPUT, opacity: 0.7 }} value="Opening (balance)" disabled />
              ) : (
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.type}
                  onChange={e => setForm(previousForm => ({ ...previousForm, type: e.target.value as TransactionType }))}>
                  {NEW_TYPES.map(txnType => <option key={txnType} value={txnType}>{TYPE_LABEL[txnType]}</option>)}
                </select>
              )}
            </div>
            <div>
              <label style={LABEL}>Date</label>
              <input style={INPUT} type="date" value={form.date}
                onChange={e => setForm(previousForm => ({ ...previousForm, date: e.target.value }))} />
            </div>
          </div>

          {!isCorporate && !isMerger && (
            <div style={{ display: 'grid', gridTemplateColumns: form.type === 'dividend' ? '1fr' : '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              {form.type !== 'dividend' && (
                <div>
                  <label style={LABEL}>Shares</label>
                  <DecimalInput style={INPUT} value={form.quantity}
                    onValueChange={value => recompute({ quantity: value })} placeholder="0" />
                </div>
              )}
              {form.type !== 'dividend' && (
                <div>
                  <label style={LABEL}>Price / share ({sym}) <span style={{ textTransform: 'none', color: 'var(--text-muted)' }}>optional</span></label>
                  <DecimalInput style={INPUT} value={form.price}
                    onValueChange={value => recompute({ price: value })} placeholder="NAV / price" />
                </div>
              )}
              <div>
                <label style={LABEL}>
                  {form.type === 'dividend' ? `Dividend credited (${sym})`
                    : form.type === 'sell' ? `Total credited (${sym})`
                    : form.type === 'opening' ? `Total cost (${sym})`
                    : `Total debited (${sym})`}
                </label>
                <DecimalInput style={INPUT} value={form.amount}
                  onValueChange={value => setForm(previousForm => ({ ...previousForm, amount: value }))} placeholder="0.00" />
              </div>
            </div>
          )}

          {impliedCostPerShare !== null && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              Implied cost/share:{' '}
              <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {sym}{impliedCostPerShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          )}

          {isOpening && (
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>Realised P&L seed ({sym})</label>
              <DecimalInput style={INPUT} value={form.realized} allowNegative
                onValueChange={value => setForm(previousForm => ({ ...previousForm, realized: value }))}
                placeholder="Carried realised P&L (optional)" />
            </div>
          )}

          {isCorporate && (
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>Ratio (new shares per old, e.g. 2 = 2-for-1)</label>
              <DecimalInput style={INPUT} value={form.ratio}
                onValueChange={value => setForm(previousForm => ({ ...previousForm, ratio: value }))} placeholder="2" />
            </div>
          )}

          {isMerger && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              Merger is recorded for audit only; model the position effect with a sell on the old
              holding and a buy on the new one.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={LABEL}>Notes</label>
            <input style={INPUT} value={form.notes}
              onChange={e => setForm(previousForm => ({ ...previousForm, notes: e.target.value }))} placeholder="Optional" />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn">
                Cancel edit
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary"
              style={{ opacity: saving ? 0.7 : 1 }}>
              <PlusIcon size={14} /> {saving ? 'Saving…' : editingId ? 'Update transaction' : 'Add transaction'}
            </button>
          </div>
        </form>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{err}</div>}

        {/* Ledger list */}
        <div className="table-scroll" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <Th style={{ textAlign: 'left' }}>Date</Th>
                <Th style={{ textAlign: 'left' }}>Type</Th>
                <Th>Shares</Th>
                <Th>Amount</Th>
                <Th>Ratio</Th>
                <Th>Avg Cost/Sh</Th>
                <Th style={{ textAlign: 'center', width: 80 }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Loading…</td></tr>
              )}
              {!loading && txns.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                  No transactions yet. Add a buy, sell or dividend above.
                </td></tr>
              )}
              {!loading && txns.map(txn => (
                <tr key={txn.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td style={{ textAlign: 'left' }}>{txn.date ? formatDate(txn.date) : '—'}</Td>
                  <Td style={{ textAlign: 'left' }}>
                    <span style={{ fontWeight: 600 }}>{TYPE_LABEL[txn.type || ''] || txn.type}</span>
                    {txn.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{txn.notes}</div>}
                  </Td>
                  <Td className="mono">{num(txn.quantity)}</Td>
                  <Td className="mono">{money(txn.amount)}</Td>
                  <Td className="mono">{txn.ratio ? `${txn.ratio}×` : '—'}</Td>
                  <Td className="mono">{(() => { const avgCost = txn.id ? runningAvgCosts.get(txn.id) : undefined; return avgCost ? sym + avgCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' })()}</Td>
                  <Td style={{ textAlign: 'center' }}>
                    {confirm === txn.id ? (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => txn.id && remove(txn.id)} className="btn btn-sm btn-danger-solid">Yes</button>
                        <button onClick={() => setConfirm(null)} className="btn btn-sm">No</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(txn)} title="Edit"
                          aria-label={`Edit ${TYPE_LABEL[txn.type || ''] || txn.type} on ${txn.date ? formatDate(txn.date) : 'no date'}`}
                          className="btn-row btn-row-accent">
                          <EditIcon size={12} />
                        </button>
                        <button onClick={() => txn.id && setConfirm(txn.id)} title="Delete"
                          aria-label={`Delete ${TYPE_LABEL[txn.type || ''] || txn.type} on ${txn.date ? formatDate(txn.date) : 'no date'}`}
                          className="btn-row btn-row-danger">
                          <TrashIcon size={12} />
                        </button>
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Derived position summary */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Shares: <strong style={{ color: 'var(--text-primary)' }}>{num(holding.stocks_owned)}</strong></span>
          <span>Avg cost: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.avg_cost_price)}</strong></span>
          <span>Realised: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.realized_pnl)}</strong></span>
          <span>Dividends: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.total_dividends)}</strong></span>
        </div>
      </div>
    </div>
  )
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) => (
  <th scope="col" style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', ...style }}>{children}</th>
)
const Td = ({ children, style, className }: { children?: React.ReactNode; style?: CSSProperties; className?: string }) => (
  <td className={className} style={{ padding: '9px 12px', textAlign: 'right', ...style }}>{children}</td>
)
```

Replacement file implementing the behavior above.

```tsx
import { useRef, type CSSProperties } from 'react'
import type { TransactionType } from '../../types'
import { EditIcon, TrashIcon, PlusIcon } from '../../components/Icon'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useUiMode } from '../../lib/uiMode'
import { Ui2HoldingLedger } from '../../ui2/transactions/Ui2HoldingLedger'
import { NEW_TYPES, TYPE_LABEL, useHoldingLedger, type LedgerProps } from './useHoldingLedger'
export { TYPE_LABEL } from './useHoldingLedger'

const INPUT: CSSProperties = {
  width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)',
  outline: 'none',
}
const LABEL: CSSProperties = { display: 'block', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }

export default function TransactionsModal(props: LedgerProps) {
  const View = useUiMode() === 'ui2' ? Ui2HoldingLedger : ClassicHoldingLedger
  return <View key={JSON.stringify([props.holding.id, props.userId])} {...props} />
}

function ClassicHoldingLedger({ holding, onClose, onChanged, userId }: LedgerProps) {
  const { currencySign, transactions, loading, err, form, setForm, editingId, saving, confirm, setConfirm, resetForm,
    recompute, startEdit, submit, remove, money, formatQuantity, runningAvgCosts, isCorporate, isMerger, isOpening, impliedCostPerShare
  } = useHoldingLedger({ holding, userId, onChanged })
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, () => { if (!saving) onClose() })

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Transactions — ${holding.script}`} className="modal-card" style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 720,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Transactions — {holding.script}</h2>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-muted)', fontSize: 20, padding: '0 4px' }}>✕</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 18 }}>
          Position recomputes from this ledger (average cost). Buy = total debited; Sell = total credited.
        </div>

        {/* Add / edit form */}
        <form onSubmit={submit} style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: 16, marginBottom: 18, background: 'var(--bg-secondary)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL}>Type</label>
              {isOpening ? (
                // Opening type is fixed; only its values can be edited.
                <input style={{ ...INPUT, opacity: 0.7 }} value="Opening (balance)" disabled />
              ) : (
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.type}
                  onChange={e => setForm(previousForm => ({ ...previousForm, type: e.target.value as TransactionType }))}>
                  {NEW_TYPES.map(txnType => <option key={txnType} value={txnType}>{TYPE_LABEL[txnType]}</option>)}
                </select>
              )}
            </div>
            <div>
              <label style={LABEL}>Date</label>
              <input style={INPUT} type="date" value={form.date}
                onChange={e => setForm(previousForm => ({ ...previousForm, date: e.target.value }))} />
            </div>
          </div>

          {!isCorporate && !isMerger && (
            <div style={{ display: 'grid', gridTemplateColumns: form.type === 'dividend' ? '1fr' : '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              {form.type !== 'dividend' && (
                <div>
                  <label style={LABEL}>Shares</label>
                  <DecimalInput style={INPUT} value={form.quantity}
                    onValueChange={value => recompute({ quantity: value })} placeholder="0" />
                </div>
              )}
              {form.type !== 'dividend' && (
                <div>
                  <label style={LABEL}>Price / share ({currencySign}) <span style={{ textTransform: 'none', color: 'var(--text-muted)' }}>optional</span></label>
                  <DecimalInput style={INPUT} value={form.price}
                    onValueChange={value => recompute({ price: value })} placeholder="NAV / price" />
                </div>
              )}
              <div>
                <label style={LABEL}>
                  {form.type === 'dividend' ? `Dividend credited (${currencySign})`
                    : form.type === 'sell' ? `Total credited (${currencySign})`
                    : form.type === 'opening' ? `Total cost (${currencySign})`
                    : `Total debited (${currencySign})`}
                </label>
                <DecimalInput style={INPUT} value={form.amount}
                  onValueChange={value => setForm(previousForm => ({ ...previousForm, amount: value }))} placeholder="0.00" />
              </div>
            </div>
          )}

          {impliedCostPerShare !== null && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
              Implied cost/share:{' '}
              <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {currencySign}{impliedCostPerShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          )}

          {isOpening && (
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>Realised P&L seed ({currencySign})</label>
              <DecimalInput style={INPUT} value={form.realized} allowNegative
                onValueChange={value => setForm(previousForm => ({ ...previousForm, realized: value }))}
                placeholder="Carried realised P&L (optional)" />
            </div>
          )}

          {isCorporate && (
            <div style={{ marginTop: 12 }}>
              <label style={LABEL}>Ratio (new shares per old, e.g. 2 = 2-for-1)</label>
              <DecimalInput style={INPUT} value={form.ratio}
                onValueChange={value => setForm(previousForm => ({ ...previousForm, ratio: value }))} placeholder="2" />
            </div>
          )}

          {isMerger && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              Merger is recorded for audit only; model the position effect with a sell on the old
              holding and a buy on the new one.
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label style={LABEL}>Notes</label>
            <input style={INPUT} value={form.notes}
              onChange={e => setForm(previousForm => ({ ...previousForm, notes: e.target.value }))} placeholder="Optional" />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            {editingId && (
              <button type="button" onClick={resetForm} className="btn">
                Cancel edit
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary"
              style={{ opacity: saving ? 0.7 : 1 }}>
              <PlusIcon size={14} /> {saving ? 'Saving…' : editingId ? 'Update transaction' : 'Add transaction'}
            </button>
          </div>
        </form>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{err}</div>}

        {/* Ledger list */}
        <div className="table-scroll" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)' }}>
                <Th style={{ textAlign: 'left' }}>Date</Th>
                <Th style={{ textAlign: 'left' }}>Type</Th>
                <Th>Shares</Th>
                <Th>Amount</Th>
                <Th>Ratio</Th>
                <Th>Avg Cost/Sh</Th>
                <Th style={{ textAlign: 'center', width: 80 }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>Loading…</td></tr>
              )}
              {!loading && transactions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>
                  No transactions yet. Add a buy, sell or dividend above.
                </td></tr>
              )}
              {!loading && transactions.map(transaction => (
                <tr key={transaction.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <Td style={{ textAlign: 'left' }}>{transaction.date ? formatDate(transaction.date) : '—'}</Td>
                  <Td style={{ textAlign: 'left' }}>
                    <span style={{ fontWeight: 600 }}>{TYPE_LABEL[transaction.type || ''] || transaction.type}</span>
                    {transaction.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{transaction.notes}</div>}
                  </Td>
                  <Td className="mono">{formatQuantity(transaction.quantity)}</Td>
                  <Td className="mono">{money(transaction.amount)}</Td>
                  <Td className="mono">{transaction.ratio ? `${transaction.ratio}×` : '—'}</Td>
                  <Td className="mono">{(() => { const avgCost = transaction.id ? runningAvgCosts.get(transaction.id) : undefined; return avgCost ? currencySign + avgCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' })()}</Td>
                  <Td style={{ textAlign: 'center' }}>
                    {confirm === transaction.id ? (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => transaction.id && remove(transaction.id)} className="btn btn-sm btn-danger-solid">Yes</button>
                        <button onClick={() => setConfirm(null)} className="btn btn-sm">No</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(transaction)} title="Edit"
                          aria-label={`Edit ${TYPE_LABEL[transaction.type || ''] || transaction.type} on ${transaction.date ? formatDate(transaction.date) : 'no date'}`}
                          className="btn-row btn-row-accent">
                          <EditIcon size={12} />
                        </button>
                        <button onClick={() => transaction.id && setConfirm(transaction.id)} title="Delete"
                          aria-label={`Delete ${TYPE_LABEL[transaction.type || ''] || transaction.type} on ${transaction.date ? formatDate(transaction.date) : 'no date'}`}
                          className="btn-row btn-row-danger">
                          <TrashIcon size={12} />
                        </button>
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Derived position summary */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Shares: <strong style={{ color: 'var(--text-primary)' }}>{formatQuantity(holding.stocks_owned)}</strong></span>
          <span>Avg cost: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.avg_cost_price)}</strong></span>
          <span>Realised: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.realized_pnl)}</strong></span>
          <span>Dividends: <strong style={{ color: 'var(--text-primary)' }}>{money(holding.total_dividends)}</strong></span>
        </div>
      </div>
    </div>
  )
}

const Th = ({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) => (
  <th scope="col" style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', ...style }}>{children}</th>
)
const Td = ({ children, style, className }: { children?: React.ReactNode; style?: CSSProperties; className?: string }) => (
  <td className={className} style={{ padding: '9px 12px', textAlign: 'right', ...style }}>{children}</td>
)
```

* [ ] **Extend the entry-point tests** in `frontend/src/features/holdings/TransactionsModal.test.tsx`. Exercise both interfaces through the same public component. Assert the API payload and check the state after switching views.

Current file on main, included to identify the full replacement boundary.

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { api } from '../../lib/api/client'
import TransactionsModal from './TransactionsModal'

vi.mock('../../lib/api/client', () => ({
  api: {
    listTransactions: vi.fn().mockResolvedValue([]),
    createTransaction: vi.fn().mockResolvedValue({}),
    updateTransaction: vi.fn().mockResolvedValue({}),
    deleteTransaction: vi.fn().mockResolvedValue({}),
  },
}))

const holding = {
  id: 'holding-1',
  script: 'VWCE',
  currency: 'EUR',
} as HoldingWithPrice

describe('TransactionsModal numeric input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listTransactions).mockResolvedValue([])
  })

  // Theme contract: row actions use the shared tinted classes whose borders
  // track --blue/--red per theme, not hardcoded rgba colours.
  it('renders ledger row actions with the shared btn-row classes', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'buy', date: '2026-01-05', quantity: 1, amount: 100 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByTitle('Edit')).toHaveClass('btn-row', 'btn-row-accent')
    expect(screen.getByTitle('Delete')).toHaveClass('btn-row', 'btn-row-danger')
  })

  it('submits comma decimal transaction values as numbers', async () => {
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} />)

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30,68' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledTimes(1))
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      quantity: 1.5,
      amount: 30.68,
    }), undefined)
  })

  it('rejects malformed amount text instead of coercing it', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1,,2' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('keeps a stored 1.234 amount on a notes-only edit', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'dividend', date: '2026-01-05', quantity: 0, amount: 1.234 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.click(await screen.findByTitle('Edit'))
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: 'tax refund' } })
    fireEvent.click(screen.getByRole('button', { name: /Update transaction/ }))
    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 1.234, notes: 'tax refund' }), undefined))
  })

  it('reads and writes the target ledger in act-as', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} userId="u1" />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith('holding-1', 'u1'))
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({ amount: 100 }), 'u1'))
  })
})
```

Replacement file implementing the behavior above.

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { api } from '../../lib/api/client'
import TransactionsModal from './TransactionsModal'
import { useUiMode } from '../../lib/uiMode'

vi.mock('../../lib/uiMode', () => ({ useUiMode: vi.fn(() => 'classic') }))

vi.mock('../../lib/api/client', () => ({
  api: {
    listTransactions: vi.fn().mockResolvedValue([]),
    createTransaction: vi.fn().mockResolvedValue({}),
    updateTransaction: vi.fn().mockResolvedValue({}),
    deleteTransaction: vi.fn().mockResolvedValue({}),
  },
}))

const holding = {
  id: 'holding-1',
  script: 'VWCE',
  currency: 'EUR',
} as HoldingWithPrice

describe('TransactionsModal numeric input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useUiMode).mockReturnValue('classic')
    vi.mocked(api.listTransactions).mockResolvedValue([])
  })

  it('creates a UI_2.0 buy using the editable total after price and shares prefill it', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText('Shares (not used for dividends)'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByLabelText(/Price \/ share/), { target: { value: '10' } })
    expect(screen.getByLabelText(/Total amount/)).toHaveValue('15.00')
    fireEvent.change(screen.getByLabelText(/Total amount/), { target: { value: '15,25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeVisible()
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      type: 'buy', quantity: 1.5, amount: 15.25,
    }), undefined)
    expect(onChanged).toHaveBeenCalledOnce()
  })

  it('opens the UI_2.0 event editor and confirms deletion against the selected owner', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    vi.mocked(api.listTransactions).mockResolvedValueOnce([
      { id: 'event-1', type: 'split', date: '2026-10-01', ratio: 2 },
    ])
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} userId="owner" />)
    expect(screen.getByRole('dialog', { name: 'VWCE · transaction ledger' })).toBeVisible()
    fireEvent.click(await screen.findByRole('button', { name: /Edit Split/ }))
    expect(screen.getByLabelText(/Ratio/)).toHaveValue('2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete event' }))
    expect(api.deleteTransaction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeVisible()
    expect(api.deleteTransaction).toHaveBeenCalledWith('event-1', 'owner')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('clears an invalid UI_2.0 amount when cancelling and reopening the editor', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    await screen.findByText('No transactions yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText('Shares (not used for dividends)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Total amount/), { target: { value: '1,2,3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid amount')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('No transactions yet.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('edits a UI_2.0 opening with its type locked and realised seed prefilled', async () => {
    vi.mocked(useUiMode).mockReturnValue('ui2')
    vi.mocked(api.listTransactions).mockResolvedValueOnce([
      { id: 'opening-1', type: 'opening', date: '2026-01-01', quantity: 4, amount: 80, realized_seed: -7.25 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /Edit Opening/ }))
    expect(screen.getByLabelText('Event type')).toBeDisabled()
    expect(screen.getByLabelText('Event type')).toHaveDisplayValue('Opening')
    const seed = screen.getByLabelText(/Realised P&L seed/)
    expect(seed).toHaveValue('-7.25')
    fireEvent.change(seed, { target: { value: '-8.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save event' }))
    expect(await screen.findByRole('button', { name: 'Add event' })).toBeVisible()
    expect(api.updateTransaction).toHaveBeenCalledWith('opening-1',
      expect.objectContaining({ type: 'opening', realized_seed: -8.5 }), undefined)
  })

  it('rejects a cleared date in the Classic editor', async () => {
    const { container } = render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    expect(await screen.findByText('Enter a valid date')).toBeVisible()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  // The shared row-action classes track the theme's blue and red borders.
  it('renders ledger row actions with the shared btn-row classes', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'buy', date: '2026-01-05', quantity: 1, amount: 100 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    expect(await screen.findByTitle('Edit')).toHaveClass('btn-row', 'btn-row-accent')
    expect(screen.getByTitle('Delete')).toHaveClass('btn-row', 'btn-row-danger')
  })

  it('submits comma decimal transaction values as numbers', async () => {
    const onChanged = vi.fn()
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={onChanged} />)

    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1,5' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '30,68' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledTimes(1))
    expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({
      quantity: 1.5,
      amount: 30.68,
    }), undefined)
  })

  it('rejects malformed amount text instead of coercing it', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '1,,2' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))

    expect(await screen.findByText('Enter a valid amount')).toBeInTheDocument()
    expect(api.createTransaction).not.toHaveBeenCalled()
  })

  it('keeps a stored 1.234 amount on a notes-only edit', async () => {
    vi.mocked(api.listTransactions).mockResolvedValue([
      { id: 't1', type: 'dividend', date: '2026-01-05', quantity: 0, amount: 1.234 },
    ])
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    fireEvent.click(await screen.findByTitle('Edit'))
    fireEvent.change(screen.getByPlaceholderText('Optional'), { target: { value: 'tax refund' } })
    fireEvent.click(screen.getByRole('button', { name: /Update transaction/ }))
    await waitFor(() => expect(api.updateTransaction).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 1.234, notes: 'tax refund' }), undefined))
  })

  it('reads and writes the target ledger in act-as', async () => {
    render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} userId="u1" />)
    await waitFor(() => expect(api.listTransactions).toHaveBeenCalledWith('holding-1', 'u1'))
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    await waitFor(() => expect(api.createTransaction).toHaveBeenCalledWith('holding-1', expect.objectContaining({ amount: 100 }), 'u1'))
  })
})
```

* [ ] Verify with `cd frontend && npx tsc --noEmit && npm run lint:changed && npm run test:run -- src/features/holdings/TransactionsModal.test.tsx`.
  Expected: typecheck and lint exit zero, and all ledger tests pass.
* [ ] Commit with `git add frontend/src/ui2/transactions/Ui2HoldingLedger.tsx frontend/src/features/holdings/TransactionsModal.tsx frontend/src/features/holdings/TransactionsModal.test.tsx`
  and `git commit -m "✨ Add the UI_2.0 ledger editor"`.

### Task 4. Fix the holding symbol test

**Files:** `frontend/src/features/holdings/AddEditModal.tsx`,
`frontend/src/features/holdings/AddEditModal.test.tsx`

The holding form already has a Yahoo Test button. A rejected lookup currently
shows its raw upstream error. Use a stable, visible error for an invalid
symbol and keep the valid quote preview.

* [ ] In `AddEditModal.tsx`, replace the lookup result handling. The current
  code displays a raw request error and accepts an empty quote.

Current:

```tsx
      const data = await api.getMarketPrice(form.symbol)
      setLivePrice(data)
    } catch (e) {
      setLivePrice({ error: e instanceof Error ? e.message : String(e) })
```

Replace with:

```tsx
      const data = await api.getMarketPrice(form.symbol)
      setLivePrice(data.price != null && Number.isFinite(data.price) && data.price > 0
        ? data : { error: 'No valid quote found for this symbol' })
    } catch {
      setLivePrice({ error: 'No valid quote found for this symbol' })
```

* [ ] In `AddEditModal.test.tsx`, add the following behavior tests for the
  existing Test button.

Current mock:

```tsx
    getMarketPrice: vi.fn(),
```

Replace with:

```tsx
    getMarketPrice: vi.fn(),
    getMarketProfile: vi.fn().mockResolvedValue(null),
```

The profile mock keeps the existing symbol preview from making an unrelated
request during these focused tests.

```tsx
it('shows a valid Yahoo quote after Test', async () => {
  vi.mocked(api.getMarketPrice).mockResolvedValueOnce({ price: 123.45, currency: 'USD' })
  render(<AddEditModal holding={null} onClose={() => {}} onSaved={() => {}} />)
  fireEvent.change(screen.getByLabelText('Yahoo Symbol'), { target: { value: 'AAPL' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))
  expect(await screen.findByText(/123.45 USD/)).toBeVisible()
})

it('shows a clear error for an invalid Yahoo symbol', async () => {
  vi.mocked(api.getMarketPrice).mockRejectedValueOnce(new Error('upstream response'))
  render(<AddEditModal holding={null} onClose={() => {}} onSaved={() => {}} />)
  fireEvent.change(screen.getByLabelText('Yahoo Symbol'), { target: { value: 'BAD-SYMBOL' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test' }))
  expect(await screen.findByText('Error: No valid quote found for this symbol')).toBeVisible()
})
```

* [ ] Verify with `cd frontend && npm run test:run -- src/features/holdings/AddEditModal.test.tsx`.
  Expected: the valid quote and invalid symbol tests pass with the existing holding tests.
* [ ] Commit with `git add frontend/src/features/holdings/AddEditModal.tsx frontend/src/features/holdings/AddEditModal.test.tsx`
  and `git commit -m "🐛 Explain failed Yahoo symbol tests"`.

### Task 5. Verify the end-to-end ledger flows

**Files:**

* `frontend/src/features/holdings/TransactionsModal.tsx`
* `frontend/src/features/holdings/TransactionsModal.test.tsx`
* `frontend/src/ui2/transactions/Ui2HoldingLedger.tsx`

* [ ] From the implementation branch, check changed-file lint, browser integration and the production bundle. The required browser flag makes a missing Chromium installation fail the run.

```bash
(cd frontend && npm run lint:changed && REQUIRE_BROWSER_TESTS=1 npm run test:run && npm run build)
```

Expected: ESLint exits zero. The full Vitest suite reports 89 files and 806 tests passed, and the production build succeeds.

* [ ] Using the [dev runbook](../../.claude/skills/run-app/SKILL.md), open a UI_2.0 ledger from both Overview and Transactions. At desktop and phone widths, check focus, Escape and scrolling in Light, Dark and Cyber.
* [ ] Add a buy, adjust the computed cash total for fees, save, then edit its notes. Confirm the holding refreshes. Enter Shares `1` and Total amount `1,2,3` on an empty ledger. Cancel the error and check the empty list and the next Add event.
* [ ] Edit an opening, verify the locked type and prefilled realised seed, save a new seed and reopen. Edit a split, cancel a deletion, then confirm deletion and check the target holding refreshes.
* [ ] Check Classic and Glass inline editing. Clear the Classic date and save. Expect “Enter a valid date”. Switch target owners and confirm the list refetches. During a pending Classic delete, verify “Saving…” and that Escape keeps the modal open.
* [ ] Open the frontend PR with the `ui-2.0` label and record the implementation branch, PR and shared components on the [status board](PD-059-ui-2-status.md).

## 6. Done and next

* [x] Specify the complete implementation and behavioral tests inline.
* [x] Verified the final code in a scratch checkout: TypeScript, ESLint, 18 focused tests, 806 full-suite tests and production build pass.
* [ ] Merge the amendment and ship slice 15 through its frontend PR.
* [ ] Record dev-stack verification on the board.

**Next:** Slice 16 consumes the shared ledger from the Transactions page.
