import { Link } from 'react-router-dom'
import { api, type User } from '../../lib/api/client'
import { useUiMode, useUiRevamp } from '../../lib/uiMode'
import { Ui2AdminUsers } from '../../ui2/admin/Ui2AdminUsers'
import { AdminShell } from './AdminShell'
import { AdminUserSettings } from './AdminUserSettings'
import { useAdminActions } from './useAdminActions'
import { useAdminUsers } from './useAdminUsers'

// AdminManageAdmins is a pure dispatcher: only useUiMode() lives here, so
// the hook count is stable across mode changes.
export default function AdminManageAdmins() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2AdminUsers section="admins" />
  return <ClassicAdminManageAdmins />
}

function ClassicAdminManageAdmins() {
  const { users: admins, regions, loading, err, load, regionLabel } = useAdminUsers('admins')
  const revamp = useUiRevamp()

  const { caller, busy, runAction, toggleFeature, setUiMode } = useAdminActions(load)

  const setRegionFor = async (listedAdmin: User) => {
    const choice = prompt(`Move ${listedAdmin.username} to which region? (${regions.map(region => region.id).join(', ')})`, listedAdmin.region || regions[0]?.id || '')
    if (!choice) return
    if (!regions.find(region => region.id === choice)) { alert('Unknown region'); return }
    await runAction(listedAdmin.id, () => api.adminSetUserRegion(listedAdmin.id, { region: choice }))
  }

  const intro = (
    <div style={{ marginBottom: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Administrators</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
        One admin per region. Promote a user from the <Link to="/admin" style={{ color: 'var(--blue)' }}>Users</Link> view.
      </p>
    </div>
  )

  // The glass UI (PD-054) gets the same list + settings layout as Users.
  if (revamp) {
    return (
      <AdminShell>
        {intro}
        {err && <div className="alert-danger">{err}</div>}
        {loading && admins.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}><span className="spinner" /></div>
        ) : (
          <AdminUserSettings users={admins} regions={regions} caller={caller} busy={busy}
            runAction={runAction} onFeature={toggleFeature} onUiMode={setUiMode} listLabel="Administrators" />
        )}
      </AdminShell>
    )
  }

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500,
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = { padding: '12px', borderBottom: '1px solid var(--border)', fontSize: 13 }
  return (
    <AdminShell>
      {intro}

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
                <th scope="col" style={th}>Username</th>
                <th scope="col" style={th}>Name</th>
                <th scope="col" style={th}>Role</th>
                <th scope="col" style={th}>Region</th>
                <th scope="col" style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(listedAdmin => {
                const isSelf = listedAdmin.id === caller?.id
                const isRowSuper = listedAdmin.role === 'superadmin'
                return (
                  <tr key={listedAdmin.id}>
                    <td style={td}>
                      <Link to={`/admin/users/${listedAdmin.id}`}
                        style={{ color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>
                        {listedAdmin.username}
                      </Link>
                      {isSelf && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>(you)</span>}
                    </td>
                    <td style={td}>{listedAdmin.name}</td>
                    <td style={td}>{listedAdmin.role}</td>
                    <td style={td}>{listedAdmin.region ? regionLabel(listedAdmin.region) : '— all regions —'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {!isRowSuper && (
                          <button className="btn btn-sm" disabled={busy === listedAdmin.id}
                            onClick={() => runAction(listedAdmin.id, () => api.adminDemoteUser(listedAdmin.id), `Demote ${listedAdmin.username} back to user?`)}>
                            Demote
                          </button>
                        )}
                        {!isRowSuper && !isSelf && (
                          <button className="btn btn-sm" disabled={busy === listedAdmin.id} onClick={() => setRegionFor(listedAdmin)}>
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
