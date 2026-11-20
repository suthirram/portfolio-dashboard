import type { HoldingWithPrice } from '../../types'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { canonicalCurrency, formatQuantity } from '../../lib/currency'
import { formatRate } from '../../lib/rate'
import { money } from './Ui2SummaryCards'
import SectorBadge from '../../features/holdings/SectorBadge'

interface Props {
  xirr?: number | null
  // The rate's caveat (under a year, undated opening), '' when none — the
  // Classic table shows the same text on hover.
  xirrNote?: string
  holding: HoldingWithPrice
  close: () => void
  edit: () => void
  ledger?: () => void
  remove: () => Promise<void>
}

export function Ui2HoldingDetailsDialog({ holding, xirr, xirrNote = '', close, edit, ledger, remove }: Props) {
  const flagged = Boolean(xirrNote) && xirr != null
  const currency = canonicalCurrency(holding.currency)
  const eur = currency === 'EUR'
  const converted = eur ? 'EUR' : 'INR'
  const metrics: [string, string][] = [
    ['Shares', formatQuantity(holding.stocks_owned)],
    ['Average cost per share', money(holding.avg_cost_price, currency)],
    ['Total cost', money(eur ? holding.cost_price_eur : holding.cost_price, converted)],
    ['Current value', money(eur ? holding.current_value_eur : holding.current_value, converted)],
    ['Unrealised return', money(eur ? holding.unrealized_pnl_eur : holding.unrealized_pnl, converted)],
    ['Realised gain', money(holding.realized_pnl, currency)],
    ['Dividends', money(holding.total_dividends, currency)],
    ['XIRR', `${formatRate(xirr)}${flagged ? '*' : ''}`],
  ]
  return <Ui2Dialog title={holding.script || 'Holding details'} onClose={close}>
    <p>{holding.symbol} · {holding.exchange}</p>
    <SectorBadge holding={holding} />
    <div className="ui2-detailgrid">{metrics.map(([label, value]) =>
      <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    {flagged && <p className="ui2-note">* {xirrNote}</p>}
    <div className="ui2-dialog-actions">
      <button className="ui2-btn" onClick={edit}>Edit</button>
      {ledger && <button className="ui2-btn" onClick={ledger}>Ledger</button>}
      <button className="ui2-btn ui2-btn-danger" onClick={remove}>Delete</button>
    </div>
  </Ui2Dialog>
}
