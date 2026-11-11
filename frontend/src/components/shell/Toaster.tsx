import { useSyncExternalStore } from 'react'
import { currentToasts, dismissToast, subscribeToasts } from '../../lib/toast'
import { AlertTriangleIcon, CheckIcon } from '../Icon'

// Toaster renders the toast queue (lib/toast) as glass cards in the
// bottom-right corner. A polite live region, so screen readers announce
// each message without stealing focus.
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts)
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map(queued => (
        <div key={queued.id} className={`toast toast-${queued.tone}`}>
          <span className="toast-icon" aria-hidden>
            {queued.tone === 'error' ? <AlertTriangleIcon size={14} /> : <CheckIcon size={14} />}
          </span>
          <span className="toast-message">{queued.message}</span>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(queued.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
