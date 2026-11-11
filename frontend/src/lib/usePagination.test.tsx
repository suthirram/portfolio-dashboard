import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, pageSlice, usePagination } from './usePagination'
import { Pager } from '../components/Pager'

const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1)

describe('pageSlice', () => {
  it('cuts 15 rows per page with 1-based from/to', () => {
    expect(PAGE_SIZE).toBe(15)
    const second = pageSlice(numbers(40), 1)
    expect(second.pageItems).toEqual(numbers(30).slice(15))
    expect([second.from, second.to, second.lastPage]).toEqual([16, 30, 2])
    const last = pageSlice(numbers(40), 2)
    expect([last.from, last.to]).toEqual([31, 40])
  })

  it('clamps a page past the end to the last page, and an empty list to nothing', () => {
    expect(pageSlice(numbers(20), 5)).toMatchObject({ page: 1, from: 16, to: 20 })
    expect(pageSlice([], 0)).toMatchObject({ page: 0, from: 0, to: 0, pageItems: [] })
  })
})

describe('usePagination', () => {
  it('moves between pages and stops at both ends', () => {
    const { result } = renderHook(() => usePagination(numbers(31), 'same'))
    expect(result.current.hasPrev).toBe(false)
    act(() => result.current.next())
    act(() => result.current.next())
    expect([result.current.from, result.current.to, result.current.hasNext]).toEqual([31, 31, false])
    act(() => result.current.next())
    expect(result.current.from).toBe(31)
  })

  it('goes back to the first page when the reset key changes, not when rows reload', () => {
    const { result, rerender } = renderHook(({ items, key }) => usePagination(items, key), {
      initialProps: { items: numbers(40), key: 'a' },
    })
    act(() => result.current.next())
    rerender({ items: numbers(40), key: 'a' })
    expect(result.current.from).toBe(16)
    rerender({ items: numbers(40), key: 'b' })
    expect(result.current.from).toBe(1)
  })
})

describe('Pager', () => {
  function Harness({ count }: { count: number }) {
    const pagination = usePagination(numbers(count), 'k')
    return <><Pager pagination={pagination} label="Rows" /><output>{pagination.pageItems.join(',')}</output></>
  }

  it('shows the Gmail-style range and pages with the arrows', async () => {
    render(<Harness count={40} />)
    expect(screen.getByRole('navigation', { name: 'Rows pages' })).toHaveTextContent('1–15 of 40')
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('navigation')).toHaveTextContent('31–40 of 40')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(numbers(40).slice(30).join(','))
  })

  it('renders nothing for an empty list', () => {
    render(<Harness count={0} />)
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
