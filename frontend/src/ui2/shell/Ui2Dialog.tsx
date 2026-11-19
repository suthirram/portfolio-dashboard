// The handoff's dialog (#details): a blurred backdrop, a rounded panel, a
// heading with a × close. Focus is trapped and restored, and Escape closes,
// through the app's useDialogFocus policy; a click on the backdrop closes
// like the handoff's closedby="any". `wide` fits chart content. It renders
// into document.body: inside .ui2-main (its own stacking context) the sidebar
// would sit above the backdrop, unlike the handoff's top-layer dialog.
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../../lib/useDialogFocus'
import '../primitives.css'

export function Ui2Dialog({ title, onClose, children, wide = false, busy = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  // While a save runs, Escape, × and the backdrop do not close.
  busy?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = () => { if (!busy) onClose() }
  useDialogFocus(root, close)
  return createPortal(
    <div className="ui2-dialog-backdrop" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={wide ? 'ui2-dialog ui2-dialog-wide' : 'ui2-dialog'}>
        <div className="ui2-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ui2-dialog-close" aria-label={`Close ${title}`} onClick={close} disabled={busy}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
