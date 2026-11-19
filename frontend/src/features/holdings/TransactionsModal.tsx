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
