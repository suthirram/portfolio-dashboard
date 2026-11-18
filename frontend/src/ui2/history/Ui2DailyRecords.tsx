// "Daily records" (handoff snapshotTable): the month's rows per asset group,
// with the classic table's tints in the reference's placement — the P/L cell
// by the day-over-day value move, the Invested cell purple on a new
// investment. Figures come from assetCells, so they equal the classic table.
import { useMemo, useState } from 'react'
import type { HistoryRow } from '../../lib/api/client'
import { fmtCurrency, type RegionKey } from '../../features/history/historyShared'
import {
  ASSET_LABELS, ASSET_SYMBOL, DIRECTION_CUE, DIRECTION_TITLE, FILTER_LABELS,
  assetCells, rowSource, shortDate, signedPercent, visibleAssets,
  type AssetFilter, type HistoryAsset,
} from './historyCells'

const FILTERS: AssetFilter[] = ['ALL', 'INR', 'EUR', 'GOLD']

export function Ui2DailyRecords({ rows, filter, onFilter, onEdit, onSelectRegion }: {
  rows: HistoryRow[]
  filter: AssetFilter
  onFilter: (filter: AssetFilter) => void
  onEdit: (row: HistoryRow) => void
  // Opens the per-stock breakdown (HoldingsModal) for a currency group.
  onSelectRegion: (row: HistoryRow, prev: HistoryRow | null, region: RegionKey) => void
}) {
  // Newest first by default, like the handoff; the classic helpers read
  // newestFirst[i + 1] as the prior day whatever the display order.
  const [newestFirst, setNewestFirst] = useState(true)
  const byDateDesc = useMemo(() => rows.toSorted((left, right) => right.date.localeCompare(left.date)), [rows])
  const hasGold = useMemo(() => rows.some(row => row.gold), [rows])
  const filters = hasGold ? FILTERS : FILTERS.filter(option => option !== 'GOLD')
  const assets = visibleAssets(filter, hasGold)
  const indexes = byDateDesc.map((_, index) => index)
  const display = newestFirst ? indexes : indexes.toReversed()

  return (
    <section className="ui2-panel u2h-snapshot-panel" aria-labelledby="u2h-daily-records">
      <div className="u2h-snapshot-top">
        <div>
          <h2 id="u2h-daily-records">Daily records <span className="u2h-count">{rows.length}</span></h2>
          <p className="ui2-subtitle">Select a value to inspect that day’s holdings.</p>
        </div>
        <div className="u2h-filters" role="group" aria-label="Filter snapshot currencies">
          {filters.map(option => (
            <button key={option} type="button" className={filter === option ? 'active' : undefined}
              aria-pressed={filter === option} onClick={() => onFilter(option)}>
              {FILTER_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <div className="u2h-snap-scroll">
        <table className="ui2-table u2h-snapshots" data-single={assets.length === 1 ? 'true' : undefined}
          aria-label="Daily portfolio snapshots">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" aria-sort={newestFirst ? 'descending' : 'ascending'}>
                <button type="button" className="u2h-day-link" onClick={() => setNewestFirst(order => !order)}>
                  Date {newestFirst ? '↓' : '↑'}
                </button>
              </th>
              {assets.map(asset => (
                <th key={asset} scope="colgroup" colSpan={asset === 'GOLD' ? 4 : 5} className="u2h-group-border">
                  {ASSET_LABELS[asset]}
                </th>
              ))}
              <th rowSpan={2} scope="col">Actions</th>
            </tr>
            <tr>
              {assets.map(asset => (
                <AssetHeaders key={asset} asset={asset} />
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map(index => {
              const row = byDateDesc[index]
              const prev = byDateDesc[index + 1] ?? null
              return (
                <tr key={row.date}>
                  <td>
                    <strong>{shortDate(row.date)}</strong>
                    {row.tentative && <span className="u2h-live-label">LIVE</span>}
                    <span className="u2h-source">{rowSource(row)}</span>
                  </td>
                  {assets.map(asset => (
                    <AssetRowCells key={asset} rows={byDateDesc} index={index} asset={asset}
                      onSelect={asset === 'GOLD' ? undefined : () => onSelectRegion(row, prev, asset)} />
                  ))}
                  <td>
                    {row.tentative
                      ? <span className="u2-muted">—</span>
                      : (
                        <button type="button" className="ui2-btn u2h-edit" onClick={() => onEdit(row)}
                          aria-label={`Edit snapshot ${row.date}`}>Edit</button>
                      )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="u2h-legend" aria-label="History colour legend">
        <span className="u2h-up">↑ Value moved up</span>
        <span className="u2h-down">↓ Value moved down</span>
        <span className="u2h-flat">＝ Unchanged</span>
        <span className="u2h-new">＋ New investment</span>
        <small>P/L cell tint compares value with the previous day; purple marks increased invested amount.</small>
      </div>
      <div className="u2h-overflow-note">
        {assets.length > 1 ? 'Scroll horizontally for all currency groups, or select a single asset group. ' : ''}
        Daily volatility is the day’s change net of money added or withdrawn; “—” means no baseline is available.
      </div>
    </section>
  )
}

function AssetHeaders({ asset }: { asset: HistoryAsset }) {
  return (
    <>
      <th scope="col" className="u2h-group-border">INVESTED</th>
      <th scope="col">VALUE</th>
      <th scope="col">DAILY VOLATILITY</th>
      <th scope="col">P/L</th>
      {asset !== 'GOLD' && <th scope="col">DIVIDENDS</th>}
    </>
  )
}

function AssetRowCells({ rows, index, asset, onSelect }: {
  rows: HistoryRow[]
  index: number
  asset: HistoryAsset
  onSelect?: () => void
}) {
  const cells = assetCells(rows, index, asset)
  const sym = ASSET_SYMBOL[asset]
  const money = (amount: number | null) => amount === null ? '—' : fmtCurrency(amount, sym)
  const direction = cells.direction ?? 'none'
  const date = rows[index].date
  return (
    <>
      <td className={`u2h-group-border${cells.newInvestment ? ' u2h-new' : ''}`}
        title={cells.newInvestment ? 'New investment — invested amount increased versus prior day' : 'Invested amount'}>
        {money(cells.invested)}
        {cells.newInvestment && <span className="u2h-cue">＋ New investment</span>}
      </td>
      <td>
        {onSelect && cells.hasHoldings
          ? (
            <button type="button" className="u2h-day-link" onClick={onSelect}
              aria-label={`View ${asset} holdings on ${date}`}>{money(cells.current)}</button>
          )
          : money(cells.current)}
      </td>
      <td className={cells.volatility === null ? '' : cells.volatility < 0 ? 'u2-negative' : cells.volatility > 0 ? 'u2-positive' : ''}>
        {cells.volatility === null ? '—' : signedPercent(cells.volatility)}
      </td>
      <td className={`u2h-move u2h-${direction}`} title={DIRECTION_TITLE[direction]}>
        {cells.pnlPct === null ? '—' : signedPercent(cells.pnlPct)}
        <span className="u2h-cue">{DIRECTION_CUE[direction]}</span>
      </td>
      {asset !== 'GOLD' && (
        <td className={cells.dividendsOnDay > 0 ? 'u2h-dividend-day' : undefined}
          title={cells.dividendsOnDay > 0 ? `+${fmtCurrency(cells.dividendsOnDay, sym)} received this day` : undefined}>
          {money(cells.dividendsToDate)}
          {cells.dividendsOnDay > 0 && <span className="u2h-cue">+{fmtCurrency(cells.dividendsOnDay, sym)} today</span>}
        </td>
      )}
    </>
  )
}
