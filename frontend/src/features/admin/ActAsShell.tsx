import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { User } from '../../lib/api/client'
import { useActAsUser } from './useActAsUser'

// Common chrome for every act-as route: resolve the :id, then render the
// wrapped screen with the loaded user. Keeps the invalid-id redirect and the
// error / loading states identical across act-as screens.
export function ActAsShell({ children }: { children: (user: User) => ReactNode }) {
  const { id, user, error } = useActAsUser()

  if (!id) return <Navigate to="/admin" replace />
  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--red)' }}>{error}</div>
      </div>
    )
  }
  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="spinner" /></div>
  }
  return <>{children(user)}</>
}
