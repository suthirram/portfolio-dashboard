import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type Region, type SecurityQuestion } from '../../lib/api/client'
import { useAuth } from './AuthContext'
import { AuthShell, FormError, FormField, LinkText, PrimaryButton, authInputStyle } from './AuthShell'

interface QAState { questionId: string; answer: string }

export default function SignupPage() {
  const { setUser } = useAuth()
  const navigate = useNavigate()

  const [regions, setRegions] = useState<Region[]>([])
  const [questions, setQuestions] = useState<SecurityQuestion[]>([])
  const [catalogueErr, setCatalogueErr] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [region, setRegion] = useState('')
  const [qas, setQas] = useState<QAState[]>([
    { questionId: '', answer: '' },
    { questionId: '', answer: '' },
    { questionId: '', answer: '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [r, q] = await Promise.all([api.getRegions(), api.getQuestions()])
        setRegions(r)
        setQuestions(q)
      } catch (e) {
        setCatalogueErr(e instanceof Error ? e.message : 'Failed to load form options')
      }
    })()
  }, [])

  const usedQuestionIds = new Set(qas.map(q => q.questionId).filter(Boolean))

  const updateQA = (idx: number, patch: Partial<QAState>) => {
    setQas(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  const validate = (): string | null => {
    if (name.trim().length === 0) return 'Name is required'
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username.trim())) return 'Username must be 3–32 chars (letters, numbers, _ or -)'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (password !== confirmPassword) return 'Passwords do not match'
    if (!region) return 'Pick your region'
    if (qas.some(q => !q.questionId || !q.answer.trim())) return 'All three security questions and answers are required'
    if (new Set(qas.map(q => q.questionId)).size !== 3) return 'Choose three different questions'
    return null
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const msg = validate()
    if (msg) { setError(msg); return }
    setLoading(true)
    try {
      const user = await api.signup({
        name: name.trim(),
        username: username.trim(),
        password,
        region,
        security_answers: qas.map(q => ({ question_id: q.questionId, answer: q.answer })),
      })
      setUser(user)
      navigate('/', { replace: true })
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Track your own private portfolio."
      footer={<>Already have an account? <LinkText to="/login">Log in</LinkText></>}>
      {catalogueErr ? <FormError error={catalogueErr} /> : null}
      <form onSubmit={onSubmit}>
        <FormError error={error} />
        <FormField label="Your name">
          <input value={name} onChange={e => setName(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <FormField label="Username" hint="3–32 chars: letters, numbers, _ or -">
          <input value={username} autoComplete="username"
            onChange={e => setUsername(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <FormField label="Password" hint="At least 8 characters">
          <input type="password" autoComplete="new-password" value={password}
            onChange={e => setPassword(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <FormField label="Confirm password">
          <input type="password" autoComplete="new-password" value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <FormField label="Region" hint="Which administrator looks after you">
          <select value={region} onChange={e => setRegion(e.target.value)} required style={authInputStyle()}>
            <option value="">Choose…</option>
            {regions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </FormField>
        <div style={{ marginTop: 8, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Security questions
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
          You will need these to recover a forgotten password — no email reset is available.
        </p>
        {qas.map((qa, i) => (
          <div key={i} style={{
            marginBottom: 12, padding: 12, background: 'var(--bg-input)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
          }}>
            <select value={qa.questionId} required
              onChange={e => updateQA(i, { questionId: e.target.value })}
              style={{ ...authInputStyle(), marginBottom: 8 }}>
              <option value="">Question {i + 1}…</option>
              {questions.map(q => (
                <option key={q.id} value={q.id}
                  disabled={q.id !== qa.questionId && usedQuestionIds.has(q.id)}>
                  {q.prompt}
                </option>
              ))}
            </select>
            <input placeholder="Your answer" value={qa.answer} required
              onChange={e => updateQA(i, { answer: e.target.value })} style={authInputStyle()} />
          </div>
        ))}
        <PrimaryButton loading={loading}>Create account</PrimaryButton>
      </form>
    </AuthShell>
  )
}
