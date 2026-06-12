import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api/client'
import { useAuth } from './AuthContext'
import { AuthShell, FormError, FormField, LinkText, PrimaryButton, authInputStyle } from './AuthShell'

export default function LoginPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as { from?: string } | null)?.from

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await api.login({ username: username.trim(), password })
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
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your portfolio."
      footer={
        <>
          New here? <LinkText to="/signup">Create an account</LinkText>
          <div style={{ marginTop: 6 }}>
            <LinkText to="/forgot-password">Forgot your password?</LinkText>
          </div>
        </>
      }>
      <form onSubmit={onSubmit}>
        <FormError error={error} />
        <FormField label="Username">
          <input autoFocus autoComplete="username" value={username}
            onChange={e => setUsername(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <FormField label="Password">
          <input type="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <PrimaryButton loading={loading}>Log in</PrimaryButton>
      </form>
    </AuthShell>
  )
}
