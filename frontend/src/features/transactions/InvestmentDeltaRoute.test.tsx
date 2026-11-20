import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockUiMode = vi.hoisted(() => ({ mode: 'classic' as 'classic' | 'glass' | 'ui2' }))
vi.mock('../../lib/uiMode', async () => {
  const actual = await vi.importActual<typeof import('../../lib/uiMode')>('../../lib/uiMode')
  return { ...actual, useUiMode: () => mockUiMode.mode }
})

vi.mock('../../ui2/transactions/Ui2InvestmentDelta', () => ({
  Ui2InvestmentDeltaPage: () => <p>UI_2.0 investment delta page</p>,
}))

import InvestmentDeltaRoute from './InvestmentDeltaRoute'

const renderRoute = () => render(
  <MemoryRouter initialEntries={['/transactions/delta']}>
    <Routes>
      <Route path="/transactions" element={<p>Transactions page</p>} />
      <Route path="/transactions/delta" element={<InvestmentDeltaRoute />} />
    </Routes>
  </MemoryRouter>,
)

describe('InvestmentDeltaRoute', () => {
  it('shows the investment delta page in UI_2.0', () => {
    mockUiMode.mode = 'ui2'
    renderRoute()
    expect(screen.getByText('UI_2.0 investment delta page')).toBeInTheDocument()
  })

  it.each(['classic', 'glass'] as const)('sends %s back to Transactions, where the graph is inline', mode => {
    mockUiMode.mode = mode
    renderRoute()
    expect(screen.getByText('Transactions page')).toBeInTheDocument()
  })
})
