import { Link } from 'react-router-dom'
import { useTheme } from '../../lib/useTheme'
import { useUiMode } from '../../lib/uiMode'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'
import { Ui2ProfilePage } from '../../ui2/profile/Ui2ProfilePage'
import { useProfileForms, type FormMessage } from './useProfileForms'

// ProfilePage is a pure dispatcher: only useUiMode() lives here, so the hook
// count is stable across mode changes.
export default function ProfilePage() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2ProfilePage />
  return <ClassicProfilePage />
}

function ClassicProfilePage() {
  const { user, profile, password, security } = useProfileForms()
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
  const { name, setName, username, setUsername, password: profilePassword, setPassword: setProfilePassword,
    msg: profileMsg, saving: savingProfile, save: saveProfile } = profile
  const { current: currentPw, setCurrent: setCurrentPw, next: newPw, setNext: setNewPw, confirm: newPwConfirm,
    setConfirm: setNewPwConfirm, msg: pwMsg, saving: savingPw, save: changePassword } = password
  const { questions, qas, usedIds, updateQA, password: sqPassword, setPassword: setSqPassword,
    msg: sqMsg, saving: savingSQ, save: saveQuestions } = security

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

  const message = (formMessage: FormMessage) =>
    formMessage && (
      <div style={{
        marginTop: 8,
        color: formMessage.kind === 'ok' ? 'var(--green)' : 'var(--red)',
        fontSize: 13,
      }}>{formMessage.text}</div>
    )

  return (
    <div className="page-art page-art-profile" style={{ minHeight: '100dvh' }}>
      <header className="nav-glass page-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/" className="btn-icon" aria-label="Back to dashboard" title="Back to dashboard">
            <ArrowLeftIcon size={14} />
          </Link>
          <h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Account settings</h1>
        </div>
        <ThemePicker variant="inline" theme={theme} premium={user?.premium} onSelect={setTheme} />
      </header>

      <main className="page-main" style={{ maxWidth: 1200, margin: '0 auto' }}>
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
          <button type="submit" disabled={savingProfile} className="btn-primary btn-lg" style={{ opacity: savingProfile ? 0.6 : 1 }}>
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
          <button type="submit" disabled={savingPw} className="btn-primary btn-lg" style={{ opacity: savingPw ? 0.6 : 1 }}>
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
                {questions.map(question => (
                  <option key={question.id} value={question.id}
                    disabled={question.id !== qa.questionId && usedIds.has(question.id)}>
                    {question.prompt}
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
          <button type="submit" disabled={savingSQ} className="btn-primary btn-lg" style={{ opacity: savingSQ ? 0.6 : 1 }}>
            {savingSQ ? 'Saving…' : 'Save security questions'}
          </button>
          {message(sqMsg)}
        </form>
      </section>
      </main>
    </div>
  )
}
