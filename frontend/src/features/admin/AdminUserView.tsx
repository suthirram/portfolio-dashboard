import DashboardPage from '../dashboard/DashboardPage'
import { ActAsShell } from './ActAsShell'

export default function AdminUserView() {
  return (
    <ActAsShell>
      {user => <DashboardPage actAsUserId={user.id} actAsLabel={`${user.username}'s portfolio`} />}
    </ActAsShell>
  )
}
