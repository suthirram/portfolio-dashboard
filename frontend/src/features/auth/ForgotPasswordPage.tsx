import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../lib/api/client'
import { AuthShell, FormError, FormField, LinkText, PrimaryButton, authInputStyle } from './AuthShell'

interface PromptedQuestion { id: string; prompt: string }

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [username, setUsername] = useState('')
  const [questions, setQuestions] = useState<PromptedQuestion[]>([])
  const [answers, setAnswers] = useState<string[]>(['', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const startRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.recoverQuestions({ username: username.trim() })
      setQuestions(res as PromptedQuestion[])
      setStep(2)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 423) setError('Recovery locked. Contact your administrator to reset it.')
        else setError(e.message)
      } else setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const submitAnswers = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    if (answers.some(a => !a.trim())) { setError('Answer all three questions'); return }
    setLoading(true)
    try {
      await api.recoverPassword({
        username: username.trim(),
        new_password: newPassword,
        answers: questions.map((q, i) => ({ question_id: q.id, answer: answers[i] })),
      })
      setInfo('Password reset. Log in with your new password.')
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 423) setError('Recovery locked — three wrong attempts. Contact your administrator.')
        else if (e.status === 401) setError('At least one answer was wrong.')
        else setError(e.message)
      } else setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Recover your password"
      subtitle={step === 1 ? 'Enter your username to begin.' : 'Answer your security questions and pick a new password.'}
      footer={<LinkText to="/login">Back to login</LinkText>}>
      <FormError error={error} />
      {info && (
        <div style={{
          background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid var(--green)',
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 14, fontSize: 13,
        }}>{info}</div>
      )}

      {step === 1 && (
        <form onSubmit={startRecover}>
          <FormField label="Username">
            <input autoFocus value={username} required
              onChange={e => setUsername(e.target.value)} style={authInputStyle()} />
          </FormField>
          <PrimaryButton loading={loading}>Continue</PrimaryButton>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitAnswers}>
          {questions.map((q, i) => (
            <FormField key={q.id} label={q.prompt}>
              <input value={answers[i]} required
                onChange={e => setAnswers(prev => prev.map((a, j) => j === i ? e.target.value : a))}
                style={authInputStyle()} />
            </FormField>
          ))}
          <FormField label="New password" hint="At least 8 characters">
            <input type="password" autoComplete="new-password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} required style={authInputStyle()} />
          </FormField>
          <FormField label="Confirm new password">
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} required style={authInputStyle()} />
          </FormField>
          <PrimaryButton loading={loading}>Reset password</PrimaryButton>
        </form>
      )}
    </AuthShell>
  )
}
