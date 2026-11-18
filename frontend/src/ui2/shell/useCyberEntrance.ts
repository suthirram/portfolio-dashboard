import { useEffect, useRef } from 'react'
import type { ThemeName } from '../../lib/useTheme'

// One entrance per Cyber activation in this mounted shell. Route renders
// leave it alone; theme changes, entitlement changes and unmount cancel it.
export function useCyberEntrance(theme: ThemeName, premium: boolean) {
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell || theme !== 'cyberpunk' || !premium || !window.matchMedia) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let firstFrame = 0
    let secondFrame = 0
    let timer = 0

    const stop = () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(timer)
      shell.removeAttribute('data-cyber-entrance')
    }
    const onMotionChange = () => { if (motion.matches) stop() }
    motion.addEventListener('change', onMotionChange)

    // Match the reference's two-frame restart without forcing layout.
    // The shell and its controls render immediately, before this effect.
    if (!motion.matches) {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (motion.matches) return
          shell.setAttribute('data-cyber-entrance', 'true')
          timer = window.setTimeout(stop, 1600)
        })
      })
    }

    return () => {
      motion.removeEventListener('change', onMotionChange)
      stop()
    }
  }, [theme, premium])

  return shellRef
}
