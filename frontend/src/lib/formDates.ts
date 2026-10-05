// splitISO parses the date part of a YYYY-MM-DD (or any longer ISO string)
// into its pieces, or null when the input is absent or not an ISO date. Both
// formatters below share it so they can never disagree on what parses or on
// field order.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function splitISO(iso: string | null | undefined): { y: string; m: string; d: string } | null {
  if (!iso) return null
  const match = ISO_DATE.exec(iso.slice(0, 10))
  return match ? { y: match[1], m: match[2], d: match[3] } : null
}

// formatDate renders a YYYY-MM-DD (or any date-parseable ISO string) as
// dd-MM-yyyy for display. Non-parseable input is returned unchanged so
// callers can pass through placeholders/empty strings safely.
export function formatDate(iso: string | null | undefined): string {
  const p = splitISO(iso)
  return p ? `${p.d}-${p.m}-${p.y}` : iso ?? ''
}

// formatDayMonth renders a YYYY-MM-DD as dd-MM — the app's dd-MM-yyyy order
// minus the year, for compact chart axes (the mini-chart triptych is a third
// of the page wide, so Recharts would silently drop colliding dd-MM-yyyy
// ticks) where the selected month already implies the year. Non-parseable
// input is returned unchanged, same as formatDate.
export function formatDayMonth(iso: string | null | undefined): string {
  const p = splitISO(iso)
  return p ? `${p.d}-${p.m}` : iso ?? ''
}
