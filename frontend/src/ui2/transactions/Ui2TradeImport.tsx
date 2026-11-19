import { useState } from 'react'
import type { Holding } from '../../types'
import { ImportCounts, InvalidLines } from '../../features/imports/ImportTables'
import NameConfirmDialog from '../../features/imports/NameConfirmDialog'
import { TRADE_CSV_EXAMPLE_HEADER } from '../../features/transactions/tradeCsv'
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
  const [csvText, setCsvText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const previewStatusByLine = new Map<number, string>(ctrl.preview?.rows.map(row => [row.line, row.status] as const) ?? [])
  const visiblePreviewRows = ctrl.rows.filter(row => {
    const status = previewStatusByLine.get(row.line)
    return status === 'ready' || status === 'replace' || status === 'covered'
  }).slice(0, 20)

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

  return (
    <Ui2Dialog title="Import transactions" onClose={handleClose} busy={ctrl.busy}>
      <p className="ui2-note">
        Buys and sells into <strong>₹ INR</strong> holdings · dates read as <strong>DD/MM/YYYY</strong>
        {ctrl.fileName && ` · ${ctrl.fileName}`}
      </p>
      {ctrl.error && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{ctrl.error}</p>}

      {ctrl.step === 'pick' && (
        <div>
          <p className="ui2-note">Upload a Groww trade export or paste its CSV contents. Review the matches before importing.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0' }}>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="Choose CSV file"
              onChange={event => {
                const file = event.target.files?.[0]
                if (!file) return
                setSourceName('')
                void ctrl.readFile(file).then(text => {
                  if (text !== null) {
                    setCsvText(text)
                    setSourceName(file.name)
                  }
                })
                event.currentTarget.value = ''
              }}
            />
            <button type="button" className="ui2-btn" onClick={() => {
              setCsvText(TRADE_CSV_EXAMPLE_HEADER)
              setSourceName('')
            }}>Load example</button>
          </div>
          <textarea
            aria-label="CSV contents"
            placeholder="Paste CSV contents here"
            value={csvText}
            onChange={event => { setCsvText(event.target.value); setSourceName('') }}
            style={{ width: '100%', height: 170, border: '1px solid var(--u2-border)', borderRadius: 8,
              padding: 12, background: 'var(--u2-bg)', color: 'var(--u2-text)', resize: 'vertical' }}
          />
          <p className="ui2-note">
            Required columns: Symbol, Type, Quantity, Value, Exchange, Execution date and time. Load example fills the header only; add your own rows. Maximum 5,000 rows.
          </p>
          {ctrl.busy && <p className="ui2-note" aria-live="polite">Validating…</p>}
          <div className="ui2-dialog-actions">
            <button type="button" className="ui2-btn" onClick={handleClose}>Cancel</button>
            <button type="button" className="ui2-btn ui2-btn-primary" disabled={!csvText.trim() || ctrl.busy}
              onClick={() => void ctrl.validateText(csvText, sourceName)}>
              Validate CSV
            </button>
          </div>
        </div>
      )}

      {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
        <div>
          <ImportCounts
            total={ctrl.counts.total + ctrl.localErrors.length + ctrl.skipped.length}
            counts={[
              ['Ready to import', ctrl.counts.ready],
              ['Replaces an identical trade', ctrl.counts.replace],
              ['Covered by the opening balance', ctrl.counts.covered],
              ['Skipped', ctrl.skipped.length],
              ['Invalid', ctrl.counts.invalid],
            ]}
          />
          <InvalidLines lines={ctrl.invalidLines} />
          {visiblePreviewRows.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 16 }}>
              <table className="ui2-table" aria-label="Trade preview">
                <thead><tr><th scope="col">Date</th><th scope="col">Symbol</th><th scope="col">Type</th><th scope="col">Shares</th><th scope="col">Amount</th></tr></thead>
                <tbody>
                  {visiblePreviewRows.map((row, index) => (
                    <tr key={`${row.line}-${index}`}>
                      <td>{row.date}</td><td>{row.symbol}</td><td>{row.type}</td>
                      <td>{row.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</td>
                      <td>₹{row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
