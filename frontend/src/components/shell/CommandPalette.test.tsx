import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette, matchCommands, type Command } from './CommandPalette'

const commands = (runs: Record<string, () => void> = {}): Command[] => [
  { id: 'history', group: 'Go to', label: 'History', keywords: 'snapshots', run: runs.history ?? vi.fn() },
  { id: 'txns', group: 'Go to', label: 'Transactions', keywords: 'ledger trades', run: runs.txns ?? vi.fn() },
  { id: 'dark', group: 'Theme', label: 'Dark theme', run: runs.dark ?? vi.fn() },
]

describe('matchCommands', () => {
  it('needs every word to match the label, group or keywords', () => {
    expect(matchCommands(commands(), '').map(command => command.id)).toEqual(['history', 'txns', 'dark'])
    expect(matchCommands(commands(), 'ledger').map(command => command.id)).toEqual(['txns'])
    expect(matchCommands(commands(), 'go hist').map(command => command.id)).toEqual(['history'])
    expect(matchCommands(commands(), 'theme gold')).toEqual([])
  })
})

describe('CommandPalette', () => {
  it('filters as you type and runs the highlighted command on Enter', async () => {
    const txns = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={commands({ txns })} />)
    const input = screen.getByRole('combobox', { name: 'Search commands' })
    expect(input).toHaveFocus()

    await userEvent.type(input, 'trades{Enter}')
    expect(txns).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('moves the highlight with the arrow keys', async () => {
    const dark = vi.fn()
    render(<CommandPalette open onClose={vi.fn()} commands={commands({ dark })} />)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(screen.getByRole('option', { name: /Dark theme/ })).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Enter}')
    expect(dark).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and says when nothing matches', async () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} commands={commands()} />)
    await userEvent.type(screen.getByRole('combobox'), 'zzz')
    expect(screen.getByText('No matching command')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing while closed', () => {
    render(<CommandPalette open={false} onClose={vi.fn()} commands={commands()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
