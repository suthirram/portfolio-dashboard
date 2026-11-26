// The UI_2.0 Overview summary (PD-059 slice 4), laid out from the handoff's
// runtime summary: a context row (one bold conversion rate and the display
// currency) above four cards — Portfolio value, Daily movement, Total profit
// & loss, Dividend income — each opening a breakdown dialog. DashboardPage
// owns the data and passes native-currency lines per asset; a value that is
// not known stays "—" and is never shown as zero.
import { useId, useState, type ReactNode } from 'react'
import type { Summary } from '../../types'
import type { GroupDayChange } from '../../features/holdings/dashboardPriceMovement'
import { SUPPORTED_CURRENCIES, currencySymbol, type SupportedCurrency } from '../../lib/currency'
import { formatDayMonthName } from '../../lib/formDates'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import './overview.css'

type Amount = number | null | undefined
const usable = (value: Amount): value is number => value != null && Number.isFinite(value)

export function money(value: Amount, currency: string) {
  return !usable(value) ? '—' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(value)
}

// The handoff signs gains and losses explicitly: +₹1,14,185.72 / −₹594.20.
export function signedMoney(value: Amount, currency: string) {
  return !usable(value) ? '—' : (value < 0 ? '−' : '+') + money(Math.abs(value), currency)
}
export const signedPercent = (value: Amount) => !usable(value) ? '—' : (value < 0 ? '−' : '+') + Math.abs(value).toFixed(2) + '%'
export const tone = (value: Amount) => !usable(value) ? '' : value < 0 ? 'u2-negative' : 'u2-positive'
// Like tone, but zero reads as neutral (blue) rather than a gain.
export const signTone = (value: Amount) => !usable(value) ? '' : value < 0 ? 'u2-negative' : value > 0 ? 'u2-positive' : 'u2-neutral'

export const GOLD_LABEL = 'Physical gold'

export interface AssetLine {
  label: string
  currency: SupportedCurrency
  invested: Amount
  current: Amount
  unrealised: Amount
  realised: Amount
  income: Amount
}

interface Props {
  summary: Summary | null
  assets: AssetLine[]
  daily: Partial<Record<SupportedCurrency, GroupDayChange | null | undefined>>
}

type CardKey = 'value' | 'daily' | 'returns' | 'income'
const CARD_TITLE: Record<CardKey, string> = {
  value: 'Portfolio value', daily: 'Daily movement', returns: 'Total profit & loss', income: 'Dividend income',
}
const DIALOG_TITLE: Record<CardKey, string> = {
  value: 'Invested and current value', daily: 'Daily movement details',
  returns: 'Profit and loss breakdown', income: 'Dividend income by currency',
}
const CARD_KEYS = Object.keys(CARD_TITLE) as CardKey[]
const MARKET = { INR: { place: 'India', name: 'Indian Rupee' }, EUR: { place: 'Europe', name: 'Euro' } } as const

export function Ui2SummaryCards({ summary, assets, daily }: Props) {
  const currencyId = useId()
  const [currency, setCurrency] = useState<SupportedCurrency>('INR')
  const [open, setOpen] = useState<CardKey | null>(null)
  if (!summary) return null
  const rate = summary.eur_rate
  const validRate = rate != null && Number.isFinite(rate) && rate > 0
  const hasGold = assets.some(asset => asset.label === GOLD_LABEL)

  // Sum one field across the assets in the display currency. One unknown
  // amount, or a conversion with no usable rate, makes the whole total unknown.
  function total(field: 'invested' | 'current' | 'unrealised' | 'realised' | 'income') {
    let sum = 0
    for (const asset of assets) {
      const amount = asset[field]
      if (!usable(amount)) return null
      if (asset.currency === currency || amount === 0) sum += amount
      else if (validRate) sum += currency === 'EUR' ? amount * rate! : amount / rate!
      else return null
    }
    return sum
  }
  // Dividends in one currency's own units, for the breakdown (gold pays none).
  function incomeIn(code: SupportedCurrency) {
    let sum = 0
    for (const asset of assets) {
      if (asset.label === GOLD_LABEL || asset.currency !== code) continue
      if (!usable(asset.income)) return null
      sum += asset.income
    }
    return sum
  }

  const current = total('current')
  const invested = total('invested')
  const unrealised = total('unrealised')
  const realised = total('realised')
  // Combined P/L needs both parts; each part still shows on its own line.
  const profit = unrealised != null && realised != null ? unrealised + realised : null
  const unrealisedPct = unrealised != null && invested != null && invested > 0 ? 100 * unrealised / invested : null
  const movements = SUPPORTED_CURRENCIES.map(code => {
    const bucket = summary.per_currency?.find(item => item.currency === code)
    const change = daily[code]
    return { code, gain: change === undefined ? bucket?.change_value : change?.gain,
      pct: change === undefined ? bucket?.change_pct : change?.pct,
      close: change === undefined ? bucket?.previous_close : change?.previousValue }
  })
  const closeDate = summary.previous_close_date
  const closeLabel = closeDate ? `vs ${formatDayMonthName(closeDate)} ${closeDate.slice(0, 4)} close` : 'Previous close date unavailable'

  const body: Record<CardKey, ReactNode> = {
    value: <>
      <strong className="u2-summary-amount">{money(current, currency)}</strong>
      <p className="u2-summary-secondary">Total invested <strong>{money(invested, currency)}</strong></p>
    </>,
    daily: <>
      <div className="u2-daily">{movements.map(({ code, gain, pct }) => <div key={code}>
        <span>{code} equities</span>
        <strong className={tone(gain)}>{signedMoney(gain, code)}</strong>
        <small className={tone(pct)}>{signedPercent(pct)}</small>
      </div>)}</div>
      <p className="u2-summary-secondary">{closeLabel}</p>
    </>,
    returns: <>
      <strong className={'u2-summary-amount ' + tone(profit)}>{signedMoney(profit, currency)}</strong>
      <div className="u2-components">
        <div><span>Unrealised ({unrealisedPct == null ? '—' : unrealisedPct.toFixed(2) + '%'})</span>
          <strong className={tone(unrealised)}>{signedMoney(unrealised, currency)}</strong></div>
        <div><span>Realised</span><strong className={tone(realised)}>{signedMoney(realised, currency)}</strong></div>
      </div>
    </>,
    income: <>
      <strong className="u2-summary-amount">{money(total('income'), currency)}</strong>
      <p className="u2-summary-secondary">Total dividend income · {currency}</p>
    </>,
  }
  const dialog: Record<CardKey, ReactNode> = {
    value: <>
      <table className="ui2-table u2-summary-table" aria-label="Investment and current value breakdown">
        <thead><tr><th scope="col">Asset</th><th scope="col">Invested</th><th scope="col">Current</th></tr></thead>
        <tbody>{assets.map(asset => <tr key={asset.label}><td>{asset.label}</td>
          <td>{money(asset.invested, asset.currency)}</td><td>{money(asset.current, asset.currency)}</td></tr>)}</tbody>
      </table>
      <p className="ui2-note">Breakdown stays in original currencies. Combined totals use the conversion rate shown above the cards.</p>
    </>,
    daily: <>
      {movements.map(({ code, close }) => <div className="u2-detail-pair" key={code}>
        <span>{MARKET[code].place} previous close</span><strong>{money(close, code)}</strong></div>)}
      {hasGold && <div className="u2-detail-pair"><span>Gold daily movement</span><strong>—</strong></div>}
      <p className="ui2-note">Gold has no prior-close baseline. Daily movements remain in their original currency.</p>
    </>,
    returns: <>
      <table className="ui2-table u2-summary-table" aria-label="Returns by asset group">
        <thead><tr><th scope="col">Asset</th><th scope="col">Unrealised</th><th scope="col">Realised</th></tr></thead>
        <tbody>{assets.map(asset => <tr key={asset.label}><td>{asset.label}</td>
          <td className={tone(asset.unrealised)}>{signedMoney(asset.unrealised, asset.currency)}</td>
          <td>{money(asset.realised, asset.currency)}</td></tr>)}</tbody>
      </table>
      <p className="ui2-note">Total P/L = unrealised + realised gains. Dividends are shown separately.</p>
    </>,
    income: <>
      {SUPPORTED_CURRENCIES.map(code => <div className="u2-detail-pair" key={code}>
        <span>{MARKET[code].name} · {code}</span><strong>{money(incomeIn(code), code)}</strong></div>)}
      <p className="ui2-note">Totals are shown in their original currencies. The card total uses the selected display currency.</p>
    </>,
  }

  return <section aria-label="Portfolio summary" className="u2-summary">
    <div className="u2-summary-context">
      <span>Portfolio summary <small>{hasGold ? 'Equities + physical gold' : 'Equities'}</small></span>
      <div className="u2-summary-tools">
        <strong className="u2-rate-badge">{validRate ? '1 EUR = ' + money(1 / rate!, 'INR') : 'Conversion rate unavailable'}</strong>
        <label htmlFor={currencyId}>Display currency <select id={currencyId} value={currency}
          onChange={event => setCurrency(event.target.value as SupportedCurrency)}>
          {SUPPORTED_CURRENCIES.map(code => <option key={code} value={code}>{code} {currencySymbol(code)}</option>)}
        </select></label>
      </div>
    </div>
    <div className="u2-summary-grid">{CARD_KEYS.map(key => <article key={key} className={'ui2-panel u2-summary-card' + (key === 'value' ? ' u2-summary-lead' : '')}>
      <h2>{CARD_TITLE[key]}</h2>
      <div className="u2-summary-body">{body[key]}</div>
      <button type="button" className="u2-breakdown-toggle" aria-haspopup="dialog" aria-label={'View breakdown · ' + CARD_TITLE[key]}
        onClick={() => setOpen(key)}><span>View breakdown</span><span aria-hidden="true">›</span></button>
    </article>)}</div>
    {open && <Ui2Dialog title={DIALOG_TITLE[open]} onClose={() => setOpen(null)}>{dialog[open]}</Ui2Dialog>}
  </section>
}
