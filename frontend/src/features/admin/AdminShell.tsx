import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ShieldIcon, ArrowLeftIcon, LogOutIcon, UsersIcon } from '../../components/Icon'

const navStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-block',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
  background: active ? 'var(--blue)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: active ? 600 : 400,
})

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const isSuper = user?.role === 'superadmin'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        padding: '0 28px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/admin" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              width: 32, height: 32, background: 'var(--blue)', color: '#fff', borderRadius: 8,
              display: 'grid', placeItems: 'center',
            }}><ShieldIcon size={18} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Admin</span>
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{user?.name || user?.username}</span>
          <button onClick={logout}
            style={{
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', padding: '6px 12px',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            <LogOutIcon size={14} /> Log out
          </button>
        </div>
      </header>

      <div style={{ padding: '12px 28px 0' }}>
        <Link to="/" className="back-btn" style={{
          color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 13,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '6px 12px',
        }}>
          <ArrowLeftIcon size={14} /> My portfolio
        </Link>
      </div>

      <div style={{
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        padding: '12px 28px', display: 'flex', gap: 10,
      }}>
        <NavLink to="/admin" end style={({ isActive }) => ({
          ...navStyle(isActive), display: 'inline-flex', alignItems: 'center', gap: 6,
        })}>
          <UsersIcon size={14} /> Users
        </NavLink>
        {isSuper && (
          <NavLink to="/admin/admins" style={({ isActive }) => ({
            ...navStyle(isActive), display: 'inline-flex', alignItems: 'center', gap: 6,
          })}>
            <ShieldIcon size={14} /> Admins
          </NavLink>
        )}
      </div>

      <main style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {children}
      </main>
    </div>
  )
}
