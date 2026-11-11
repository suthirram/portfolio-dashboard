import { useEffect, useRef, useState } from 'react'
import { MONTHS } from './historyShared'

// The History page's month navigator: ‹ / › step one month, the label opens
// a year-and-month grid for a far jump, and "This month" returns to the
// current month. The range runs from min (the first browsable month) to max
// (the current trading month); months outside it are disabled, since a
// future month has no rows to show.

export interface YearMonth {
  year: number
  month0: number
}

const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const index = (value: YearMonth) => value.year * 12 + value.month0

// shiftMonth moves value by delta months, kept within [min, max].
export function shiftMonth(value: YearMonth, delta: number, min: YearMonth, max: YearMonth): YearMonth {
  const target = Math.min(Math.max(index(value) + delta, index(min)), index(max))
  return { year: Math.floor(target / 12), month0: target % 12 }
}

export function MonthNavigator({ value, min, max, onChange }: {
  value: YearMonth
  min: YearMonth
  max: YearMonth
  onChange: (value: YearMonth) => void
}) {
  const [open, setOpen] = useState(false)
  // The year the grid shows; it follows the selection each time it opens.
  const [gridYear, setGridYear] = useState(value.year)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const atMin = index(value) <= index(min)
  const atMax = index(value) >= index(max)
  const label = `${LONG_MONTHS[value.month0]} ${value.year}`
  const pick = (next: YearMonth) => { onChange(next); setOpen(false) }

  return (
    <div ref={rootRef} className="month-nav" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" className="btn-icon" aria-label="Previous month" title="Previous month"
        disabled={atMin} style={{ opacity: atMin ? 0.4 : 1 }}
        onClick={() => onChange(shiftMonth(value, -1, min, max))}>‹</button>
      <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Month: ${label}. Choose another month`}
        onClick={() => { setGridYear(value.year); setOpen(wasOpen => !wasOpen) }}
        style={{ minWidth: 150, justifyContent: 'center', fontWeight: 600 }}>
        {label} <span aria-hidden style={{ fontSize: 10, opacity: 0.7 }}>▾</span>
      </button>
      <button type="button" className="btn-icon" aria-label="Next month" title="Next month"
        disabled={atMax} style={{ opacity: atMax ? 0.4 : 1 }}
        onClick={() => onChange(shiftMonth(value, 1, min, max))}>›</button>
      {!atMax && (
        <button type="button" className="btn btn-sm" onClick={() => onChange(max)}>This month</button>
      )}

      {open && (
        <div className="menu-pop" role="dialog" aria-label="Choose a month" style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 120, width: 264, padding: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" className="btn-icon" aria-label="Previous year" disabled={gridYear <= min.year}
              style={{ opacity: gridYear <= min.year ? 0.4 : 1 }} onClick={() => setGridYear(shown => shown - 1)}>‹</button>
            <span className="mono" style={{ fontWeight: 700 }} aria-live="polite">{gridYear}</span>
            <button type="button" className="btn-icon" aria-label="Next year" disabled={gridYear >= max.year}
              style={{ opacity: gridYear >= max.year ? 0.4 : 1 }} onClick={() => setGridYear(shown => shown + 1)}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {MONTHS.map((shortName, month0) => {
              const option = { year: gridYear, month0 }
              const outside = index(option) < index(min) || index(option) > index(max)
              const selected = index(option) === index(value)
              const current = index(option) === index(max)
              return (
                <button key={shortName} type="button" className="btn btn-sm" disabled={outside}
                  aria-pressed={selected} aria-label={`${LONG_MONTHS[month0]} ${gridYear}`}
                  onClick={() => pick(option)}
                  style={{
                    justifyContent: 'center', opacity: outside ? 0.35 : 1,
                    fontWeight: current ? 700 : undefined,
                    textDecoration: current && !selected ? 'underline' : undefined,
                  }}>
                  {shortName}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
