import { useEffect, useRef, type RefObject } from 'react'

// Open dialogs in opening order. Only the last one (the one on top) handles
// keys, so a dialog stacked over another (History's conflict over paste)
// owns Tab and Escape until it closes.
const openDialogs: HTMLElement[] = []

// While any dialog is open the page behind it must not scroll. A trackpad
// two-finger scroll over the backdrop would otherwise move the page (and
// bounce it at its edges): overscroll-behavior only stops scroll chaining out
// of a dialog that itself overflows. The first dialog to open locks, the last
// one to close restores. A visible scrollbar's width is padded back so the
// page does not shift sideways when it disappears.
let restorePageScroll: (() => void) | null = null

function lockPageScroll() {
  if (restorePageScroll) return
  const root = document.documentElement
  const previousOverflow = root.style.overflow
  const previousPadding = document.body.style.paddingRight
  const scrollbar = root.clientWidth > 0 ? window.innerWidth - root.clientWidth : 0
  if (scrollbar > 0) {
    document.body.style.paddingRight = `calc(${getComputedStyle(document.body).paddingRight} + ${scrollbar}px)`
  }
  root.style.overflow = 'hidden'
  restorePageScroll = () => {
    root.style.overflow = previousOverflow
    document.body.style.paddingRight = previousPadding
    restorePageScroll = null
  }
}

/** Keep keyboard focus inside a modal and restore the invoking control; lock the page's scroll while it is open. */
export function useDialogFocus(root: RefObject<HTMLElement>, onClose: () => void, active = true, restoreFocusTo?: HTMLElement | null) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!active || !root.current) return
    const dialog = root.current
    openDialogs.push(dialog)
    lockPageScroll()
    const previous = restoreFocusTo ?? document.activeElement as HTMLElement | null
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter(element => !element.closest('[hidden]'))
    ;(controls()[0] ?? dialog).focus()
    const onKey = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== dialog) return
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
      openDialogs.splice(openDialogs.indexOf(dialog), 1)
      if (openDialogs.length === 0) restorePageScroll?.()
      if (previous?.isConnected) previous.focus()
    }
  }, [root, active, restoreFocusTo])
}
