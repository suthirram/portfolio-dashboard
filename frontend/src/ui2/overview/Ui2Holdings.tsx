import type { HoldingWithPrice } from '../../types'
import { useState } from 'react'
import { canonicalCurrency, formatQuantity } from '../../lib/currency'
import { computeGroupDayChange, holdingMovement, holdingDayGain } from '../../features/holdings/dashboardPriceMovement'
import { nativeView, sumTotals } from '../../features/holdings/currencyTotals'
import type { XirrIndex } from '../../features/holdings/stockXirr'
import { formatRate } from '../../lib/rate'
import { formatDate } from '../../lib/formDates'
import { money, signTone, signedMoney, signedPercent, tone } from './Ui2SummaryCards'
import { stockIconStyle } from './holdingIcon'

const HEADERS = ['HOLDING', 'SHARES', 'AVG COST', 'SHARE PRICE', 'VALUE', 'TODAY', 'UNREALISED']

const CURRENCY_LABEL: Record<string, string> = {
  INR: 'Indian Rupee',
  EUR: 'Euro',
  OTHER: 'Other Currencies',
}

type MarketCurrency = 'INR' | 'EUR' | 'OTHER'

export function Ui2Holdings({ rows, select, xirr }: { rows: HoldingWithPrice[]; select: (id: string) => void; xirr?: XirrIndex | null }) {
  const [collapsed, setCollapsed] = useState<Record<MarketCurrency, boolean>>({ INR: false, EUR: false, OTHER: false })
  const markets = (['INR', 'EUR', 'OTHER'] as const)
    .map(currency => ({
      currency,
      rows: rows.filter(holding => canonicalCurrency(holding.currency) === currency),
    }))
    .filter(market => market.rows.length > 0)

  return (
    <div className="u2-holdings-markets">
      {markets.map(({ currency, rows: marketRows }) => {
        const isCollapsed = collapsed[currency]
        const panelId = `u2-holdings-${currency.toLowerCase()}`
        const totals = sumTotals(marketRows)
        const dayChange = computeGroupDayChange(marketRows)
        const native = currency === 'EUR' ? 'EUR' : 'INR'
        const foreign: 'INR' | 'EUR' | null = currency === 'EUR' ? 'INR' : currency === 'INR' ? 'EUR' : null
        const costView = nativeView(native, totals.cost, totals.costEur)
        const valueView = nativeView(native, totals.value, totals.valueEur)
        const unrealView = nativeView(native, totals.unreal, totals.unrealEur)
        const realView = nativeView(native, totals.real, totals.realEur)
        const bucket = currency === 'OTHER' ? undefined : xirr?.byCurrency[currency]
        return <section className={`u2-market-panel u2-market-panel-${currency.toLowerCase()}`} key={currency} aria-labelledby={`${panelId}-heading`}>
          <div className="u2-market-header">
            <div>
              <h3 id={`${panelId}-heading`}>{CURRENCY_LABEL[currency]} <span>{currency}</span></h3>
              <small>{marketRows.length} {marketRows.length === 1 ? 'holding' : 'holdings'}</small>
            </div>
            <div className="u2-market-metrics">
              <span>
                <small>Cost</small>
                <strong>{money(costView.primary as number, native)}</strong>
                {foreign && <em className="u2-metric-xsub">({money(costView.secondary as number, foreign)})</em>}
              </span>
              <span>
                <small>Current value</small>
                <strong className="u2-neutral">{money(valueView.primary as number, native)}</strong>
                {foreign && <em className="u2-metric-xsub">({money(valueView.secondary as number, foreign)})</em>}
              </span>
              <span>
                <small>Unrealised</small>
                <strong className={signTone(unrealView.primary as number)}>{money(unrealView.primary as number, native)}</strong>
                {foreign && <em className="u2-metric-xsub">({money(Math.abs(unrealView.secondary as number), foreign)})</em>}
              </span>
              <span>
                <small>Realised</small>
                <strong className={signTone(realView.primary as number)}>{money(realView.primary as number, native)}</strong>
                {foreign && <em className="u2-metric-xsub">({money(Math.abs(realView.secondary as number), foreign)})</em>}
              </span>
              <span>
                <small>Today</small>
                <strong className={signTone(dayChange?.gain)}>{dayChange ? signedMoney(dayChange.gain, native) : '—'}</strong>
                {dayChange?.pct != null && <em className="u2-metric-xsub">({signedPercent(dayChange.pct)})</em>}
              </span>
              <span>
                <small>XIRR</small>
                <strong className={signTone(bucket?.xirr)}>{formatRate(bucket?.xirr)}</strong>
                {bucket?.since && <em className="u2-metric-xsub">since {formatDate(bucket.since)}</em>}
              </span>
            </div>
            <button type="button" className="u2-market-collapse" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${currency} table`} aria-expanded={!isCollapsed} aria-controls={panelId} onClick={() => setCollapsed(previous => ({ ...previous, [currency]: !previous[currency] }))}>
              <span aria-hidden="true">{isCollapsed ? '➕' : '➖'}</span>
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
            const holdingCurrency = canonicalCurrency(holding.currency)
            const holdingNative = holdingCurrency === 'EUR' ? 'EUR' : 'INR'
            const eur = holdingCurrency === 'EUR'
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
                <td data-label="Avg cost">{money(holding.avg_cost_price, holdingCurrency)}</td>
                <td data-label="Share price" className={`u2-price-${priceTone}`}>
                  {money(holding.current_price, holdingCurrency)}
                </td>
                <td data-label="Value">
                  {money(nativeView(holdingNative, holding.current_value, holding.current_value_eur).primary as number, holdingNative)}
                </td>
                <td data-label="Today" className={tone(dayGain)}>
                  {signedMoney(dayGain, holdingCurrency)}
                  <small>{signedPercent(movement?.pct ?? null)}</small>
                </td>
                <td data-label="Unrealised" className={tone(unrealised)}>
                  {signedMoney(unrealised, holdingNative)}
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
