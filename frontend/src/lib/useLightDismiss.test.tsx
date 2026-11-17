import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useLightDismiss } from './useLightDismiss'

function Popup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  useLightDismiss(root, open, onClose)
  return <><div ref={root}><button type="button">inside</button></div><button type="button">outside</button></>
}

describe('useLightDismiss', () => {
  it('closes an open popup on Escape and on a press outside', () => {
    const onClose = vi.fn()
    render(<Popup open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores presses inside and does nothing while closed', () => {
    const onClose = vi.fn()
    const { rerender } = render(<Popup open onClose={onClose} />)
    fireEvent.mouseDown(screen.getByText('inside'))
    rerender(<Popup open={false} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
