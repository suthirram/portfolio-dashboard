import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PortfolioHero, valueSplit } from './PortfolioHero'
import type { HoldingWithPreviousClose } from '../features/holdings/dashboardPriceMovement'

const held = (currency: string, currentValue: number) =>
  ({ id: `${currency}-${currentValue}`, currency, current_value: currentValue }) as HoldingWithPreviousClose

const summary = { total_current_value: 120000, total_current_value_eur: 1320, total_cost: 100000, total_unrealized: 20000 }

describe('valueSplit', () => {
  it('shares the INR-denominated current value between currencies', () => {
    expect(valueSplit([held('INR', 300), held('EUR', 100), held('INR', 0)])).toEqual([
      { currency: 'INR', value: 300, share: 0.75 },
      { currency: 'EUR', value: 100, share: 0.25 },
    ])
    expect(valueSplit([])).toEqual([])
  })
})

describe('PortfolioHero', () => {
  it('shows the value, each held currency today and the unrealised gain', () => {
    render(<PortfolioHero summary={summary} loading={false} holdings={[held('INR', 90000), held('EUR', 30000)]}
      dayChange={{ INR: { gain: 1500, previousValue: 100000, pct: 1.5 }, EUR: null }} />)
    expect(screen.getByText('₹1,20,000.00')).toBeInTheDocument()
    expect(screen.getByText('Today · INR').parentElement).toHaveTextContent('+₹1,500.00 +1.50%')
    expect(screen.getByText('Today · EUR').parentElement).toHaveTextContent('—')
    expect(screen.getByText('Unrealised').parentElement).toHaveTextContent('+₹20,000.00 +20.00%')
    expect(screen.getByRole('img', { name: 'INR 75%, EUR 25%' })).toBeInTheDocument()
  })

  it('marks each currency chip with its flag', () => {
    render(<PortfolioHero summary={summary} loading={false} holdings={[held('INR', 90000), held('EUR', 30000)]}
      dayChange={{ INR: { gain: 1, previousValue: 100, pct: 1 }, EUR: { gain: 1, previousValue: 100, pct: 1 } }} />)
    expect(screen.getByText('Today · INR').querySelector('[data-flag="IN"]')).not.toBeNull()
    expect(screen.getByText('Today · EUR').querySelector('[data-flag="EU"]')).not.toBeNull()
    expect(screen.getByText('Unrealised').querySelector('.currency-flag')).toBeNull()
  })

  it('leaves out a currency that is not held', () => {
    render(<PortfolioHero summary={summary} loading={false} holdings={[held('INR', 90000)]}
      dayChange={{ INR: { gain: -200, previousValue: 1000, pct: -20 } }} />)
    expect(screen.queryByText('Today · EUR')).toBeNull()
    expect(screen.getByText('Today · INR').parentElement).toHaveClass('neg')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('shows a skeleton while the first summary loads', () => {
    render(<PortfolioHero summary={null} loading holdings={[]} dayChange={{}} />)
    expect(screen.getByLabelText('Loading portfolio')).toHaveAttribute('aria-busy', 'true')
  })
})
