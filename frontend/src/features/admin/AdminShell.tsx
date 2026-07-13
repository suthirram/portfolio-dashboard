import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ShieldIcon, ArrowLeftIcon, LogOutIcon, UsersIcon } from '../../components/Icon'

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const isSuper = user?.role === 'superadmin'

  return (
    <div className="page-art page-art-admin page-art-users" style={{ minHeight: '100vh' }}>
      <header className="nav-glass" style={{
        padding: '0 28px',
        height: 'var(--nav-height)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div className="brand-tile" style={{ width: 32, height: 32 }}><ShieldIcon size={18} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Admin</span>
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.name || user?.username}</span>
          <button onClick={logout} className="btn">
            <LogOutIcon size={14} /> Log out
          </button>
        </div>
      </header>

      <div className="nav-glass">
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '12px 28px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link to="/" aria-label="My portfolio" title="My portfolio" style={{
            color: 'var(--text-secondary)', textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)', width: 32, height: 32,
          }}>
            <ArrowLeftIcon size={14} />
          </Link>
          {/* Active state comes from .btn[aria-current="page"] (NavLink sets it). */}
          <NavLink to="/admin" end className="btn">
            <UsersIcon size={14} /> Users
          </NavLink>
          {isSuper && (
            <NavLink to="/admin/admins" className="btn">
              <ShieldIcon size={14} /> Admins
            </NavLink>
          )}
        </div>
      </div>

      <main style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
