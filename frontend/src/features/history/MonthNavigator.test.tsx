import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MonthNavigator, shiftMonth, type YearMonth } from './MonthNavigator'

const MIN = { year: 2020, month0: 0 }
const MAX = { year: 2026, month0: 10 } // November 2026

function Harness({ start }: { start: YearMonth }) {
  const [value, setValue] = useState(start)
  return <MonthNavigator value={value} min={MIN} max={MAX} onChange={setValue} />
}
const monthButton = () => screen.getByRole('button', { name: /^Month: / })

describe('shiftMonth', () => {
  it('crosses year boundaries and stays within the range', () => {
    expect(shiftMonth({ year: 2026, month0: 0 }, -1, MIN, MAX)).toEqual({ year: 2025, month0: 11 })
    expect(shiftMonth({ year: 2025, month0: 11 }, 1, MIN, MAX)).toEqual({ year: 2026, month0: 0 })
    expect(shiftMonth(MIN, -1, MIN, MAX)).toEqual(MIN)
    expect(shiftMonth(MAX, 1, MIN, MAX)).toEqual(MAX)
  })
})

describe('MonthNavigator', () => {
  it('steps a month at a time across the year boundary', async () => {
    render(<Harness start={{ year: 2026, month0: 0 }} />)
    expect(monthButton()).toHaveTextContent('January 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(monthButton()).toHaveTextContent('December 2025')
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(monthButton()).toHaveTextContent('January 2026')
  })

  it('jumps back to the current month and hides that button there', async () => {
    render(<Harness start={{ year: 2023, month0: 3 }} />)
    await userEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(monthButton()).toHaveTextContent('November 2026')
    expect(screen.queryByRole('button', { name: 'This month' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })

  it('picks a month from the grid of another year and closes it', async () => {
    render(<Harness start={MAX} />)
    await userEvent.click(monthButton())
    expect(screen.getByRole('dialog', { name: 'Choose a month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    await userEvent.click(screen.getByRole('button', { name: 'March 2025' }))
    expect(monthButton()).toHaveTextContent('March 2025')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the grid on the selected year and closes on Escape', async () => {
    render(<Harness start={{ year: 2022, month0: 5 }} />)
    await userEvent.click(monthButton())
    expect(screen.getByRole('button', { name: 'June 2022' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stops at the first browsable month', () => {
    render(<Harness start={MIN} />)
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  })
})
