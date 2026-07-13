import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useAuth } from '../auth/AuthContext'
import { AdminShell } from './AdminShell'

export default function AdminManageAdmins() {
  const { user: caller } = useAuth()
  const [admins, setAdmins] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.adminListAdmins()
      setAdmins(data)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load admins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const regionLabel = (id: string) => regions.find(r => r.id === id)?.label ?? id

  const runAction = async (id: string, fn: () => Promise<unknown>, msg?: string) => {
    if (msg && !confirm(msg)) return
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
    const choice = prompt(`Move ${u.username} to which region? (${regions.map(r => r.id).join(', ')})`, u.region || regions[0]?.id || '')
    if (!choice) return
    if (!regions.find(r => r.id === choice)) { alert('Unknown region'); return }
    await runAction(u.id, () => api.adminSetUserRegion(u.id, { region: choice }))
  }

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = { padding: '12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
  return (
    <AdminShell>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Administrators</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          One admin per region. Promote a user from the <Link to="/admin" style={{ color: 'var(--blue)' }}>Users</Link> view.
        </p>
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
        ) : (
          <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Username</th>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={th}>Region</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(u => {
                const isSelf = u.id === caller?.id
                const isRowSuper = u.role === 'superadmin'
                return (
                  <tr key={u.id}>
                    <td style={td}>
                      <Link to={`/admin/users/${u.id}`}
                        style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {u.username}
                      </Link>
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </td>
                    <td style={td}>{u.name}</td>
                    <td style={td}>{u.role}</td>
                    <td style={td}>{u.region ? regionLabel(u.region) : '— all regions —'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {!isRowSuper && (
                          <button className="btn btn-sm" disabled={busy === u.id}
                            onClick={() => runAction(u.id, () => api.adminDemoteUser(u.id), `Demote ${u.username} back to user?`)}>
                            Demote
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === u.id} onClick={() => setRegionFor(u)}>
                            Move region
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
