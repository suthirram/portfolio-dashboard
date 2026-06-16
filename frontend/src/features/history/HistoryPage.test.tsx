import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  parsePasteText,
  monthRange,
  dailyVolatility,
  HistoryTable,
  AddRowModal,
  ConflictDialog,
  PasteModal,
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
  it('resolves a 31-day month to first/last UTC day', () => {
    expect(monthRange(2026, 0)).toEqual({ from: '2026-01-01', to: '2026-01-31' })
  })
  it('resolves February in a non-leap year to the 28th', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('resolves February in a leap year to the 29th', () => {
    expect(monthRange(2024, 1)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})

// ---- parsePasteText (TDD §7.6 parser) ----

describe('parsePasteText', () => {
  it('parses Google-Sheets TSV into the §4.6 body shape', () => {
    const tsv = '2026-06-01\t100\t110\t50\t55\t0\t0\n2026-06-02\t200\t190\t0\t0\t10\t12'
    expect(parsePasteText(tsv)).toEqual([
      { date: '2026-06-01', regions: { india: { invested: 100, current: 110 }, europe: { invested: 50, current: 55 } } },
      { date: '2026-06-02', regions: { india: { invested: 200, current: 190 }, us: { invested: 10, current: 12 } } },
    ])
  })

  it('parses Excel CSV too', () => {
    const csv = '2026-06-01,100,110,0,0,0,0'
    expect(parsePasteText(csv)).toEqual([
      { date: '2026-06-01', regions: { india: { invested: 100, current: 110 } } },
    ])
  })

  it('skips a header row whose first cell is not a date', () => {
    const tsv = 'date\tii\tic\tei\tec\tui\tuc\n2026-06-01\t100\t110\t0\t0\t0\t0'
    const out = parsePasteText(tsv)
    expect(out).toHaveLength(1)
    expect(out[0].date).toBe('2026-06-01')
  })

  it('omits a region whose invested and current are both zero', () => {
    const [r] = parsePasteText('2026-06-01,0,0,0,0,0,0')
    expect(r.regions).toEqual({})
  })
})

// ---- dailyVolatility ----

describe('dailyVolatility', () => {
  const rows: HistoryRow[] = [
    // newest first (server order)
    row({ date: '2026-06-17', totals: { invested_total: 200, current_total: 220, pnl_pct: 10 } }),
    row({ date: '2026-06-16', totals: { invested_total: 200, current_total: 200, pnl_pct: 0 } }),
    row({ date: '2026-06-15', totals: { invested_total: 200, current_total: 0,   pnl_pct: null } }),
  ]

  it('returns +10 for an upward day (220 vs prior 200)', () => {
    expect(dailyVolatility(rows, 0)).toBeCloseTo(10, 5)
  })

  it('returns null when there is no prior row', () => {
    // rows[2] is the oldest; rows[3] does not exist.
    expect(dailyVolatility(rows, 2)).toBeNull()
  })

  it('returns null when the prior current value is 0 (divide-by-zero)', () => {
    // rows[1] looks back to rows[2] which has current_total=0.
    expect(dailyVolatility(rows, 1)).toBeNull()
  })

  it('returns a negative value when the portfolio dropped', () => {
    const down: HistoryRow[] = [
      row({ date: '2026-06-17', totals: { invested_total: 100, current_total: 75,  pnl_pct: -25 } }),
      row({ date: '2026-06-16', totals: { invested_total: 100, current_total: 100, pnl_pct: 0 } }),
    ]
    expect(dailyVolatility(down, 0)).toBeCloseTo(-25, 5)
  })
})

// ---- HistoryTable (TDD §7.3) ----

describe('HistoryTable', () => {
  it('renders — for absent regions', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({
        date: '2026-06-16',
        regions: { india: region(100, 198, 'cron') },
        totals: { invested_total: 100, current_total: 198, pnl_pct: 98 },
      })]} />)
    // India cells show values, Europe/US show the em dash placeholder.
    expect(screen.getByText('198')).toBeInTheDocument()
    // Europe inv, Europe cur, US inv, US cur are all 0 → '—'.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })

  it('hides the delete control on a cron row', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({ date: '2026-06-16', regions: { india: region(100, 198, 'cron') } })]} />)
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('shows delete on an all-manual row and fires onDelete with the date', () => {
    const onDelete = vi.fn()
    render(<HistoryTable currency="INR" onDelete={onDelete}
      rows={[row({ date: '2026-06-16', regions: { india: region(100, 198, 'manual') } })]} />)
    const btn = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(btn)
    expect(onDelete).toHaveBeenCalledWith('2026-06-16')
  })

  it('renders the Daily vol % column and a signed value for non-first rows', () => {
    const rows: HistoryRow[] = [
      row({
        date: '2026-06-17',
        regions: { india: region(100, 220, 'cron') },
        totals: { invested_total: 100, current_total: 220, pnl_pct: 120 },
      }),
      row({
        date: '2026-06-16',
        regions: { india: region(100, 200, 'cron') },
        totals: { invested_total: 100, current_total: 200, pnl_pct: 100 },
      }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(screen.getByText('Daily vol %')).toBeInTheDocument()
    // 220 vs prior 200 → +10.00
    expect(screen.getByText('+10.00')).toBeInTheDocument()
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
    expect(arg.regions).toEqual({ india: { invested: 100, current: 198 } })
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
  existing: { india: region(100, 110, 'cron'), europe: region(50, 55, 'cron') },
  incoming: { india: { invested: 200, current: 220 }, europe: { invested: 60, current: 66 } },
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

    expect(onResolve).toHaveBeenCalledWith('2026-06-02', { india: { invested: 200, current: 220 } })
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
      rows: [{ date: '2026-06-01', regions: { india: { invested: 100, current: 110 } } }],
    })
    // report summary renders after submit resolves
    expect(await screen.findByText(/Applied: 1/)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-31: invalid date/)).toBeInTheDocument()
  })
})
