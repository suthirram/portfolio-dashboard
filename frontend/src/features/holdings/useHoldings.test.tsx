import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useHoldings } from './useHoldings'
import type { HoldingWithPrice } from '../../types'

const mockApi = vi.hoisted(() => ({
  listHoldings: vi.fn(),
  getPrices: vi.fn(),
  getSummary: vi.fn(),
  getStockXirr: vi.fn(),
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
  mockApi.getStockXirr.mockResolvedValue({
    as_of: '2026-11-11',
    currencies: [{ currency: 'INR', xirr: 0.12, since: '2024-01-01', undated_openings: 0 }],
    holdings: [{ holding_id: '1', xirr: 0.2, since: '2024-01-01', undated_opening: false }],
  })
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

  it('keeps the Yahoo close when the snapshot has the holding too, the snapshot winning', async () => {
    mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding({ previous_close_price: 90 })] })
    const { result } = renderHook(() => useHoldings())

    await waitFor(() => {
      expect(result.current.enriched[0]?.previous_close_price).toBe(100)
    })
  })

  it('keeps the Yahoo close when there is no snapshot yet', async () => {
    mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding({ previous_close_price: 90 })] })
    mockApi.getSummary.mockResolvedValue({})
    const { result } = renderHook(() => useHoldings())

    await waitFor(() => {
      expect(result.current.enriched[0]?.previous_close_price).toBe(90)
    })
    expect(mockApi.listHistory).not.toHaveBeenCalled()
  })

  it('keeps the Yahoo close in admin act-as mode', async () => {
    mockApi.getPrices.mockResolvedValue({ holdings: [liveHolding({ previous_close_price: 90 })] })
    const { result } = renderHook(() => useHoldings('user-1'))

    await waitFor(() => {
      expect(result.current.enriched[0]?.previous_close_price).toBe(90)
    })
  })

  it('does not fetch own-history snapshots in admin act-as mode', async () => {
    const { result } = renderHook(() => useHoldings('user-1'))

    await waitFor(() => {
      expect(result.current.enriched[0]?.current_price).toBe(120)
    })

    expect(mockApi.getPrices).toHaveBeenCalledWith('user-1')
    expect(mockApi.listHistory).not.toHaveBeenCalled()
  })

  it('indexes the stock XIRR by holding and currency, act-as included', async () => {
    const { result } = renderHook(() => useHoldings('user-1'))

    await waitFor(() => {
      expect(result.current.xirr?.byHolding['1']?.xirr).toBe(0.2)
    })
    expect(result.current.xirr?.byCurrency.INR?.xirr).toBe(0.12)
    expect(mockApi.getStockXirr).toHaveBeenCalledWith('user-1')
  })

  it('still loads prices when /xirr fails, with no rates', async () => {
    mockApi.getStockXirr.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useHoldings())

    await waitFor(() => {
      expect(result.current.enriched[0]?.current_price).toBe(120)
    })
    expect(result.current.xirr).toBeNull()
  })
})
