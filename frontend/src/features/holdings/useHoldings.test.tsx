import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHoldings } from './useHoldings'
import type { HoldingWithPrice } from '../../types'

const mockApi = vi.hoisted(() => ({
  listHoldings: vi.fn(),
  getPrices: vi.fn(),
  getSummary: vi.fn(),
  listHistory: vi.fn(),
  deleteHolding: vi.fn(),
}))

vi.mock('../../lib/api/client', () => ({ api: mockApi }))

const liveHolding = (overrides: Partial<HoldingWithPrice> = {}): HoldingWithPrice => ({
  id: '1',
  script: 'TCS',
  symbol: 'TCS.NS',
  exchange: 'NSE',
  type: 'stock',
  stocks_owned: 1,
  avg_cost_price: 100,
  realized_pnl: 0,
  currency: 'INR',
  current_price: 120,
  current_value: 120,
  ...overrides,
} as HoldingWithPrice)

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.listHoldings.mockResolvedValue([])
  mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding()] })
  mockApi.getSummary.mockResolvedValue({ previous_close_date: '2026-06-24' })
  mockApi.listHistory.mockResolvedValue({
    currency: 'INR',
    rows: [{
      date: '2026-06-24',
      regions: {},
      totals: { invested_total: 0, current_total: 0, pnl_pct: null },
      holdings: [{
        symbol: 'TCS.NS',
        script: 'TCS',
        currency: 'INR',
        quantity: 1,
        close_price: 100,
      }],
    }],
  })
})

describe('useHoldings', () => {
  it('enriches live holdings with previous close prices from the snapshot row', async () => {
    const { result } = renderHook(() => useHoldings())

    await waitFor(() => {
      expect(result.current.enriched[0]?.previous_close_price).toBe(100)
    })

    expect(mockApi.listHistory).toHaveBeenCalledWith('2026-06-24', '2026-06-24')
  })

  it('does not fetch own-history snapshots in admin act-as mode', async () => {
    const { result } = renderHook(() => useHoldings('user-1'))

    await waitFor(() => {
      expect(result.current.enriched[0]?.current_price).toBe(120)
    })

    expect(mockApi.getPrices).toHaveBeenCalledWith('user-1')
    expect(mockApi.listHistory).not.toHaveBeenCalled()
  })
})
