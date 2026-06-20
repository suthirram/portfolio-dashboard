import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  parsePasteText,
  monthRange,
  parseAmount,
  normaliseDate,
  HistoryTable,
  AddRowModal,
  ConflictDialog,
  PasteModal,
  niceDomain,
  fmtAxisAmount,
  perCurrencyChartData,
  regionCurrentDirection,
} from './HistoryPage'
import type {
  DateConflict,
  HistoryRow,
  PasteHistoryReport,
  RegionSnapshot,
} from '../../lib/api/client'

// ---- helpers ----

const region = (invested: number, current: number, source: 'cron' | 'manual'): RegionSnapshot =>
  ({ invested, current, source })

const row = (overrides: Partial<HistoryRow> & { date: string }): HistoryRow => ({
  regions: {},
  totals: { invested_total: 0, current_total: 0, pnl_pct: null },
  ...overrides,
})

// ---- monthRange (TDD §7.1 range derivation) ----

describe('monthRange', () => {
  // monthRange extends `from` back by one day so the first row of the
  // selected month has a prior row for Daily volatlity.
  it('resolves a 31-day month to (last-of-prev → last UTC day)', () => {
    expect(monthRange(2026, 0)).toEqual({ from: '2025-12-31', to: '2026-01-31' })
  })
  it('resolves February in a non-leap year to (Jan 31 → Feb 28)', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-01-31', to: '2026-02-28' })
  })
  it('resolves February in a leap year to (Jan 31 → Feb 29)', () => {
    expect(monthRange(2024, 1)).toEqual({ from: '2024-01-31', to: '2024-02-29' })
  })
})

// ---- parsePasteText (TDD §7.6 parser) ----

describe('parsePasteText', () => {
  it('parses Google-Sheets TSV into the §4.6 body shape', () => {
    const tsv = '2026-06-01\t100\t110\t50\t55\t0\t0\n2026-06-02\t200\t190\t0\t0\t10\t12'
    expect(parsePasteText(tsv)).toEqual([
      { date: '2026-06-01', regions: { INR: { invested: 100, current: 110 }, EUR: { invested: 50, current: 55 } } },
      { date: '2026-06-02', regions: { INR: { invested: 200, current: 190 }, USD: { invested: 10, current: 12 } } },
    ])
  })

  it('skips a header row whose first cell is not a date', () => {
    const tsv = 'date\tii\tic\tei\tec\tui\tuc\n2026-06-01\t100\t110\t0\t0\t0\t0'
    const out = parsePasteText(tsv)
    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-06-01')
  })

  it('omits a region whose invested and current are both zero', () => {
    const [r] = parsePasteText('2026-06-01\t0\t0\t0\t0\t0\t0')
    expect(r.regions).toEqual({})
  })

  it('accepts dd/mm/yyyy dates and normalises to YYYY-MM-DD', () => {
    const [r] = parsePasteText('28/02/2026\t100\t110\t0\t0\t0\t0')
    expect(r.date).toBe('2026-02-28')
  })

  it('strips ₹, €, $ symbols and thousands separators', () => {
    const [r] = parsePasteText('2026-06-01\t₹791,098.34\t₹1,057,757.67\t€5,621.76\t€5,880.73\t$0\t$0')
    expect(r.regions).toEqual({
      INR: { invested: 791098.34, current: 1057757.67 },
      EUR: { invested: 5621.76, current: 5880.73 },
    })
  })

  it('ignores trailing Daily-vol / P-L columns', () => {
    const [r] = parsePasteText('28/02/2026\t₹100\t₹110\t€50\t€55\t\t\t1.23\t10.50%')
    expect(r.date).toBe('2026-02-28')
    expect(r.regions.INR).toEqual({ invested: 100, current: 110 })
    expect(r.regions.EUR).toEqual({ invested: 50, current: 55 })
  })
})

// ---- parseAmount ----

describe('parseAmount', () => {
  it('strips currency symbols', () => {
    expect(parseAmount('₹1234.56')).toBe(1234.56)
    expect(parseAmount('€5621.76')).toBe(5621.76)
    expect(parseAmount('$100')).toBe(100)
  })
  it('strips thousands commas', () => {
    expect(parseAmount('1,057,757.67')).toBe(1057757.67)
  })
  it('empty / blank cell → 0', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('   ')).toBe(0)
  })
})

// ---- normaliseDate ----

describe('normaliseDate', () => {
  it('passes ISO through', () => {
    expect(normaliseDate('2026-02-28')).toBe('2026-02-28')
  })
  it('converts dd/mm/yyyy', () => {
    expect(normaliseDate('28/02/2026')).toBe('2026-02-28')
  })
  it('converts dd-mm-yyyy', () => {
    expect(normaliseDate('28-02-2026')).toBe('2026-02-28')
  })
  it('converts dd.mm.yyyy', () => {
    expect(normaliseDate('28.02.2026')).toBe('2026-02-28')
  })
  it('returns empty for nonsense', () => {
    expect(normaliseDate('not a date')).toBe('')
    expect(normaliseDate('')).toBe('')
  })
})

// ---- HistoryTable (TDD §7.3) ----

describe('HistoryTable', () => {
  it('renders currency-prefixed values per group (₹/€/$) with absent regions at 0', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({
        date: '2026-06-16',
        regions: { INR: region(100, 198, 'cron') },
        totals: { invested_total: 100, current_total: 198, pnl_pct: 98 },
      })]} />)
    // India cells show ₹-prefixed values.
    expect(screen.getByText('₹100.00')).toBeInTheDocument()
    expect(screen.getByText('₹198.00')).toBeInTheDocument()
    // Absent Europe and US: invested + current both render as €0.00 / $0.00.
    expect(screen.getAllByText('€0.00').length).toBe(2)
    expect(screen.getAllByText('$0.00').length).toBe(2)
  })

  it('hides the delete control on a cron row', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({ date: '2026-06-16', regions: { INR: region(100, 198, 'cron') } })]} />)
    expect(screen.queryByRole('button', { name: /Delete row/ })).toBeNull()
  })

  it('shows delete on an all-manual row and fires onDelete with the date', () => {
    const onDelete = vi.fn()
    render(<HistoryTable currency="INR" onDelete={onDelete}
      rows={[row({ date: '2026-06-16', regions: { INR: region(100, 198, 'manual') } })]} />)
    const btn = screen.getByRole('button', { name: /Delete row/ })
    fireEvent.click(btn)
    expect(onDelete).toHaveBeenCalledWith('2026-06-16')
  })

  it('renders an Edit button on every row when onEdit is provided', () => {
    const onEdit = vi.fn()
    const rows: HistoryRow[] = [
      row({ date: '2026-06-16', regions: { INR: region(100, 198, 'cron') } }),
      row({ date: '2026-06-15', regions: { INR: region(100, 100, 'manual') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} onEdit={onEdit} rows={rows} />)
    const edits = screen.getAllByRole('button', { name: /Edit row/ })
    expect(edits.length).toBe(2)
    // Target by row date, not display position (default order is oldest-first).
    fireEvent.click(screen.getByRole('button', { name: 'Edit row for 2026-06-16' }))
    expect(onEdit).toHaveBeenCalledWith(rows[0])
  })

  it('does not render Edit when onEdit is omitted', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({ date: '2026-06-16', regions: { INR: region(100, 198, 'cron') } })]} />)
    expect(screen.queryByRole('button', { name: /Edit row/ })).toBeNull()
  })

  it('renders Daily volatlity headers (one per currency group) and per-region values', () => {
    const rows: HistoryRow[] = [
      row({
        date: '2026-06-17',
        regions: { INR: region(100, 220, 'cron') },
        totals: { invested_total: 100, current_total: 220, pnl_pct: 120 },
      }),
      row({
        date: '2026-06-16',
        regions: { INR: region(100, 200, 'cron') },
        totals: { invested_total: 100, current_total: 200, pnl_pct: 100 },
      }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    // One "Daily volatlity" header per currency group → 3 of them.
    expect(screen.getAllByText('Daily volatlity').length).toBe(3)
    // 220 vs prior 200 → +10.00 in the India column.
    expect(screen.getByText('10.00')).toBeInTheDocument()
  })

  it('clicking the Date header flips to oldest-first while volatility stays pinned to the prior day', () => {
    const rows: HistoryRow[] = [
      // server order = newest-first
      row({
        date: '2026-06-17',
        regions: { INR: region(100, 220, 'cron') },
        totals: { invested_total: 100, current_total: 220, pnl_pct: 120 },
      }),
      row({
        date: '2026-06-16',
        regions: { INR: region(100, 200, 'cron') },
        totals: { invested_total: 100, current_total: 200, pnl_pct: 100 },
      }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)

    // Default is oldest-first: 06-16 on top, 06-17 below.
    let bodyRows = document.querySelectorAll('tbody tr')
    expect(bodyRows[0].querySelector('td')?.textContent).toBe('2026-06-16')
    expect(bodyRows[1].querySelector('td')?.textContent).toBe('2026-06-17')

    // Math is unchanged by display order: 06-17 still reads +10.00 vs its
    // prior day (200), and 06-16 (no prior in window) renders "—".
    const lastCells = bodyRows[1].querySelectorAll('td')
    expect(Array.from(lastCells).some(c => c.textContent === '10.00')).toBe(true)

    // Click the Date header → newest-first: 06-17 back on top.
    fireEvent.click(screen.getByRole('button', { name: /Sort by date/ }))
    bodyRows = document.querySelectorAll('tbody tr')
    expect(bodyRows[0].querySelector('td')?.textContent).toBe('2026-06-17')
    expect(bodyRows[1].querySelector('td')?.textContent).toBe('2026-06-16')
  })
})

// ---- AddRowModal (TDD §7.5) ----

describe('AddRowModal', () => {
  it('submits only the regions with non-zero values, no source key', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<AddRowModal onSubmit={onSubmit} onCancel={() => {}} />)

    const fieldsets = document.querySelectorAll('fieldset')
    const indiaInputs = fieldsets[0].querySelectorAll('input')
    fireEvent.change(indiaInputs[0], { target: { value: '100' } })  // invested
    fireEvent.change(indiaInputs[1], { target: { value: '198' } })  // current

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    const arg = onSubmit.mock.calls[0][0]
    expect(arg.regions).toEqual({ INR: { invested: 100, current: 198 } })
    expect(arg.regions.europe).toBeUndefined()
  })

  it('cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(<AddRowModal onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

// ---- ConflictDialog (TDD §7.7) ----

const conflict: DateConflict = {
  date: '2026-06-02',
  existing: { INR: region(100, 110, 'cron'), EUR: region(50, 55, 'cron') },
  incoming: { INR: { invested: 200, current: 220 }, EUR: { invested: 60, current: 66 } },
}

describe('ConflictDialog', () => {
  it('renders each region with its existing source tag', () => {
    render(<ConflictDialog conflict={conflict} onResolve={vi.fn()} onSkip={vi.fn()} />)
    expect(screen.getByText(/2026-06-02/)).toBeInTheDocument()
    // existing values carry a (cron) tag
    expect(screen.getAllByText(/\(cron\)/).length).toBe(2)
  })

  it('confirming with only India ticked emits an India-only override', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<ConflictDialog conflict={conflict} onResolve={onResolve} onSkip={vi.fn()} />)

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])  // India
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onResolve).toHaveBeenCalledWith('2026-06-02', { INR: { invested: 200, current: 220 } })
  })

  it('skip calls onSkip and never resolves', () => {
    const onResolve = vi.fn()
    const onSkip = vi.fn()
    render(<ConflictDialog conflict={conflict} onResolve={onResolve} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(onSkip).toHaveBeenCalled()
    expect(onResolve).not.toHaveBeenCalled()
  })
})

// ---- PasteModal (TDD §7.6 submission) ----

describe('PasteModal', () => {
  it('parses the textarea and submits the §4.6 body, then shows the report', async () => {
    const report: PasteHistoryReport = {
      applied: ['2026-06-01'],
      conflicts: [],
      rejected: [{ date: '2026-06-31', reason: 'invalid date' }],
    }
    const onSubmit = vi.fn().mockResolvedValue(report)
    render(<PasteModal monthLabel="2026-06" onSubmit={onSubmit} onCancel={() => {}} />)

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '2026-06-01\t100\t110\t0\t0\t0\t0' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(onSubmit).toHaveBeenCalledWith({
      month: '2026-06',
      rows: [{ date: '2026-06-01', regions: { INR: { invested: 100, current: 110 } } }],
    })
    // report summary renders after submit resolves
    expect(await screen.findByText(/Applied: 1/)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-31: invalid date/)).toBeInTheDocument()
  })
})

describe('niceDomain', () => {
  it('returns undefined when no finite values', () => {
    expect(niceDomain([])).toBeUndefined()
    expect(niceDomain([NaN, null as unknown as number])).toBeUndefined()
  })

  it('zooms into a narrow band far above zero', () => {
    // The reported bug: invested vs current both ≈450k rendered flat
    // because the default domain started at 0. The padded domain must
    // start well above zero so the fluctuation is visible.
    const [min, max] = niceDomain([452000, 458000, 461000])!
    expect(min).toBeGreaterThan(400000)
    expect(max).toBeGreaterThanOrEqual(461000)
    expect(min).toBeLessThan(452000)
  })

  it('handles negative ranges (P/L %)', () => {
    const [min, max] = niceDomain([-3.2, 1.5, 4.8])!
    expect(min).toBeLessThan(-3.2)
    expect(max).toBeGreaterThan(4.8)
  })

  it('pads a flat series so it sits inside the chart', () => {
    const [min, max] = niceDomain([100, 100])!
    expect(min).toBeLessThan(100)
    expect(max).toBeGreaterThan(100)
  })
})

describe('perCurrencyChartData null-gap', () => {
  // Regression: a region added mid-month leaves earlier dates with no
  // snapshot. Emitting 0 for those dates dragged the dynamic Y-axis
  // floor to ~0, re-flattening the chart (the original bug), and drew
  // the line crashing to 0. Absent regions must emit null so niceDomain
  // ignores them and the line gaps instead.
  const rows: HistoryRow[] = [
    row({ date: '2026-06-01', regions: { EUR: region(1000, 1100, 'manual') } }), // no INR
    row({ date: '2026-06-02', regions: { INR: region(452000, 458000, 'cron') } }),
    row({ date: '2026-06-03', regions: { INR: region(452000, 461000, 'cron') } }),
  ]

  it('emits null (not 0) for dates where the region is absent', () => {
    const series = perCurrencyChartData(rows, 'INR')
    expect(series[0]).toMatchObject({ invested: null, current: null, pnl_pct: null })
    expect(series[1]).toMatchObject({ invested: 452000, current: 458000 })
  })

  it('keeps the dynamic domain zoomed despite the absent leading date', () => {
    const series = perCurrencyChartData(rows, 'INR')
    const [min] = niceDomain(series.flatMap(d => [d.invested, d.current]))!
    // floor stays high — not dragged to ~0 by the missing 2026-06-01 row
    expect(min).toBeGreaterThan(400000)
  })
})

describe('perCurrencyChartData daily_vol', () => {
  const rows: HistoryRow[] = [
    row({ date: '2026-06-03', regions: { INR: region(100, 99,  'cron') } }),
    row({ date: '2026-06-02', regions: { INR: region(100, 110, 'cron') } }),
    row({ date: '2026-06-01', regions: { INR: region(100, 100, 'cron') } }),
  ]

  it('is null on the first point and day-over-day % thereafter', () => {
    const series = perCurrencyChartData(rows, 'INR') // sorts oldest-first
    expect(series[0].daily_vol).toBeNull()           // 06-01, no baseline
    expect(series[1].daily_vol).toBeCloseTo(10, 5)   // 100 -> 110
    expect(series[2].daily_vol).toBeCloseTo(-10, 5)  // 110 -> 99
  })

  it('is null when the prior point has no data for the region', () => {
    const gap: HistoryRow[] = [
      row({ date: '2026-06-01', regions: { EUR: region(1000, 1100, 'manual') } }), // no INR
      row({ date: '2026-06-02', regions: { INR: region(100, 200, 'cron') } }),
    ]
    const series = perCurrencyChartData(gap, 'INR')
    expect(series[0].daily_vol).toBeNull() // INR absent
    expect(series[1].daily_vol).toBeNull() // no prior INR baseline
  })
})

describe('regionCurrentDirection', () => {
  // newest-first (server order): rows[i+1] is the prior day.
  const rows: HistoryRow[] = [
    row({ date: '2026-06-03', regions: { INR: region(100, 120, 'cron') } }), // vs 110 -> up
    row({ date: '2026-06-02', regions: { INR: region(100, 110, 'cron') } }), // vs 110 -> flat
    row({ date: '2026-06-01', regions: { INR: region(100, 110, 'cron') } }), // no prior
  ]

  it('flags up / flat and null on the first row', () => {
    expect(regionCurrentDirection(rows, 0, 'INR')).toBe('up')
    expect(regionCurrentDirection(rows, 1, 'INR')).toBe('flat')
    expect(regionCurrentDirection(rows, 2, 'INR')).toBeNull()
  })

  it('flags down and returns null when the region is absent on either day', () => {
    const r2: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(100, 90, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(100, 110, 'cron') } }),
    ]
    expect(regionCurrentDirection(r2, 0, 'INR')).toBe('down')

    const gap: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(100, 110, 'cron') } }),
      row({ date: '2026-06-01', regions: { EUR: region(50, 60, 'manual') } }), // no INR prior
    ]
    expect(regionCurrentDirection(gap, 0, 'INR')).toBeNull()
  })
})

describe('fmtAxisAmount', () => {
  it('compacts thousands and millions', () => {
    expect(fmtAxisAmount(450000)).toBe('450k')
    expect(fmtAxisAmount(1500000)).toBe('1.5M')
    expect(fmtAxisAmount(2000000)).toBe('2M')
    expect(fmtAxisAmount(500)).toBe('500')
  })
})
