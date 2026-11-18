import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { UserIcon } from '../../components/Icon'
import { api, ApiError } from '../../lib/api/client'
import { useAuth } from './AuthContext'
import './LoginPage.css'

const rememberedUsernameKey = 'pd_login_username'

function readRememberedUsername() {
  try { return window.localStorage?.getItem(rememberedUsernameKey) ?? '' } catch { return '' }
}

export default function LoginPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as { from?: string } | null)?.from

  const [username, setUsername] = useState(readRememberedUsername)
  const [rememberUsername, setRememberUsername] = useState(() => Boolean(readRememberedUsername()))
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await api.login({ username: username.trim(), password })
      try {
        if (rememberUsername) window.localStorage?.setItem(rememberedUsernameKey, username.trim())
        else window.localStorage?.removeItem(rememberedUsernameKey)
      } catch { /* Storage restrictions must not prevent login. */ }
      setUser(user)
      const next = user.must_change_password ? '/onboarding'
                : fromState && fromState !== '/login' ? fromState
                : user.role === 'superadmin' ? '/admin'
                : '/'
      navigate(next, { replace: true })
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 403) setError('Account is hidden. Contact your administrator.')
        else if (e.status === 423) setError('Account is locked. Contact your administrator to reset it.')
        else setError(e.message || 'Login failed')
      } else {
        setError('Network error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="sunrise-login">
      <section className="sunrise-login-card" aria-labelledby="login-title">
        <h1 id="login-title">Welcome back</h1>
        <p className="sunrise-login-subtitle">Log in to your portfolio dashboard.</p>
        <form onSubmit={onSubmit} method="post" aria-labelledby="login-title" aria-busy={loading}>
          {error && <div className="sunrise-login-error" role="alert">{error}</div>}
          <div className="sunrise-login-field">
            <label htmlFor="login-username">Username</label>
            <div className="sunrise-login-input">
              <UserIcon size={24} />
              <input id="login-username" name="username" type="text" autoComplete="username"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username}
                onChange={e => setUsername(e.target.value)} required />
            </div>
          </div>
          <div className="sunrise-login-field">
            <label htmlFor="login-password">Password</label>
            <div className="sunrise-login-input">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <rect x="4" y="10" width="16" height="12" rx="2" />
                <path d="M8 10V6a4 4 0 0 1 8 0v4" />
              </svg>
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} required />
              <button className="sunrise-login-reveal" type="button" aria-label="Show password"
                aria-pressed={showPassword} aria-controls="login-password" onClick={() => setShowPassword(value => !value)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
          </div>
          <div className="sunrise-login-options">
            <div className="sunrise-login-remember">
              <input id="login-remember" name="remember-username" type="checkbox" checked={rememberUsername}
                onChange={e => {
                  setRememberUsername(e.target.checked)
                  if (!e.target.checked) {
                    try { window.localStorage?.removeItem(rememberedUsernameKey) } catch { /* Storage may be unavailable. */ }
                  }
                }} aria-describedby="login-remember-hint" />
              <label htmlFor="login-remember">Remember me</label>
              <span id="login-remember-hint" className="sr-only">Remember my username on this device.</span>
            </div>
            <Link to="/forgot-password">Forgot your password?</Link>
          </div>
          <button className="sunrise-login-submit" type="submit" disabled={loading} aria-live="polite">
            <span>{loading ? 'Logging in…' : 'Log in'}</span>
            {!loading && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            )}
          </button>
        </form>
        <div className="sunrise-login-footer">
          <span>New here? <Link to="/signup">Create an account</Link></span>
        </div>
      </section>
    </main>
  )
}
