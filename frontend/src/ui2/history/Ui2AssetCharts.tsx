// The per-asset chart panels below (or above) Daily records: India, Europe
// and Gold, each with the three mini charts. Series reuse the classic chart
// helpers; only the date labels switch to the handoff's "16 Nov".
import type { HistoryRow } from '../../lib/api/client'
import { formatDayMonthName } from '../../lib/formDates'
import {
  goldChartData, perCurrencyChartData, regionHasData,
} from '../../features/history/historyShared'
import { ASSET_LABELS, type HistoryAsset } from './historyCells'
import { Ui2MiniChart, type MiniChartKind, type MiniChartPoint } from './Ui2MiniChart'

const KINDS: MiniChartKind[] = ['value', 'pl', 'volatility']

// assetSeries is one asset's oldest-first chart points with handoff dates.
// Both classic helpers sort oldest first, so index i is sorted row i.
export function assetSeries(rows: HistoryRow[], asset: HistoryAsset): MiniChartPoint[] {
  const oldestFirst = rows.toSorted((left, right) => left.date.localeCompare(right.date))
  const series = asset === 'GOLD' ? goldChartData(rows) : perCurrencyChartData(rows, asset)
  return series.map((point, index) => ({ ...point, date: formatDayMonthName(oldestFirst[index].date) }))
}

// chartedAssets keeps the assets that have something to plot, as the classic
// page shows a currency panel only with data and gold only with an overlay.
export function chartedAssets(rows: HistoryRow[], assets: HistoryAsset[]): HistoryAsset[] {
  return assets.filter(asset => asset === 'GOLD'
    ? rows.some(row => row.gold)
    : regionHasData(perCurrencyChartData(rows, asset)))
}

export function Ui2AssetCharts({ rows, assets, periodLabel, markers = true, onExpand }: {
  rows: HistoryRow[]
  assets: HistoryAsset[]
  // "November 2026", or "Full history" in the dialog.
  periodLabel: string
  markers?: boolean
  // Opens the zoomable full-history page for an asset's value chart.
  onExpand?: (asset: HistoryAsset) => void
}) {
  const shown = chartedAssets(rows, assets)
  if (shown.length === 0) return null
  return (
    <section className="u2h-chart-grid" aria-label="Supporting history charts">
      {shown.map(asset => {
        const points = assetSeries(rows, asset)
        const unit = asset === 'EUR' ? 'EUR' : 'INR'
        return (
          <section key={asset} className="ui2-panel u2h-asset-charts" aria-labelledby={`u2h-charts-${asset}`}>
            <div className="u2h-intro">
              <div>
                <h2 id={`u2h-charts-${asset}`}>{ASSET_LABELS[asset]}</h2>
                <p>{periodLabel}</p>
              </div>
            </div>
            <div className="u2h-asset-chart-grid">
              {KINDS.map(kind => (
                <Ui2MiniChart key={kind} points={points} kind={kind} unit={unit} markers={markers}
                  label={`${ASSET_LABELS[asset]}, ${periodLabel}`}
                  onExpand={kind === 'value' && onExpand ? () => onExpand(asset) : undefined} />
              ))}
            </div>
          </section>
        )
      })}
    </section>
  )
}
