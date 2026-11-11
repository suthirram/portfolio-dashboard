import type { Pagination } from '../lib/usePagination'

// Pager is the Gmail-style range control above a paged list: "1–15 of 230"
// and a pair of ‹ › buttons, disabled at either end. It renders nothing for
// an empty list.
export function Pager<T>({ pagination, label }: { pagination: Pagination<T>; label: string }) {
  const { from, to, total, hasPrev, hasNext, prev, next } = pagination
  if (total === 0) return null
  return (
    <nav className="pager" aria-label={`${label} pages`}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span aria-live="polite" style={{ marginRight: 6, whiteSpace: 'nowrap' }}>
        <span className="mono">{from}–{to}</span> of <span className="mono">{total}</span>
      </span>
      <button type="button" className="btn-icon" onClick={prev} disabled={!hasPrev} aria-label="Previous page" title="Previous page"
        style={{ opacity: hasPrev ? 1 : 0.4 }}>‹</button>
      <button type="button" className="btn-icon" onClick={next} disabled={!hasNext} aria-label="Next page" title="Next page"
        style={{ opacity: hasNext ? 1 : 0.4 }}>›</button>
    </nav>
  )
}
