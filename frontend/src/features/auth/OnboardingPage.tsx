import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, type SecurityQuestion } from '../../lib/api/client'
import { useAuth } from './AuthContext'
import { AuthShell, FormError, FormField, PrimaryButton, authInputStyle } from './AuthShell'

interface QAState { questionId: string; answer: string }

export default function OnboardingPage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()

  const [questions, setQuestions] = useState<SecurityQuestion[]>([])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [qas, setQas] = useState<QAState[]>([
    { questionId: '', answer: '' },
    { questionId: '', answer: '' },
    { questionId: '', answer: '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void api.getQuestions().then(setQuestions).catch(e => setError(e instanceof Error ? e.message : 'Failed to load questions'))
  }, [])

  if (!user) {
    navigate('/login', { replace: true })
    return null
  }
  if (!user.must_change_password) {
    navigate('/', { replace: true })
    return null
  }

  const usedIds = new Set(qas.map(q => q.questionId).filter(Boolean))

  const updateQA = (idx: number, patch: Partial<QAState>) => {
    setQas(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password === 'admin') { setError('Pick a real password — not the bootstrap default.'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (qas.some(q => !q.questionId || !q.answer.trim())) { setError('All three security questions and answers are required'); return }
    if (new Set(qas.map(q => q.questionId)).size !== 3) { setError('Choose three different questions'); return }
    setLoading(true)
    try {
      const updated = await api.completeOnboarding({
        // Bootstrap super admin always has password "admin" at this point;
        // the backend re-checks it before swapping in the new credentials.
        current_password: 'admin',
        new_password: password,
        security_answers: qas.map(q => ({ question_id: q.questionId, answer: q.answer })),
      })
      setUser(updated)
      navigate('/admin', { replace: true })
    } catch (e) {
      if (e instanceof ApiError) setError(e.message)
      else setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Secure your account"
      subtitle={`Welcome, ${user.username}. Pick a real password and three security questions before you continue.`}
      footer={<button onClick={logout} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>Log out</button>}>
      <form onSubmit={onSubmit}>
        <FormError error={error} />
        <FormField label="New password" hint="At least 8 characters; never use the bootstrap default again">
          <input type="password" autoComplete="new-password" autoFocus value={password}
            onChange={e => setPassword(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <FormField label="Confirm new password">
          <input type="password" autoComplete="new-password" value={confirm}
            onChange={e => setConfirm(e.target.value)} required style={authInputStyle()} />
        </FormField>
        <div style={{ marginTop: 8, marginBottom: 6, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
          Security questions
        </div>
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
                  disabled={q.id !== qa.questionId && usedIds.has(q.id)}>
                  {q.prompt}
                </option>
              ))}
            </select>
            <input placeholder="Your answer" value={qa.answer} required
              onChange={e => updateQA(i, { answer: e.target.value })} style={authInputStyle()} />
          </div>
        ))}
        <PrimaryButton loading={loading}>Finish setup</PrimaryButton>
      </form>
    </AuthShell>
  )
}
