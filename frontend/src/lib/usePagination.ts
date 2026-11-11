import { useEffect, useState } from 'react'

// Client-side paging for the long lists (Transactions, Dividends): the page
// already holds the filtered, sorted rows, so a page is a slice of them.

export const PAGE_SIZE = 15

export interface Pagination<T> {
  pageItems: T[]
  // 1-based positions of the first and last row shown; 0 when empty.
  from: number
  to: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  prev: () => void
  next: () => void
}

// pageSlice is the pure part: the rows of page (0-based), clamped so a list
// that shrank (a row deleted on the last page) still shows its last page.
export function pageSlice<T>(items: T[], page: number, size = PAGE_SIZE) {
  const lastPage = Math.max(0, Math.ceil(items.length / size) - 1)
  const current = Math.min(Math.max(page, 0), lastPage)
  const start = current * size
  const pageItems = items.slice(start, start + size)
  return {
    page: current,
    pageItems,
    from: pageItems.length ? start + 1 : 0,
    to: start + pageItems.length,
    lastPage,
  }
}

// usePagination pages items, going back to the first page whenever
// resetKey changes (new filters, sort or tab) but not when the rows merely
// reload after an edit, so the user stays where they were.
export function usePagination<T>(items: T[], resetKey: string, size = PAGE_SIZE): Pagination<T> {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [resetKey])
  const slice = pageSlice(items, page, size)
  return {
    pageItems: slice.pageItems,
    from: slice.from,
    to: slice.to,
    total: items.length,
    hasPrev: slice.page > 0,
    hasNext: slice.page < slice.lastPage,
    prev: () => setPage(Math.max(slice.page - 1, 0)),
    next: () => setPage(Math.min(slice.page + 1, slice.lastPage)),
  }
}
