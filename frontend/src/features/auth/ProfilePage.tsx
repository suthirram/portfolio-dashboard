import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type SecurityQuestion } from '../../lib/api/client'
import { useAuth } from './AuthContext'
import { ArrowLeftIcon } from '../../components/Icon'

interface QAState { questionId: string; answer: string }

export default function ProfilePage() {
  const { user, refresh } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [savingPw, setSavingPw] = useState(false)

  const [questions, setQuestions] = useState<SecurityQuestion[]>([])
  const [qas, setQas] = useState<QAState[]>([
    { questionId: '', answer: '' },
    { questionId: '', answer: '' },
    { questionId: '', answer: '' },
  ])
  const [sqPassword, setSqPassword] = useState('')
  const [sqMsg, setSqMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [savingSQ, setSavingSQ] = useState(false)

  useEffect(() => {
    void api.getQuestions().then(setQuestions).catch(console.error)
  }, [])

  const card: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: 24,
    marginBottom: 16,
    maxWidth: 560,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px', color: 'var(--text-primary)',
    outline: 'none', fontSize: 13, marginBottom: 10,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }
  const button: React.CSSProperties = {
    background: 'var(--blue)', color: '#fff', padding: '8px 14px', fontWeight: 600,
  }

  const message = (m: { kind: 'ok' | 'err'; text: string } | null) =>
    m && (
      <div style={{
        marginTop: 8,
        color: m.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        fontSize: 13,
      }}>{m.text}</div>
    )

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMsg(null)
    setSavingProfile(true)
    try {
      await api.updateProfile({
        name: name.trim(),
        username: username.trim(),
        current_password: profilePassword,
      })
      setProfilePassword('')
      await refresh()
      setProfileMsg({ kind: 'ok', text: 'Profile updated.' })
    } catch (e) {
      setProfileMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Failed to update' })
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPw.length < 8) { setPwMsg({ kind: 'err', text: 'New password must be at least 8 chars' }); return }
    if (newPw !== newPwConfirm) { setPwMsg({ kind: 'err', text: 'Passwords do not match' }); return }
    setSavingPw(true)
    try {
      await api.updatePassword({ current_password: currentPw, new_password: newPw })
      setCurrentPw(''); setNewPw(''); setNewPwConfirm('')
      setPwMsg({ kind: 'ok', text: 'Password changed. Other sessions were signed out.' })
    } catch (e) {
      setPwMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Failed to change password' })
    } finally {
      setSavingPw(false)
    }
  }

  const usedIds = new Set(qas.map(q => q.questionId).filter(Boolean))
  const updateQA = (idx: number, patch: Partial<QAState>) =>
    setQas(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))

  const saveQuestions = async (e: React.FormEvent) => {
    e.preventDefault()
    setSqMsg(null)
    if (qas.some(q => !q.questionId || !q.answer.trim())) { setSqMsg({ kind: 'err', text: 'All three are required' }); return }
    if (new Set(qas.map(q => q.questionId)).size !== 3) { setSqMsg({ kind: 'err', text: 'Choose three different questions' }); return }
    setSavingSQ(true)
    try {
      await api.updateSecurityQs({
        current_password: sqPassword,
        security_answers: qas.map(q => ({ question_id: q.questionId, answer: q.answer })),
      })
      setSqPassword('')
      setQas([
        { questionId: '', answer: '' },
        { questionId: '', answer: '' },
        { questionId: '', answer: '' },
      ])
      setSqMsg({ kind: 'ok', text: 'Security questions updated.' })
    } catch (e) {
      setSqMsg({ kind: 'err', text: e instanceof ApiError ? e.message : 'Failed to update' })
    } finally {
      setSavingSQ(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link to="/" aria-label="Back to dashboard" title="Back to dashboard" style={{
          color: 'var(--text-secondary)', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', width: 32, height: 32,
        }}>
          <ArrowLeftIcon size={14} />
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Account settings</h1>
      </div>

      <section style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Profile</h2>
        <form onSubmit={saveProfile}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} required />
          <label style={labelStyle}>Username</label>
          <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} required />
          <label style={labelStyle}>Confirm with your current password</label>
          <input style={inputStyle} type="password" autoComplete="current-password"
            value={profilePassword} onChange={e => setProfilePassword(e.target.value)} required />
          <button type="submit" disabled={savingProfile} style={{ ...button, opacity: savingProfile ? 0.6 : 1 }}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
          {message(profileMsg)}
        </form>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Change password</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Changing your password signs you out of other sessions.
        </p>
        <form onSubmit={changePassword}>
          <label style={labelStyle}>Current password</label>
          <input style={inputStyle} type="password" autoComplete="current-password"
            value={currentPw} onChange={e => setCurrentPw(e.target.value)} required />
          <label style={labelStyle}>New password</label>
          <input style={inputStyle} type="password" autoComplete="new-password"
            value={newPw} onChange={e => setNewPw(e.target.value)} required />
          <label style={labelStyle}>Confirm new password</label>
          <input style={inputStyle} type="password" autoComplete="new-password"
            value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)} required />
          <button type="submit" disabled={savingPw} style={{ ...button, opacity: savingPw ? 0.6 : 1 }}>
            {savingPw ? 'Saving…' : 'Change password'}
          </button>
          {message(pwMsg)}
        </form>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Security questions</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Replaces all three at once. You'll need these if you forget your password.
        </p>
        <form onSubmit={saveQuestions}>
          {qas.map((qa, i) => (
            <div key={i} style={{
              marginBottom: 10, padding: 10, background: 'var(--bg-input)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            }}>
              <select value={qa.questionId} required
                onChange={e => updateQA(i, { questionId: e.target.value })}
                style={{ ...inputStyle, marginBottom: 8 }}>
                <option value="">Question {i + 1}…</option>
                {questions.map(q => (
                  <option key={q.id} value={q.id}
                    disabled={q.id !== qa.questionId && usedIds.has(q.id)}>
                    {q.prompt}
                  </option>
                ))}
              </select>
              <input placeholder="Your answer" value={qa.answer} required
                onChange={e => updateQA(i, { answer: e.target.value })} style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
          ))}
          <label style={labelStyle}>Confirm with your current password</label>
          <input style={inputStyle} type="password" autoComplete="current-password"
            value={sqPassword} onChange={e => setSqPassword(e.target.value)} required />
          <button type="submit" disabled={savingSQ} style={{ ...button, opacity: savingSQ ? 0.6 : 1 }}>
            {savingSQ ? 'Saving…' : 'Save security questions'}
          </button>
          {message(sqMsg)}
        </form>
      </section>
    </div>
  )
}
