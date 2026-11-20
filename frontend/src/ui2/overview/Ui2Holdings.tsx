import type { HoldingWithPrice } from '../../types'
import { useState } from 'react'
import { canonicalCurrency, formatQuantity } from '../../lib/currency'
import { holdingMovement, holdingDayGain } from '../../features/holdings/dashboardPriceMovement'
import { nativeView } from '../../features/holdings/currencyTotals'
import { money, signedMoney, signedPercent, tone } from './Ui2SummaryCards'
import { stockIconStyle } from './holdingIcon'

const HEADERS = ['HOLDING', 'SHARES', 'AVG COST', 'SHARE PRICE', 'VALUE', 'TODAY', 'UNREALISED']

export function Ui2Holdings({ rows, select }: { rows: HoldingWithPrice[]; select: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Record<'INR' | 'EUR', boolean>>({ INR: false, EUR: false })
  const markets = (['INR', 'EUR'] as const).map(currency => ({
    currency,
    rows: rows.filter(holding => canonicalCurrency(holding.currency) === currency),
  }))

  return (
    <div className="u2-holdings-markets">
      {markets.map(({ currency, rows: marketRows }) => {
        const isCollapsed = collapsed[currency]
        const panelId = `u2-holdings-${currency.toLowerCase()}`
        return <section className={`u2-market-panel u2-market-panel-${currency.toLowerCase()}`} key={currency} aria-labelledby={`${panelId}-heading`}>
          <div className="u2-market-header">
            <div>
              <h3 id={`${panelId}-heading`}>{currency === 'INR' ? 'Indian Rupee' : 'Euro'} <span>{currency}</span></h3>
              <small>{marketRows.length} {marketRows.length === 1 ? 'holding' : 'holdings'}</small>
            </div>
            <button type="button" className="u2-market-collapse" aria-expanded={!isCollapsed} aria-controls={panelId} onClick={() => setCollapsed(previous => ({ ...previous, [currency]: !previous[currency] }))}>
              <span>{isCollapsed ? 'Show table' : 'Hide table'}</span>
              <span aria-hidden="true" className="u2-market-chevron">⌄</span>
            </button>
          </div>
          <div id={panelId} hidden={isCollapsed}>
            <div className="u2-holdings">
              <table className="ui2-table" aria-label={`${currency} holdings`}>
                <caption className="sr-only">{currency} holdings</caption>
                <thead>
                  <tr>{HEADERS.map(label => <th scope="col" key={label}>{label}</th>)}</tr>
                </thead>
                <tbody>
          {marketRows.map(holding => {
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
          </div>
        </section>
      })}
    </div>
  )
}
