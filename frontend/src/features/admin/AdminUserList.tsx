import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useAuth } from '../auth/AuthContext'
import { AdminShell } from './AdminShell'

type StatusFilter = 'active' | 'all'

export default function AdminUserList() {
  const { user: caller } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const isSuper = caller?.role === 'superadmin'

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.adminListUsers(status === 'all')
      setUsers(data)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const regionLabel = useCallback((id: string) =>
    regions.find(r => r.id === id)?.label ?? id, [regions])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return users.filter(u => {
      if (!q) return true
      return u.username.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    })
  }, [users, filter])

  const runAction = async (id: string, fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(id)
    try {
      await fn()
      await load()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const setRegionFor = async (u: User) => {
    if (!isSuper) return
    const choice = prompt(
      `Move ${u.username} to which region? (${regions.map(r => r.id).join(', ')})`,
      u.region || regions[0]?.id || '',
    )
    if (!choice) return
    if (!regions.find(r => r.id === choice)) { alert('Unknown region'); return }
    await runAction(u.id, () => api.adminSetUserRegion(u.id, { region: choice }))
  }

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = {
    padding: '12px', borderBottom: '1px solid var(--border)', fontSize: 13,
  }
  return (
    <AdminShell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>
            Users {isSuper ? '— all regions' : caller?.region ? `— ${regionLabel(caller.region)}` : ''}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            {isSuper
              ? 'Promote, demote, move regions, and help any user.'
              : 'Help the users in your region.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={filter} placeholder="Filter by username or name…"
            onChange={e => setFilter(e.target.value)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px',
              color: 'var(--text-primary)', outline: 'none', width: 240, fontSize: 13,
            }} />
          <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px',
              color: 'var(--text-primary)', outline: 'none', fontSize: 13,
            }}>
            <option value="active">Active only</option>
            <option value="all">Include hidden</option>
          </select>
        </div>
      </div>

      {err && (
        <div style={{
          background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid var(--red)',
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13,
        }}>{err}</div>
      )}

      <div className="table-scroll" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><span className="spinner" /></div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No users found.
          </div>
        ) : (
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Username</th>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={th}>Region</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(u => {
                const isSelf = u.id === caller?.id
                const isRowSuper = u.role === 'superadmin'
                const flags: string[] = []
                if (u.disabled) flags.push('Hidden')
                if (u.locked) flags.push('Locked')
                return (
                  <tr key={u.id} style={{ opacity: u.disabled ? 0.55 : 1 }}>
                    <td style={td}>
                      <Link to={`/admin/users/${u.id}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {u.username}
                      </Link>
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </td>
                    <td style={td}>{u.name}</td>
                    <td style={td}>{u.role}</td>
                    <td style={td}>{u.region ? regionLabel(u.region) : '—'}</td>
                    <td style={td}>
                      {flags.length === 0
                        ? <span style={{ color: 'var(--green)' }}>Active</span>
                        : <span style={{ color: 'var(--yellow)' }}>{flags.join(', ')}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/users/${u.id}`} className="btn btn-sm">
                          Open
                        </Link>
                        {u.locked && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminResetLockout(u.id))}>
                            Unlock
                          </button>
                        )}
                        {!isRowSuper && !u.disabled && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminHideUser(u.id), `Hide ${u.username}? They cannot log in until reactivated.`)}>
                            Hide
                          </button>
                        )}
                        {!isRowSuper && u.disabled && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminReactivateUser(u.id))}>
                            Reactivate
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && u.role === 'user' && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminPromoteUser(u.id), `Promote ${u.username} to admin?`)}>
                            Promote
                          </button>
                        )}
                        {isSuper && u.role === 'admin' && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminDemoteUser(u.id), `Demote ${u.username} back to user?`)}>
                            Demote
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === u.id} onClick={() => setRegionFor(u)}>
                            Move region
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminSetUserGold(u.id, { enabled: !u.gold_enabled }),
                              u.gold_enabled ? `Disable gold tracking for ${u.username}? Data is kept, only hidden.` : undefined)}>
                            {u.gold_enabled ? 'Disable gold' : 'Enable gold'}
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminSetUserPremium(u.id, { enabled: !u.premium }),
                              u.premium ? `Disable premium for ${u.username}? Their theme falls back to dark.` : undefined)}>
                            {u.premium ? 'Disable premium' : 'Enable premium'}
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm btn-danger" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminDeleteUser(u.id), `Permanently delete ${u.username} and all their holdings? This cannot be undone.`)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  )
}
