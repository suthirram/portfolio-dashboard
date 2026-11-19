// The trades CSV import (PD-051): choose a broker export → confirm unknown
// symbols (map, create or leave) → preview → one atomic commit. Built from
// the dividend import's shared pieces (features/imports).
import { useUiMode } from '../../lib/uiMode'
import { Ui2TradeImport } from '../../ui2/transactions/Ui2TradeImport'
import { useRef } from 'react'
import { useDialogFocus } from '../../lib/useDialogFocus'
import type { Holding } from '../../types'
import { modalBackdrop, modalCard } from '../history/historyShared'
import { ImportCounts, InvalidLines } from '../imports/ImportTables'
import NameConfirmDialog from '../imports/NameConfirmDialog'
import { useTradeImport, pendingNames } from './useTradeImport'

interface Props {
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

// Pure dispatcher — only useUiMode() lives here so the hook count is stable
// if the account's UI mode changes while the modal is open.
export default function TradeImportModal(props: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2TradeImport holdings={props.holdings} userId={props.userId} onClose={props.onClose} onImported={props.onImported} />
  return <ClassicTradeImportModal {...props} />
}

function ClassicTradeImportModal({ holdings, userId, onClose, onImported }: Props) {
  const ctrl = useTradeImport(holdings, userId)
  const root = useRef<HTMLDivElement>(null)
  // Escape on the result step behaves like Done so the page refreshes. The
  // names step renders its own dialog, which owns the keys meanwhile.
  useDialogFocus(root, () => {
    if (ctrl.busy) return
    if (ctrl.step === 'result') onImported()
    onClose()
  }, ctrl.step !== 'names' || !ctrl.preview)

  if (ctrl.step === 'names' && ctrl.preview) {
    return (
      <NameConfirmDialog
        names={pendingNames(ctrl.preview, ctrl.answers, ctrl.created)}
        holdings={ctrl.inrHoldings}
        heading="Confirm symbols"
        intro="These symbols don't match a holding. Choose the holding each one means, or create a new one. Your answers are remembered for next time."
        createLabel={symbol => `Create a new holding ${symbol}`}
        onBack={() => ctrl.setStep('pick')}
        onConfirm={(confirmed, newHoldings) => {
          const nextAnswers = { ...ctrl.answers, ...confirmed }
          const nextCreated = [...ctrl.created, ...newHoldings]
          ctrl.setAnswers(nextAnswers)
          ctrl.setCreated(nextCreated)
          void ctrl.runPreview(ctrl.rows, nextAnswers, nextCreated)
        }}
      />
    )
  }

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import trades">
      <div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>
          {ctrl.step === 'result' ? 'Import complete' : ctrl.step === 'preview' ? 'Preview import' : 'Import trades'}
        </h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Buys and sells into <strong>₹ INR</strong> holdings · dates read as <strong>DD/MM/YYYY</strong> (1/11/2024 = 1 Nov 2024), a time like 03:30 PM is optional{ctrl.fileName && ` · ${ctrl.fileName}`}
        </p>
        {ctrl.error && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{ctrl.error}</p>}

        {ctrl.step === 'pick' && (
          <>
            <label htmlFor="trades-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="trades-csv" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" style={{ display: 'none' }} onChange={e => void ctrl.pick(e.target.files![0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              A broker order history with the columns <code>Stock name, Symbol, ISIN, Type, Quantity, Value, Exchange, Execution date and time, Order status</code> (comma- or tab-separated). Nothing is saved until you confirm.
            </p>
            {ctrl.busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
          <>
            <ImportCounts
              total={ctrl.counts.total + ctrl.localErrors.length}
              counts={[
                ['Ready to import', ctrl.counts.ready],
                ['Replaces an identical trade', ctrl.counts.replace],
                ['Covered by the opening balance', ctrl.counts.covered],
                ['Invalid', ctrl.counts.invalid],
              ]}
            />
            {ctrl.counts.replace > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>A row with the same holding, day, type, quantity and value as a saved trade replaces it — nothing is duplicated.</p>}
            {ctrl.counts.covered > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Rows on or before a holding&apos;s opening date are already in its opening balance and are not imported.</p>}
            {ctrl.skipped.length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{ctrl.skipped.length} rows skipped: the order did not execute.</p>}
            <InvalidLines lines={ctrl.invalidLines} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {(Object.keys(ctrl.answers).length > 0 || ctrl.created.length > 0) && (
                <button className="btn" onClick={() => { ctrl.setAnswers({}); ctrl.setCreated([]); void ctrl.runPreview(ctrl.rows, {}, []) }}>Change symbols</button>
              )}
              <button className="btn" onClick={() => ctrl.setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={ctrl.counts.invalid > 0 || ctrl.counts.ready + ctrl.counts.replace === 0 || ctrl.busy} onClick={ctrl.confirm}>Confirm import</button>
            </div>
          </>
        )}

        {ctrl.step === 'result' && ctrl.result && (
          <>
            <p role="status" style={{ color: 'var(--green)', margin: 0 }}>
              <strong>{ctrl.result.imported} imported</strong> · {ctrl.result.replaced} replaced · {ctrl.result.covered} covered by an opening balance
              {ctrl.result.created_holdings > 0 && ` · ${ctrl.result.created_holdings} new holdings`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => { onImported(); onClose() }}>Done</button>
            </div>
          </>
        )}

        {ctrl.step !== 'result' && (
          <div>
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}
