import { useState } from 'react'
import { api } from '../../lib/api/client'
import { parseSeededDecimal } from '../../lib/formNumbers'
import { canonicalCurrency } from '../../lib/currency'
import { todayIST } from '../../lib/formDates'
import type { DividendCurrency, DividendRow, Holding } from '../../types'

// The dividend dialogs' state and writes, shared by the Classic modals and
// the UI_2.0 dialogs (PD-059 R29) so both validate and save identically.

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

// useDividendForm adds a dividend to a holding in the tab's currency, or
// edits one (its holding then stays fixed).
export function useDividendForm({ currency, holdings, editing, userId, onSaved }: {
  currency: DividendCurrency
  holdings: Holding[]
  editing: DividendRow | null
  userId?: string
  onSaved: () => void
}) {
  const inTab = holdings.filter(holding => canonicalCurrency(holding.currency) === currency)
  const [holdingId, setHoldingId] = useState(editing?.holding_id ?? inTab[0]?.id ?? '')
  const [date, setDate] = useState(editing?.date ?? todayIST())
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    const value = parseSeededDecimal(amount, editing?.amount)
    if (!holdingId || !date || !(value > 0)) {
      setErr('Choose a holding, a date and a positive amount.')
      return
    }
    setSaving(true)
    setErr('')
    // quantity is required by TransactionInput but unused for a dividend.
    const body = { type: 'dividend' as const, date: `${date}T00:00:00Z`, quantity: 0, amount: value, notes: editing?.notes }
    try {
      if (editing) await api.updateTransaction(editing.id, body, userId)
      else await api.createTransaction(holdingId, body, userId)
      onSaved()
    } catch (error) {
      setErr(message(error))
    } finally {
      setSaving(false)
    }
  }

  return { inTab, holdingId, setHoldingId, date, setDate, amount, setAmount, saving, err, save }
}

// useDividendAction runs one destructive dividend call: busy while it runs,
// the error kept on failure so the dialog can stay open and say why.
export function useDividendAction(action: () => Promise<unknown>, onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async () => {
    setBusy(true)
    try {
      await action()
      onDone()
    } catch (error) {
      setErr(message(error))
      setBusy(false)
    }
  }
  return { busy, err, run }
}
