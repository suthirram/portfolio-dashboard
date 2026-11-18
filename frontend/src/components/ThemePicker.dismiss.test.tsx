// The inline theme picker closes on Escape (PD-058 Task 11).
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ThemePicker from './ThemePicker'

describe('ThemePicker inline dismissal', () => {
  it('closes the open options on Escape', () => {
    render(<ThemePicker variant="inline" theme="dark" onSelect={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Theme:/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
