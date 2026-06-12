import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { api, ApiError, type User } from '../../lib/api/client'
import DashboardPage from '../dashboard/DashboardPage'

export default function AdminUserView() {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void api.adminGetUser(id).then(setUser).catch(e => {
      setErr(e instanceof ApiError ? e.message : 'Failed to load user')
    })
  }, [id])

  if (!id) return <Navigate to="/admin" replace />
  if (err) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--red)' }}>{err}</div>
      </div>
    )
  }
  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><span className="spinner" /></div>
  }

  return <DashboardPage actAsUserId={user.id} actAsLabel={`${user.username}'s portfolio`} />
}
