import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './LoginPage.css'
import './AuthShell.css'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

// The signed-out screens' frame: the login's sunrise card (#330) in Light,
// shared by signup, forgot-password and onboarding (PD-059 slice 26).
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <main className="sunrise-login sunrise-auth">
      <section className="sunrise-login-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        {subtitle && <p className="sunrise-login-subtitle">{subtitle}</p>}
        {children}
        {footer && (
          <div className="sunrise-login-footer">
            <span>{footer}</span>
          </div>
        )}
      </section>
    </main>
  )
}

// authInputStyle stays for callers that spread it; the sunrise look now
// comes from AuthShell.css, so it adds nothing inline.
export function authInputStyle(): CSSProperties {
  return {}
}

export function FormField({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div className="sunrise-login-field">
      <label>
        {label}
        {children}
      </label>
      {error && <div className="sunrise-auth-field-error">{error}</div>}
      {hint && !error && <div className="sunrise-auth-hint">{hint}</div>}
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
    <button type={type} className="sunrise-login-submit" disabled={disabled || loading} onClick={onClick}
      aria-busy={loading || undefined}>
      {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : children}
    </button>
  )
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null
  return <div className="sunrise-login-error" role="alert">{error}</div>
}

export function LinkText({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to}>{children}</Link>
}
