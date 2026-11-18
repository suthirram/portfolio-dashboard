import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeName } from '../../lib/useTheme'
import { useCyberEntrance } from './useCyberEntrance'

class MotionQuery extends EventTarget {
  matches = false
  change(matches: boolean) {
    this.matches = matches
    this.dispatchEvent(new Event('change'))
  }
}

let motion: MotionQuery
const clicked = vi.fn()
function Preview({ theme = 'cyberpunk', premium = true, route = '/' }: {
  theme?: ThemeName; premium?: boolean; route?: string
}) {
  const shellRef = useCyberEntrance(theme, premium)
  return <div ref={shellRef} data-testid="shell">
    <button onClick={clicked}>Refresh</button><span>{route}</span>
  </div>
}
const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds))
const playing = () => screen.getByTestId('shell').hasAttribute('data-cyber-entrance')

beforeEach(() => {
  vi.useFakeTimers()
  clicked.mockClear()
  motion = new MotionQuery()
  vi.stubGlobal('matchMedia', vi.fn(() => motion))
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCyberEntrance', () => {
  it('plays on Cyber load and removes the marker after the reference duration', () => {
    render(<Preview />)
    advance(50)
    expect(playing()).toBe(true)
    advance(1600)
    expect(playing()).toBe(false)
  })

  it('keeps controls usable before and during the entrance', () => {
    render(<Preview />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    advance(50)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(clicked).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it.each<ThemeName>(['light', 'dark'])('does not play in %s', theme => {
    render(<Preview theme={theme} />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('does not play for a non-premium account even with a stored Cyber theme', () => {
    render(<Preview premium={false} />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('plays when entering Cyber, cancels on exit and replays on re-entry', () => {
    const { rerender } = render(<Preview theme="light" />)
    rerender(<Preview theme="cyberpunk" />)
    advance(50)
    expect(playing()).toBe(true)
    rerender(<Preview theme="dark" />)
    expect(playing()).toBe(false)
    rerender(<Preview theme="cyberpunk" />)
    advance(50)
    expect(playing()).toBe(true)
  })

  it('does not replay on a route render', () => {
    const { rerender } = render(<Preview />)
    advance(1700)
    rerender(<Preview route="/history" />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('skips reduced motion and cancels immediately when the preference changes', () => {
    motion.matches = true
    const { unmount } = render(<Preview />)
    advance(50)
    expect(playing()).toBe(false)
    unmount()
    motion.matches = false
    render(<Preview />)
    advance(50)
    expect(playing()).toBe(true)
    act(() => motion.change(true))
    expect(playing()).toBe(false)
    act(() => motion.change(false))
    advance(50)
    expect(playing()).toBe(false)
  })

  it('cancels when Premium is revoked', () => {
    const { rerender } = render(<Preview />)
    advance(50)
    rerender(<Preview premium={false} />)
    expect(playing()).toBe(false)
  })

  it('cancels queued frames when leaving Cyber before the entrance starts', () => {
    const { rerender } = render(<Preview />)
    rerender(<Preview theme="dark" />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('cleans up on unmount, including StrictMode effect replay', () => {
    const { unmount } = render(<StrictMode><Preview /></StrictMode>)
    advance(50)
    const shell = screen.getByTestId('shell')
    expect(playing()).toBe(true)
    unmount()
    advance(1700)
    expect(shell).not.toHaveAttribute('data-cyber-entrance')
    expect(vi.getTimerCount()).toBe(0)
  })
})
