// Date defaults follow the IST calendar day (PD-058 Task 4): at 01:30 IST the
// UTC date is still yesterday, and a UTC slice used to prefill it.
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../types'

const mockApi = vi.hoisted(() => ({
  listTransactions: vi.fn().mockResolvedValue([]),
  listHistory: vi.fn().mockResolvedValue({ rows: [] }),
}))
vi.mock('../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../lib/api/client')>('../lib/api/client')
  return { ...actual, api: mockApi }
})

import TransactionsModal from './holdings/TransactionsModal'
import { AddRowModal } from './history/HistoryModals'
import HistoryChartPage from './history/HistoryChartPage'

// 2026-11-17 20:00 UTC is 2026-11-18 01:30 IST.
const LATE_NIGHT_IST = new Date('2026-11-17T20:00:00Z')

describe('date defaults at 01:30 IST', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(LATE_NIGHT_IST)
  })
  afterEach(() => vi.useRealTimers())

  it('prefills a new ledger transaction with the IST day', async () => {
    const holding = { id: 'holding-1', script: 'VWCE', currency: 'EUR' } as HoldingWithPrice
    const { container } = render(<TransactionsModal holding={holding} onClose={() => {}} onChanged={() => {}} />)
    await waitFor(() => expect(mockApi.listTransactions).toHaveBeenCalled())
    expect(container.querySelector('input[type="date"]')).toHaveValue('2026-11-18')
  })

  it('prefills a manual History row with the IST day', () => {
    render(<AddRowModal onSubmit={async () => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-18')
  })

  it('loads the full-history chart up to the IST day', async () => {
    render(
      <MemoryRouter initialEntries={['/history/chart/INR']}>
        <Routes><Route path="/history/chart/:region" element={<HistoryChartPage />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockApi.listHistory).toHaveBeenCalledWith(expect.any(String), '2026-11-18'))
  })
})
