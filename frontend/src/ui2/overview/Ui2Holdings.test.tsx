import { fireEvent, render, screen, within } from '@testing-library/react'
import type { XirrIndex } from '../../features/holdings/stockXirr'
import { Ui2Holdings } from './Ui2Holdings'

const holding = (currency: 'INR' | 'EUR', id: string) => ({
  id, script: currency === 'INR' ? 'Indian stock' : 'European stock', symbol: currency === 'INR' ? 'TST.NS' : 'TST.DE',
  exchange: currency === 'INR' ? 'NSE' as const : 'OTHER' as const, currency, stocks_owned: 1, avg_cost_price: 100,
  current_price: 110, current_value: currency === 'INR' ? 110 : 11_000, current_value_eur: currency === 'EUR' ? 110 : 1.1,
  cost_price: 100, cost_price_eur: currency === 'EUR' ? 100 : 1, unrealized_pnl: 10, unrealized_pnl_eur: 10,
})

it('renders separate INR and EUR tables with independent collapse controls', () => {
  render(<Ui2Holdings rows={[holding('INR', 'inr'), holding('EUR', 'eur')]} select={() => undefined} />)

  expect(screen.getByRole('table', { name: 'INR holdings' })).toBeVisible()
  expect(screen.getByRole('table', { name: 'EUR holdings' })).toBeVisible()
  expect(screen.getAllByText('Cost')).toHaveLength(2)
  expect(screen.getAllByText('Current value')).toHaveLength(2)
  expect(screen.getAllByText('Unrealised')).toHaveLength(2)
  expect(screen.getAllByText('Realised')).toHaveLength(2)
  expect(screen.getAllByText('Today')).toHaveLength(2)
  expect(screen.getAllByText('XIRR')).toHaveLength(2)

  fireEvent.click(screen.getByRole('button', { name: 'Collapse INR table' }))

  expect(screen.getByRole('button', { name: 'Expand INR table' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('table', { name: 'EUR holdings' })).toBeVisible()
  expect(screen.getByRole('table', { name: 'INR holdings', hidden: true })).not.toBeVisible()
})

it('colours the header metrics green, red or blue by sign and leaves cost uncoloured', () => {
  const falling = { ...holding('EUR', 'eur'), previous_close_price: 120, realized_pnl: 0, realized_pnl_eur: 0 }
  const xirr = { asOf: '2026-11-26', byHolding: {}, byCurrency: { EUR: { currency: 'EUR', xirr: 0.0813, since: '2025-04-30' } } } as unknown as XirrIndex
  render(<Ui2Holdings rows={[falling]} select={() => undefined} xirr={xirr} />)
  const header = within(screen.getByRole('region', { name: /^Euro/ }))
  const value = (label: string) => header.getByText(label).nextElementSibling as HTMLElement

  expect(value('Cost').className).toBe('')
  expect(value('Current value')).toHaveClass('u2-neutral')
  expect(value('Unrealised')).toHaveClass('u2-positive')
  expect(value('Realised')).toHaveClass('u2-neutral')
  expect(value('Today')).toHaveClass('u2-negative')
  expect(value('XIRR')).toHaveClass('u2-positive')
  expect(value('XIRR').nextElementSibling).toHaveClass('u2-metric-xsub')
})
