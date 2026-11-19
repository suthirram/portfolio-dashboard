import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Ui2SummaryCards } from './Ui2SummaryCards'

it('switches portfolio totals while preserving native breakdown values and dialog focus', () => {
  render(<Ui2SummaryCards summary={{eur_rate: 0.01, previous_close_date: "2026-11-16"}} daily={{EUR: null}} assets={[
    { label: 'EUR equities', currency: 'EUR', current: 100, invested: 80, unrealised: 20, realised: 0, income: 5 },
    { label: 'Physical gold', currency: 'INR', current: 5000, invested: 4000, unrealised: 1000, realised: 0, income: 0 },
  ]} />)
  expect(screen.getAllByRole('heading').map(item => item.textContent)).toEqual([
    'Total portfolio value', 'Unrealised return', 'Today by currency', 'Realised gains', 'Dividends',
  ])
  expect(screen.getByText('₹15,000.00')).toBeVisible()
  expect(screen.getByText('≈ €150.00 converted equivalent')).toBeVisible()
  expect(screen.getByText('vs 2026-11-16 close')).toBeVisible()
  expect(screen.getByText('INR · — (—)')).toBeVisible()
  expect(screen.getByText('EUR · — (—)')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Display currency'), { target: {value: 'EUR'} })
  expect(screen.getByText('€150.00')).toBeVisible()
  const button = screen.getByRole('button', {name: 'View breakdown · Total portfolio value'})
  button.focus()
  fireEvent.click(button)
  expect(within(screen.getByRole('dialog')).getByText(/Current ₹5,000.00/)).toBeVisible()
  fireEvent.keyDown(document, {key: 'Escape'})
  expect(button).toHaveFocus()
})

it('keeps native totals available when conversion has no usable rate', () => {
  render(<Ui2SummaryCards summary={{}} daily={{}} assets={[
    { label: 'INR equities', currency: 'INR', current: 100, invested: 80, unrealised: 20, realised: -5, income: 0 },
  ]} />)
  expect(screen.getByText('₹100.00')).toBeVisible()
  expect(screen.getByText('-₹5.00')).toBeVisible()
  expect(screen.getByText('₹0.00')).toBeVisible()
  expect(screen.getByText('≈ — converted equivalent')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Display currency'), { target: { value: 'EUR' } })
  expect(screen.queryByText('€100.00')).toBeNull()
  expect(screen.getByText('Conversion rate unavailable')).toBeVisible()
})

it('withholds an incomplete valuation while keeping realised gains and income', () => {
  render(<Ui2SummaryCards summary={{eur_rate: 0.01}} daily={{INR: null, EUR: {gain: 0, previousValue: 100, pct: 0}}} assets={[
    { label: 'INR equities', currency: 'INR', current: null, invested: 80, unrealised: null, realised: 5, income: 2 },
    { label: 'EUR equities', currency: 'EUR', current: 100, invested: 80, unrealised: 20, realised: 0, income: 0 },
  ]} />)
  const cards = screen.getByRole('region', { name: 'Portfolio summary' })
  expect(cards).not.toHaveTextContent('₹10,000.00')
  expect(screen.getByText('₹5.00')).toBeVisible()
  expect(screen.getByText('₹2.00')).toBeVisible()
  expect(screen.getByText('EUR · €0.00 (0.00%)')).toBeVisible()
  expect(screen.getByText('INR · — (—)')).toBeVisible()
})

it.each([0, -1, NaN, Infinity])('treats rate %s as unavailable', rate => {
  render(<Ui2SummaryCards summary={{eur_rate: rate}} daily={{}} assets={[
    { label: 'EUR equities', currency: 'EUR', current: 100, invested: 80, unrealised: 20, realised: 0, income: 0 },
  ]} />)
  expect(screen.getByText('Conversion rate unavailable')).toBeVisible()
  expect(screen.queryByText(/Infinity|NaN/)).toBeNull()
})
