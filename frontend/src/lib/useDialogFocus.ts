import { useEffect, useRef, type RefObject } from 'react'

/** Keep keyboard focus inside a modal and restore the invoking control. */
export function useDialogFocus(root: RefObject<HTMLElement>, onClose: () => void, active = true, restoreFocusTo?: HTMLElement | null) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active || !root.current) return
    const dialog = root.current
    const previous = restoreFocusTo ?? document.activeElement as HTMLElement | null
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter(element => !element.closest('[hidden]'))
    ;(controls()[0] ?? dialog).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = controls()
      const first = elements[0], last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [root, active, restoreFocusTo])
}
