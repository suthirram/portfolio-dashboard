import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Ui2DividendsPage } from './Ui2DividendsPage'

// Hoisted so the vi.mock factory may read it: Vitest lifts vi.mock above the
// module body, where a plain const is still uninitialised.
const fixture = vi.hoisted(() => ({ seen: [] as string[], error: '', refresh: vi.fn() }))

vi.mock('../../features/dividends/useDividends', () => ({
  useDividends: (currency: string) => {
    fixture.seen.push(currency)
    const inr = {
      rows: [
        { id: 'd1', holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', date: '2026-10-01',
          amount: 500, currency: 'INR', cumulative: 500, holding_cumulative: 500 },
        { id: 'd2', holding_id: 'h2', script: 'Infosys', symbol: 'INFY.NS', date: '2026-11-01',
          amount: 300, currency: 'INR', cumulative: 800, holding_cumulative: 300 },
      ],
      summary: { total: 800, count: 2, holdings: 2, first_date: '2026-10-01', last_date: '2026-11-01' },
      by_year: [{ period: '2026', total: 800, count: 2 }],
      by_month: [
        { period: '2026-10', total: 500, count: 1 },
        { period: '2026-11', total: 300, count: 1 },
      ],
      by_holding: [
        { holding_id: 'h1', script: 'TCS', symbol: 'TCS.NS', total: 500, count: 1, share: 0.625 },
        { holding_id: 'h2', script: 'Infosys', symbol: 'INFY.NS', total: 300, count: 1, share: 0.375 },
      ],
    }
    const empty = {
      rows: [], summary: { total: 0, count: 0, holdings: 0 },
      by_year: [], by_month: [], by_holding: [],
    }
    return {
      view: currency === 'INR' ? inr : empty,
      ready: true,
      holdings: [
        { id: 'h1', script: 'TCS', symbol: 'TCS.NS', currency: 'INR', exchange: 'NSE',
          stocks_owned: 10, avg_cost_price: 1000 },
        { id: 'h2', script: 'Infosys', symbol: 'INFY.NS', currency: 'INR', exchange: 'NSE',
          stocks_owned: 20, avg_cost_price: 1500 },
      ],
      loading: false,
      error: fixture.error,
      refresh: fixture.refresh,
    }
  },
}))

vi.mock('../../features/dividends/DividendModal', () => ({
  default: ({ editing, onClose }: { editing: unknown; onClose: () => void }) => (
    <div role="dialog" aria-label={editing ? 'Edit dividend' : 'Add dividend'}>
      <button onClick={onClose}>Close</button>
    </div>
  ),
  DeleteDividendDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Delete dividend"><button onClick={onClose}>Close</button></div>
  ),
}))

vi.mock('../../features/dividends/DeleteAllDialog', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Delete all dividends"><button onClick={onClose}>Close</button></div>
  ),
}))

vi.mock('../../features/dividends/DividendImportModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Import dividends"><button onClick={onClose}>Close</button></div>
  ),
}))

const show = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/dividends${search}`]}>
      <Ui2DividendsPage />
    </MemoryRouter>)

beforeEach(() => {
  fixture.seen = []
  fixture.error = ''
  fixture.refresh.mockClear()
})

describe('Ui2DividendsPage', () => {
  it('renders the handoff intro and the four stat cards', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Income, one payment at a time.' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Total dividends · INR' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Payments' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Holdings paying' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Payment range' })).toBeInTheDocument()
  })

  it('renders every payment with no row-number column', () => {
    show()
    expect(screen.getByText('Currency cumulative')).toBeInTheDocument()
    // Six columns, per handoff frame 07: no "#" column.
    expect(screen.getAllByRole('columnheader', { hidden: false }).slice(0, 6)).toHaveLength(6)
    expect(screen.getByText('2 of 2 payments')).toBeInTheDocument()
  })

  it('reads the tab from the URL and asks the hook for it', () => {
    show('?currency=EUR')
    expect(fixture.seen).toContain('EUR')
    expect(screen.getByRole('tab', { name: '€ EUR' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the empty state for a currency with no payments', () => {
    show('?currency=EUR')
    expect(screen.getByRole('heading', { name: 'Your income story starts here.' })).toBeInTheDocument()
    expect(screen.queryByText('Currency cumulative')).not.toBeInTheDocument()
  })

  it('switches tab through the URL when a tab is clicked', async () => {
    show()
    await userEvent.click(screen.getByRole('tab', { name: '€ EUR' }))
    expect(fixture.seen).toContain('EUR')
  })

  it('filters by holding but keeps the full-tab cumulative', async () => {
    show()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Dividend holding' }), 'h2')
    expect(screen.getByText('1 of 2 payments')).toBeInTheDocument()
    // 800 is the tab-wide running total: filtering must not recompute it.
    // Scope to the Infosys payment row — the stat card and yearly table also
    // show ₹800.00, so an unscoped getByText throws "Found multiple elements".
    const paymentRow = screen.getByRole('cell', { name: /Infosys/ }).closest('tr')!
    expect(within(paymentRow).getByText('₹800.00')).toHaveClass('u2-positive')
    expect(screen.queryByText('TCS.NS')).not.toBeInTheDocument()
  })

  it('names the viewed account in act-as and offers the way back', () => {
    render(
      <MemoryRouter initialEntries={['/dividends']}>
        <Ui2DividendsPage actAsUserId="u9" actAsLabel="alice's dividends" />
      </MemoryRouter>)
    const banner = screen.getByRole('region', { name: 'Act-as session' })
    expect(banner).toHaveTextContent("Viewing alice's dividends")
    expect(within(banner).getByRole('link', { name: 'Exit act-as' })).toHaveAttribute('href', '/admin')
  })

  it('keeps the currency tabs and offers a retry after a load error', async () => {
    fixture.error = 'Network down'
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('tab', { name: '€ EUR' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(fixture.refresh).toHaveBeenCalled()
  })

  it('tells the user when a search matches nothing', async () => {
    show()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search dividends' }), 'zzz')
    expect(screen.getByText('No payments match this search.')).toBeInTheDocument()
  })

  it('switches the chart between monthly and yearly buckets', async () => {
    show()
    expect(screen.getByRole('img', { name: 'Dividend income by month in INR' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Yearly' }))
    expect(screen.getByRole('img', { name: 'Dividend income by year in INR' })).toBeInTheDocument()
  })

  it('shows each holding’s share of income', () => {
    show()
    expect(screen.getByText('62.5% of dividend income')).toBeInTheDocument()
    expect(screen.getByText('37.5% of dividend income')).toBeInTheDocument()
  })

  it('opens the add, import and delete-all dialogs', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: '＋ Add dividend' }))
    expect(screen.getByRole('dialog', { name: 'Add dividend' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Upload CSV' }))
    expect(screen.getByRole('dialog', { name: 'Import dividends' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(screen.getByRole('button', { name: 'Delete all INR' }))
    expect(screen.getByRole('dialog', { name: 'Delete all dividends' })).toBeInTheDocument()
  })

  it('opens the edit dialog for a row', async () => {
    show()
    const [edit] = screen.getAllByRole('button', { name: /^Edit dividend of / })
    await userEvent.click(edit)
    expect(screen.getByRole('dialog', { name: 'Edit dividend' })).toBeInTheDocument()
  })
})
