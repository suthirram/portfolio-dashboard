import { useId, useState } from 'react'
import type { Summary } from '../../types'
import type { GroupDayChange } from '../../features/holdings/dashboardPriceMovement'
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../../lib/currency'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import './overview.css'

type Amount = number | null | undefined
export function money(value: Amount, currency: string) {
  return value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(value)
}

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

const titles = ['Total portfolio value', 'Unrealised return', 'Today by currency', 'Realised gains', 'Dividends'] as const
export function Ui2SummaryCards({ summary, assets, daily }: Props) {
  const currencyId = useId()
  const [currency, setCurrency] = useState<SupportedCurrency>('INR')
  const [open, setOpen] = useState<typeof titles[number] | null>(null)
  if (!summary) return null
  const rate = summary.eur_rate
  const validRate = rate != null && Number.isFinite(rate) && rate > 0
  function total(field: keyof Pick<AssetLine, 'invested' | 'current' | 'unrealised' | 'realised' | 'income'>, display = currency) {
    let sum = 0
    for (const asset of assets) {
      const amount = asset[field]
      if (amount == null || !Number.isFinite(amount)) return null
      if (asset.currency === display || amount === 0) sum += amount
      else if (validRate) sum += display === 'EUR' ? amount * rate! : amount / rate!
      else return null
    }
    return sum
  }
  const unrealised = total('unrealised')
  const realised = total('realised')
  const invested = total('invested')
  const movements = SUPPORTED_CURRENCIES.map(code => {
    const bucket = summary.per_currency?.find(item => item.currency === code)
    const change = daily[code]
    return { code, gain: change === undefined ? bucket?.change_value : change?.gain,
      pct: change === undefined ? bucket?.change_pct : change?.pct,
      close: change === undefined ? bucket?.previous_close : change?.previousValue }
  })
  const equivalent = currency === 'INR' ? 'EUR' : 'INR'
  const values = [
    <><label htmlFor={currencyId}>Display currency <select id={currencyId} value={currency} onChange={event => setCurrency(event.target.value as SupportedCurrency)}>
      {SUPPORTED_CURRENCIES.map(code => <option key={code}>{code}</option>)}</select></label>
      <strong className="u2-summary-amount">{money(total('current'), currency)}</strong>
      <small>≈ {money(total('current', equivalent), equivalent)} converted equivalent</small>
      <small>Total invested {money(invested, currency)}</small></>,
    <><strong className="u2-summary-amount">{money(unrealised, currency)}</strong><small>{invested && unrealised != null ? (100 * unrealised / invested).toFixed(2) + '%' : '—'} since purchase</small></>,
    <>{movements.map(({code, gain, pct}) => <small key={code}>{code} · {money(gain, code)} ({pct == null ? '—' : pct.toFixed(2) + '%'})</small>)}
      <small>{summary.previous_close_date ? 'vs ' + summary.previous_close_date + ' close' : 'Previous close date unavailable'}</small></>,
    <strong className="u2-summary-amount">{money(realised, currency)}</strong>,
    <strong className="u2-summary-amount">{money(total('income'), currency)}</strong>,
  ]
  return <section aria-label="Portfolio summary" className="u2-summary">
    <p className="u2-summary-rate">{validRate ? '1 EUR = ' + money(1 / rate!, 'INR') : 'Conversion rate unavailable'}</p>
    <div className="u2-summary-grid">{titles.map((title, index) => <article key={title} className="ui2-panel">
      <h2>{title}</h2><div className="u2-summary-value">{values[index]}</div><button className="ui2-btn" onClick={() => setOpen(title)}
        aria-label={'View breakdown · ' + title}>View breakdown</button></article>)}</div>
    {open && <Ui2Dialog title={open} onClose={() => setOpen(null)}>
      {open === 'Today by currency' ? <>{movements.map(item => <p key={item.code}>{item.code} previous close {money(item.close, item.code)}</p>)}
        <p>Gold daily movement —</p></> :
        <dl className="u2-summary-breakdown">{assets.filter(asset => open !== 'Dividends' || asset.label !== 'Physical gold').map(asset =>
          <div key={asset.label}><dt>{asset.label}</dt><dd>{open === 'Total portfolio value'
            ? <>Invested {money(asset.invested, asset.currency)} · Current {money(asset.current, asset.currency)}</>
            : money(open === 'Unrealised return' ? asset.unrealised : open === 'Realised gains' ? asset.realised : asset.income, asset.currency)}</dd></div>)}</dl>}
    </Ui2Dialog>}
  </section>
}
