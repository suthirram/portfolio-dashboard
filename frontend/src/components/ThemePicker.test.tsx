import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ThemePicker from './ThemePicker'

describe('ThemePicker', () => {
  it('selects a theme directly with one click', () => {
    const onSelect = vi.fn()
    render(<ThemePicker theme="dark" premium onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '⚡ Cyber' }))
    expect(onSelect).toHaveBeenCalledWith('cyberpunk')
    fireEvent.click(screen.getByRole('button', { name: '☀ Light' }))
    expect(onSelect).toHaveBeenCalledWith('light')
  })

  it('marks the active theme as pressed', () => {
    render(<ThemePicker theme="light" premium onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '☀ Light' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '🌙 Dark' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides the Cyber option from non-premium accounts', () => {
    render(<ThemePicker theme="dark" premium={false} onSelect={() => {}} />)
    expect(screen.queryByRole('button', { name: '⚡ Cyber' })).toBeNull()
    expect(screen.getAllByRole('button').length).toBe(2)
  })
})
