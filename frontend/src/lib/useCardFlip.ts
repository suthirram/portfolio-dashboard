import { useEffect, useRef, useState } from 'react'

// The dashboard's card flip: the card turns edge-on (card-flipping-out),
// onFlip swaps what it shows while it is invisible, then it turns back
// (card-flipping-in). Clicks during a flip are ignored. Shared by the
// summary cards and the glass hero's Unrealised chip.

export const FLIP_PHASE_MS = 180

export function useCardFlip(onFlip: () => void): { flipClass: string; flip: () => void } {
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const busy = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const flip = () => {
    if (busy.current) return
    busy.current = true
    setPhase('out')
    timers.current.push(setTimeout(() => {
      onFlip()
      setPhase('in')
      timers.current.push(setTimeout(() => {
        setPhase('idle')
        busy.current = false
      }, FLIP_PHASE_MS))
    }, FLIP_PHASE_MS))
  }

  const flipClass = phase === 'out' ? 'card-flipping-out' : phase === 'in' ? 'card-flipping-in' : ''
  return { flipClass, flip }
}
