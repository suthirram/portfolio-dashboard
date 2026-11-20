import { Navigate } from 'react-router-dom'
import { useUiMode } from '../../lib/uiMode'
import { Ui2InvestmentDeltaPage } from '../../ui2/transactions/Ui2InvestmentDelta'

// InvestmentDeltaRoute is a pure dispatcher for /transactions/delta (PD-059
// R33): UI_2.0 shows the graph on its own page; Classic and Glass keep it
// inline on Transactions, so they go back there.
export default function InvestmentDeltaRoute() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2InvestmentDeltaPage />
  return <Navigate to="/transactions" replace />
}
