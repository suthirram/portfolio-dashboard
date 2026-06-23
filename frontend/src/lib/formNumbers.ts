export type SingleSeparatorMode = 'auto' | 'decimal'

interface DecimalInputOptions {
  allowNegative?: boolean
  singleSeparator?: SingleSeparatorMode
}

function splitSign(value: string, allowNegative: boolean): { sign: number; digits: string } | null {
  if (value.startsWith('-')) {
    if (!allowNegative) return null
    const rest = value.slice(1)
    if (!rest || rest.includes('-')) return null
    return { sign: -1, digits: rest }
  }
  if (value.includes('-')) return null
  return { sign: 1, digits: value }
}

function singleSeparatorIsGrouping(value: string, separator: string): boolean {
  const index = value.indexOf(separator)
  const before = value.slice(0, index)
  const after = value.slice(index + 1)
  return before.length >= 1 && before.length <= 3 && after.length === 3
}

function isGroupedInteger(value: string, separator: string): boolean {
  if (!value.includes(separator)) return /^\d+$/.test(value)

  const escaped = separator === '.' ? '\\.' : separator
  const western = new RegExp(`^\\d{1,3}(?:${escaped}\\d{3})+$`)
  const indian = new RegExp(`^\\d{1,3}(?:${escaped}\\d{2})+${escaped}\\d{3}$`)
  return western.test(value) || indian.test(value)
}

function normaliseDecimalInput(raw: string, options: DecimalInputOptions = {}): string | null {
  const value = raw.trim().replace(/[\s_]/g, '')
  if (!value) return '0'

  const signed = splitSign(value, Boolean(options.allowNegative))
  if (!signed) return null

  const { sign, digits } = signed
  if (!/^\d+(?:[.,]\d*)*$/.test(digits)) return null

  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')
  const commaCount = (digits.match(/,/g) ?? []).length
  const dotCount = (digits.match(/\./g) ?? []).length
  let decimal = ''

  if (lastComma !== -1 && lastDot !== -1) {
    decimal = lastComma > lastDot ? ',' : '.'
  } else if (lastComma !== -1) {
    if (commaCount === 1) {
      decimal = options.singleSeparator === 'decimal' || !singleSeparatorIsGrouping(digits, ',') ? ',' : ''
    } else {
      if (!isGroupedInteger(digits, ',')) return null
      decimal = ''
    }
  } else if (lastDot !== -1) {
    if (dotCount === 1) {
      decimal = options.singleSeparator === 'decimal' || !singleSeparatorIsGrouping(digits, '.') ? '.' : ''
    } else {
      if (!isGroupedInteger(digits, '.')) return null
      decimal = ''
    }
  }

  if (decimal) {
    const [integer, fraction] = decimal === ','
      ? [digits.slice(0, lastComma), digits.slice(lastComma + 1)]
      : [digits.slice(0, lastDot), digits.slice(lastDot + 1)]
    const grouping = decimal === ',' ? '.' : ','
    if (/[,.]/.test(fraction)) return null
    if (!isGroupedInteger(integer, grouping)) return null
  }

  let normalized: string
  if (decimal === ',') {
    normalized = digits.replace(/\./g, '').replace(',', '.')
  } else if (decimal === '.') {
    normalized = digits.replace(/,/g, '')
  } else {
    normalized = digits.replace(/[,.]/g, '')
  }
  if (!normalized || normalized === '.') return null
  return (sign < 0 ? '-' : '') + normalized
}

export function parseDecimalInput(raw: string, options: DecimalInputOptions = {}): number {
  const normalized = normaliseDecimalInput(raw, options)
  if (normalized == null) return NaN
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

export function sanitizeDecimalInput(raw: string, options: DecimalInputOptions = {}): string {
  const cleaned = raw.replace(/[^\d.,\s-]/g, '')
  if (!options.allowNegative) return cleaned.replace(/-/g, '')

  const trimmedStart = cleaned.match(/^\s*/)?.[0] ?? ''
  const rest = cleaned.slice(trimmedStart.length)
  const negative = rest.startsWith('-')
  const withoutMinus = cleaned.replace(/-/g, '')
  return negative ? `${trimmedStart}-${withoutMinus.slice(trimmedStart.length)}` : withoutMinus
}

// groupIndian renders a numeric string with Indian digit grouping (2,2,3 from
// the right, e.g. 12,34,56,789.45) and a dot decimal, preserving the exact
// digits given. Empty -> "". Used to display amounts in add/edit inputs.
export function groupIndian(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  const neg = value.startsWith('-')
  const [intPart, decPart] = (neg ? value.slice(1) : value).split('.')
  const last3 = intPart.slice(-3)
  const rest = intPart.slice(0, -3)
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3
  return (neg ? '-' : '') + grouped + (decPart != null ? '.' + decPart : '')
}
