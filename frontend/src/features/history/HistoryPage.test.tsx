import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  parsePasteText,
  monthRange,
  parseAmount,
  parseFormAmount,
  groupIndian,
  sanitizeAmount,
  normaliseDate,
  HistoryTable,
  HoldingsModal,
  AddRowModal,
  ConflictDialog,
  PasteModal,
  niceDomain,
  symmetricDomain,
  regionHasData,
  formToBody,
  changedRegions,
  fmtAxisAmount,
  perCurrencyChartData,
  goldChartData,
  goldCurrentDirection,
  regionDailyVolatility,
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

// ---- parseFormAmount (locale-tolerant decimal entry) ----

describe('parseFormAmount', () => {
  it('parses either decimal separator and strips thousands grouping', () => {
    expect(parseFormAmount('23456.45')).toBe(23456.45)   // plain dot decimal
    expect(parseFormAmount('23456,45')).toBe(23456.45)   // lone comma decimal
    expect(parseFormAmount('23,456.45')).toBe(23456.45)  // en grouping
    expect(parseFormAmount('23.456,45')).toBe(23456.45)  // european grouping
    expect(parseFormAmount('1,234')).toBe(1234)           // single grouping comma
    expect(parseFormAmount('12,34,567')).toBe(1234567)    // Indian grouping
    expect(parseFormAmount('1,234,567')).toBe(1234567)   // comma thousands only
    expect(parseFormAmount('1.234.567')).toBe(1234567)   // dot thousands only
    expect(parseFormAmount('  1 234,5 ')).toBe(1234.5)   // space grouping
    expect(parseFormAmount('')).toBe(0)
  })

  it('rejects malformed numeric text', () => {
    expect(parseFormAmount('1,,2')).toBeNaN()
    expect(parseFormAmount('12.34.56')).toBeNaN()
  })
})

// ---- sanitizeAmount (block non-numeric keystrokes) ----

describe('sanitizeAmount', () => {
  it('strips letters and symbols but keeps digits and separators', () => {
    expect(sanitizeAmount('12a3b4')).toBe('1234')
    expect(sanitizeAmount('₹1,234.50')).toBe('1,234.50')
    expect(sanitizeAmount('-99')).toBe('99')   // amounts are non-negative
    expect(sanitizeAmount('1 23,4.5')).toBe('1 23,4.5')
  })
})

// ---- groupIndian (lakh/crore digit grouping) ----

describe('groupIndian', () => {
  it('groups integer part as 2,2,3 from the right and keeps the decimal', () => {
    expect(groupIndian('23456.45')).toBe('23,456.45')
    expect(groupIndian('1234567')).toBe('12,34,567')
    expect(groupIndian('123456789.5')).toBe('12,34,56,789.5')
    expect(groupIndian('999')).toBe('999')
    expect(groupIndian('-1234567')).toBe('-12,34,567')
    expect(groupIndian('')).toBe('')
  })

  it('round-trips with parseFormAmount', () => {
    expect(parseFormAmount(groupIndian('98765432.1'))).toBe(98765432.1)
  })
})

// ---- formToBody / changedRegions (override + reset semantics) ----

const blank = (): Parameters<typeof formToBody>[0] => ({
  INR: { invested: '', current: '' },
  EUR: { invested: '', current: '' },
})

describe('formToBody', () => {
  it('includes a region with an explicit 0 so a value can be reset', () => {
    const f = blank()
    f.EUR = { invested: '0', current: '0' } // reset EUR to zero
    expect(formToBody(f)).toEqual({ EUR: { invested: 0, current: 0 } })
  })
  it('treats a blank field as 0 when the other is filled', () => {
    const f = blank()
    f.INR = { invested: '100', current: '' }
    expect(formToBody(f)).toEqual({ INR: { invested: 100, current: 0 } })
  })
  it('skips a region whose both fields are blank (untouched)', () => {
    expect(formToBody(blank())).toEqual({})
  })
})

describe('changedRegions', () => {
  it('keeps only regions that differ from the original row', () => {
    const original = {
      INR: region(100, 110, 'manual'),
      EUR: region(0, 1, 'manual'),
    }
    const body = { INR: { invested: 100, current: 110 }, EUR: { invested: 0, current: 0 } }
    // INR unchanged → dropped; EUR current 1→0 → kept.
    expect(changedRegions(body, original)).toEqual({ EUR: { invested: 0, current: 0 } })
  })
  it('returns empty when nothing changed (no request)', () => {
    const original = { INR: region(5, 6, 'manual') }
    expect(changedRegions({ INR: { invested: 5, current: 6 } }, original)).toEqual({})
  })
})

// ---- symmetricDomain (zero-centred volatility axis) ----

describe('symmetricDomain', () => {
  it('centres the range on zero around the largest swing', () => {
    const d = symmetricDomain([-3, 1, -5, 2])
    expect(d).toBeDefined()
    expect(d![0]).toBe(-d![1])           // symmetric about 0
    expect(d![1]).toBeGreaterThanOrEqual(5)
  })
  it('returns undefined when no finite values', () => {
    expect(symmetricDomain([null, undefined, NaN])).toBeUndefined()
  })
  it('handles an all-zero series', () => {
    expect(symmetricDomain([0, 0])).toEqual([-1, 1])
  })
})

// ---- regionHasData (hide empty currency charts) ----

describe('regionHasData', () => {
  it('is false when every point is zero or null', () => {
    expect(regionHasData([{ invested: 0, current: 0 }, { invested: null, current: null }])).toBe(false)
  })
  it('is true when any invested or current is non-zero', () => {
    expect(regionHasData([{ invested: 0, current: 0 }, { invested: null, current: 12 }])).toBe(true)
  })
})

describe('goldChartData', () => {
  it('maps the per-row gold overlay to the chart series, oldest first', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: {}, gold: { invested: 7200, current: 14400, volatility_pct: 5, pnl_pct: 100 } }),
      row({ date: '2026-06-16', regions: {} }), // no overlay → nulls
    ]
    expect(goldChartData(rows)).toEqual([
      { date: '06-16', invested: null, current: null, pnl_pct: null, daily_vol: null },
      { date: '06-17', invested: 7200, current: 14400, pnl_pct: 100, daily_vol: 5 },
    ])
  })
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
  it('parses Google-Sheets TSV into the §4.6 body shape (INR/EUR; extra cols ignored)', () => {
    // Trailing columns beyond EUR (legacy USD, daily vol, P/L) are ignored.
    const tsv = '2026-06-01\t100\t110\t50\t55\t0\t0\n2026-06-02\t200\t190\t60\t65\t10\t12'
    expect(parsePasteText(tsv)).toEqual([
      { date: '2026-06-01', regions: { INR: { invested: 100, current: 110 }, EUR: { invested: 50, current: 55 } } },
      { date: '2026-06-02', regions: { INR: { invested: 200, current: 190 }, EUR: { invested: 60, current: 65 } } },
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
    // Absent Europe: invested + current both render as €0.00. (USD dropped.)
    expect(screen.getAllByText('€0.00').length).toBe(2)
    expect(screen.queryByText('$0.00')).toBeNull()
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
    // One "Daily volatlity" header per currency group (INR, EUR) → 2.
    expect(screen.getAllByText('Daily volatlity').length).toBe(2)
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

  it('omits the gold column group when no row carries an overlay', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({ date: '2026-06-16', regions: { INR: region(100, 198, 'cron') } })]} />)
    expect(screen.queryByText('Gold invested')).toBeNull()
    expect(screen.queryByText('Gold value')).toBeNull()
  })

  it('renders the gold column group with the overlay values (owner 72 g example)', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}}
      rows={[row({
        date: '2026-06-16',
        regions: { INR: region(100, 198, 'cron') },
        gold: { invested: 7200, current: 14400, volatility_pct: 0, pnl_pct: 100 },
      })]} />)
    expect(screen.getByText('Gold invested')).toBeInTheDocument()
    expect(screen.getByText('₹7,200.00')).toBeInTheDocument()
    expect(screen.getByText('₹14,400.00')).toBeInTheDocument()
    expect(screen.getByText('0.00')).toBeInTheDocument()   // volatility
    expect(screen.getByText('100.00%')).toBeInTheDocument() // P/L
  })

  it('renders em dashes in the gold group for a pre-purchase row while the group is shown', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: { INR: region(100, 198, 'cron') },
        gold: { invested: 7200, current: 14400, volatility_pct: 0, pnl_pct: 100 } }),
      row({ date: '2026-06-16', regions: { INR: region(100, 198, 'cron') } }), // no overlay
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    // Layout: date(1) + 2 currency groups × 4 (8) + gold group (4) + action(1).
    // The gold cells are indices 9–12; on a pre-purchase row all four are —.
    const tr = Array.from(document.querySelectorAll('tbody tr'))
      .find(t => t.querySelector('td')?.textContent === '2026-06-16')!
    const cells = Array.from(tr.querySelectorAll('td'))
    expect(cells.slice(9, 13).map(c => c.textContent)).toEqual(['—', '—', '—', '—'])
  })
})

// ---- HistoryTable cell tints ----

describe('HistoryTable cell tints', () => {
  const norm = (s: string) => s.replace(/\s/g, '')
  // INR group cells for a given date row: td[1]=invested, td[2]=current,
  // td[3]=daily vol, td[4]=P/L%. td[0] is the date.
  const cellsForDate = (date: string) => {
    const tr = Array.from(document.querySelectorAll('tbody tr'))
      .find(t => t.querySelector('td')?.textContent === date)!
    return Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[]
  }
  const pnlCell = (date: string) => cellsForDate(date)[4]
  const investedCell = (date: string) => cellsForDate(date)[1]

  // Group tint for INR on the default ('dark') theme — the no-signal
  // background. The source uses 0.10; the DOM normalises it to 0.1.
  const GROUP_INR = 'rgba(251,146,60,0.1)'

  it('P/L% cell is mild green when the price rose vs the prior day', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: { INR: region(100, 220, 'cron') } }), // 220 > 200
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(norm(pnlCell('2026-06-17').style.background)).toBe('rgba(34,197,94,0.18)')
  })

  it('P/L% cell is mild red when the price fell vs the prior day', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: { INR: region(100, 180, 'cron') } }), // 180 < 200
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(norm(pnlCell('2026-06-17').style.background)).toBe('rgba(239,68,68,0.18)')
  })

  it('P/L% cell is mild blue when the price is unchanged', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: { INR: region(100, 200, 'cron') } }), // 200 == 200
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(norm(pnlCell('2026-06-17').style.background)).toBe('rgba(59,130,246,0.18)')
  })

  it('P/L% cell keeps the plain group tint when there is no prior day', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(norm(pnlCell('2026-06-16').style.background)).toBe(norm(GROUP_INR))
  })

  it('Amount-invested cell is mild purple when new investment was made that day', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: { INR: region(200, 260, 'cron') } }), // invested 200 > 100
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(norm(investedCell('2026-06-17').style.background)).toBe('rgba(168,85,247,0.18)')
  })

  it('Amount-invested cell keeps the group tint when invested did not increase', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-17', regions: { INR: region(100, 260, 'cron') } }), // invested unchanged
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') } }),
    ]
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={rows} />)
    expect(norm(investedCell('2026-06-17').style.background)).toBe(norm(GROUP_INR))
  })
})

// ---- Gold column tints (mirror the currency tints) ----

describe('goldCurrentDirection', () => {
  const g = (invested: number, current: number) => ({ invested, current, volatility_pct: 0, pnl_pct: 0 })
  it('is up/down/flat by the day-over-day gold value, null without a prior', () => {
    expect(goldCurrentDirection(g(100, 220), g(100, 200))).toBe('up')
    expect(goldCurrentDirection(g(100, 180), g(100, 200))).toBe('down')
    expect(goldCurrentDirection(g(100, 200), g(100, 200))).toBe('flat')
    expect(goldCurrentDirection(g(100, 200), undefined)).toBeNull()
    expect(goldCurrentDirection(undefined, g(100, 200))).toBeNull()
  })
})

describe('HistoryTable gold cell tints', () => {
  const norm = (s: string) => s.replace(/\s/g, '')
  // Layout: date(0), INR td[1-4], EUR td[5-8], gold td[9]=invested
  // td[10]=value td[11]=vol td[12]=P/L%.
  const goldCells = (date: string) => {
    const tr = Array.from(document.querySelectorAll('tbody tr'))
      .find(t => t.querySelector('td')?.textContent === date)!
    return Array.from(tr.querySelectorAll('td')) as HTMLTableCellElement[]
  }
  const GOLD_TINT = 'rgba(217,119,6,0.1)'
  const gold = (invested: number, current: number, pnl: number) =>
    ({ invested, current, volatility_pct: 0, pnl_pct: pnl })

  it('P/L% cell tints green/red by the day-over-day gold value move', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={[
      row({ date: '2026-06-17', regions: { INR: region(100, 200, 'cron') }, gold: gold(7200, 14400, 100) }),
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') }, gold: gold(7200, 14000, 94) }),
    ]} />)
    expect(norm(goldCells('2026-06-17')[12].style.background)).toBe('rgba(34,197,94,0.18)') // up → green
  })

  it('gold invested cell is purple on a day gold invested rose', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={[
      row({ date: '2026-06-17', regions: { INR: region(100, 200, 'cron') }, gold: gold(14400, 20000, 38) }), // 14400 > 7200
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') }, gold: gold(7200, 14000, 94) }),
    ]} />)
    expect(norm(goldCells('2026-06-17')[9].style.background)).toBe('rgba(168,85,247,0.18)') // purple
  })

  it('gold cells keep the plain gold tint when nothing changed / no prior', () => {
    render(<HistoryTable currency="INR" onDelete={() => {}} rows={[
      row({ date: '2026-06-16', regions: { INR: region(100, 200, 'cron') }, gold: gold(7200, 14000, 94) }),
    ]} />)
    expect(norm(goldCells('2026-06-16')[9].style.background)).toBe(norm(GOLD_TINT)) // invested, no prior
    expect(norm(goldCells('2026-06-16')[12].style.background)).toBe(norm(GOLD_TINT)) // P/L, no prior
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

  it('excludes the change in invested so it reflects only market movement', () => {
    // Day 1: invested 100, current 100. Day 2: user adds 50 of principal
    // (invested 150) and the market lifts current to 165. The raw current
    // jump is +65 but 50 of that is fresh contribution, not a market gain.
    // daily_vol = ((165 - 100) - (150 - 100)) / 100 = 15%.
    const flows: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(150, 165, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(100, 100, 'cron') } }),
    ]
    const series = perCurrencyChartData(flows, 'INR') // sorts oldest-first
    expect(series[0].daily_vol).toBeNull()          // 06-01, no baseline
    expect(series[1].daily_vol).toBeCloseTo(15, 5)  // net of the +50 contribution
  })

  it('values withdrawn cost basis at current ratio for partial sells', () => {
    // Day 1: 10 shares, avg cost 10, marked at 12 => invested 100/current 120.
    // Day 2: sell 5 shares; remaining 5 are marked at 13 => invested 50/current 65.
    // The sold cost basis left at current value (50 * 65/50 = 65), so the
    // market move is (65 + 65 - 120) / 120 = 8.33%.
    const flows: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(50, 65, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(100, 120, 'cron') } }),
    ]
    const series = perCurrencyChartData(flows, 'INR')
    expect(series[1].daily_vol).toBeCloseTo(8.333333, 5)
  })

  it('still computes when invested is zero (principal withdrawn, gains riding)', () => {
    // Division is by prevCurrent; invested 0 is a valid baseline. Day 1:
    // invested 0, current 50. Day 2: invested still 0, market lifts to 55.
    // daily_vol = ((55 - 50) - 0) / 50 = 10%.
    const zeroInvested: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(0, 55, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(0, 50, 'cron') } }),
    ]
    const series = perCurrencyChartData(zeroInvested, 'INR')
    expect(series[1].daily_vol).toBeCloseTo(10, 5)
  })
})

describe('regionDailyVolatility', () => {
  // newest-first (server order): rows[i+1] is the prior day.
  it('excludes new invested principal from the table daily volatility cell', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(150, 165, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(100, 100, 'cron') } }),
    ]

    expect(regionDailyVolatility(rows, 0, 'INR')).toBeCloseTo(15, 5)
  })

  it('does not turn a partial sell in a rising market into negative volatility', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(50, 65, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(100, 120, 'cron') } }),
    ]

    expect(regionDailyVolatility(rows, 0, 'INR')).toBeCloseTo(8.333333, 5)
  })

  it('returns null for full liquidation because sale proceeds are not in the aggregate row', () => {
    const rows: HistoryRow[] = [
      row({ date: '2026-06-02', regions: { INR: region(0, 0, 'cron') } }),
      row({ date: '2026-06-01', regions: { INR: region(100, 120, 'cron') } }),
    ]

    expect(regionDailyVolatility(rows, 0, 'INR')).toBeNull()
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

// ---- Per-currency Holdings modal ----

describe('HoldingsModal', () => {
  const today: HistoryRow = row({
    date: '2026-06-25',
    holdings: [
      { symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 110, current: 220 },
      { symbol: 'OLD.NS', script: 'Sold Out', currency: 'INR', quantity: 0, close_price: 5, current: 0 },
      { symbol: 'SHORT.NS', script: 'Shorted', currency: 'INR', quantity: -3, close_price: 9, current: -27 },
      { symbol: 'SAP.DE', script: 'SAP', currency: 'EUR', quantity: 2, close_price: 12, current: 24 },
    ],
  })
  const prev: HistoryRow = row({
    date: '2026-06-24',
    holdings: [
      { symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 100, current: 200 },
      { symbol: 'SAP.DE', script: 'SAP', currency: 'EUR', quantity: 2, close_price: 10, current: 20 },
    ],
  })

  it('renders the title, columns and per-stock yesterday/current/change/daily for the chosen currency', () => {
    render(<HoldingsModal row={today} prev={prev} region="INR" onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Holdings' })).toBeInTheDocument()
    for (const col of ['Script name', 'Yesterday price', 'Current price', 'Change value', 'Daily change']) {
      expect(screen.getByText(col)).toBeInTheDocument()
    }
    // TCS: 100 → 110 → +10 → +10.00%.
    expect(screen.getByText('₹100.00')).toBeInTheDocument()
    expect(screen.getByText('₹110.00')).toBeInTheDocument()
    expect(screen.getByText('₹10.00')).toBeInTheDocument()
    expect(screen.getByText('10.00%')).toBeInTheDocument()
  })

  it('excludes zero and negative positions, and other currencies', () => {
    render(<HoldingsModal row={today} prev={prev} region="INR" onClose={() => {}} />)
    expect(screen.getByText('TCS')).toBeInTheDocument()
    expect(screen.queryByText('Sold Out')).toBeNull()   // quantity 0
    expect(screen.queryByText('Shorted')).toBeNull()    // quantity < 0
    expect(screen.queryByText('SAP')).toBeNull()        // other currency
  })

  it('scopes to the selected currency (EUR) with its symbol', () => {
    render(<HoldingsModal row={today} prev={prev} region="EUR" onClose={() => {}} />)
    expect(screen.getByText('SAP')).toBeInTheDocument()
    expect(screen.getByText('€10.00')).toBeInTheDocument()
    expect(screen.getByText('€12.00')).toBeInTheDocument()
    expect(screen.queryByText('TCS')).toBeNull()
  })

  it('shows an em dash when a stock has no prior-day price', () => {
    const noPrev: HistoryRow = row({ date: '2026-06-25', holdings: [
      { symbol: 'NEW.NS', script: 'New Co', currency: 'INR', quantity: 1, close_price: 50, current: 50 },
    ] })
    render(<HoldingsModal row={noPrev} prev={null} region="INR" onClose={() => {}} />)
    expect(screen.getByText('New Co')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn()
    render(<HoldingsModal row={today} prev={prev} region="INR" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('HistoryTable currency-cell click → onSelectRegion', () => {
  const newer = row({
    date: '2026-06-25',
    regions: {
      INR: { invested: 100, current: 110, source: 'cron' },
      EUR: { invested: 20, current: 24, source: 'cron' },
    },
    holdings: [
      { symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 110 },
      { symbol: 'SAP.DE', script: 'SAP', currency: 'EUR', quantity: 2, close_price: 12 },
    ],
  })
  const older = row({
    date: '2026-06-24',
    regions: { INR: { invested: 100, current: 100, source: 'cron' } },
    holdings: [{ symbol: 'TCS.NS', script: 'TCS', currency: 'INR', quantity: 2, close_price: 100 }],
  })

  it('opens with the clicked row, prior row, and the clicked currency', () => {
    const onSelectRegion = vi.fn()
    render(<HistoryTable rows={[newer, older]} currency="INR" onDelete={() => {}} onSelectRegion={onSelectRegion} />)
    fireEvent.click(screen.getAllByTitle('View EUR holdings')[0])
    expect(onSelectRegion).toHaveBeenCalledTimes(1)
    expect(onSelectRegion.mock.calls[0][0].date).toBe('2026-06-25')
    expect(onSelectRegion.mock.calls[0][1].date).toBe('2026-06-24')
    expect(onSelectRegion.mock.calls[0][2]).toBe('EUR')
  })

  it('is not clickable for a currency with no positive holding', () => {
    const onSelectRegion = vi.fn()
    // older holds only INR → its EUR cells are not selectable.
    render(<HistoryTable rows={[older]} currency="INR" onDelete={() => {}} onSelectRegion={onSelectRegion} />)
    expect(screen.queryByTitle('View EUR holdings')).toBeNull()
  })
})

describe('HistoryTable currency cell — accessibility', () => {
  const r = row({
    date: '2026-06-25',
    regions: { EUR: { invested: 20, current: 24, source: 'cron' } },
    holdings: [{ symbol: 'SAP.DE', script: 'SAP', currency: 'EUR', quantity: 2, close_price: 12 }],
  })

  it('exposes exactly one focusable button per clickable currency group', () => {
    render(<HistoryTable rows={[r]} currency="INR" onDelete={() => {}} onSelectRegion={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'View EUR holdings' })).toHaveLength(1)
  })

  it('opens via keyboard (Enter) on the group button', () => {
    const onSelectRegion = vi.fn()
    render(<HistoryTable rows={[r]} currency="INR" onDelete={() => {}} onSelectRegion={onSelectRegion} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'View EUR holdings' }), { key: 'Enter' })
    expect(onSelectRegion).toHaveBeenCalledTimes(1)
    expect(onSelectRegion.mock.calls[0][2]).toBe('EUR')
  })
})

describe('HoldingsModal — duplicate symbol', () => {
  it('renders both same-symbol holdings and matches each to its own prior price', () => {
    const today: HistoryRow = row({ date: '2026-06-25', holdings: [
      { symbol: 'DUP.NS', script: 'Plan A', currency: 'INR', quantity: 1, close_price: 110 },
      { symbol: 'DUP.NS', script: 'Plan B', currency: 'INR', quantity: 2, close_price: 220 },
    ] })
    const prev: HistoryRow = row({ date: '2026-06-24', holdings: [
      { symbol: 'DUP.NS', script: 'Plan A', currency: 'INR', quantity: 1, close_price: 100 },
      { symbol: 'DUP.NS', script: 'Plan B', currency: 'INR', quantity: 2, close_price: 200 },
    ] })
    render(<HoldingsModal row={today} prev={prev} region="INR" onClose={() => {}} />)
    expect(screen.getByText('Plan A')).toBeInTheDocument()
    expect(screen.getByText('Plan B')).toBeInTheDocument()
    expect(screen.getByText('₹100.00')).toBeInTheDocument() // Plan A yesterday
    expect(screen.getByText('₹200.00')).toBeInTheDocument() // Plan B yesterday
  })
})

describe('HoldingsModal — change colour coding', () => {
  const today: HistoryRow = row({ date: '2026-06-25', holdings: [
    { symbol: 'UP.NS', script: 'Up', currency: 'INR', quantity: 1, close_price: 110 },
    { symbol: 'DN.NS', script: 'Down', currency: 'INR', quantity: 1, close_price: 90 },
    { symbol: 'FLAT.NS', script: 'Flat', currency: 'INR', quantity: 1, close_price: 100 },
  ] })
  const prev: HistoryRow = row({ date: '2026-06-24', holdings: [
    { symbol: 'UP.NS', script: 'Up', currency: 'INR', quantity: 1, close_price: 100 },
    { symbol: 'DN.NS', script: 'Down', currency: 'INR', quantity: 1, close_price: 100 },
    { symbol: 'FLAT.NS', script: 'Flat', currency: 'INR', quantity: 1, close_price: 100 },
  ] })

  it('paints change green for up, red for down, blue for unchanged', () => {
    render(<HoldingsModal row={today} prev={prev} region="INR" onClose={() => {}} />)
    const colorOf = (label: string) =>
      (screen.getByText(label).closest('tr')!.querySelectorAll('td')[3] as HTMLTableCellElement).style.color
    expect(colorOf('Up')).toContain('--green')
    expect(colorOf('Down')).toContain('--red')
    expect(colorOf('Flat')).toContain('--blue')
  })
})
