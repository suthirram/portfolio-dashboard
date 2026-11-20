import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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
  // R33 resolved as inline: /transactions/delta redirects back for all UI modes
  // because the investment delta now lives inline on the Transactions page.
  it.each(['classic', 'glass', 'ui2'] as const)('redirects %s back to Transactions', () => {
    renderRoute()
    expect(screen.getByText('Transactions page')).toBeInTheDocument()
  })
})
