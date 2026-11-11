import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SearchIcon } from '../Icon'

// The glass UI's command palette (PD-054): ⌘K / Ctrl+K opens it from any
// page, typing filters the commands (every word must match the label or a
// keyword), arrows move, Enter runs, Escape closes. It follows the ARIA
// combobox + listbox pattern so the active option is announced.

export interface Command {
  id: string
  label: string
  group: string
  keywords?: string
  hint?: string
  run: () => void
}

export function matchCommands(commands: Command[], query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return commands
  return commands.filter(command => {
    const haystack = `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase()
    return words.every(word => haystack.includes(word))
  })
}

export function CommandPalette({ open, onClose, commands }: {
  open: boolean
  onClose: () => void
  commands: Command[]
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = useMemo(() => matchCommands(commands, query), [commands, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(index => Math.min(index + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(matches[active]) }
  }

  const activeId = matches[active] ? `palette-option-${matches[active].id}` : undefined
  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette"
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="palette-search">
          <SearchIcon size={16} />
          <input ref={inputRef} className="palette-input" value={query} placeholder="Jump to a page or run a command…"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={activeId}
            aria-label="Search commands"
            onChange={e => { setQuery(e.target.value); setActive(0) }} />
          <kbd>esc</kbd>
        </div>
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Commands">
          {matches.length === 0 && <li className="palette-empty">No matching command</li>}
          {matches.map((command, index) => (
            <li key={command.id} id={`palette-option-${command.id}`} role="option" aria-selected={index === active}
              className="palette-option" onMouseEnter={() => setActive(index)} onClick={() => run(command)}>
              <span className="palette-group">{command.group}</span>
              <span className="palette-label">{command.label}</span>
              {command.hint && <kbd>{command.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
