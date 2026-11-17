import { useEffect, useRef, type RefObject } from 'react'

/** Close an open popup (menu, picker) on Escape or a press outside root.
 * root wraps both the trigger and the popup, so pressing the trigger is an
 * inside press and its own toggle decides. */
export function useLightDismiss(root: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) close.current()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current() }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [root, open])
}
