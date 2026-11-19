import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useDialogFocus } from './useDialogFocus'

function Dialog({ name, onClose }: { name: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useDialogFocus(root, onClose)
  return (
    <div ref={root} tabIndex={-1} data-testid={name}>
      <button type="button">{name} first</button>
      <button type="button">{name} last</button>
    </div>
  )
}

describe('useDialogFocus', () => {
  it('lets only the dialog on top handle Escape and Tab when two are open', () => {
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    render(<><Dialog name="bottom" onClose={closeBottom} /><Dialog name="top" onClose={closeTop} /></>)

    expect(screen.getByText('top first')).toHaveFocus()
    screen.getByText('top last').focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.getByText('top first')).toHaveFocus()

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(closeBottom).not.toHaveBeenCalled()
  })

  it('locks the page scroll while a dialog is open and restores it when the last one closes', () => {
    document.documentElement.style.overflow = 'scroll'
    const { rerender, unmount } = render(<Dialog name="bottom" onClose={() => {}} />)
    expect(document.documentElement.style.overflow).toBe('hidden')
    // A second dialog over the first keeps it locked, and closing it does not unlock.
    rerender(<><Dialog name="bottom" onClose={() => {}} /><Dialog name="top" onClose={() => {}} /></>)
    rerender(<Dialog name="bottom" onClose={() => {}} />)
    expect(document.documentElement.style.overflow).toBe('hidden')
    unmount()
    // The page's own value comes back, not a blanket reset.
    expect(document.documentElement.style.overflow).toBe('scroll')
    document.documentElement.style.overflow = ''
  })

  it('hands the keys back to the lower dialog once the top one closes', () => {
    const closeBottom = vi.fn()
    const { rerender } = render(<><Dialog name="bottom" onClose={closeBottom} /><Dialog name="top" onClose={() => {}} /></>)
    rerender(<Dialog name="bottom" onClose={closeBottom} />)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(closeBottom).toHaveBeenCalledTimes(1)
  })
})
