import { useState } from 'react'
import { api, ApiError, type GoldPrice } from '../../lib/api/client'
import { DecimalInput } from '../../components/DecimalInput'
import { formatDayMonthYearName } from '../../lib/formDates'
import { toast } from '../../lib/toast'
import { localToday, pricePerGram, pricesByMonth } from '../../features/gold/goldPrices'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import { money } from '../overview/Ui2SummaryCards'
import '../asset/asset.css'
import './gold.css'

const RECENT_DAYS = 30
const PRICE_INPUT_ID = 'ui2-gold-price-per-gram'

// The handoff's daily gold price panel: one INR rate per gram per day, the
// 30 most recent shown, every month behind "View all months" (owner,
// 2026-11-18). Edit rate loads a day into the form; saving it replaces it.
export function Ui2GoldPrices({ prices, onSaved }: { prices: GoldPrice[]; onSaved: () => void }) {
  const [date, setDate] = useState(localToday())
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [allMonths, setAllMonths] = useState(false)

  const recent = [...prices].sort((first, second) => second.date.localeCompare(first.date)).slice(0, RECENT_DAYS)

  const save = async () => {
    const value = pricePerGram(price)
    if (!date) { setErr('Pick a date'); return }
    if (value == null) { setErr('Price must be a number > 0'); return }
    setErr('')
    setSaving(true)
    try {
      await api.putGoldPrices([{ date, price_per_gram: value }])
      setPrice('')
      toast('Daily price saved', 'success')
      onSaved()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const editRate = (recorded: GoldPrice) => {
    setDate(recorded.date)
    setPrice(String(recorded.price_per_gram))
    document.getElementById(PRICE_INPUT_ID)?.focus()
  }

  return (
    <section className="ui2-panel asset-panel" aria-label="Daily gold price">
      <div className="asset-panel-head">
        <h2>Daily gold price</h2>
        <span className="asset-note">One INR rate per gram, per calendar day</span>
      </div>
      <form
        className="asset-toolbar"
        style={{ justifyContent: 'flex-start', alignItems: 'flex-end' }}
        onSubmit={event => { event.preventDefault(); void save() }}
      >
        <label className="asset-note">
          Price date<br />
          <input className="asset-input" type="date" aria-label="Gold price date" max={localToday()}
            value={date} onChange={event => setDate(event.target.value)} required style={{ marginTop: 7 }} />
        </label>
        <label className="asset-note">
          Price per gram · INR<br />
          <DecimalInput id={PRICE_INPUT_ID} className="asset-input" aria-label="Gold price per gram" placeholder="₹ / gram"
            value={price} onValueChange={setPrice} style={{ marginTop: 7 }} />
        </label>
        <button type="submit" className="ui2-btn ui2-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save price'}
        </button>
      </form>
      {err && <p className="asset-error" role="alert">{err}</p>}
      <p className="asset-note" style={{ marginTop: 12 }}>Re-entering a date replaces its recorded rate.</p>
      {recent.length === 0 ? (
        <p className="asset-note" style={{ marginTop: 16 }}>No prices recorded yet.</p>
      ) : (
        <div className="gold-price-list">
          {recent.map(recorded => (
            <div key={recorded.date} className="gold-price-item">
              <span>{formatDayMonthYearName(recorded.date)}</span>
              <strong>{money(recorded.price_per_gram, 'INR')} / g</strong>
              <button type="button" className="ui2-btn" aria-label={`Edit rate for ${formatDayMonthYearName(recorded.date)}`}
                onClick={() => editRate(recorded)}>Edit rate</button>
            </div>
          ))}
        </div>
      )}
      <div className="asset-modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="ui2-btn" onClick={() => setAllMonths(true)} disabled={prices.length === 0}>
          View all months
        </button>
      </div>

      {allMonths && (
        <Ui2Dialog title="Gold prices · all months" onClose={() => setAllMonths(false)} wide>
          <p className="asset-note">Recorded rates only. Missing days remain missing; no interpolation.</p>
          {pricesByMonth(prices).map(group => (
            <section key={group.month} aria-label={`Gold prices ${group.month}`}>
              <h3>{group.month}</h3>
              <div className="asset-table-wrap">
                <table className="asset-table">
                  <thead><tr><th scope="col">Date</th><th scope="col">INR per gram</th></tr></thead>
                  <tbody>
                    {group.prices.map(recorded => (
                      <tr key={recorded.date}>
                        <td>{formatDayMonthYearName(recorded.date)}</td>
                        <td>{money(recorded.price_per_gram, 'INR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </Ui2Dialog>
      )}
    </section>
  )
}
