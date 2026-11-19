import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import { Ui2Allocation } from './Ui2Allocation'

const classification = (symbol: string) => ({ status: 'resolved' as const, symbol, sector: 'Technology' })
const technology: HoldingWithPrice[] = [
  { currency: 'EUR', id: 'sap', symbol: 'SAP.DE', stocks_owned: 1, current_price: 100, current_value_eur: 100, current_value: 10000, classification: classification('SAP.DE') },
  { currency: 'INR', id: 'tcs', symbol: 'TCS.NS', stocks_owned: 1, current_price: 10000, current_value: 10000, classification: classification('TCS.NS') },
]

it('selects the sector at its first currency group, only in the Sector view', () => {
  const onSelectSector = vi.fn()
  render(<Ui2Allocation holdings={technology} onSelectSector={onSelectSector} />)
  // Holding view: entries are plain text.
  expect(screen.queryByRole('button', { name: /Show .* holdings/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Sector' }))
  expect(screen.getByText('Select a sector to see its holdings.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Show Technology holdings/ }))
  // INR is listed before EUR, so the jump lands on the first group.
  expect(onSelectSector).toHaveBeenCalledWith({ currency: 'INR', key: 'sector:technology' })
  fireEvent.click(screen.getByRole('button', { name: 'Currency' }))
  expect(screen.queryByRole('button', { name: /Show .* holdings/ })).toBeNull()
})

it('keeps sector entries static when nothing handles the selection', () => {
  render(<Ui2Allocation holdings={technology} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sector' }))
  expect(screen.queryByRole('button', { name: /Show .* holdings/ })).toBeNull()
})

it('withholds percentages when a priced EUR holding lacks an INR valuation', () => {
  render(<Ui2Allocation holdings={[
    { currency: 'INR', id: 'one', stocks_owned: 1, current_price: 10000, current_value: 10000 },
    { currency: 'EUR', id: 'two', stocks_owned: 1, current_price: 100, current_value_eur: 100 },
  ]} />)
  expect(screen.getByText(/missing INR valuation/)).toBeVisible()
  expect(screen.queryByText(/100.0%/)).toBeNull()
})
