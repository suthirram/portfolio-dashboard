import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChartLineIcon } from '../../components/Icon'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="page-art page-art-dashboard" style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '32px 16px',
    }}>
      <div className="card-elevated" style={{
        width: '100%',
        maxWidth: 420,
        padding: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div className="brand-tile" style={{ width: 36, height: 36 }}><ChartLineIcon size={20} /></div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Portfolio Dashboard</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 }}>{subtitle}</p>}
        {children}
        {footer && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function authInputStyle(): React.CSSProperties {
  return {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    outline: 'none',
    fontSize: 13,
  }
}

export function FormField({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      {children}
      {error && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      {hint && !error && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )
}

export function PrimaryButton({ disabled, loading, children, type = 'submit', onClick }: {
  disabled?: boolean
  loading?: boolean
  children: ReactNode
  type?: 'submit' | 'button'
  onClick?: () => void
}) {
  return (
    <button
      type={type}
      className="btn-primary"
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        width: '100%',
        justifyContent: 'center',
        padding: '10px 16px',
        fontSize: 14,
        opacity: disabled || loading ? 0.6 : 1,
        marginTop: 4,
      }}>
      {loading ? <span className="spinner" style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> : children}
    </button>
  )
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null
  return (
    <div style={{
      background: 'var(--red-dim)',
      color: 'var(--red)',
      border: '1px solid var(--red)',
      padding: '10px 12px',
      borderRadius: 'var(--radius-sm)',
      marginBottom: 14,
      fontSize: 13,
    }}>
      {error}
    </div>
  )
}

export function LinkText({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{children}</Link>
  )
}
