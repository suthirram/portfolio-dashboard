import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Region, type User } from '../../lib/api/client'

export type AdminSection = 'users' | 'admins'

// useAdminUsers loads an Administration account list for every interface
// (PD-059 slices 23–24): the caller's scoped users (the server applies region
// scope) or, for the super admin, the administrators; plus the region
// catalogue and, for users, whether hidden accounts are included.
export function useAdminUsers(section: AdminSection = 'users') {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [includeHidden, setIncludeHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setUsers(section === 'admins' ? await api.adminListAdmins() : await api.adminListUsers(includeHidden))
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : section === 'admins' ? 'Failed to load admins' : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [section, includeHidden])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const regionLabel = useCallback((id: string) =>
    regions.find(region => region.id === id)?.label ?? id, [regions])

  return { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel }
}
