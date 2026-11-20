// The handoff's hand-rolled SVG bar chart (PD-059 slices 18–21). Geometry is
// copied from assetBarChart() in the reference HTML; no chart library.
import { formatMoney } from '../../lib/currency'
import './asset.css'

export interface BarDatum { label: string; value: number }

const BASE_Y = 195
const PLOT_HEIGHT = 160
const GRID = [0, 0.5, 1]

export function AssetBarChart({ data, currency, label }: {
  data: BarDatum[]
  currency: string
  label: string
}) {
  const max = Math.max(...data.map(datum => datum.value), 1)
  const step = 600 / Math.max(data.length, 1)

  return (
    <svg className="asset-chart" viewBox="0 0 700 240" role="img" aria-label={label}>
      {GRID.map(tick => (
        <g key={tick}>
          <line
            x1="75" x2="680"
            y1={BASE_Y - tick * PLOT_HEIGHT} y2={BASE_Y - tick * PLOT_HEIGHT}
            stroke="var(--u2-border)" strokeDasharray="3 4"
          />
          <text x="65" y={BASE_Y + 4 - tick * PLOT_HEIGHT} fill="var(--u2-muted)" textAnchor="end" fontSize="10">
            {formatMoney(max * tick, currency)}
          </text>
        </g>
      ))}
      {data.map((datum, index) => (
        <g key={datum.label}>
          <rect
            x={80 + index * step + step * 0.2}
            y={BASE_Y - (datum.value / max) * PLOT_HEIGHT}
            width={Math.max(8, step * 0.55)}
            height={(datum.value / max) * PLOT_HEIGHT}
            fill="var(--u2-accent)"
            rx="4"
          >
            <title>{`${datum.label}: ${formatMoney(datum.value, currency)}`}</title>
          </rect>
          <text
            x={80 + index * step + step * 0.47}
            y="220"
            fill="var(--u2-muted)"
            textAnchor="middle"
            fontSize="10"
          >
            {datum.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
