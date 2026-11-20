import { useRef } from 'react'
import { formatDate } from '../../lib/formDates'
import { formatMoney } from '../../lib/currency'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useUiMode } from '../../lib/uiMode'
import { Ui2DividendImport } from '../../ui2/dividends/Ui2DividendImport'
import type { DividendCurrency, Holding } from '../../types'
import { modalBackdrop, modalCard, td, th } from '../history/historyShared'
import { ImportCounts, InvalidLines } from '../imports/ImportTables'
import NameConfirmDialog from '../imports/NameConfirmDialog'
import { useDividendImport, openNames } from './useDividendImport'

interface Props {
  currency: DividendCurrency
  holdings: Holding[]
  userId?: string
  onClose: () => void
  onImported: () => void
}

// Pure dispatcher — only useUiMode() lives here so the hook count is stable
// if the account's UI mode changes while the modal is open.
export default function DividendImportModal(props: Props) {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) {
    return (
      <Ui2DividendImport
        currency={props.currency}
        holdings={props.holdings}
        userId={props.userId}
        onClose={props.onClose}
        onImported={props.onImported}
      />
    )
  }
  return <ClassicDividendImportModal {...props} />
}

function ClassicDividendImportModal({ currency, holdings, userId, onClose, onImported }: Props) {
  const ctrl = useDividendImport(currency, holdings, userId)
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

  return (
    <div style={modalBackdrop} role="dialog" aria-modal="true" aria-label="Import dividends">
      <div ref={root} tabIndex={-1} style={{ ...modalCard, width: 'min(720px, 100%)', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>{ctrl.step === 'result' ? 'Import complete' : ctrl.step === 'preview' ? 'Preview import' : 'Import dividends'}</h2>
        <p style={{ margin: 0, padding: '8px 12px', border: '1px solid var(--blue)', background: 'var(--blue-dim)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
          Importing into <strong>{ctrl.label}</strong> · dates read as <strong>DD/MM/YYYY</strong> (1/2/2020 = 1 Feb 2020){ctrl.fileName && ` · ${ctrl.fileName}`}
        </p>
        {ctrl.err && <p role="alert" style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{ctrl.err}</p>}

        {ctrl.step === 'pick' && (
          <>
            <label htmlFor="dividend-csv" className="btn" style={{ alignSelf: 'flex-start' }}>Choose a .csv file</label>
            <input id="dividend-csv" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => void ctrl.pick(e.target.files?.[0])} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Expected header (any order, any case; CUMULATIVE optional): <code>Date,Share Name,Dividend,CUMULATIVE</code>. Nothing is saved until you confirm.</p>
            {ctrl.busy && <div className="spinner" style={{ width: 14, height: 14 }} />}
          </>
        )}

        {ctrl.step === 'preview' && ctrl.counts && ctrl.preview && (
          <>
            <ImportCounts total={ctrl.counts.total}
              counts={[['Ready to import', ctrl.counts.ready], ['Already exists', ctrl.counts.duplicate], ['Invalid', ctrl.counts.invalid]]} />
            <InvalidLines lines={ctrl.invalidLines} />
            {ctrl.preview.warnings.map(warning => (
              <p key={warning.line} style={{ color: 'var(--yellow)', fontSize: 12, margin: 0 }}>⚠ Line {warning.line}: {warning.message}. Import is still allowed.</p>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {Object.keys(ctrl.answers).length > 0 && <button className="btn" onClick={ctrl.changeNames}>Change names</button>}
              <button className="btn" onClick={() => ctrl.setStep('pick')}>Choose another file</button>
              <button className="btn-primary" disabled={ctrl.counts.invalid > 0 || ctrl.busy} onClick={ctrl.confirm}>Confirm import</button>
            </div>
          </>
        )}

        {ctrl.step === 'result' && ctrl.result && (
          <>
            <p style={{ color: 'var(--green)', margin: 0 }}><strong>{ctrl.result.imported} imported</strong> into {ctrl.label}.</p>
            {ctrl.result.duplicates.length > 0 && (
              <>
                <p role="status" style={{ color: 'var(--yellow)', margin: 0 }}>⚠ <strong>{ctrl.result.duplicates.length} duplicates are discarded</strong> — already saved.</p>
                <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th scope="col" style={th}>Line</th><th scope="col" style={th}>Date</th><th scope="col" style={th}>Share</th><th scope="col" style={{ ...th, textAlign: 'right' }}>Dividend</th></tr></thead>
                  <tbody>{ctrl.result.duplicates.map(duplicate => (
                    <tr key={duplicate.line}><td style={td}>{duplicate.line}</td><td style={td}>{formatDate(duplicate.date)}</td><td style={td}>{duplicate.share_name}</td><td style={{ ...td, textAlign: 'right' }}>{formatMoney(duplicate.amount, currency)}</td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
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
