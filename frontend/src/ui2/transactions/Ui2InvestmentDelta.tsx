import { Link } from 'react-router-dom'
import { useAuthOptional } from '../../features/auth/AuthContext'
import { MIN_YEAR, PERFORMANCE_COLUMN_LABELS } from '../../features/history/historyShared'
import { InvestmentDeltaChart } from '../../features/transactions/InvestmentDeltaChart'
import { useInvestmentDelta } from '../../features/transactions/useInvestmentDelta'
import { useTheme } from '../../lib/useTheme'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import './transactions.css'

export const INVESTMENT_DELTA_PATH = '/transactions/delta'

// The UI_2.0 Transactions page's way in to the investment delta (PD-059 R33,
// owner: move the graph to its own sub-route). Own ledger only, like the graph.
export function Ui2InvestmentDeltaLink() {
  return (
    <Link to={INVESTMENT_DELTA_PATH} className="ui2-panel u2-tx-delta-link" aria-label="Open the investment delta">
      <span>
        <strong>Investment delta</strong>
        <small>Money added or sold each month, and the amount invested, by year</small>
      </span>
      <span className="u2-tx-delta-link-go" aria-hidden="true">View →</span>
    </Link>
  )
}

// The investment delta sub-route: the graph at full height under a page
// intro, with the way back to the ledger. The graph mounts fresh on every
// visit, so it always reads the figures healed by the latest ledger write.
export function Ui2InvestmentDeltaPage() {
  return (
    <div className="u2-tx-page">
      <Ui2PageIntro
        title="Money in, month by month."
        subtitle="What you added or sold each month, and the amount invested, for one year at a time."
        actions={<Link to="/transactions" className="ui2-btn">‹ Back to Transactions</Link>}
      />
      <Ui2InvestmentDelta />
    </div>
  )
}

// The investment delta graph (PD-059 R22): each month's money added or sold,
// and the invested amount, for one year and one column. Same data and chart
// as the Classic panel.
export function Ui2InvestmentDelta() {
  const auth = useAuthOptional()
  const { theme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const { fromHistory, year, setYear, currentYear, ready, error, columns, column, setPicked, months } =
    useInvestmentDelta({ active: true })

  return (
    <section className="ui2-panel u2-tx-delta" aria-label="Investment delta">
      <div className="u2-tx-delta-head">
        <h2>Investment delta</h2>
        <div className="u2-tx-delta-year">
          <button type="button" className="ui2-btn" aria-label="Previous year"
            disabled={year <= MIN_YEAR} onClick={() => setYear(shown => shown - 1)}>‹</button>
          <strong>{year}</strong>
          <button type="button" className="ui2-btn" aria-label="Next year"
            disabled={year >= currentYear} onClick={() => setYear(shown => shown + 1)}>›</button>
        </div>
      </div>
      {columns.length > 1 && (
        <div className="u2-tx-delta-columns" role="group" aria-label="Investment delta column">
          {columns.map(option => (
            <button key={option} type="button" aria-pressed={option === column}
              className={option === column ? 'ui2-btn ui2-btn-primary' : 'ui2-btn'} onClick={() => setPicked(option)}>
              {PERFORMANCE_COLUMN_LABELS[option]}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <p className="ui2-note" role="alert">{error}</p>
      ) : !ready ? (
        <p className="ui2-note" aria-live="polite">Loading…</p>
      ) : !column ? (
        <p className="ui2-note">{fromHistory ? `No History rows for ${year}` : `Nothing invested in ${year}`}</p>
      ) : (
        <div className="u2-tx-delta-chart" role="img"
          aria-label={`Investment delta ${year}, ${PERFORMANCE_COLUMN_LABELS[column]}`}>
          <InvestmentDeltaChart months={months} column={column} theme={theme} />
        </div>
      )}
    </section>
  )
}
