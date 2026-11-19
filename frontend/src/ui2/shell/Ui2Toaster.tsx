// The handoff's toast (#toast): one message centred at the bottom of the
// screen. It renders the app's toast queue (lib/toast), so toast() works
// the same in every interface; UI_2.0 shows the newest message. A polite
// live region announces it without moving focus.
import { useSyncExternalStore } from 'react'
import { currentToasts, subscribeToasts } from '../../lib/toast'
import '../primitives.css'

export function Ui2Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, currentToasts, currentToasts)
  const newest = toasts.at(-1)
  return (
    <div role="status" aria-live="polite">
      {newest && <div key={newest.id} className="ui2-toast">{newest.message}</div>}
    </div>
  )
}
