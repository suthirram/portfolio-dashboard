import type { HoldingWithPrice } from '../../types'
import { canonicalCurrency, formatQuantity } from '../../lib/currency'
import { holdingMovement, holdingDayGain } from '../../features/holdings/dashboardPriceMovement'
import { nativeView } from '../../features/holdings/currencyTotals'
import { money, signedMoney, signedPercent, tone } from './Ui2SummaryCards'
import { stockIconStyle } from './holdingIcon'

const HEADERS = ['HOLDING', 'SHARES', 'AVG COST', 'SHARE PRICE', 'VALUE', 'TODAY', 'UNREALISED']

export function Ui2Holdings({ rows, select }: { rows: HoldingWithPrice[]; select: (id: string) => void }) {
  return (
    <div className="u2-holdings">
      <table className="ui2-table" aria-label="Holdings">
        <thead>
          <tr>{HEADERS.map(label => <th scope="col" key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(holding => {
            const currency = canonicalCurrency(holding.currency)
            const native = currency === 'EUR' ? 'EUR' : 'INR'
            const eur = currency === 'EUR'
            const movement = holdingMovement(holding)
            const priceTone = movement?.tone ?? 'neutral'
            const dayGain = holdingDayGain(holding)
            const unrealised = eur ? holding.unrealized_pnl_eur : holding.unrealized_pnl
            const cost = eur ? holding.cost_price_eur : holding.cost_price
            const unrealisedPct = unrealised != null && cost ? (unrealised / cost) * 100 : null
            const selectRow = () => { if (holding.id) select(holding.id) }
            const sym = holding.symbol ?? ''
            const icon = sym.split('.')[0].slice(0, 4)
            return (
              <tr key={holding.id} className="u2-holding-row" onClick={event => {
                if ((event.target as HTMLElement).closest('button')) return
                event.currentTarget.querySelector('button')?.focus()
                selectRow()
              }}>
                <td>
                  <div className="u2-holding">
                    <div className="u2-stock-icon" style={stockIconStyle(sym)} aria-hidden="true">
                      {icon}
                    </div>
                    <div>
                      <button type="button" className="u2-holding-name" disabled={!holding.id} onClick={selectRow}>
                        {holding.script}
                      </button>
                      <small>{holding.symbol} · {holding.exchange}</small>
                    </div>
                  </div>
                </td>
                <td data-label="Shares">{formatQuantity(holding.stocks_owned)}</td>
                <td data-label="Avg cost">{money(holding.avg_cost_price, currency)}</td>
                <td data-label="Share price" className={`u2-price-${priceTone}`}>
                  {money(holding.current_price, currency)}
                </td>
                <td data-label="Value">
                  {money(nativeView(native, holding.current_value, holding.current_value_eur).primary, native)}
                </td>
                <td data-label="Today" className={tone(dayGain)}>
                  {signedMoney(dayGain, currency)}
                  <small>{signedPercent(movement?.pct ?? null)}</small>
                </td>
                <td data-label="Unrealised" className={tone(unrealised)}>
                  {signedMoney(unrealised, native)}
                  <small>{signedPercent(unrealisedPct)}</small>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
