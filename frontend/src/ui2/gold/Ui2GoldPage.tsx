import { useState } from 'react'
import type { GoldTransaction } from '../../lib/api/client'
import { formatDayMonthYearName } from '../../lib/formDates'
import { formatRate } from '../../lib/rate'
import { useGoldData } from '../../features/gold/useGoldData'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { AssetStats, type AssetStat } from '../asset/AssetStats'
import { money, signedMoney } from '../overview/Ui2SummaryCards'
import { GOLD_COLUMNS, goldCell, grams, nimmiTone } from './goldColumns'
import { Ui2GoldDetails } from './Ui2GoldDetails'
import { Ui2GoldEditor } from './Ui2GoldEditor'
import { Ui2GoldPrices } from './Ui2GoldPrices'
import { MissingPricesAlert, Ui2MissingPrices } from './Ui2MissingPrices'
import '../asset/asset.css'
import './gold.css'

const toneOf = (value: number | null | undefined): AssetStat['tone'] =>
  value == null || value === 0 ? undefined : value > 0 ? 'positive' : 'negative'

// newestFirst orders purchases the way the handoff's ledger does; the id
// breaks same-day ties so the order is stable across refreshes.
const newestFirst = (rows: GoldTransaction[]) =>
  [...rows].sort((first, second) => second.date.localeCompare(first.date) || second.id - first.id)

export function Ui2GoldPage() {
  const { rows, prices, missing, metrics, loading, err, refresh } = useGoldData()
  const [editing, setEditing] = useState<{ txn: GoldTransaction | null } | null>(null)
  const [details, setDetails] = useState<GoldTransaction | null>(null)
  const [promptSkipped, setPromptSkipped] = useState(false)

  const latest = prices.at(-1)
  const purchases = newestFirst(rows)

  const stats: AssetStat[] = [
    {
      label: 'Current value',
      value: money(metrics?.current, 'INR'),
      detail: `Latest recorded rate · ${latest ? formatDayMonthYearName(latest.date) : 'unavailable'}`,
    },
    { label: 'Total invested', value: money(metrics?.invested, 'INR'), detail: 'Actual amounts paid' },
    { label: 'Physical gold', value: grams(metrics?.grams), detail: 'Purchased weight' },
    {
      label: 'Net P/L · physical',
      value: signedMoney(metrics?.nett_ex_bees, 'INR'),
      detail: 'Excludes GOLDBEES',
      tone: toneOf(metrics?.nett_ex_bees),
    },
  ]

  const meta: Array<{ label: string; value: string; help?: string; tone?: AssetStat['tone'] }> = [
    { label: 'Average cost per gram', value: money(metrics?.avg_per_gram, 'INR') },
    {
      label: 'GOLDBEES P/L · excl. tax',
      value: signedMoney(metrics?.bees_pl, 'INR'),
      help: 'GOLDBEES P/L excluding tax, from your GOLDBEES holding.',
      tone: toneOf(metrics?.bees_pl),
    },
    {
      label: 'Net P/L · including bees',
      value: signedMoney(metrics?.nett_in_bees, 'INR'),
      help: 'Physical net P/L plus GOLDBEES P/L. Unavailable when the ETF component is unavailable.',
      tone: toneOf(metrics?.nett_in_bees),
    },
    {
      label: 'Physical gold XIRR',
      value: formatRate(metrics?.xirr),
      help: 'Annualised cash-flow return for physical gold.',
      tone: toneOf(metrics?.xirr),
    },
  ]

  return (
    <>
      <Ui2PageIntro title="A clear view of your gold." subtitle="Your physical gold ledger, from purchase to present value." />

      <section className="asset-root" aria-label="Gold">
        <div className="asset-top">
          <div>
            <h2>Physical gold</h2>
            <p className="asset-note" style={{ marginTop: 7 }}>Purchases, bill comparisons and daily prices · INR</p>
          </div>
          <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => setEditing({ txn: null })}>
            ＋ Add purchase
          </button>
        </div>

        {err && <p className="ui2-note" role="alert">{err}</p>}
        {loading && <p className="ui2-note" aria-live="polite">Loading…</p>}

        <AssetStats stats={stats} />

        <section className="ui2-panel gold-meta" aria-label="Gold metrics">
          {meta.map(item => (
            <div key={item.label}>
              {item.help
                ? <button type="button" className="asset-metric-help" title={item.help}><span>{item.label}</span></button>
                : <span>{item.label}</span>}
              <strong className={item.tone === 'positive' ? 'u2-positive' : item.tone === 'negative' ? 'u2-negative' : undefined}>
                {item.value}
              </strong>
            </div>
          ))}
        </section>

        {!loading && missing.length > 0 && (
          <MissingPricesAlert count={missing.length} onReview={() => setPromptSkipped(false)} />
        )}

        <section className="ui2-panel">
          <div className="asset-search">
            <h2 style={{ font: '700 15px var(--u2-font-display)', margin: 0 }}>Purchase ledger</h2>
            <span style={{ flex: 1 }} />
            <span className="asset-note">All 15 purchase columns</span>
          </div>
          <div className="asset-table-wrap">
            <table className="asset-table" aria-label="Gold purchases">
              <thead>
                <tr>
                  {GOLD_COLUMNS.map(column => (
                    <th key={column.key} scope="col" className={column.kind === 'computed' ? 'computed' : undefined}>
                      {column.label}
                    </th>
                  ))}
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && purchases.length === 0 ? (
                  <tr><td colSpan={GOLD_COLUMNS.length + 1} className="empty">No purchases yet. Add your first purchase.</td></tr>
                ) : purchases.map(txn => (
                  <tr key={txn.id}>
                    {GOLD_COLUMNS.map(column => (
                      <td
                        key={column.key}
                        className={[
                          column.kind === 'computed' && 'computed',
                          column.key === 'nimmi_loss' && nimmiTone(txn),
                        ].filter(Boolean).join(' ') || undefined}
                      >
                        {goldCell(txn, column.key)}
                      </td>
                    ))}
                    <td>
                      <button type="button" className="ui2-btn" aria-label={`Details of ${formatDayMonthYearName(txn.date)} purchase`}
                        onClick={() => setDetails(txn)}>Details</button>{' '}
                      <button type="button" className="ui2-btn" aria-label={`Edit ${formatDayMonthYearName(txn.date)} purchase`}
                        onClick={() => setEditing({ txn })}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="asset-footer">
            <span>{purchases.length} purchases · newest first</span>
            <span>Shaded columns are calculated · scroll horizontally to view all columns</span>
          </div>
        </section>

        {!loading && <Ui2GoldPrices prices={prices} onSaved={() => void refresh()} />}
      </section>

      {editing && (
        <Ui2GoldEditor txn={editing.txn} onClose={() => setEditing(null)} onSaved={() => void refresh()} />
      )}
      {details && (
        <Ui2GoldDetails
          txn={details}
          onClose={() => setDetails(null)}
          onEdit={() => { setEditing({ txn: details }); setDetails(null) }}
          onDeleted={() => void refresh()}
        />
      )}
      {!loading && !promptSkipped && missing.length > 0 && !editing && !details && (
        <Ui2MissingPrices missing={missing} onSkip={() => setPromptSkipped(true)} onSaved={refresh} />
      )}
    </>
  )
}
