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

// todayIST is the current IST calendar day as YYYY-MM-DD — the browser twin
// of the server's istToday.
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

// normaliseDate accepts the day-first formats users paste or upload from
// spreadsheets — YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (1-digit day
// or month allowed) — and returns "YYYY-MM-DD", or "" when the input is not a
// real calendar date (31/02/2021 and 13/13/2020 are rejected).
export function normaliseDate(s: string): string {
  const t = s.trim()
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  const dayFirst = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(t)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (dayFirst) [d, m, y] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])]
  else return ''
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
