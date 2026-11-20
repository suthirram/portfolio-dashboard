import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type GoldPrice } from '../../lib/api/client'
import { Ui2GoldPrices } from './Ui2GoldPrices'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return { ...actual, api: { putGoldPrices: vi.fn() } }
})

// 35 consecutive days ending 2026-11-18, ascending as the server returns them.
const series: GoldPrice[] = Array.from({ length: 35 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 9, 15 + index))
  return { date: day.toISOString().slice(0, 10), price_per_gram: 9000 + index }
})

beforeEach(() => { vi.clearAllMocks() })

describe('Ui2GoldPrices', () => {
  it('lists the 30 most recent days, newest first', () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    const edits = screen.getAllByRole('button', { name: /^Edit rate for/ })
    expect(edits).toHaveLength(30)
    expect(edits[0]).toHaveAccessibleName('Edit rate for 18 Nov 2026')
  })

  it('loads a recorded day into the form with Edit rate', async () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit rate for 18 Nov 2026' }))
    expect(screen.getByLabelText('Gold price date')).toHaveValue('2026-11-18')
    expect(screen.getByLabelText('Gold price per gram')).toHaveValue('9034')
    expect(screen.getByLabelText('Gold price per gram')).toHaveFocus()
  })

  it('saves one day and reports it', async () => {
    vi.mocked(api.putGoldPrices).mockResolvedValue(undefined)
    const onSaved = vi.fn()
    render(<Ui2GoldPrices prices={series} onSaved={onSaved} />)
    await userEvent.clear(screen.getByLabelText('Gold price date'))
    await userEvent.type(screen.getByLabelText('Gold price date'), '2026-11-10')
    await userEvent.type(screen.getByLabelText('Gold price per gram'), '9450')
    await userEvent.click(screen.getByRole('button', { name: 'Save price' }))
    await waitFor(() => expect(api.putGoldPrices).toHaveBeenCalledWith([{ date: '2026-11-10', price_per_gram: 9450 }]))
    expect(onSaved).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Gold price per gram')).toHaveValue('')
  })

  it('rejects a non-positive rate without calling the server', async () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Gold price per gram'), '0')
    await userEvent.click(screen.getByRole('button', { name: 'Save price' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Price must be a number > 0')
    expect(api.putGoldPrices).not.toHaveBeenCalled()
  })

  it('shows every month, newest first, behind View all months', async () => {
    render(<Ui2GoldPrices prices={series} onSaved={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'View all months' }))
    const dialog = screen.getByRole('dialog', { name: 'Gold prices · all months' })
    const months = within(dialog).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(months).toEqual(['2026-11', '2026-10'])
    expect(within(within(dialog).getByRole('region', { name: 'Gold prices 2026-10' })).getAllByRole('row'))
      .toHaveLength(18) // header + 17 October days
  })
})
