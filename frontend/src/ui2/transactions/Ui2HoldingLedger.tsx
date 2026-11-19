import { useState } from 'react'
import type { TransactionType } from '../../types'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDate } from '../../lib/formDates'
import { NEW_TYPES, TYPE_LABEL, useHoldingLedger, type LedgerProps } from '../../features/holdings/useHoldingLedger'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import './ledger.css'

export function Ui2HoldingLedger({ holding, onClose, onChanged, userId }: LedgerProps) {
  const [editor, setEditor] = useState(false)
  const { currencySign, transactions, loading, err, form, setForm, editingId, saving, confirm, setConfirm, resetForm,
    recompute, startEdit, submit, remove, money, formatQuantity, isCorporate, isMerger, isOpening, impliedCostPerShare
  } = useHoldingLedger({ holding, userId, onChanged })
  const ledgerForm = <form className="ui2-form ui2-asset-form" onSubmit={async event => {
    if (await submit(event)) setEditor(false)
  }}>
      <label>Event type<select value={form.type} disabled={isOpening} onChange={event =>
        setForm(previousForm => ({ ...previousForm, type: event.target.value as TransactionType }))}>
        {(isOpening ? ['opening'] : NEW_TYPES).map(type => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}
      </select></label>
      <label>Date<input type="date" required value={form.date} onChange={event => setForm(previousForm => ({ ...previousForm, date: event.target.value }))} /></label>
    {!isCorporate && !isMerger && <>
      {form.type !== 'dividend' && <>
        <label>Shares (not used for dividends)<DecimalInput value={form.quantity} onValueChange={quantity => recompute({ quantity })} /></label>
      </>}
      <label>Total amount · {currencySign}<DecimalInput value={form.amount} onValueChange={amount => setForm(previousForm => ({ ...previousForm, amount }))} /></label>
      {form.type !== 'dividend' && <label>Price / share ({currencySign}, optional)<DecimalInput value={form.price} onValueChange={price => recompute({ price })} /></label>}
      {impliedCostPerShare !== null && <p className="ui2-note ui2-form-full">Implied cost/share: {money(impliedCostPerShare)}</p>}
    </>}
    {isCorporate && <label>Ratio (new shares per old)<DecimalInput value={form.ratio} onValueChange={ratio => setForm(previousForm => ({ ...previousForm, ratio }))} /></label>}
    {isOpening && <label>Realised P&amp;L seed ({currencySign})<DecimalInput allowNegative value={form.realized}
      onValueChange={realized => setForm(previousForm => ({ ...previousForm, realized }))} /></label>}
    {isMerger && <p className="ui2-note ui2-form-full">Merger records an audit event. Record a sell and a buy for changes to the position.</p>}
    <label className="ui2-form-full">Notes<input value={form.notes} onChange={event => setForm(previousForm => ({ ...previousForm, notes: event.target.value }))} /></label>
    <p className="ui2-note ui2-form-full">A buy is the total debited and a sell the total credited, fees included.</p>
    {err && <p role="alert" className="ui2-form-error ui2-form-full">{err}</p>}
    <div className="ui2-dialog-actions ui2-form-full">
      <button type="button" className="ui2-btn" disabled={saving} onClick={() => { resetForm(); setConfirm(null); setEditor(false) }}>Cancel</button>
      {editingId && (confirm === editingId
        ? <>
            <button type="button" className="ui2-btn" disabled={saving} onClick={() => setConfirm(null)}>Keep event</button>
            <button type="button" className="ui2-btn ui2-btn-danger" disabled={saving} onClick={async () => {
              if (await remove(editingId)) { resetForm(); setEditor(false) }
            }}>Confirm delete</button>
          </>
        : <button type="button" className="ui2-btn ui2-btn-danger" disabled={saving} onClick={() => setConfirm(editingId)}>Delete event</button>)}
      <button className="ui2-btn ui2-btn-primary" disabled={saving}>Save event</button>
    </div>
  </form>
  const title = editor ? `${editingId ? 'Edit' : 'Add'} event · ${holding.script}` : 'Transaction ledger'
  // The list's actions live in a footer that never scrolls away: Close for
  // leaving, Add event for the one thing you do here. Only the events scroll.
  const footer = editor ? undefined : <>
    <p className="u2-ledger-footer-note">Opening balances are managed on the holding. These events belong to this holding.</p>
    <div className="u2-ledger-footer-actions">
      <button type="button" className="ui2-btn" disabled={saving} onClick={onClose}>Close</button>
      <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => { resetForm(); setEditor(true) }}>Add event</button>
    </div>
  </>
  return <Ui2Dialog key={editor ? 'editor' : 'list'} title={title} busy={saving} onClose={onClose}
    className="u2-ledger-dialog" footer={footer}>
    {!editor && err && <p role="alert" className="ui2-form-error">{err}</p>}
    {editor ? ledgerForm : <>
      <p className="u2-ledger-meta">
        <span>Holding: <strong>{holding.symbol || holding.script}</strong></span>
        <span>Currency: <strong>{holding.currency}</strong></span>
      </p>
      <div role="region" aria-label="Transaction events" tabIndex={0} className="u2-ledger-scroll">
        <table className="ui2-table ui2-ledger-table">
        <thead><tr>{['Date', 'Type', 'Shares', 'Amount', ''].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{transactions.toSorted((left, right) => (right.date || '').localeCompare(left.date || '')).map(transaction =>
          <tr key={transaction.id}>
            <td>{transaction.date ? formatDate(transaction.date) : '—'}</td><td>{(TYPE_LABEL[transaction.type || ''] || transaction.type)}</td>
            <td>{formatQuantity(transaction.quantity)}</td><td>{money(transaction.amount)}</td>
            <td><button className="ui2-btn" onClick={() => { startEdit(transaction); setEditor(true) }}
              aria-label={`Edit ${(TYPE_LABEL[transaction.type || ''] || transaction.type)} on ${transaction.date ? formatDate(transaction.date) : 'unknown date'}`}>Edit</button></td>
          </tr>)}</tbody>
        </table>
        {loading ? <p className="u2-ledger-empty">Loading…</p> : !err && !transactions.length && <p className="u2-ledger-empty">No transactions yet.</p>}
      </div>
    </>}
  </Ui2Dialog>
}
