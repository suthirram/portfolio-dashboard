import TransactionsPage from '../transactions/TransactionsPage'
import { ActAsShell } from './ActAsShell'

// /admin/users/:id/transactions — the target user's full ledger, editable
// in act-as (PD-048).
// The id lives in the URL (not only in a prop) so the view is linkable and
// survives a refresh, and so TransactionsPage picks its endpoint from the
// same source as its heading.
export default function AdminUserTransactions() {
  return (
    <ActAsShell>
      {user => <TransactionsPage actAsUserId={user.id} actAsLabel={`${user.username}'s transactions`} />}
    </ActAsShell>
  )
}
