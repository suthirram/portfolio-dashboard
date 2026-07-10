// The History month table: per-currency column groups, the optional gold
// group, and the day-over-day cell tints. Split out of HistoryPage.tsx;
// HistoryPage re-exports HistoryTable so existing imports keep working.
import { useMemo, useState } from 'react'
import type {
  GoldHistoryOverlay,
  HistoryRow,
  RegionSnapshot,
} from '../../lib/api/client'
import { EditIcon, TrashIcon } from '../../components/Icon'
import type { ThemeName } from '../../lib/useTheme'
import {
  CURRENCY_BY_REGION, CURRENCY_SYMBOL, GOLD_TINT, NEW_INVESTMENT_TINT,
  PRICE_DIR_TINT, REGIONS, REGION_TINTS,
  actionCell, actionTd, actionTh, fmtCurrency, goldCurrentDirection,
  holdingRegion, iconBtnBlueStyle, iconBtnRedStyle,
  regionCurrentDirection, regionDailyVolatility, regionInvestedWentUp,
  regionPnLPct, sortHeaderBtn, td, th,
  type RegionKey,
} from './historyShared'

// HistoryTable lays out three side-by-side groups (one per currency:
// India₹ / Europe€ / US$) each with [Amount invested | Actual value |
// Daily volatlity | P/L%]. Values render in native currency with the
// symbol prefixed. When invested goes up vs the prior day for a region,
// the row's "Amount invested" cell highlights green — the "user added
// holdings" signal from the PR7 design review.
//
// Header spelling "volatlity" matches the user's reference screenshot
// verbatim. If we ever correct the typo, update the test expectation
// in HistoryPage.test.tsx too.
export function HistoryTable({ rows, currency: _currency, onDelete, onEdit, onSelectRegion, theme = 'dark', canForceDelete = false }: {
  rows: HistoryRow[]
  currency: string
  onDelete: (date: string) => void
  onEdit?: (row: HistoryRow) => void
  // Clicking a currency-group cell opens the Holdings modal scoped to that
  // currency. prev is the prior trading day's row (for yesterday's price), or
  // null when this is the oldest row loaded.
  onSelectRegion?: (row: HistoryRow, prev: HistoryRow | null, region: RegionKey) => void
  theme?: ThemeName
  canForceDelete?: boolean
}) {
  // Click the Date header to flip order. Default true = oldest-first.
  const [sortAsc, setSortAsc] = useState(true)

  const isAllManual = (regions: Record<string, RegionSnapshot>) =>
    Object.values(regions).every(r => r.source === 'manual')

  // Canonical newest-first array drives the day-over-day math: the
  // volatility / invested-went-up helpers assume rows[i+1] is the prior
  // day. Display order is independent — ascending just reverses what we
  // render, while every cell still computes against the canonical index.
  const byDateDesc = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    [rows],
  )
  const indexOfDate = useMemo(() => {
    const m = new Map<string, number>()
    byDateDesc.forEach((r, i) => m.set(r.date, i))
    return m
  }, [byDateDesc])
  const display = sortAsc ? [...byDateDesc].reverse() : byDateDesc
  // The gold column group appears only when the backend attached an overlay
  // to at least one row — i.e. a gold-enabled user with a valued position
  // (PRD-003 §8). Non-gold users never see it.
  const hasGold = useMemo(() => rows.some(r => r.gold), [rows])

  return (
    <div style={{ overflowX: 'auto', background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card)' }}>
            <th style={{ ...th, borderRight: '2px solid var(--border)' }}>
              <button onClick={() => setSortAsc(s => !s)} style={sortHeaderBtn}
                aria-label="Sort by date"
                title={sortAsc ? 'Oldest first — click for newest' : 'Newest first — click for oldest'}>
                Date {sortAsc ? '▲' : '▼'}
              </button>
            </th>
            {REGIONS.map((r, idx) => (
              <CurrencyHeaderGroup key={r} region={r} last={idx === REGIONS.length - 1} theme={theme} />
            ))}
            {hasGold && <GoldHeaderGroup />}
            <th style={actionTh}></th>
          </tr>
        </thead>
        <tbody>
          {display.map((r) => {
            const i = indexOfDate.get(r.date)!
            const sources = new Set(Object.values(r.regions).map(rs => rs.source))
            const sourceLabel = sources.size === 1 ? Array.from(sources)[0] : 'mixed'
            const prev = byDateDesc[i + 1] ?? null
            return (
              <tr key={r.date} title={`Source: ${sourceLabel}`}>
                <td style={{ ...td, borderRight: '2px solid var(--border)', fontWeight: 600 }}>{r.date}</td>
                {REGIONS.map((region, idx) => (
                  <CurrencyRowCells
                    key={region}
                    rows={byDateDesc}
                    i={i}
                    region={region}
                    last={idx === REGIONS.length - 1}
                    theme={theme}
                    onSelectRegion={onSelectRegion ? () => onSelectRegion(r, prev, region) : undefined}
                  />
                ))}
                {hasGold && <GoldRowCells gold={r.gold} prevGold={prev?.gold} />}
                <td style={actionTd}>
                  <div style={actionCell}>
                    {onEdit && (
                      <button onClick={() => onEdit(r)} style={iconBtnBlueStyle}
                        aria-label={`Edit row for ${r.date}`} title="Edit">
                        <EditIcon size={16} />
                      </button>
                    )}
                    {(isAllManual(r.regions) || canForceDelete) && (
                      <button onClick={() => onDelete(r.date)} style={iconBtnRedStyle}
                        aria-label={`Delete row for ${r.date}`}
                        title={isAllManual(r.regions) ? 'Delete' : 'Delete (super-admin override of cron row)'}>
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CurrencyHeaderGroup({ region, last, theme }: { region: RegionKey; last: boolean; theme: ThemeName }) {
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  const tint = REGION_TINTS[theme][region].header
  const hdr: React.CSSProperties = { ...th, background: tint }
  return (
    <>
      <th style={hdr}>Amount invested</th>
      <th style={hdr}>Actual value</th>
      <th style={hdr}>Daily volatlity</th>
      <th style={{ ...hdr, ...sep }}>P/L%</th>
    </>
  )
}

function CurrencyRowCells({ rows, i, region, last, theme, onSelectRegion }: {
  rows: HistoryRow[]
  i: number
  region: RegionKey
  last: boolean
  theme: ThemeName
  onSelectRegion?: () => void
}) {
  const r = rows[i]
  const sym = CURRENCY_SYMBOL[CURRENCY_BY_REGION[region]]
  const rs = r.regions[region]
  const invested = rs?.invested ?? 0
  const current  = rs?.current  ?? 0
  const vol      = regionDailyVolatility(rows, i, region)
  const pnl      = regionPnLPct(r, region)
  const wentUp   = regionInvestedWentUp(rows, i, region)
  const dir      = regionCurrentDirection(rows, i, region)
  const tint = REGION_TINTS[theme][region].cell
  const sep = last ? {} : { borderRight: '2px solid var(--border)' }
  // The cell group opens the per-currency Holdings modal only when this row has
  // at least one positive holding in this currency. The whole group is
  // mouse-clickable, but only the first cell carries the button semantics +
  // keyboard focus, so a screen reader hears one "View <currency> holdings"
  // button per group rather than four identical tab stops.
  const hasHoldings = !!r.holdings?.some(h => holdingRegion(h) === region && h.quantity > 0)
  const selectable = !!onSelectRegion && hasHoldings
  const mouseProps = selectable ? { onClick: () => onSelectRegion!() } : {}
  const buttonProps = selectable
    ? {
        ...mouseProps,
        role: 'button',
        tabIndex: 0,
        'aria-label': `View ${region} holdings`,
        title: `View ${region} holdings`,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRegion!() }
        },
      }
    : {}
  const base: React.CSSProperties = { ...td, background: tint, cursor: selectable ? 'pointer' : undefined }
  // New-investment override beats the group tint to keep the signal loud:
  // a day the user added holdings gets a mild purple "Amount invested" cell.
  const investedStyle: React.CSSProperties = {
    ...base,
    background: wentUp ? NEW_INVESTMENT_TINT : tint,
    fontWeight: wentUp ? 600 : undefined,
  }
  // P/L% cell tints by the day-over-day price move: mild green up, mild red
  // down, mild blue unchanged; plain group tint when there is no prior day
  // to compare against. Text stays the default colour — the background is
  // the single signal here (its own +/- sign still reads the P/L), so it
  // does not clash with the price-direction tint.
  const pnlStyle: React.CSSProperties = {
    ...base,
    ...sep,
    background: dir ? PRICE_DIR_TINT[dir] : tint,
  }
  const volColor = vol === null ? undefined : vol >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  return (
    <>
      <td {...buttonProps} style={investedStyle}>{fmtCurrency(invested, sym)}</td>
      <td {...mouseProps} style={base}>{fmtCurrency(current, sym)}</td>
      <td {...mouseProps} style={{ ...base, color: volColor }}>
        {vol === null ? '—' : vol.toFixed(2)}
      </td>
      <td {...mouseProps} style={pnlStyle}>
        {pnl === null ? '—' : `${pnl.toFixed(2)}%`}
      </td>
    </>
  )
}

function GoldHeaderGroup() {
  const hdr: React.CSSProperties = { ...th, background: GOLD_TINT }
  return (
    <>
      <th style={{ ...hdr, borderLeft: '2px solid var(--border)' }}>Gold invested</th>
      <th style={hdr}>Gold value</th>
      <th style={hdr}>Daily volatility</th>
      <th style={hdr}>P/L%</th>
    </>
  )
}

function GoldRowCells({ gold, prevGold }: { gold?: GoldHistoryOverlay; prevGold?: GoldHistoryOverlay }) {
  const base: React.CSSProperties = { ...td, background: GOLD_TINT }
  const first: React.CSSProperties = { ...base, borderLeft: '2px solid var(--border)' }
  // Rows before the first purchase (or before any price existed) carry no
  // overlay — the whole group reads em dashes rather than fake zeros.
  if (!gold) {
    return (
      <>
        <td style={first}>—</td><td style={base}>—</td><td style={base}>—</td><td style={base}>—</td>
      </>
    )
  }
  const volColor = gold.volatility_pct === 0 ? undefined
    : gold.volatility_pct > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)'
  // Match the currency columns: a day the gold invested rose (a new
  // purchase) gets the purple "new investment" tint; the P/L% cell tints
  // by the day-over-day value move (green up / red down / blue flat).
  const wentUp = !!prevGold && gold.invested > prevGold.invested
  const dir = goldCurrentDirection(gold, prevGold)
  const investedStyle: React.CSSProperties = {
    ...first,
    background: wentUp ? NEW_INVESTMENT_TINT : GOLD_TINT,
    fontWeight: wentUp ? 600 : undefined,
  }
  const pnlStyle: React.CSSProperties = { ...base, background: dir ? PRICE_DIR_TINT[dir] : GOLD_TINT }
  return (
    <>
      <td style={investedStyle}>{fmtCurrency(gold.invested, '₹')}</td>
      <td style={base}>{fmtCurrency(gold.current, '₹')}</td>
      <td style={{ ...base, color: volColor }}>{gold.volatility_pct.toFixed(2)}</td>
      <td style={pnlStyle}>{gold.pnl_pct === null ? '—' : `${gold.pnl_pct.toFixed(2)}%`}</td>
    </>
  )
}
