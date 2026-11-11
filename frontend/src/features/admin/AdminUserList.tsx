import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useUiRevamp } from '../../lib/uiMode'
import { AdminShell } from './AdminShell'
import { AdminUserSettings, FEATURE_SWITCHES, type FeatureSwitch } from './AdminUserSettings'
import { useAdminActions } from './useAdminActions'

type StatusFilter = 'active' | 'all'

export default function AdminUserList() {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const revamp = useUiRevamp()

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
    regions.find(region => region.id === id)?.label ?? id, [regions])

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return users.filter(listedUser => {
      if (!needle) return true
      return listedUser.username.toLowerCase().includes(needle) || listedUser.name.toLowerCase().includes(needle)
    })
  }, [users, filter])

  const { caller, busy, runAction, toggleFeature } = useAdminActions(load)
  const isSuper = caller?.role === 'superadmin'
  const featureNamed = (key: FeatureSwitch['key']) => FEATURE_SWITCHES.find(feature => feature.key === key)!

  const setRegionFor = async (listedUser: User) => {
    if (!isSuper) return
    const choice = prompt(
      `Move ${listedUser.username} to which region? (${regions.map(region => region.id).join(', ')})`,
      listedUser.region || regions[0]?.id || '',
    )
    if (!choice) return
    if (!regions.find(region => region.id === choice)) { alert('Unknown region'); return }
    await runAction(listedUser.id, () => api.adminSetUserRegion(listedUser.id, { region: choice }))
  }

  // The glass UI gets the list + settings layout; the same data and actions.
  if (revamp) {
    return (
      <AdminShell>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>
            Users {isSuper ? '— all regions' : caller?.region ? `— ${regionLabel(caller.region)}` : ''}
          </h1>
        </div>
        {err && <div className="alert-danger">{err}</div>}
        {loading && users.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}><span className="spinner" /></div>
        ) : (
          <AdminUserSettings users={users} regions={regions} caller={caller} busy={busy}
            includeHidden={status === 'all'} onIncludeHidden={includeHidden => setStatus(includeHidden ? 'all' : 'active')}
            runAction={runAction} onFeature={toggleFeature} />
        )}
      </AdminShell>
    )
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
        <div className="alert-danger">{err}</div>
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
              {visible.map(listedUser => {
                const isSelf = listedUser.id === caller?.id
                const isRowSuper = listedUser.role === 'superadmin'
                const flags: string[] = []
                if (listedUser.disabled) flags.push('Hidden')
                if (listedUser.locked) flags.push('Locked')
                return (
                  <tr key={listedUser.id} style={{ opacity: listedUser.disabled ? 0.55 : 1 }}>
                    <td style={td}>
                      <Link to={`/admin/users/${listedUser.id}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {listedUser.username}
                      </Link>
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </td>
                    <td style={td}>{listedUser.name}</td>
                    <td style={td}>{listedUser.role}</td>
                    <td style={td}>{listedUser.region ? regionLabel(listedUser.region) : '—'}</td>
                    <td style={td}>
                      {flags.length === 0
                        ? <span style={{ color: 'var(--green)' }}>Active</span>
                        : <span style={{ color: 'var(--yellow)' }}>{flags.join(', ')}</span>}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        <Link to={`/admin/users/${listedUser.id}`} className="btn btn-sm">
                          Open
                        </Link>
                        {listedUser.locked && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminResetLockout(listedUser.id))}>
                            Unlock
                          </button>
                        )}
                        {!isRowSuper && !listedUser.disabled && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminHideUser(listedUser.id), `Hide ${listedUser.username}? They cannot log in until reactivated.`)}>
                            Hide
                          </button>
                        )}
                        {!isRowSuper && listedUser.disabled && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminReactivateUser(listedUser.id))}>
                            Reactivate
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && listedUser.role === 'user' && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminPromoteUser(listedUser.id), `Promote ${listedUser.username} to admin?`)}>
                            Promote
                          </button>
                        )}
                        {isSuper && listedUser.role === 'admin' && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminDemoteUser(listedUser.id), `Demote ${listedUser.username} back to user?`)}>
                            Demote
                          </button>
                        )}
                        {isSuper && !isRowSuper && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id} onClick={() => setRegionFor(listedUser)}>
                            Move region
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => toggleFeature(listedUser, featureNamed('gold_enabled'))}>
                            {listedUser.gold_enabled ? 'Disable gold' : 'Enable gold'}
                          </button>
                        )}
                        {isSuper && (
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => toggleFeature(listedUser, featureNamed('premium'))}>
                            {listedUser.premium ? 'Disable premium' : 'Enable premium'}
                          </button>
                        )}
                        {isSuper && (
                          // PD-052: the Transactions investment delta reads the ledger by
                          // default; this switches the account back to History rows.
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            onClick={() => toggleFeature(listedUser, featureNamed('delta_from_history'))}>
                            {listedUser.delta_from_history ? 'Delta from ledger' : 'Delta from History'}
                          </button>
                        )}
                        {isSuper && (
                          // PD-054: the glass UI is opt-in per account.
                          <button className="btn btn-sm" disabled={busy === listedUser.id}
                            aria-pressed={Boolean(listedUser.ui_revamp)}
                            onClick={() => toggleFeature(listedUser, featureNamed('ui_revamp'))}>
                            {listedUser.ui_revamp ? 'Glass UI off' : 'Glass UI on'}
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm btn-danger" disabled={busy === listedUser.id}
                            onClick={() => runAction(listedUser.id, () => api.adminDeleteUser(listedUser.id), `Permanently delete ${listedUser.username} and all their holdings? This cannot be undone.`)}>
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
