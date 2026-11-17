// Sortable holdings headers are keyboard buttons inside scoped th cells, and
// only the active column carries aria-sort (PD-058 Task 5).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HoldingWithPrice } from '../../types'
import HoldingsTable from './HoldingsTable'

const holding = (id: string, script: string, shares: number) => ({
  id, script, symbol: `${script}.NS`, currency: 'INR', stocks_owned: shares,
  avg_cost_price: 10, current_price: 12,
}) as HoldingWithPrice

const renderTable = () => render(
  <HoldingsTable holdings={[holding('one', 'ALPHA', 5), holding('two', 'BETA', 1)]} loading={false}
    onEdit={() => {}} onDelete={() => {}} />,
)

const header = (name: RegExp) => screen.getByRole('button', { name }).closest('th')!
const firstScript = () => within(screen.getAllByRole('row')[1]).getAllByText(/^(ALPHA|BETA)$/)[0].textContent

describe('HoldingsTable sort headers', () => {
  it('sorts by a column from a header button and marks only that column', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: /^Shares/ }))

    expect(header(/^Shares/)).toHaveAttribute('aria-sort', 'ascending')
    expect(firstScript()).toBe('BETA')
    expect(header(/^Avg Cost/)).not.toHaveAttribute('aria-sort')

    fireEvent.click(screen.getByRole('button', { name: /^Shares/ }))
    expect(header(/^Shares/)).toHaveAttribute('aria-sort', 'descending')
    expect(firstScript()).toBe('ALPHA')
  })

  it('makes avg cost sortable the same way', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: /^Avg Cost\/Sh/ }))
    expect(header(/^Avg Cost/)).toHaveAttribute('aria-sort', 'ascending')
  })

  it('scopes every header cell to its column', () => {
    renderTable()
    for (const cell of screen.getAllByRole('columnheader')) expect(cell).toHaveAttribute('scope', 'col')
  })
})
