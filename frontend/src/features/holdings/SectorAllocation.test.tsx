import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import Charts from '../../components/Charts'

const rows: HoldingWithPrice[] = [
  { symbol: 'TCS', script: 'TCS', currency: 'INR', stocks_owned: 1, current_price: 60, current_value: 60,
    classification: { symbol: 'TCS', status: 'resolved', sector: 'Technology' } },
  { symbol: 'NOQUOTE', currency: 'INR', stocks_owned: 1, price_error: 'no quote' },
  { symbol: 'SAP', currency: 'EUR', stocks_owned: 1, current_price: 30, current_value: 9999, current_value_eur: 30,
    classification: { symbol: 'SAP', status: 'resolved', sector: 'Technology' } },
]

describe('Sectors chart', () => {
  it('mounts only when selected and exposes native values and navigation in the legend', () => {
    const onSelectSector = vi.fn()
    render(<Charts holdings={rows} onSelectSector={onSelectSector} />)
    expect(screen.queryByRole('region', { name: 'Sector allocation' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sectors' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 unpriced holding is excluded')
    const legend = screen.getByRole('list', { name: 'Sector allocation values' })
    expect(within(legend).getByText('₹60.00')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Sector allocation currency'), { target: { value: 'EUR' } })
    expect(within(legend).getByText('€30.00')).toBeInTheDocument()
    expect(within(legend).queryByText(/9,999/)).not.toBeInTheDocument()
    fireEvent.click(within(legend).getByRole('button', { name: /Technology/ }))
    expect(onSelectSector).toHaveBeenCalledWith({ currency: 'EUR', key: 'sector:technology' })
  })

  it('explains zero priced value without NaN/Infinity', () => {
    render(<Charts holdings={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sectors' }))
    expect(screen.getByText('No priced positive holdings in INR to allocate.')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/)
  })
})
