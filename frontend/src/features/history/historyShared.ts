// Shared constants, pure helpers, and style objects for the History feature.
// No JSX here — HistoryPage (page + charts), HistoryTable, and HistoryModals
// all import from this module, so it must never import from them.
import type { CSSProperties, Dispatch, FocusEvent, SetStateAction } from 'react'
import type {
  GoldHistoryOverlay,
  HistoryHolding,
  HistoryRow,
  RegionSnapshot,
} from '../../lib/api/client'
import { groupIndian, parseDecimalInput, sanitizeDecimalInput } from '../../lib/formNumbers'
import type { ThemeName } from '../../lib/useTheme'

// Snapshot buckets are keyed by currency after PR7 design-review
// (2026-06-16); the backend's CurrencyOf decides which bucket a
// holding falls into based on Exchange first, Currency fallback.
export const REGIONS = ['INR', 'EUR'] as const
export type RegionKey = typeof REGIONS[number]

export const REGION_LABELS: Record<RegionKey, string> = {
  INR: 'India (INR)',
  EUR: 'Europe (EUR)',
}

// PRD-002 §7.2 + PR7 design review: saffron (INR), blue (EUR).
// Palettes are theme-aware: brighter hues for dark backgrounds, darker
// hues for light. The previous single palette was muddy on white and
// faded on near-black.
export type LinePalette = Record<RegionKey, { invested: string; current: string }>
export const REGION_COLOURS: Record<ThemeName, LinePalette> = {
  dark: {
    INR: { invested: '#fcd34d', current: '#f97316' }, // amber-300 / orange-500
    EUR: { invested: '#60a5fa', current: '#3b82f6' }, // blue-400 / 500
  },
  light: {
    INR: { invested: '#d97706', current: '#9a3412' }, // amber-600 / orange-800
    EUR: { invested: '#2563eb', current: '#1e3a8a' }, // blue-600  / 900
  },
  cyberpunk: {
    INR: { invested: '#ffe600', current: '#ff9e00' }, // neon yellow / orange
    EUR: { invested: '#00e5ff', current: '#2b7fff' }, // neon cyan / blue
  },
}

export const PNL_LINE_COLOUR: Record<ThemeName, string> = {
  dark:  '#c084fc', // purple-400, pops on dark
  light: '#6d28d9', // purple-700, readable on white
  cyberpunk: '#ff2bd6', // neon magenta
}

export const VOL_LINE_COLOUR: Record<ThemeName, string> = {
  dark:  '#2dd4bf', // teal-400, distinct from the amber/blue/red/purple lines
  light: '#0f766e', // teal-700, readable on white
  cyberpunk: '#00ffa3', // neon mint
}

// Per-theme background tints for each currency group in the table.
// `header` lands behind the column-group header cells; `cell` is the
// per-data-cell tint that propagates the group identity down the column.
export const REGION_TINTS: Record<ThemeName, Record<RegionKey, { header: string; cell: string }>> = {
  light: {
    INR: { header: '#FFEDD5', cell: '#FFF7ED' }, // orange-100 / orange-50
    EUR: { header: '#DBEAFE', cell: '#EFF6FF' }, // blue-100   / blue-50
  },
  dark: {
    INR: { header: 'rgba(251,146,60,0.22)', cell: 'rgba(251,146,60,0.10)' },
    EUR: { header: 'rgba(96,165,250,0.22)', cell: 'rgba(96,165,250,0.10)' },
  },
  cyberpunk: {
    INR: { header: 'rgba(255,230,0,0.18)', cell: 'rgba(255,230,0,0.07)' },
    EUR: { header: 'rgba(0,229,255,0.18)', cell: 'rgba(0,229,255,0.07)' },
  },
}

// PRICE_DIR_TINT tints the "P/L%" cell by the day-over-day price move:
// mild green up, mild red down, mild blue unchanged. Semi-transparent so it
// reads on both themes; overrides the per-currency group tint on that cell.
export const PRICE_DIR_TINT: Record<'up' | 'down' | 'flat', string> = {
  up:   'rgba(34,197,94,0.18)',  // green
  down: 'rgba(239,68,68,0.18)',  // red
  flat: 'rgba(59,130,246,0.18)', // blue
}

// NEW_INVESTMENT_TINT marks the "Amount invested" cell on a day the user
// added holdings (invested rose vs the prior day). Mild purple — kept
// distinct from the green/red/blue price-direction tints above.
export const NEW_INVESTMENT_TINT = 'rgba(168,85,247,0.18)' // purple

// Physical gold is tracked in INR and forms one column group (PRD-003 §8),
// after the per-currency groups. A muted amber tint sets it apart without
// competing with the saffron/blue/red currency tints.
export const GOLD_TINT = 'rgba(217,119,6,0.10)'

// Physical gold is INR-denominated; a distinct amber/yellow palette keeps it
// apart from INR's saffron. No expand target — gold has no full-history page.
export const GOLD_PALETTE: Record<ThemeName, { invested: string; current: string }> = {
  dark:  { invested: '#fde047', current: '#eab308' }, // yellow-300 / 500
  light: { invested: '#ca8a04', current: '#854d0e' }, // yellow-600 / 800
  cyberpunk: { invested: '#ffe600', current: '#ffb300' }, // neon yellow / amber
}

// Year selector lower bound. Lets users browse back through 2020 even
// before any snapshot exists for that year — useful for manually pasting
// backfilled history.
export const MIN_YEAR = 2020

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// monthRange returns the inclusive [from, to] for the month, with `from`
// extended back by one day so the first day-of-month row has a prior row
// to compute Daily volatlity against (PR7 design review).
export function monthRange(year: number, month0: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month0, 0))   // last day of previous month
  const to   = new Date(Date.UTC(year, month0 + 1, 0))
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

// ---- Form state helpers (Add/Edit modals) ----

export interface RegionFormValue {
  invested: string
  current: string
}
export type RegionFormState = Record<RegionKey, RegionFormValue>

export function emptyForm(): RegionFormState {
  return {
    INR: { invested: '', current: '' },
    EUR: { invested: '', current: '' },
  }
}

// parseFormAmount tolerates both decimal conventions so a value typed into an
// amount form parses the same regardless of the user's locale habits. The last
// separator is the decimal when both '.' and ',' are present; otherwise a single
// separator is treated as decimal unless it looks like a thousands group.
// Empty -> 0. Distinct from the paste parser, where comma is always grouping.
//   "23456.45" -> 23456.45   "23456,45"  -> 23456.45
//   "23,456.45" -> 23456.45  "23.456,45" -> 23456.45
//   "1,234" -> 1234          "1,234,567" -> 1234567
export function parseFormAmount(s: string): number {
  return parseDecimalInput(s)
}
export { groupIndian }

// groupedInitial formats a stored numeric value for an input's initial display.
export function groupedInitial(v: number | undefined): string {
  return v == null ? '' : groupIndian(String(v))
}

// sanitizeAmount drops anything that can't be part of a numeric amount. The
// DecimalInput component also blocks those keystrokes before they reach state.
export function sanitizeAmount(s: string): string {
  return sanitizeDecimalInput(s)
}

// formError validates the amount fields before submit. A field that is
// non-empty but does not parse to a finite number is rejected (rather than
// silently skipped) so a typo can never drop a region on save.
export function formError(form: RegionFormState): string | null {
  for (const r of REGIONS) {
    for (const key of ['invested', 'current'] as const) {
      const raw = form[r][key].trim()
      if (raw !== '' && !Number.isFinite(parseFormAmount(raw))) {
        return `Enter a valid ${key} amount for ${REGION_LABELS[r]}.`
      }
    }
  }
  return null
}

// regroupHandler returns an onBlur handler that normalises a typed amount and
// re-applies Indian grouping, so freshly entered values match the prefilled
// ones (e.g. "2345678" → "23,45,678"). Empty stays empty.
export function regroupHandler(setForm: Dispatch<SetStateAction<RegionFormState>>) {
  return (r: RegionKey, key: keyof RegionFormValue) =>
    (e: FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim()
      const parsed = parseFormAmount(raw)
      const grouped = raw === '' || !Number.isFinite(parsed) ? raw : groupIndian(String(parsed))
      setForm(f => ({ ...f, [r]: { ...f[r], [key]: grouped } }))
    }
}

// formToBody collects the regions the user actually touched. A region is
// included when either field is non-blank (a blank field counts as 0), so an
// explicit 0 — e.g. resetting a value from 1 to 0 — overrides rather than being
// dropped. A region with BOTH fields blank is untouched and left unchanged.
export function formToBody(form: RegionFormState): Record<string, { invested: number; current: number }> {
  const out: Record<string, { invested: number; current: number }> = {}
  for (const r of REGIONS) {
    const investedRaw = form[r].invested.trim()
    const currentRaw = form[r].current.trim()
    if (investedRaw === '' && currentRaw === '') continue // untouched region
    out[r] = { invested: parseFormAmount(investedRaw), current: parseFormAmount(currentRaw) }
  }
  return out
}

// changedRegions keeps only the regions whose values differ from the original
// row. Saving an edit that touched one currency then doesn't re-assert (and
// flip to manual) the untouched ones, and a no-op save sends nothing.
export function changedRegions(
  body: Record<string, { invested: number; current: number }>,
  original: Record<string, RegionSnapshot>,
): Record<string, { invested: number; current: number }> {
  const out: Record<string, { invested: number; current: number }> = {}
  for (const [r, v] of Object.entries(body)) {
    const o = original[r]
    if (!o || o.invested !== v.invested || o.current !== v.current) out[r] = v
  }
  return out
}

// ---- Currency mapping ----
// Region → display currency. Holdings are stored per-region in the
// snapshot (DD-002 §2.1); the UI here translates to original currency
// because the user wants to read the table in native amounts (PR7
// design-review on Screenshot 2026-06-16).

// CURRENCY_BY_REGION is now identity since bucket keys are currency
// codes, but kept as a named export so callers can read the table
// without assuming key == code.
export const CURRENCY_BY_REGION: Record<RegionKey, 'INR' | 'EUR'> = {
  INR: 'INR',
  EUR: 'EUR',
}

export const CURRENCY_SYMBOL: Record<'INR' | 'EUR', string> = {
  INR: '₹',
  EUR: '€',
}

// fmtCurrency formats amount with the currency symbol and 2dp using Indian
// digit grouping (lakh/crore), e.g. "₹10,19,620.00", regardless of the
// browser locale. An amount of 0 renders as "₹0.00" rather than the em dash
// used elsewhere, because in the per-currency layout an absent value collapses
// the whole row group instead.
export function fmtCurrency(amount: number, sym: string): string {
  return sym + amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

// ---- Chart data ----

// goldChartData shapes the per-row gold overlay into the chart series (same
// shape as perCurrencyChartData). Rows without an overlay emit nulls so the
// line bridges the gap rather than plunging to zero.
export function goldChartData(rows: HistoryRow[]) {
  const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return oldestFirst.map(r => ({
    date: r.date.slice(5),
    invested: r.gold ? r.gold.invested : null,
    current: r.gold ? r.gold.current : null,
    pnl_pct: r.gold ? r.gold.pnl_pct : null,
    daily_vol: r.gold ? r.gold.volatility_pct : null,
  }))
}

// perCurrencyChartData produces oldest-first chart series for one region.
// pnl_pct on a per-region basis is (current - invested) / invested * 100.
//
// Dates where the region has no snapshot emit `null` (a gap) rather than
// 0. Two reasons: a 0 point drags the dynamic Y-axis floor back toward
// zero — re-flattening the very fluctuation the dynamic domain exists to
// show — and it draws the line plunging to 0 on empty dates, which reads
// as "portfolio went to zero" instead of "no data". `null` lets niceDomain
// (which filters non-finite) ignore it and the Line connectNulls bridge
// the gap. The table still renders absent regions as 0 (CurrencyRowCells).
export function perCurrencyChartData(rows: HistoryRow[], region: RegionKey) {
  const oldestFirst = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  // daily_vol is the per-currency day-over-day % change of the current
  // value vs the previous data point, net of the change in invested so a
  // contribution/withdrawal doesn't read as a market move. null on the
  // first point and whenever either side of the baseline is absent or the
  // prior current is zero (divide-by-zero / no baseline).
  let prevCurrent: number | null = null
  let prevInvested: number | null = null
  return oldestFirst.map(r => {
    const rs = r.regions[region]
    const invested = rs ? rs.invested : null
    const current  = rs ? rs.current  : null
    const pnl_pct  = rs && rs.invested > 0 ? ((rs.current - rs.invested) / rs.invested) * 100 : null
    const daily_vol = current != null && prevCurrent != null && prevCurrent !== 0
        && invested != null && prevInvested != null
      ? ((current - prevCurrent - (invested - prevInvested)) / prevCurrent) * 100
      : null
    prevCurrent = current
    prevInvested = invested
    return { date: r.date.slice(5), invested, current, pnl_pct, daily_vol }
  })
}

// niceDomain returns a padded, nicely-rounded [min, max] for a value
// axis so the plotted lines fill the chart instead of being crushed
// against a zero floor. Pads ~8% beyond the data range and snaps the
// bounds to a readable step. Returns undefined when there are no finite
// values (caller falls back to Recharts' 'auto' domain).
export function niceDomain(values: (number | null | undefined)[]): [number, number] | undefined {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (finite.length === 0) return undefined
  const lo = Math.min(...finite)
  const hi = Math.max(...finite)
  if (lo === hi) {
    // Flat series: pad around the single value so it sits mid-chart.
    const pad = Math.abs(lo) * 0.05 || 1
    return [lo - pad, hi + pad]
  }
  const pad = (hi - lo) * 0.08
  const step = niceStep((hi - lo + 2 * pad) / 5)
  const min = Math.floor((lo - pad) / step) * step
  const max = Math.ceil((hi + pad) / step) * step
  return [min, max]
}

// symmetricDomain returns a [-m, +m] range centred on zero so a signed series
// (daily volatility %) renders with the zero line in the middle of the chart.
// m is the padded, nicely-rounded magnitude of the largest swing either way.
// Returns undefined when there are no finite values.
export function symmetricDomain(values: (number | null | undefined)[]): [number, number] | undefined {
  const finite = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (finite.length === 0) return undefined
  const maxAbs = Math.max(...finite.map(Math.abs))
  if (maxAbs === 0) return [-1, 1]
  const pad = maxAbs * 0.08
  const step = niceStep((maxAbs + pad) / 3)
  const m = Math.ceil((maxAbs + pad) / step) * step
  return [-m, m]
}

// regionHasData reports whether a region's chart series has any non-zero
// invested or current value. Used to hide a currency's charts entirely when
// the profile never held that currency (e.g. USD for the super admin).
export function regionHasData(data: { invested: number | null; current: number | null }[]): boolean {
  return data.some(d => (d.invested ?? 0) !== 0 || (d.current ?? 0) !== 0)
}

// niceStep rounds a raw step up to the nearest 1/2/5 × 10ⁿ — the
// classic "nice number" sequence for axis ticks.
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

// fmtAxisAmount keeps the amount axis labels compact (1.2M, 450k) so the
// wider dynamic range doesn't overflow the tick gutter.
export function fmtAxisAmount(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`
  return String(v)
}

// ---- Row stats (table cells) ----

export function fmt(n: number) {
  return n === 0 ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

// regionDailyVolatility is the per-currency day-over-day % used by the
// table column. Rows newest-first. Per-currency by design: the history UI
// never combines currencies (PortfolioSnapshot.Totals is a same-currency-
// only aggregate, not FX-converted), so volatility is computed per bucket.
export function regionDailyVolatility(rows: HistoryRow[], i: number, region: RegionKey): number | null {
  const prev = rows[i + 1]
  if (!prev) return null
  const prevCur = prev.regions[region]?.current ?? 0
  if (prevCur === 0) return null
  const today = rows[i].regions[region]?.current ?? 0
  return ((today - prevCur) / prevCur) * 100
}

// regionPnLPct is the per-region P/L %.
export function regionPnLPct(r: HistoryRow, region: RegionKey): number | null {
  const inv = r.regions[region]?.invested ?? 0
  const cur = r.regions[region]?.current  ?? 0
  if (inv === 0) return null
  return ((cur - inv) / inv) * 100
}

// regionInvestedWentUp reports whether the region's invested amount on
// this row is strictly greater than the prior day's — the user-added-
// holdings highlight from PR7 design-review.
export function regionInvestedWentUp(rows: HistoryRow[], i: number, region: RegionKey): boolean {
  const prev = rows[i + 1]
  if (!prev) return false
  const prevInv = prev.regions[region]?.invested ?? 0
  const todayInv = rows[i].regions[region]?.invested ?? 0
  return todayInv > prevInv
}

// regionCurrentDirection compares the region's current (market) value to
// the prior day's, driving the "P/L%" cell tint: 'up' / 'down' / 'flat'.
// Returns null when there is no prior data point for the region to compare
// against (first row, or the region is absent on either day) — the cell
// then keeps its plain per-currency group tint. Rows newest-first, so
// rows[i+1] is the prior day.
//
// Deliberately separate from regionDailyVolatility: that one treats an
// absent region as 0 (so a vanished bucket reads as a -100% move), whereas
// the tint must show "no comparison" (null) when either day lacks the
// region. Keep the two in sync only where that difference does not matter.
export function regionCurrentDirection(
  rows: HistoryRow[], i: number, region: RegionKey,
): 'up' | 'down' | 'flat' | null {
  const prev = rows[i + 1]
  if (!prev) return null
  const prevRs = prev.regions[region]
  const curRs = rows[i].regions[region]
  if (!prevRs || !curRs) return null
  const delta = curRs.current - prevRs.current
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

// goldCurrentDirection mirrors regionCurrentDirection for the gold overlay:
// 'up'/'down'/'flat' by the day-over-day change in gold value, null when
// there is no prior gold point to compare against (keeps the plain tint).
export function goldCurrentDirection(
  gold?: GoldHistoryOverlay, prevGold?: GoldHistoryOverlay,
): 'up' | 'down' | 'flat' | null {
  if (!gold || !prevGold) return null
  const delta = gold.current - prevGold.current
  return delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
}

// holdingRegion maps a holding's currency code to its table currency group,
// defaulting unknown/blank to INR (the Holding.Currency default).
export function holdingRegion(h: HistoryHolding): RegionKey {
  const code = (h.currency || 'INR').toUpperCase()
  // Only INR and EUR are tracked; anything else (incl. legacy USD) → INR.
  return code === 'EUR' ? 'EUR' : 'INR'
}

// ---- Paste parsing (PasteModal) ----

// parsePasteText accepts TSV (tabs) — what Google Sheets / Excel
// copy-paste yields. Expected columns in order:
//
//   Date | INR invested | INR current | EUR invested | EUR current
//        | [Daily vol] | [P/L %]
//
// Trailing columns (Daily vol, P/L %) are ignored — they are derived
// on read.
//
// Robustness in PR7 design-review follow-up:
//   * Dates accepted in YYYY-MM-DD, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
//     and normalised to YYYY-MM-DD.
//   * Currency symbols (₹ € $ £) and thousands separators (, _ space)
//     stripped before parsing.
//   * Empty / blank cells become 0 — a row that has at least one
//     non-zero (invested OR current) for any region is kept.
//   * Header row detected by "first cell does not parse as a date"
//     and skipped.

const CURRENCY_SYMBOLS_RE = /[₹€$£\s_,]/g

export function parseAmount(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(CURRENCY_SYMBOLS_RE, '').trim()
  if (!cleaned) return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

// normaliseDate accepts the common European-style formats users paste
// from spreadsheets and returns "YYYY-MM-DD". Returns "" when the input
// can't be parsed as a date.
export function normaliseDate(s: string): string {
  const t = s.trim()
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  return ''
}

export function parsePasteText(text: string): { date: string; regions: Record<string, { invested: number; current: number }> }[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: { date: string; regions: Record<string, { invested: number; current: number }> }[] = []
  for (const line of lines) {
    const cells = line.split(/\t/).map(c => c.trim())
    const date = normaliseDate(cells[0] ?? '')
    if (!date) continue // skip header / malformed
    const [, ii, ic, ei, ec] = cells
    const regions: Record<string, { invested: number; current: number }> = {}
    const set = (key: string, inv: string | undefined, cur: string | undefined) => {
      const a = parseAmount(inv ?? '')
      const b = parseAmount(cur ?? '')
      if (Number.isFinite(a) && Number.isFinite(b) && (a > 0 || b > 0)) {
        regions[key] = { invested: a, current: b }
      }
    }
    set('INR', ii, ic)
    set('EUR', ei, ec)
    out.push({ date, regions })
  }
  return out
}

// ---- Shared styles ----

export const th: CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }
export const sortHeaderBtn: CSSProperties = {
  background: 'transparent', border: 'none', padding: 0, margin: 0,
  font: 'inherit', color: 'inherit', fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 4,
}
export const td: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)' }
export const actionTh: CSSProperties = { ...th, width: 72, minWidth: 72, textAlign: 'center' }
export const actionTd: CSSProperties = { ...td, width: 72, minWidth: 72, textAlign: 'center', verticalAlign: 'middle' }
export const actionCell: CSSProperties = { display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'center' }

// selectStyle keeps the Year/Month dropdowns theme-aware. Without an explicit
// background/colour, native <select> falls back to the browser default (white
// on black text), which reads as light-mode in the dark theme.
export const selectStyle: CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-primary)',
}
// Recharts renders its tooltip with a hard-coded white background; in dark mode
// the (theme-set) white text then sits on white. Force a theme-aware surface.
export const chartTooltipProps = {
  contentStyle: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)',
  } as CSSProperties,
  labelStyle: { color: 'var(--text-secondary)' } as CSSProperties,
  itemStyle: { color: 'var(--text-primary)' } as CSSProperties,
}
export const modalBackdrop: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
export const modalCard: CSSProperties = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 24,
  width: '90%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
}
