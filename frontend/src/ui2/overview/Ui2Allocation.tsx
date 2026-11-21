import { useState } from 'react'
import type { HoldingWithPrice } from '../../types'
import { classificationBucket, type SectorSelection } from '../../features/holdings/classification'
import { groupByCurrency } from '../../features/holdings/groupByCurrency'
import { filterByView } from '../../features/holdings/holdingViews'
import { pricedNativeValue } from '../../features/holdings/sectorAllocationData'
import type { SupportedCurrency } from '../../lib/currency'

type View = 'Holding' | 'Sector' | 'Currency'
// currency is the first (INR before EUR) currency group holding the entry, the
// one a sector selection jumps to.
interface Bucket { key: string; label: string; value: number; currency: SupportedCurrency }
interface Props {
  holdings: HoldingWithPrice[]
  // Selecting a sector entry opens the holdings grouped by that sector, as the
  // classic sector allocation does. Holding and currency entries stay static.
  onSelectSector?: (selection: SectorSelection) => void
}
const palette = ['var(--blue)', 'var(--purple)', 'var(--green)', 'var(--yellow)']

export function Ui2Allocation({ holdings, onSelectSector }: Props) {
  const [view, setView] = useState<View>('Holding')
  const [collapsed, setCollapsed] = useState(false)
  const groups = new Map<string, Bucket>()
  const mix: Record<SupportedCurrency, number> = { INR: 0, EUR: 0 }
  let unsupported = 0
  let unpriced = 0
  let missingConversion = false
  for (const { currency, holdings: rows } of groupByCurrency(filterByView(holdings, 'active'))) {
    if (currency === 'OTHER') { unsupported += rows.length; continue }
    for (const holding of rows) {
      const native = pricedNativeValue(holding, currency)
      if (native == null) { unpriced++; continue }
      if (native <= 0) continue
      const value = holding.current_value
      if (value == null || !Number.isFinite(value) || value <= 0) { missingConversion = true; continue }
      mix[currency] += value
      const sector = classificationBucket(holding)
      const key = view === 'Holding' ? holding.id : view === 'Sector' ? sector.key : currency
      if (!key) continue
      const label = view === 'Holding' ? holding.script || holding.symbol || key : view === 'Sector' ? sector.label : currency
      const entry = groups.get(key) ?? { key, label, value: 0, currency }
      entry.value += value
      groups.set(key, entry)
    }
  }
  const entries = [...groups.values()].sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
  const total = entries.reduce((sum, entry) => sum + entry.value, 0)
  let cumulative = 0
  const stops = entries.map((entry, index) => {
    const start = cumulative
    cumulative += entry.value / total * 100
    return palette[index % palette.length] + ' ' + start + '% ' + cumulative + '%'
  })
  const viewLabel = view === 'Holding' ? 'holdings' : view === 'Sector' ? 'sectors' : 'currencies'
  return <aside className="u2-allocation-aside">
    <section className="ui2-panel u2-allocation-panel" aria-label="Portfolio allocation">
      <div className="u2-allocation-head">
        <h2>Equity allocation</h2>
        <label className="u2-allocation-view">Group allocation
          <select value={view} onChange={event => setView(event.target.value as View)}>
            <option value="Holding">By holding</option>
            <option value="Sector">By sector</option>
            <option value="Currency">By currency</option>
          </select>
        </label>
        <button type="button" className="u2-market-collapse" aria-label={collapsed ? 'Expand legend' : 'Collapse legend'} aria-expanded={!collapsed} aria-controls="u2-allocation-legend" onClick={() => setCollapsed(prev => !prev)}>
          <span aria-hidden="true">{collapsed ? '➕' : '➖'}</span>
        </button>
      </div>
      {missingConversion ? <p>Portfolio allocation unavailable: missing INR valuation.</p> : !total ? <p>No priced positions.</p> :
        <><div role="img" aria-label={`Allocation by ${view.toLowerCase()}`} className="u2-allocation-ring" style={{ background: 'conic-gradient(' + stops.join(', ') + ')' }}>
            <div className="u2-allocation-center"><strong>{entries.length}</strong><small>{viewLabel}</small></div>
          </div>
          <ul id="u2-allocation-legend" className="u2-allocation-legend" hidden={collapsed}>{entries.map((entry, index) => {
            const percent = (100 * entry.value / total).toFixed(1) + '%'
            const content = <><span><i className="u2-allocation-dot" style={{ background: palette[index % palette.length] }} />{entry.label}</span><strong>{percent}</strong></>
            return <li key={entry.key}>{view === 'Sector' && onSelectSector
              ? <button type="button" className="u2-allocation-entry" aria-label={'Show ' + entry.label + ' holdings, ' + percent + ' of allocation'}
                onClick={() => onSelectSector({ currency: entry.currency, key: entry.key })}>{content}</button>
              : <div className="u2-allocation-entry">{content}</div>}</li>
          })}</ul>
          </>}
      <p className="u2-allocation-foot">{view === 'Sector' && onSelectSector && 'Select a sector to see its holdings. '}Allocation uses current values converted to INR.
        {(unpriced > 0 || unsupported > 0) && ` ${unpriced} unpriced · ${unsupported} unsupported.`}</p>
    </section>
    <section className="ui2-panel u2-currency-mix" aria-label="Currency mix">
      <span className="u2-mix-eyebrow">Currency mix</span>
      <h2>Two markets. One clear view.</h2>
      <div className="u2-mix-bar" aria-hidden="true">
        {!missingConversion && total > 0 && <><span style={{ width: `${100 * mix.INR / total}%` }} /><span style={{ width: `${100 * mix.EUR / total}%` }} /></>}
      </div>
      <div className="u2-mix-values">{(['INR', 'EUR'] as const).map(code => <span key={code}>{code} <strong>{missingConversion || !total ? '—' : (100 * mix[code] / total).toFixed(1) + '%'}</strong></span>)}</div>
      <p>Daily movement stays in its original currency, so each market tells its own story.</p>
    </section>
  </aside>
}
