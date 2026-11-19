// The UI_2.0 dividend CSV import (PD-059 slice 19). Upload, paste or load the
// header example, then validate — the handoff's asset-import dialog. Parsing,
// matching and server validation come from useDividendImport, shared with the
// Classic modal.
import type { DividendCurrency, Holding } from '../../types'
import { ImportCounts, InvalidLines } from '../../features/imports/ImportTables'
import NameConfirmDialog from '../../features/imports/NameConfirmDialog'
import { useDividendImport, openNames } from '../../features/dividends/useDividendImport'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import '../asset/asset.css'

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

export function Ui2DividendImport({ currency, holdings, userId, onClose, onImported }: Props) {
  const ctrl = useDividendImport(currency, holdings, userId)

  // × / Escape / backdrop on the result step must refresh the page, same as
  // the Classic modal's useDialogFocus handler.
  const handleClose = () => {
    if (ctrl.step === 'result') onImported()
    onClose()
  }

  if (ctrl.step === 'names' && ctrl.preview) {
    return (
      <NameConfirmDialog
        names={openNames(ctrl.preview, ctrl.answers)}
        holdings={ctrl.inTab}
        heading="Confirm share names"
        context={ctrl.label}
        intro="These names in your sheet don't exactly match a holding. Choose the holding each one means. Your answers are remembered for next time."
        onBack={() => ctrl.setStep('pick')}
        onConfirm={ctrl.confirmNames}
      />
    )
  }

  const title = ctrl.step === 'result' ? 'Import complete'
    : ctrl.step === 'preview' ? 'Preview import'
    : `Upload dividend CSV · ${currency}`

  return (
    <Ui2Dialog title={title} onClose={handleClose} busy={ctrl.busy}>
      <div className="asset-import">
        {ctrl.err && <p className="asset-error" role="alert">{ctrl.err}</p>}

        {ctrl.step === 'pick' && (
          <>
            <p className="asset-note">
              Date,Share Name,Dividend,CUMULATIVE · cumulative is optional.
              Match holdings within {ctrl.label}. Dates read as DD/MM/YYYY.
            </p>
            <div className="asset-toolbar" style={{ marginTop: 20 }}>
              <input
                type="file"
                accept=".csv,text/csv"
                aria-label="Dividend CSV file"
                onChange={event => void ctrl.loadFile(event.target.files?.[0])}
              />
              <button type="button" className="ui2-btn" onClick={ctrl.loadExample}>Load example</button>
            </div>
            <textarea
              aria-label="Dividend CSV contents"
              placeholder="Paste your dividend CSV"
              value={ctrl.text}
              onChange={event => ctrl.setText(event.target.value)}
            />
            <div className="ui2-dialog-actions">
              <button type="button" className="ui2-btn" onClick={handleClose}>Cancel</button>
              <button
                type="button"
                className="ui2-btn ui2-btn-primary"
                disabled={ctrl.busy || ctrl.text.trim() === ''}
                onClick={() => void ctrl.validate()}
              >
                {ctrl.busy ? 'Validating…' : 'Validate and preview'}
              </button>
            </div>
          </>
        )}

        {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
          <>
            <ImportCounts
              total={ctrl.counts.total}
              counts={[
                ['Ready to import', ctrl.counts.ready],
                ['Already exists', ctrl.counts.duplicate],
                ['Invalid', ctrl.counts.invalid],
              ]}
            />
            <InvalidLines lines={ctrl.invalidLines} />
            {ctrl.preview.warnings.map(warning => (
              <p key={warning.line} className="asset-note" role="alert">
                ⚠ Line {warning.line}: {warning.message}. Import is still allowed.
              </p>
            ))}
            <div className="ui2-dialog-actions">
              {Object.keys(ctrl.answers).length > 0 && (
                <button type="button" className="ui2-btn" onClick={ctrl.changeNames}>Change names</button>
              )}
              <button type="button" className="ui2-btn" onClick={() => ctrl.setStep('pick')}>Edit the sheet</button>
              <button
                type="button"
                className="ui2-btn ui2-btn-primary"
                disabled={ctrl.busy || ctrl.counts.invalid > 0}
                onClick={ctrl.confirm}
              >
                {ctrl.busy ? 'Importing…' : 'Confirm import'}
              </button>
            </div>
          </>
        )}

        {ctrl.step === 'result' && ctrl.result && (
          <>
            <p role="status"><strong>{ctrl.result.imported} imported</strong> into {ctrl.label}.</p>
            {ctrl.result.duplicates.length > 0 && (
              <p className="asset-note">
                ⚠ {ctrl.result.duplicates.length} duplicate
                {ctrl.result.duplicates.length === 1 ? '' : 's'} discarded — already saved.
              </p>
            )}
            <div className="ui2-dialog-actions">
              <button
                type="button"
                className="ui2-btn ui2-btn-primary"
                onClick={() => { onImported(); onClose() }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Ui2Dialog>
  )
}
