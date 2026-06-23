import type { ChangeEvent, CSSProperties, InputHTMLAttributes, KeyboardEvent } from 'react'
import { sanitizeDecimalInput } from '../lib/formNumbers'

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string | number
  onValueChange: (value: string) => void
  allowNegative?: boolean
  style?: CSSProperties
}

const EDITING_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight',
  'ArrowUp', 'ArrowDown', 'Home', 'End',
])

export function DecimalInput({
  value,
  onValueChange,
  allowNegative = false,
  onKeyDown,
  ...props
}: DecimalInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onValueChange(sanitizeDecimalInput(e.target.value, { allowNegative }))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || EDITING_KEYS.has(e.key)) return
    if (/^\d$/.test(e.key) || e.key === '.' || e.key === ',' || e.key === ' ') return
    if (allowNegative && e.key === '-') return
    e.preventDefault()
  }

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      pattern={allowNegative ? '-?[0-9.,\\s]*' : '[0-9.,\\s]*'}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  )
}
