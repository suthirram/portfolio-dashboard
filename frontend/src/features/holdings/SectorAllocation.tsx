import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { HoldingWithPrice } from '../../types'
import { SUPPORTED_CURRENCIES, formatMoney, type SupportedCurrency } from '../../lib/currency'
import { groupByCurrency } from './groupByCurrency'
import { filterByView } from './holdingViews'
import { sectorAllocation } from './sectorAllocationData'
import { chartTooltipProps } from '../history/historyShared'
import type { SectorSelection } from './classification'
import type { CurrencyCode } from './groupByCurrency'
import type { SectorColorMap } from './sectorColors'

export default function SectorAllocation({ holdings, onSelectSector, sectorColors }: {
  holdings: HoldingWithPrice[]
  onSelectSector?: (selection: SectorSelection) => void
  /** Per-currency sector colours, assigned in this pie's slice order (sectorColorsByCurrency). */
  sectorColors?: Map<CurrencyCode, SectorColorMap>
}) {
  const [currency, setCurrency] = useState<SupportedCurrency>(() => {
    const first = groupByCurrency(filterByView(holdings, 'active')).find(group => group.currency !== 'OTHER')?.currency
    return first === 'EUR' ? 'EUR' : 'INR'
  })
  const allocation = sectorAllocation(holdings, currency)
  const select = (key: string) => onSelectSector?.({ currency, key })
  const colorOf = (bucket: { key: string; color: string }) => sectorColors?.get(currency)?.get(bucket.key) ?? bucket.color
  return <section aria-label="Sector allocation">
    <div className="sector-allocation-header">
      <div><h3>Sector allocation</h3><p>Current market value · positive active positions</p></div>
      <label>Currency <select aria-label="Sector allocation currency" value={currency}
        onChange={event => setCurrency(event.target.value as SupportedCurrency)}>
        {SUPPORTED_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}
      </select></label>
    </div>
    {allocation.unpriced > 0 && <p role="status">{allocation.unpriced} unpriced {allocation.unpriced === 1 ? 'holding is' : 'holdings are'} excluded from percentages.</p>}
    {allocation.unsupported > 0 && <p>{allocation.unsupported} {allocation.unsupported === 1 ? 'holding uses' : 'holdings use'} an unsupported currency and {allocation.unsupported === 1 ? 'is' : 'are'} excluded. INR and EUR are shown separately.</p>}
    {allocation.total === 0 ? <p className="sector-allocation-empty">No priced positive holdings in {currency} to allocate.</p> :
      <div className="sector-allocation-layout">
        <div aria-hidden="true" style={{ minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={allocation.buckets} dataKey="value" nameKey="label" innerRadius={68} outerRadius={105} paddingAngle={2} isAnimationActive={false}
                onClick={(_, index) => { const bucket = allocation.buckets[index]; if (bucket) select(bucket.key) }}>
                {allocation.buckets.map(bucket => <Cell key={bucket.key} fill={colorOf(bucket)} />)}
              </Pie>
              <Tooltip {...chartTooltipProps} formatter={value => typeof value === 'number' ? formatMoney(value, currency) : '—'} />
            </PieChart>
          </ResponsiveContainer>
          <p className="sector-allocation-total">Priced value: {formatMoney(allocation.total, currency)}</p>
        </div>
        <ul className="sector-allocation-legend" aria-label="Sector allocation values">
          {allocation.buckets.map(bucket => <li key={bucket.key}>
            <button type="button" onClick={() => select(bucket.key)}>
              <span className="sector-legend-label"><span aria-hidden="true" className="sector-dot" style={{ background: colorOf(bucket) }} />{bucket.label}
                <small>{bucket.count} {bucket.count === 1 ? 'holding' : 'holdings'}{['etf', 'mutual_fund'].includes(bucket.key) ? ' · underlying sectors not included' : ''}</small>
              </span>
              <span className="sector-legend-value"><strong>{bucket.share.toFixed(1)}%</strong><small>{formatMoney(bucket.value, currency)}</small></span>
            </button>
          </li>)}
        </ul>
      </div>}
    <p className="sector-allocation-note">Funds are grouped by asset type, without a breakdown of their underlying sectors. Select a category to view its table. Percentages use priced value in the selected currency; rounding may total 99.9% or 100.1%.</p>
  </section>
}
