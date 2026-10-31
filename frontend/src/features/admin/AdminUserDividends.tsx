import DividendsPage from '../dividends/DividendsPage'
import { ActAsShell } from './ActAsShell'

// /admin/users/:id/dividends — the target user's dividends, managed in act-as.
export default function AdminUserDividends() {
  return (
    <ActAsShell>
      {user => <DividendsPage actAsUserId={user.id} actAsLabel={`${user.username}'s dividends`} />}
    </ActAsShell>
  )
}
