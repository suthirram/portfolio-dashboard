import { useAuthOptional } from '../../features/auth/AuthContext'
import { MIN_YEAR, PERFORMANCE_COLUMN_LABELS } from '../../features/history/historyShared'
import { InvestmentDeltaChart } from '../../features/transactions/InvestmentDeltaChart'
import { useInvestmentDelta } from '../../features/transactions/useInvestmentDelta'
import { useTheme } from '../../lib/useTheme'

// The investment delta graph inline on the UI_2.0 Transactions page (PD-059
// R22): each month's money added or sold, and the invested amount, for one
// year and one column. Same data and chart as the Classic panel; the owner
// decides later whether it moves to a sub-route (R33).
export function Ui2InvestmentDelta({ refreshKey }: { refreshKey: number }) {
  const auth = useAuthOptional()
  const { theme } = useTheme({ premium: auth?.user ? auth.user.premium : undefined })
  const { fromHistory, year, setYear, currentYear, ready, error, columns, column, setPicked, months } =
    useInvestmentDelta({ active: true, refreshKey })

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
