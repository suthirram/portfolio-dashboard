import { ReactNode, useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api/client'
import type { AuthUser, Region, RegionId, SecurityAnswerInput, SecurityQuestion } from '../../types'
import {
  getAccountNavigationItems,
  resolveDashboardActingUser,
  type AccountNavigationIcon,
  type AccountNavigationKey,
} from './dashboardRouting'
import { planProfileUpdates, securityAnswerInputType } from './profileUpdates'

type AuthMode = 'login' | 'signup' | 'recover' | 'profile' | 'users' | 'portfolio'

interface AuthGateProps {
  children: ReactNode | ((actingUser: AuthUser | null, currentUser: AuthUser) => ReactNode)
}

const emptyAnswers = (): SecurityAnswerInput[] => ([
  { question_id: '', answer: '' },
  { question_id: '', answer: '' },
  { question_id: '', answer: '' },
])

export default function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [regions, setRegions] = useState<Region[]>([])
  const [questions, setQuestions] = useState<SecurityQuestion[]>([])
  const [mode, setMode] = useState<AuthMode>('login')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingUser, setActingUser] = useState<AuthUser | null>(null)

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const isSuperAdmin = user?.role === 'superadmin'

  const refreshUser = async () => {
    const current = await api.me()
    setUser(current)
    if (current.must_change_password) setMode('profile')
  }

  useEffect(() => {
    void (async () => {
      try {
        const [regionList, questionList] = await Promise.all([
          api.listRegions(),
          api.listSecurityQuestions(),
        ])
        setRegions(regionList)
        setQuestions(questionList)
        await refreshUser()
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const logout = async () => {
    await api.logout()
    setUser(null)
    setActingUser(null)
    setMode('login')
  }

  const showOwnDashboard = () => {
    setActingUser(null)
    setMode('login')
  }

  const openPortfolioDashboard = (target: AuthUser) => {
    const nextActingUser = resolveDashboardActingUser(user, target)
    if (!nextActingUser) {
      showOwnDashboard()
      return
    }
    setActingUser(nextActingUser)
    setMode('portfolio')
  }

  const renderDashboard = (currentUser: AuthUser) => (
    typeof children === 'function' ? children(actingUser, currentUser) : children
  )

  if (loading) {
    return <FullPage><span className="spinner" /></FullPage>
  }

  if (!user) {
    return (
      <FullPage>
        <AuthPanel
          mode={mode}
          setMode={setMode}
          regions={regions}
          questions={questions}
          error={error}
          setError={setError}
          onAuthenticated={async next => {
            setUser(next)
            setMode(next.must_change_password ? 'profile' : 'login')
          }}
        />
      </FullPage>
    )
  }

  if (mode === 'profile' || user.must_change_password) {
    return (
      <FullPage>
        <ProfilePanel
          user={user}
          questions={questions}
          forced={!!user.must_change_password}
          error={error}
          setError={setError}
          onDone={async () => {
            await refreshUser()
            showOwnDashboard()
          }}
          onBack={showOwnDashboard}
          onLogout={logout}
        />
      </FullPage>
    )
  }

  return (
    <div>
      <AccountBar
        user={user}
        isAdmin={isAdmin}
        mode={mode}
        setMode={setMode}
        actingUser={actingUser}
        onStopActing={showOwnDashboard}
        onShowDashboard={showOwnDashboard}
        onLogout={logout}
      />
      {mode === 'users' && isAdmin && <AdminUsersPanel currentUser={user} isSuperAdmin={isSuperAdmin} onOpenPortfolio={openPortfolioDashboard} />}
      {mode === 'portfolio' && actingUser && renderDashboard(user)}
      {mode !== 'users' && mode !== 'portfolio' && renderDashboard(user)}
    </div>
  )
}

function AuthPanel({
  mode,
  setMode,
  regions,
  questions,
  error,
  setError,
  onAuthenticated,
}: {
  mode: AuthMode
  setMode: (mode: AuthMode) => void
  regions: Region[]
  questions: SecurityQuestion[]
  error: string
  setError: (message: string) => void
  onAuthenticated: (user: AuthUser) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [region, setRegion] = useState<RegionId>(regions[0]?.id || 'india')
  const [answers, setAnswers] = useState<SecurityAnswerInput[]>(emptyAnswers)
  const [recoveryQuestions, setRecoveryQuestions] = useState<SecurityQuestion[] | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const isSignup = mode === 'signup'
  const isRecover = mode === 'recover'

  useEffect(() => {
    if (!region && regions[0]?.id) setRegion(regions[0].id)
  }, [region, regions])

  const submit = async () => {
    setError('')
    try {
      if (isSignup) {
        const questionError = validateSelectedQuestions(answers)
        if (questionError) {
          setError(questionError)
          return
        }
        const res = await api.signup({ username, name, password, region, security_questions: answers })
        if (res.user) await onAuthenticated(res.user)
        return
      }
      if (isRecover) {
        const body = recoveryQuestions
          ? { username, answers, new_password: newPassword }
          : { username }
        const res = await api.recover(body)
        if (res.questions) {
          setRecoveryQuestions(res.questions)
          setAnswers(res.questions.map(q => ({ question_id: q.id, answer: '' })))
        }
        if (res.user) await onAuthenticated(res.user)
        return
      }
      const res = await api.login(username, password)
      if (res.user) await onAuthenticated(res.user)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const visibleQuestions = recoveryQuestions || questions

  return (
    <Panel title={isSignup ? 'Create account' : isRecover ? 'Recover account' : 'Sign in'}>
      <Field label="Username" value={username} onChange={setUsername} />
      {isSignup && <Field label="Name" value={name} onChange={setName} />}
      {!isRecover && <Field label="Password" type="password" value={password} onChange={setPassword} />}
      {isSignup && (
        <label style={fieldWrap}>
          <span style={labelStyle}>Region</span>
          <select value={region} onChange={e => setRegion(e.target.value as RegionId)} style={inputStyle}>
            {regions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
      )}
      {(isSignup || recoveryQuestions) && (
        <SecurityAnswerFields
          questions={visibleQuestions}
          answers={answers}
          setAnswers={setAnswers}
          allowQuestionChoice={isSignup}
        />
      )}
      {recoveryQuestions && <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />}
      {error && <div style={errorStyle}>{error}</div>}
      <button onClick={submit} style={primaryButton}>
        {isSignup ? 'Sign up' : isRecover ? (recoveryQuestions ? 'Reset password' : 'Continue') : 'Log in'}
      </button>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
        <button onClick={() => setMode('login')} style={linkButton}>Login</button>
        <button onClick={() => setMode('signup')} style={linkButton}>Sign up</button>
        <button onClick={() => setMode('recover')} style={linkButton}>Forgot password</button>
      </div>
    </Panel>
  )
}

function ProfilePanel({
  user,
  questions,
  forced,
  error,
  setError,
  onDone,
  onBack,
  onLogout,
}: {
  user: AuthUser
  questions: SecurityQuestion[]
  forced: boolean
  error: string
  setError: (message: string) => void
  onDone: () => Promise<void>
  onBack: () => void
  onLogout: () => Promise<void>
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [name, setName] = useState(user.name || '')
  const [username, setUsername] = useState(user.username || '')
  const [answers, setAnswers] = useState<SecurityAnswerInput[]>(() =>
    questions.slice(0, 3).map(q => ({ question_id: q.id, answer: '' })),
  )

  const save = async () => {
    setError('')
    try {
      const plan = planProfileUpdates({
        user,
        currentPassword,
        name,
        username,
        newPassword,
        answers,
        forced,
      })
      if (plan.error) {
        setError(plan.error)
        return
      }
      if (plan.profile) await api.updateProfile(plan.profile)
      if (plan.securityQuestions) await api.updateSecurityQuestions(plan.securityQuestions)
      if (plan.password) await api.changePassword(plan.password)
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Panel title={forced ? 'Secure the owner account' : 'Profile'}>
      <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Username" value={username} onChange={setUsername} />
      <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
        Existing security answers cannot be shown back. Fill all three only when replacing them.
      </div>
      <SecurityAnswerFields questions={questions} answers={answers} setAnswers={setAnswers} allowQuestionChoice />
      {error && <div style={errorStyle}>{error}</div>}
      <button onClick={save} style={primaryButton}>{forced ? 'Finish setup' : 'Save profile'}</button>
      {!forced && (
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button onClick={onBack} style={{ ...secondaryButton, flex: 1 }}>Back to dashboard</button>
          <button onClick={onLogout} style={{ ...secondaryButton, flex: 1 }}>Log out</button>
        </div>
      )}
    </Panel>
  )
}

function AdminUsersPanel({
  currentUser,
  isSuperAdmin,
  onOpenPortfolio,
}: {
  currentUser: AuthUser
  isSuperAdmin: boolean
  onOpenPortfolio?: (user: AuthUser) => void
}) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [error, setError] = useState('')

  const refresh = async () => {
    setError('')
    try {
      const [regionList, userList] = await Promise.all([
        api.listRegions(),
        api.listAdminUsers(true),
      ])
      setRegions(regionList)
      setUsers(userList)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const regionLabel = useMemo(() => Object.fromEntries(regions.map(r => [r.id, r.label])), [regions])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Users</h1>
      {error && <div style={errorStyle}>{error}</div>}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {users.map(u => {
          const isSelf = u.id === currentUser.id
          return (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1.5fr', gap: 12, padding: 12, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{u.name || u.username}</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{u.username}</div>
              </div>
              <div>{u.role}</div>
              <div>{u.region ? regionLabel[u.region] || u.region : 'All regions'}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {u.disabled
                  ? <button style={secondaryButton} onClick={() => act(() => api.reactivateAdminUser(u.id || ''))} disabled={isSelf}>Reactivate</button>
                  : <button style={secondaryButton} onClick={() => act(() => api.hideAdminUser(u.id || ''))} disabled={isSelf}>Hide</button>}
                <button style={secondaryButton} onClick={() => onOpenPortfolio?.(u)}>Open portfolio</button>
                <button style={secondaryButton} onClick={() => act(() => api.resetAdminUserLockout(u.id || ''))} disabled={isSelf}>Reset lockout</button>
                {isSuperAdmin && u.role === 'user' && !isSelf && <button style={secondaryButton} onClick={() => act(() => api.promoteAdminUser(u.id || ''))}>Promote</button>}
                {isSuperAdmin && u.role === 'admin' && !isSelf && <button style={secondaryButton} onClick={() => act(() => api.demoteAdminUser(u.id || ''))}>Demote</button>}
                <button style={dangerButton} onClick={() => act(() => api.deleteAdminUser(u.id || ''))} disabled={isSelf}>Delete</button>
              </div>
            </div>
          )
        })}
        {users.length === 0 && <div style={{ padding: 16, color: 'var(--text-secondary)' }}>No accounts found.</div>}
      </div>
    </main>
  )
}

function AccountBar({
  user,
  isAdmin,
  mode,
  setMode,
  actingUser,
  onStopActing,
  onShowDashboard,
  onLogout,
}: {
  user: AuthUser
  isAdmin: boolean
  mode: AuthMode
  setMode: (mode: AuthMode) => void
  actingUser: AuthUser | null
  onStopActing: () => void
  onShowDashboard: () => void
  onLogout: () => Promise<void>
}) {
  const navItems = getAccountNavigationItems(user)
  const active = (key: AccountNavigationKey) => (
    (key === 'dashboard' && mode === 'login') ||
    (key === 'users' && mode === 'users') ||
    (key === 'profile' && mode === 'profile')
  )
  const clickNav = (key: AccountNavigationKey) => {
    if (key === 'dashboard') onShowDashboard()
    if (key === 'users' && isAdmin) setMode('users')
    if (key === 'profile') setMode('profile')
    if (key === 'logout') void onLogout()
  }

  return (
    <div style={{ height: 38, background: 'var(--bg-input)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '0 28px' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{user.name || user.username} · {user.role}{user.region ? ` · ${user.region}` : ''}</span>
      {actingUser && (
        <>
          <span style={{ color: 'var(--yellow)', fontSize: 12 }}>Acting as {actingUser.name || actingUser.username}</span>
          <button style={secondarySmall} onClick={onStopActing}>Stop</button>
        </>
      )}
      {navItems.map(item => (
        <button
          key={item.key}
          type="button"
          style={active(item.key) ? primarySmall : secondarySmall}
          onClick={() => clickNav(item.key)}
          title={item.label}
        >
          <NavIcon icon={item.icon} /> {item.label}
        </button>
      ))}
    </div>
  )
}

function NavIcon({ icon }: { icon: AccountNavigationIcon }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const
  if (icon === 'home') {
    return <svg {...common}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
  }
  if (icon === 'users') {
    return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  }
  if (icon === 'profile') {
    return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
  }
  return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
}

function SecurityAnswerFields({
  questions,
  answers,
  setAnswers,
  allowQuestionChoice,
}: {
  questions: SecurityQuestion[]
  answers: SecurityAnswerInput[]
  setAnswers: (answers: SecurityAnswerInput[]) => void
  allowQuestionChoice: boolean
}) {
  const update = (index: number, patch: Partial<SecurityAnswerInput>) => {
    setAnswers(answers.map((a, i) => i === index ? { ...a, ...patch } : a))
  }
  const selectedElsewhere = (questionID: string, index: number) =>
    answers.some((answer, i) => i !== index && answer.question_id === questionID)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          {allowQuestionChoice ? (
            <select value={answers[i]?.question_id || ''} onChange={e => update(i, { question_id: e.target.value })} style={inputStyle}>
              <option value="">Choose question</option>
              {questions.map(q => (
                <option key={q.id} value={q.id} disabled={selectedElsewhere(q.id, i)}>
                  {q.prompt}
                </option>
              ))}
            </select>
          ) : (
            <span style={labelStyle}>{questions[i]?.prompt}</span>
          )}
          <input type={securityAnswerInputType} value={answers[i]?.answer || ''} onChange={e => update(i, { question_id: answers[i]?.question_id || questions[i]?.id || '', answer: e.target.value })} style={inputStyle} />
        </div>
      ))}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </label>
  )
}

function FullPage({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-primary)', padding: 24 }}>
      {children}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ width: 'min(480px, 100%)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, boxShadow: 'var(--shadow)' }}>
      <h1 style={{ fontSize: 22, marginBottom: 18 }}>{title}</h1>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </section>
  )
}

function validateSelectedQuestions(answers: SecurityAnswerInput[]) {
  if (answers.length !== 3 || answers.some(a => !a.question_id || !a.answer.trim())) {
    return 'Choose three security questions and answer each one.'
  }
  if (new Set(answers.map(a => a.question_id)).size !== answers.length) {
    return 'Choose three different security questions.'
  }
  return ''
}

const fieldWrap = { display: 'grid', gap: 6 } as const
const labelStyle = { color: 'var(--text-secondary)', fontSize: 12 } as const
const inputStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '9px 10px', outline: 'none', width: '100%' } as const
const primaryButton = { background: 'var(--blue)', color: '#fff', padding: '9px 14px', fontWeight: 700 } as const
const secondaryButton = { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', padding: '7px 10px' } as const
const dangerButton = { ...secondaryButton, color: 'var(--red)' } as const
const linkButton = { background: 'transparent', color: 'var(--blue)' } as const
const navSmallBase = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px' } as const
const primarySmall = { ...navSmallBase, background: 'var(--blue)', color: '#fff' } as const
const secondarySmall = { ...navSmallBase, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' } as const
const errorStyle = { color: 'var(--red)', background: 'var(--red-dim)', border: '1px solid rgba(255, 77, 109, 0.35)', borderRadius: 6, padding: 10 } as const
