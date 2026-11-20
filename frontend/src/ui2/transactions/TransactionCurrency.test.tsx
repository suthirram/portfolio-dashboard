import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactionCurrency } from './TransactionCurrency'

describe('TransactionCurrency', () => {
  it.each([
    ['INR', '🇮🇳'],
    ['EUR', '🇪🇺'],
  ])('shows the %s flag while keeping the currency code accessible', (currency, flag) => {
    render(<div role="status"><TransactionCurrency currency={currency} /></div>)
    expect(screen.getByRole('status')).toHaveTextContent(`${flag} ${currency}`)
    expect(screen.getByText(flag)).toHaveAttribute('aria-hidden', 'true')
  })

  it('leaves an unknown currency as its code', () => {
    render(<div role="status"><TransactionCurrency currency="USD" /></div>)
    expect(screen.getByRole('status')).toHaveTextContent('USD')
  })
})
