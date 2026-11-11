import { useState } from 'react'
import type { Summary } from '../types'
import type { GroupDayChange, HoldingWithPreviousClose } from '../features/holdings/dashboardPriceMovement'
import { formatMoney } from '../lib/currency'
import { useCardFlip } from '../lib/useCardFlip'

// The glass dashboard's hero panel (PD-054): the portfolio's current value
// in large type, today's move per currency as glowing chips, the unrealised
// gain, and the INR/EUR split of the value as a labelled bar. It reads the
// same summary and the same per-currency day change the cards below use,
// so the two never disagree. Signs and labels carry the meaning; colour
// only reinforces it.

export interface HeroDayChange {
  INR?: GroupDayChange | null
  EUR?: GroupDayChange | null
}

export interface ValueSplit {
  currency: 'INR' | 'EUR'
  value: number
  share: number
}

// valueSplit is each currency's share of the stocks' current value. Every
// holding's current_value is INR-denominated (the backend converts EUR
// positions), so the shares compare like for like.
export function valueSplit(holdings: HoldingWithPreviousClose[]): ValueSplit[] {
  const totals = { INR: 0, EUR: 0 }
  for (const holding of holdings) {
    const value = holding.current_value ?? 0
    if (value <= 0) continue
    if (holding.currency === 'EUR') totals.EUR += value
    else totals.INR += value
  }
  const sum = totals.INR + totals.EUR
  if (sum <= 0) return []
  return (['INR', 'EUR'] as const)
    .filter(currency => totals[currency] > 0)
    .map(currency => ({ currency, value: totals[currency], share: totals[currency] / sum }))
}

// CurrencyFlag marks a currency's chip with its flag: India for INR, the
// European Union for EUR. Drawn as SVG, since flag emoji render as plain
// letters on Windows. Decorative: the code beside it already names it.
export type HeroCurrency = 'INR' | 'EUR'

export function CurrencyFlag({ currency }: { currency: HeroCurrency }) {
  const box = { width: 18, height: 12, borderRadius: 2, verticalAlign: '-1px', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)' }
  if (currency === 'INR') {
    return (
      <svg className="currency-flag" data-flag="IN" viewBox="0 0 18 12" style={box} aria-hidden="true" focusable="false">
        <rect width="18" height="4" fill="#FF9933" />
        <rect y="4" width="18" height="4" fill="#FFFFFF" />
        <rect y="8" width="18" height="4" fill="#138808" />
        <circle cx="9" cy="6" r="1.5" fill="none" stroke="#000080" strokeWidth="0.5" />
      </svg>
    )
  }
  // Twelve gold stars on a circle, on EU blue.
  const stars = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    return <circle key={i} cx={9 + Math.sin(angle) * 3.6} cy={6 - Math.cos(angle) * 3.6} r="0.55" fill="#FFCC00" />
  })
  return (
    <svg className="currency-flag" data-flag="EU" viewBox="0 0 18 12" style={box} aria-hidden="true" focusable="false">
      <rect width="18" height="12" fill="#003399" />
      {stars}
    </svg>
  )
}

export interface UnrealisedView {
  currency: HeroCurrency
  amount: number
  pct: number | null
}

// unrealisedViews is the unrealised gain in each currency the summary
// reports, in the order the chip cycles through them. INR is the base and
// always present; USD joins here once the summary carries its totals.
export function unrealisedViews(summary: Summary): UnrealisedView[] {
  const view = (currency: HeroCurrency, amount: number, cost: number): UnrealisedView =>
    ({ currency, amount, pct: cost > 0 ? (amount / cost) * 100 : null })
  const views = [view('INR', summary.total_unrealized ?? 0, summary.total_cost ?? 0)]
  if (summary.total_unrealized_eur !== undefined) {
    views.push(view('EUR', summary.total_unrealized_eur, summary.total_cost_eur ?? 0))
  }
  return views
}

const signed = (amount: number, currency: string) => `${amount > 0 ? '+' : ''}${formatMoney(amount, currency)}`
const signedPct = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
const tone = (amount: number) => (amount > 0 ? 'pos' : amount < 0 ? 'neg' : '')

export function PortfolioHero({ summary, loading, holdings, dayChange }: {
  summary: Summary | null
  loading: boolean
  holdings: HoldingWithPreviousClose[]
  dayChange: HeroDayChange
}) {
  // Which of unrealisedViews the Unrealised chip shows; each click turns the
  // chip over like the summary cards below and moves on while it is edge-on.
  const [unrealisedIndex, setUnrealisedIndex] = useState(0)
  const { flipClass, flip } = useCardFlip(() => setUnrealisedIndex(index => index + 1))
  if (!summary) {
    if (!loading) return null
    return (
      <section className="hero glass-panel" aria-busy="true" aria-label="Loading portfolio">
        <div className="skeleton" style={{ width: 120, height: 12 }} />
        <div className="skeleton" style={{ width: 280, height: 40, marginTop: 12 }} />
        <div className="skeleton" style={{ width: '60%', height: 10, marginTop: 20 }} />
      </section>
    )
  }

  const views = unrealisedViews(summary)
  const view = views[unrealisedIndex % views.length]
  const nextView = views[(unrealisedIndex + 1) % views.length]
  const split = valueSplit(holdings)
  const chips = (['INR', 'EUR'] as const).filter(currency => dayChange[currency] !== undefined)

  return (
    <section className="hero glass-panel" aria-label="Portfolio overview">
      <div className="hero-main">
        <div className="hero-label">Current value</div>
        <div className="hero-value mono">{formatMoney(summary.total_current_value ?? 0, 'INR')}</div>
        <div className="hero-sub mono">{formatMoney(summary.total_current_value_eur ?? 0, 'EUR')}</div>
      </div>

      <div className="hero-chips">
        {chips.map(currency => {
          const change = dayChange[currency]
          return (
            <div key={currency} className={`hero-chip ${change ? tone(change.gain) : ''}`}>
              <span className="hero-chip-label">Today · {currency} <CurrencyFlag currency={currency} /></span>
              <span className="hero-chip-value mono">
                {change ? signed(change.gain, currency) : '—'}
                {change && change.pct !== null && <small> {signedPct(change.pct)}</small>}
              </span>
            </div>
          )
        })}
        {/* A click flips the chip to the next currency, round the cycle. */}
        <button type="button" className={`hero-chip hero-chip-cycle ${tone(view.amount)} ${flipClass}`}
          aria-label={`Unrealised in ${view.currency}: ${signed(view.amount, view.currency)}. Show in ${nextView.currency}`}
          title={`Show in ${nextView.currency}`}
          onClick={flip}>
          {/* Every currency's face sits in the same grid cell; only the
              current one is visible, so the chip is always as wide as the
              widest face and the row never shifts on a flip. */}
          <span className="hero-flip-stack">
            {views.map(option => (
              <span key={option.currency}
                className={option.currency === view.currency ? 'hero-flip' : 'hero-flip hero-flip-ghost'}
                aria-hidden={option.currency === view.currency ? undefined : true}>
                <span className="hero-chip-label">
                  Unrealised · {option.currency} <CurrencyFlag currency={option.currency} />
                </span>
                <span className="hero-chip-value mono">
                  {signed(option.amount, option.currency)}
                  {option.pct !== null && <small> {signedPct(option.pct)}</small>}
                </span>
              </span>
            ))}
          </span>
        </button>
      </div>

      {split.length > 1 && (
        <div className="hero-split">
          <div className="hero-split-bar" role="img"
            aria-label={split.map(part => `${part.currency} ${Math.round(part.share * 100)}%`).join(', ')}>
            {split.map(part => (
              <span key={part.currency} className={`hero-split-${part.currency.toLowerCase()}`}
                style={{ width: `${part.share * 100}%` }} />
            ))}
          </div>
          <div className="hero-split-legend">
            {split.map(part => (
              <span key={part.currency}>
                <i className={`hero-split-dot hero-split-${part.currency.toLowerCase()}`} aria-hidden />
                {part.currency} {Math.round(part.share * 100)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
