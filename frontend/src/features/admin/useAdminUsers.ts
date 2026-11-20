import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Region, type User } from '../../lib/api/client'

// useAdminUsers loads Admin → Users for every interface (PD-059 slice 23):
// the caller's scoped account list (the server applies region scope), the
// region catalogue, and whether hidden accounts are included.
export function useAdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [includeHidden, setIncludeHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setUsers(await api.adminListUsers(includeHidden))
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [includeHidden])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const regionLabel = useCallback((id: string) =>
    regions.find(region => region.id === id)?.label ?? id, [regions])

  return { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel }
}
