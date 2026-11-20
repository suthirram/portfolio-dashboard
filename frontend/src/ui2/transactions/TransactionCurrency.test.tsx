import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CurrencyPill } from './TransactionCurrency'
import { CURRENCY_PILL_COLOURS, type CurrencyCode } from './currencyPillConfig'
import type { ThemeName } from '../../lib/useTheme'

describe('CurrencyPill', () => {
  it.each(['light', 'dark', 'cyberpunk'] as ThemeName[])('uses the %s palette for both currencies', theme => {
    for (const currency of ['INR', 'EUR'] as CurrencyCode[]) {
      const { unmount } = render(<CurrencyPill currency={currency} theme={theme} />)
      const pill = screen.getByText(currency).parentElement!
      expect(pill).toHaveStyle({ backgroundColor: CURRENCY_PILL_COLOURS[theme][currency].bg })
      expect(pill).toHaveStyle({ color: CURRENCY_PILL_COLOURS[theme][currency].text })
      expect(pill.querySelector('span[aria-hidden="true"] svg')).toBeInTheDocument()
      unmount()
    }
  })

  it('leaves an unknown currency as its code', () => {
    render(<div role="status"><CurrencyPill currency="USD" theme="light" /></div>)
    expect(screen.getByRole('status')).toHaveTextContent('USD')
  })
})
