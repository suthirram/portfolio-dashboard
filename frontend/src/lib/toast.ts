import { isUiV2 } from './uiMode'

// A tiny toast store for the glass UI (PD-054): toast() queues a message,
// the shell's <Toaster> renders the queue, and each toast leaves on its own
// after TOAST_MS. notify() is the drop-in for window.alert: a toast in the
// glass UI, the browser alert everywhere else, so the current UI is unchanged.

export type ToastTone = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  tone: ToastTone
}

export const TOAST_MS = 4500

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function dismissToast(id: number) {
  toasts = toasts.filter(queued => queued.id !== id)
  emit()
}

export function toast(message: string, tone: ToastTone = 'info'): number {
  const id = nextId++
  toasts = [...toasts, { id, message, tone }]
  emit()
  setTimeout(() => dismissToast(id), TOAST_MS)
  return id
}

export function notify(message: string, tone: ToastTone = 'error') {
  if (isUiV2()) toast(message, tone)
  else window.alert(message)
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function currentToasts(): Toast[] {
  return toasts
}

// Test-only: empties the queue between cases.
export function __resetToastsForTests() {
  toasts = []
  emit()
}
