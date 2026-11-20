import { Navigate } from 'react-router-dom'

// The investment delta moved inline on Transactions (R33 resolved as inline).
// Any direct visit to /transactions/delta redirects back to Transactions.
export default function InvestmentDeltaRoute() {
  return <Navigate to="/transactions" replace />
}
