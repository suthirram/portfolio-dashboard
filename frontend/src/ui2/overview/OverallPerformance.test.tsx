import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type OverallPoint } from '../../lib/api/client'
import { flowAdjustedReturnPct } from '../../features/history/historyShared'
import OverallPerformance, { overallDisplayPoints } from './OverallPerformance'

vi.mock('../../lib/api/client', async importOriginal => {
  const original = await importOriginal<typeof import('../../lib/api/client')>()
  return { ...original, api: { ...original.api, getOverallHistory: vi.fn() } }
})

const point = (date: string, investedInr?: number, currentInr?: number,
  options: Partial<OverallPoint> = {}): OverallPoint => ({
  date,
  invested_inr: investedInr,
  current_inr: currentInr,
  invested_eur: investedInr == null ? undefined : investedInr / 100,
  current_eur: currentInr == null ? undefined : currentInr / 100,
  eur_inr: 100,
  fx_carried: false,
  missing_rate: false,
  gold_unvalued: false,
  ...options,
})

const series = [
  point('2025-12-10', 1000, 1100),
  point('2025-12-11', 1500, 1650),
  point('2025-12-12', 1600, 1700, { fx_carried: true }),
  point('2025-12-13', undefined, undefined, { missing_rate: true, fx_carried: true }),
  point('2025-12-14', 1700, 1800),
]

beforeEach(() => {
  vi.setSystemTime(new Date('2026-01-10T03:00:00.000Z'))
  vi.mocked(api.getOverallHistory).mockReset()
  vi.mocked(api.getOverallHistory).mockResolvedValue({ points: series, gold_unavailable: false })
})

describe('overallDisplayPoints', () => {
  it('uses selected currency amounts and computes P/L and flow-adjusted movement from daily points', () => {
    const actual = overallDisplayPoints(series.slice(0, 2), 'INR')
    expect(actual[1].pnl_pct).toBeCloseTo(10)
    expect(actual[1].movement_pct).toBeCloseTo(flowAdjustedReturnPct(1100, 1650, 1000, 1500) ?? NaN)

    const eur = overallDisplayPoints(series.slice(0, 2), 'EUR')
    expect(eur[1].invested).toBe(15)
    expect(eur[1].current).toBe(16.5)
  })

  it('keeps missing valuation amounts and derived percentages unavailable', () => {
    const actual = overallDisplayPoints(series, 'INR')
    expect(actual[3].invested).toBeNull()
    expect(actual[3].current).toBeNull()
    expect(actual[3].pnl_pct).toBeNull()
    expect(actual[4].movement_pct).toBeNull()
  })
})

describe('OverallPerformance', () => {
  it('loads a leading comparison day and shows the handoff controls and SVG graph', async () => {
    render(<OverallPerformance />)

    await waitFor(() => expect(api.getOverallHistory).toHaveBeenCalledWith('2025-12-11', '2026-01-10'))
    expect(screen.getByRole('heading', { name: 'Overall performance' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Overall chart period' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Overall chart metric' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /invested amount and current value in INR/ })).toBeInTheDocument()
    expect(screen.getByText(/1 day uses a carried EUR\/INR rate/)).toBeInTheDocument()
    expect(screen.getByText('View chart data')).toBeInTheDocument()
    expect(screen.queryByLabelText('Preview data state')).not.toBeInTheDocument()
  })

  it('switches display currency, metric and period without losing the data table', async () => {
    render(<OverallPerformance />)
    await screen.findByRole('img', { name: /in INR/ })

    fireEvent.change(screen.getByRole('combobox', { name: 'Overall chart display currency' }), { target: { value: 'EUR' } })
    expect(screen.getByRole('img', { name: /in EUR/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Daily movement' }))
    expect(screen.getByRole('img', { name: /daily movement percentage in EUR/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(api.getOverallHistory).toHaveBeenLastCalledWith('1999-12-31', '2026-01-10'))
    expect(screen.getByText('View chart data')).toBeInTheDocument()
  })

  it('never charts partial totals when the Gold service is unavailable', async () => {
    vi.mocked(api.getOverallHistory).mockResolvedValue({ points: series, gold_unavailable: true })
    render(<OverallPerformance />)

    expect(await screen.findByText('Overall value unavailable')).toBeInTheDocument()
    expect(screen.getByText(/No partial stock total is displayed/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('View chart data'))
    expect(screen.getByText('Gold data unavailable; complete total withheld')).toBeInTheDocument()
  })

  it('does not request owner-scoped overall data while acting as another user', () => {
    const { container } = render(<OverallPerformance isActingAs />)
    expect(api.getOverallHistory).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows missing-rate and unpriced-gold flags in the chart data table', async () => {
    vi.mocked(api.getOverallHistory).mockResolvedValue({
      points: [
        point('2026-01-09', undefined, undefined, { gold_unvalued: true }),
        point('2026-01-10', undefined, undefined, { missing_rate: true, fx_carried: true }),
      ],
      gold_unavailable: false,
    })
    render(<OverallPerformance />)
    await screen.findByText('Overall value unavailable')
    fireEvent.click(screen.getByText('View chart data'))
    expect(screen.getByText('Gold held without a recorded price')).toBeInTheDocument()
    expect(screen.getByText('FX rate unavailable')).toBeInTheDocument()
  })
})
