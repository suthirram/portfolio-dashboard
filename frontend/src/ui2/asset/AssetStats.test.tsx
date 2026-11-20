import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssetStats } from './AssetStats'

describe('AssetStats', () => {
  it('makes the first card the hero and the rest plain', () => {
    render(<AssetStats stats={[
      { label: 'Total dividends · INR', value: '₹900.00', detail: 'All payments in this currency' },
      { label: 'Payments', value: '2', detail: 'Recorded dividends' },
    ]} />)
    expect(screen.getByRole('region', { name: 'Total dividends · INR' })).toHaveClass('hero')
    expect(screen.getByRole('region', { name: 'Payments' })).not.toHaveClass('hero')
  })

  it('renders the detail line only when given one', () => {
    render(<AssetStats stats={[
      { label: 'Payment range', value: '—', detail: 'No recorded payments' },
      { label: 'Holdings paying', value: '0' },
    ]} />)
    expect(screen.getByText('No recorded payments')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Holdings paying' }).querySelector('.stat-detail')).toBeNull()
  })

  it('applies the tone class to the value', () => {
    render(<AssetStats stats={[{ label: 'Net P/L', value: '−₹10.00', tone: 'negative' }]} />)
    expect(screen.getByText('−₹10.00')).toHaveClass('u2-negative')
  })
})
