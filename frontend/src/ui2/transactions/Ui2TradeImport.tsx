import type { Holding } from '../../types'
import { ImportCounts, InvalidLines } from '../../features/imports/ImportTables'
import NameConfirmDialog from '../../features/imports/NameConfirmDialog'
import { useTradeImport, pendingNames } from '../../features/transactions/useTradeImport'
import { Ui2Dialog } from '../shell/Ui2Dialog'

interface Props {
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

export function Ui2TradeImport({ holdings, userId, onClose, onImported }: Props) {
  const ctrl = useTradeImport(holdings, userId)

  // Escape / × / backdrop on the result step must refresh the page, same as
  // the Classic modal's useDialogFocus escape handler (PD-059 §4).
  const handleClose = () => {
    if (ctrl.step === 'result') onImported()
    onClose()
  }

  if (ctrl.step === 'names' && ctrl.preview) {
    return (
      <NameConfirmDialog
        names={pendingNames(ctrl.preview, ctrl.answers, ctrl.created)}
        holdings={ctrl.inrHoldings}
        heading="Confirm symbols"
        intro="These symbols don't match a holding. Choose the holding each one means, or create a new one."
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

  const title = ctrl.step === 'preview' ? 'Preview import' : ctrl.step === 'result' ? 'Import complete' : 'Import transactions'

  return (
    <Ui2Dialog title={title} onClose={handleClose} busy={ctrl.busy}>
      <p className="ui2-note">
        Buys and sells into <strong>₹ INR</strong> holdings · dates read as <strong>DD/MM/YYYY</strong>
        {ctrl.fileName && ` · ${ctrl.fileName}`}
      </p>
      {ctrl.error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{ctrl.error}</p>}

      {ctrl.step === 'pick' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0' }}>
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              aria-label="Choose CSV file"
              onChange={event => { const file = event.target.files?.[0]; if (file) void ctrl.pick(file) }}
            />
          </div>
          {ctrl.busy && <p className="ui2-note" aria-live="polite">Validating…</p>}
          <p className="ui2-note">
            Required columns: Symbol, Type, Quantity, Value, Exchange, Execution date and time.
          </p>
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={handleClose}>Cancel</button>
          </div>
        </div>
      )}

      {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
        <div>
          <ImportCounts
            total={ctrl.counts.total + ctrl.localErrors.length}
            counts={[
              ['Ready to import', ctrl.counts.ready],
              ['Replaces an identical trade', ctrl.counts.replace],
              ['Covered by the opening balance', ctrl.counts.covered],
              ['Invalid', ctrl.counts.invalid],
            ]}
          />
          <InvalidLines lines={ctrl.invalidLines} />
          {ctrl.preview.warnings.map((warning, index) => (
            <p key={index} className="ui2-note" role="alert">{warning.message}</p>
          ))}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={() => ctrl.setStep('pick')}>Choose another file</button>
            <button
              type="button"
              className="ui2-btn ui2-btn-primary"
              disabled={ctrl.busy || ctrl.counts.invalid > 0 || ctrl.counts.ready + ctrl.counts.replace === 0}
              onClick={ctrl.confirm}
            >
              {ctrl.busy ? 'Importing…' : 'Confirm import'}
            </button>
          </div>
        </div>
      )}

      {ctrl.step === 'result' && ctrl.result && (
        <div>
          <p role="status">
            <strong>{ctrl.result.imported} imported</strong> · {ctrl.result.replaced} replaced · {ctrl.result.covered} covered by an opening balance
            {ctrl.result.created_holdings > 0 && ` · ${ctrl.result.created_holdings} new holdings`}
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
