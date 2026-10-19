import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, ApiError, type User } from '../../lib/api/client'

// Loads the target user for an act-as route (/admin/users/:id/...). Shared by
// every act-as screen so the id-validation and error/loading states can't
// drift between them. Region scope is still enforced server-side — an
// out-of-region id comes back as an error here, never as data.
export function useActAsUser() {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    void api.adminGetUser(id).then(setUser).catch(e => {
      setError(e instanceof ApiError ? e.message : 'Failed to load user')
    })
  }, [id])

  return { id, user, error }
}
