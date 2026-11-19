import { useState } from 'react'
import type { HoldingWithPrice } from '../../types'
import { classificationBucket, type SectorSelection } from '../../features/holdings/classification'
import { groupByCurrency } from '../../features/holdings/groupByCurrency'
import { filterByView } from '../../features/holdings/holdingViews'
import { pricedNativeValue } from '../../features/holdings/sectorAllocationData'
import type { SupportedCurrency } from '../../lib/currency'
import { money } from './Ui2SummaryCards'

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
  return <aside>
    <section className="ui2-panel" aria-label="Portfolio allocation">
      <h2>Portfolio allocation</h2>
      <div role="group" aria-label="Allocation view">
        {(['Holding', 'Sector', 'Currency'] as const).map(choice =>
          <button className="ui2-btn" key={choice} aria-pressed={choice === view} onClick={() => setView(choice)}>{choice}</button>)}
      </div>
      {missingConversion ? <p>Portfolio allocation unavailable: missing INR valuation.</p> : !total ? <p>No priced positions.</p> :
        <><div aria-hidden="true" className="u2-allocation-ring" style={{ background: 'conic-gradient(' + stops.join(', ') + ')' }} />
          <ul>{entries.map(entry => {
            const text = entry.label + ' · ' + money(entry.value, 'INR') + ' · ' + (100 * entry.value / total).toFixed(1) + '%'
            return <li key={entry.key}>{view === 'Sector' && onSelectSector
              ? <button type="button" className="u2-allocation-entry" aria-label={'Show ' + entry.label + ' holdings, ' + text}
                onClick={() => onSelectSector({ currency: entry.currency, key: entry.key })}>{text}</button>
              : text}</li>
          })}</ul>
          {view === 'Sector' && onSelectSector && <p>Select a sector to see its holdings.</p>}</>}
      {(unpriced > 0 || unsupported > 0) && <p>{unpriced} unpriced · {unsupported} unsupported</p>}
    </section>
    <section className="ui2-panel" aria-label="Currency mix">
      <h2>Currency mix</h2>
      {(['INR', 'EUR'] as const).map(code => <p key={code}>{code} · {missingConversion || !total ? '—' : (100 * mix[code] / total).toFixed(1) + '%'}</p>)}
    </section>
  </aside>
}
