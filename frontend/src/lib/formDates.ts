// formatDate renders a YYYY-MM-DD (or any date-parseable ISO string) as
// dd-MM-yyyy for display. Non-parseable input is returned unchanged so
// callers can pass through placeholders/empty strings safely.
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return iso ?? ''
  const datePart = iso.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!match) return iso
  const [, y, m, d] = match
  return `${d}-${m}-${y}`
}

// formatDayMonth renders a YYYY-MM-DD as dd-MM — the app's dd-MM-yyyy order
// minus the year, for compact chart axes where the year is implied by the
// selected month. Built on formatDate so the two can never disagree on
// order; non-parseable input is returned unchanged, same as formatDate.
export function formatDayMonth(iso: string | null | undefined): string {
  const full = formatDate(iso)
  return /^\d{2}-\d{2}-\d{4}$/.test(full) ? full.slice(0, 5) : full
}
