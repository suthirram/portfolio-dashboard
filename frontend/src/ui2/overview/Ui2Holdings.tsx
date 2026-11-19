import type { HoldingWithPrice } from '../../types'
import { canonicalCurrency, formatQuantity } from '../../lib/currency'
import { holdingMovement, holdingDayGain } from '../../features/holdings/dashboardPriceMovement'
import { nativeView } from '../../features/holdings/currencyTotals'
import SectorBadge from '../../features/holdings/SectorBadge'
import { money } from './Ui2SummaryCards'

export function Ui2Holdings({ rows, select }: { rows: HoldingWithPrice[]; select: (id: string) => void }) {
  return <div className="u2-holdings"><table className="ui2-table" aria-label="Holdings"><thead><tr>
    {['Holding', 'Shares', 'Avg cost', 'Share price', 'Value', 'Today', 'Unrealised'].map(label =>
      <th scope="col" key={label}>{label}</th>)}
  </tr></thead><tbody>{rows.map(holding => {
    const currency = canonicalCurrency(holding.currency)
    const native = currency === 'EUR' ? 'EUR' : 'INR'
    const movement = holdingMovement(holding)
    const direction = movement ? movement.tone ?? 'neutral' : undefined
    const selectRow = () => { if (holding.id) select(holding.id) }
    return <tr key={holding.id} onClick={event => {
      if ((event.target as HTMLElement).closest('button')) return
      event.currentTarget.querySelector('button')?.focus()
      selectRow()
    }}>
      <th scope="row">
        <button type="button" disabled={!holding.id} onClick={selectRow}>{holding.script}</button>
        <small>{holding.symbol} · {holding.exchange}</small>
        <SectorBadge holding={holding} />
      </th>
      <td>{formatQuantity(holding.stocks_owned)}</td>
      <td>{money(holding.avg_cost_price, currency)}</td>
      <td className={direction}>{money(holding.current_price, currency)}
        <small>{!movement ? 'Previous close unavailable' : movement.change === 0
          ? 'Unchanged from previous close' : movement.change > 0 ? 'Above previous close' : 'Below previous close'}</small></td>
      <td>{money(nativeView(native, holding.current_value, holding.current_value_eur).primary, native)}</td>
      <td>{money(holdingDayGain(holding), currency)}</td>
      <td>{money(nativeView(native, holding.unrealized_pnl, holding.unrealized_pnl_eur).primary, native)}</td>
    </tr>
  })}</tbody></table></div>
}
