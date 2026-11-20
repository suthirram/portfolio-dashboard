# PD-059: Wave 6c — Profile & security (slice 25)

* **Status**: Amendment in review (this doc). Code below is implemented and verified on the slice branch.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: Render Profile & security in the UI_2.0 shell, matching the handoff's `renderProfile`: an identity panel whose tabs pick Profile, Password or Security questions, with the chosen form beside it.
* **Architecture**: The three forms' state, rules and API calls move from `ProfilePage` into `useProfileForms`, used by both interfaces. `ProfilePage` becomes a pure `useUiMode()` dispatcher; `ClassicProfilePage` keeps its markup by aliasing the hook's fields to its old local names. `Ui2ProfilePage` renders the handoff layout with its own `profile.css`.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library. No new dependencies; no backend change.
* **Spec links**: [PRD-001](../prds/PRD-001-user-auth-and-multi-tenancy.md), [PRD-015](../prds/PRD-015-ui-2.md), [handoff HTML](../visuals/PD-059-ui-2-reference.html) (`renderProfile` and its override), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Built on slice 2 (`Ui2PageIntro`, `primitives.css`). Reuses `initials` (admin), every profile API call, the question catalogue. Independent of slices 23–24.

---

## 2. Handoff fidelity reference

**Intro**: `Your account, your preferences.` / `Manage your profile and account security.`

**Identity panel**: 64 px avatar initials, name, `@username`, role chip; tabs (`role="tablist"`, `aria-label="Account settings"`) `Profile`, `Password`, `Security questions`; the active tab tinted. Under 1050 px the layout is one column and the tabs run in a row.

**Profile**: `Profile details`; note `Your name and sign-in username.` plus `Your administrator role is managed separately.` for admins; Name, Username, `Current password confirmation`; Role and Region rows; save.

**Password**: `Change password`; Current, New, Confirm new password; the mismatch error.

**Security questions**: replace all three together; `Question n` select and `Answer n` field per pair; `Current password confirmation`; the "choose three different questions" rule.

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/features/auth/useProfileForms.ts` | Three forms' state, rules and calls for both interfaces |
| Modify | `frontend/src/features/auth/ProfilePage.tsx` | Dispatcher; Classic body on the hook; descriptive names |
| Create | `frontend/src/ui2/profile/Ui2ProfilePage.tsx` | The handoff layout |
| Create | `frontend/src/ui2/profile/profile.css` | `u2-profile-*` styles |
| Create | `frontend/src/ui2/profile/Ui2ProfilePage.test.tsx` | Tabs, each form's rules and calls |

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `feat/PD-059-profile` | Slice 25 | Classic markup, messages and rules unchanged — the logic moved, not changed | UI_2.0 accounts manage profile, password and recovery in the handoff layout | `Ui2ProfilePage.test.tsx` |

---

## 5. Owner decisions and open questions

### Decisions taken in this plan (reversible)

* The handoff's demo-only copy and buttons (`Preview profile save`, "Design preview only…") become production labels (`Save profile`, `Change password`, `Save security questions`); the Classic validation messages are kept.
* Security answers are masked (`type="password"`), as the handoff shows them.
* The page has no Back link; the shell's navigation replaces Classic's header.

### Open questions

None.

---

## 6. Task list

### Task 1 — Extract `useProfileForms`

**Files:** `frontend/src/features/auth/useProfileForms.ts` (create)

The rules (8-character minimum, matching confirmation, three distinct questions, current password on every write) must be identical in both interfaces, so they move rather than being copied.

* [ ] Create `frontend/src/features/auth/useProfileForms.ts`:

```ts
import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, type SecurityQuestion } from '../../lib/api/client'
import { useAuth } from './AuthContext'

export interface QAState { questionId: string; answer: string }
export type FormMessage = { kind: 'ok' | 'err'; text: string } | null

const emptyAnswers = (): QAState[] => [
  { questionId: '', answer: '' },
  { questionId: '', answer: '' },
  { questionId: '', answer: '' },
]

// useProfileForms owns the three account forms for every interface
// (PD-059 slice 25): profile details, password, security questions. Each
// form keeps its own fields, message and saving flag; every write needs the
// current password and goes through the same API calls and rules.
export function useProfileForms() {
  const { user, refresh } = useAuth()

  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileMsg, setProfileMsg] = useState<FormMessage>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [pwMsg, setPwMsg] = useState<FormMessage>(null)
  const [savingPw, setSavingPw] = useState(false)

  const [questions, setQuestions] = useState<SecurityQuestion[]>([])
  const [qas, setQas] = useState<QAState[]>(emptyAnswers)
  const [sqPassword, setSqPassword] = useState('')
  const [sqMsg, setSqMsg] = useState<FormMessage>(null)
  const [savingSQ, setSavingSQ] = useState(false)

  useEffect(() => {
    void api.getQuestions().then(setQuestions).catch(console.error)
  }, [])

  const saveProfile = async (e: FormEvent) => {
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
    } catch (error) {
      setProfileMsg({ kind: 'err', text: error instanceof ApiError ? error.message : 'Failed to update' })
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPw.length < 8) { setPwMsg({ kind: 'err', text: 'New password must be at least 8 chars' }); return }
    if (newPw !== newPwConfirm) { setPwMsg({ kind: 'err', text: 'Passwords do not match' }); return }
    setSavingPw(true)
    try {
      await api.updatePassword({ current_password: currentPw, new_password: newPw })
      setCurrentPw(''); setNewPw(''); setNewPwConfirm('')
      setPwMsg({ kind: 'ok', text: 'Password changed. Other sessions were signed out.' })
    } catch (error) {
      setPwMsg({ kind: 'err', text: error instanceof ApiError ? error.message : 'Failed to change password' })
    } finally {
      setSavingPw(false)
    }
  }

  const usedIds = new Set(qas.map(qa => qa.questionId).filter(Boolean))
  const updateQA = (index: number, patch: Partial<QAState>) =>
    setQas(previous => previous.map((qa, position) => (position === index ? { ...qa, ...patch } : qa)))

  const saveQuestions = async (e: FormEvent) => {
    e.preventDefault()
    setSqMsg(null)
    if (qas.some(qa => !qa.questionId || !qa.answer.trim())) { setSqMsg({ kind: 'err', text: 'All three are required' }); return }
    if (new Set(qas.map(qa => qa.questionId)).size !== 3) { setSqMsg({ kind: 'err', text: 'Choose three different questions' }); return }
    setSavingSQ(true)
    try {
      await api.updateSecurityQs({
        current_password: sqPassword,
        security_answers: qas.map(qa => ({ question_id: qa.questionId, answer: qa.answer })),
      })
      setSqPassword('')
      setQas(emptyAnswers())
      setSqMsg({ kind: 'ok', text: 'Security questions updated.' })
    } catch (error) {
      setSqMsg({ kind: 'err', text: error instanceof ApiError ? error.message : 'Failed to update' })
    } finally {
      setSavingSQ(false)
    }
  }

  return {
    user,
    profile: { name, setName, username, setUsername, password: profilePassword, setPassword: setProfilePassword, msg: profileMsg, saving: savingProfile, save: saveProfile },
    password: { current: currentPw, setCurrent: setCurrentPw, next: newPw, setNext: setNewPw, confirm: newPwConfirm, setConfirm: setNewPwConfirm, msg: pwMsg, saving: savingPw, save: changePassword },
    security: { questions, qas, usedIds, updateQA, password: sqPassword, setPassword: setSqPassword, msg: sqMsg, saving: savingSQ, save: saveQuestions },
  }
}
```

* [ ] Commit: `git add frontend/src/features/auth/useProfileForms.ts`

### Task 2 — Dispatcher and Classic on the hook

**Files:** `frontend/src/features/auth/ProfilePage.tsx` (modify)

* [ ] `frontend/src/features/auth/ProfilePage.tsx`, change 1 of 3. Current code:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type SecurityQuestion } from '../../lib/api/client'
import { useAuth } from './AuthContext'
import { useTheme } from '../../lib/useTheme'
import ThemePicker from '../../components/ThemePicker'
import { ArrowLeftIcon } from '../../components/Icon'

interface QAState { questionId: string; answer: string }

export default function ProfilePage() {
  const { user, refresh } = useAuth()
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })

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
```

Replacement:

```tsx
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
```

* [ ] `frontend/src/features/auth/ProfilePage.tsx`, change 2 of 3. Current code:

```tsx
  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }

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
    <div className="page-art page-art-profile" style={{ minHeight: '100dvh' }}>
```

Replacement:

```tsx
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
```

* [ ] `frontend/src/features/auth/ProfilePage.tsx`, change 3 of 3. Current code:

```tsx
                style={{ ...inputStyle, marginBottom: 8 }}>
                <option value="">Question {i + 1}…</option>
                {questions.map(q => (
                  <option key={q.id} value={q.id}
                    disabled={q.id !== qa.questionId && usedIds.has(q.id)}>
                    {q.prompt}
                  </option>
                ))}
```

Replacement:

```tsx
                style={{ ...inputStyle, marginBottom: 8 }}>
                <option value="">Question {i + 1}…</option>
                {questions.map(question => (
                  <option key={question.id} value={question.id}
                    disabled={question.id !== qa.questionId && usedIds.has(question.id)}>
                    {question.prompt}
                  </option>
                ))}
```

* [ ] Verify: `cd frontend && npx tsc --noEmit && npm run lint:changed`

Expected: no errors.

* [ ] Commit: `git add frontend/src/features/auth/ProfilePage.tsx`

### Task 3 — UI_2.0 page and styles

**Files:** `frontend/src/ui2/profile/Ui2ProfilePage.tsx`, `profile.css` (create)

* [ ] Create `frontend/src/ui2/profile/Ui2ProfilePage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api, type Region } from '../../lib/api/client'
import { initials } from '../../features/admin/AdminUserSettings'
import { useProfileForms, type FormMessage } from '../../features/auth/useProfileForms'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import './profile.css'

type Section = 'profile' | 'password' | 'security'

const SECTIONS: Array<[Section, string]> = [
  ['profile', 'Profile'],
  ['password', 'Password'],
  ['security', 'Security questions'],
]

function Message({ message }: { message: FormMessage }) {
  if (!message) return null
  return (
    <p className={message.kind === 'ok' ? 'u2-profile-ok' : 'u2-profile-error'} role={message.kind === 'ok' ? 'status' : 'alert'}>
      {message.text}
    </p>
  )
}

// The handoff's Profile & security page: an identity panel with the three
// sections as tabs, and the selected section's form beside it. The forms,
// rules and API calls are the Classic page's (useProfileForms).
export function Ui2ProfilePage() {
  const { user, profile, password, security } = useProfileForms()
  const [section, setSection] = useState<Section>('profile')
  const [regions, setRegions] = useState<Region[]>([])

  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  if (!user) return null
  const regionLabel = user.region ? regions.find(region => region.id === user.region)?.label ?? user.region : 'All regions'
  const sectionLabel = SECTIONS.find(([key]) => key === section)?.[1] ?? ''

  return (
    <>
      <Ui2PageIntro title="Your account, your preferences." subtitle="Manage your profile and account security." />
      <div className="u2-profile-layout">
        <aside className="ui2-panel u2-profile-identity">
          <div className="u2-profile-avatar" aria-hidden>{initials(user)}</div>
          <h2>{user.name || user.username}</h2>
          <p className="ui2-note">@{user.username}</p>
          <span className="u2-profile-role">{user.role}</span>
          <div className="u2-profile-tabs" role="tablist" aria-label="Account settings">
            {SECTIONS.map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`u2-profile-tab-${key}`} aria-controls="u2-profile-panel"
                aria-selected={section === key} className={section === key ? 'active' : undefined}
                onClick={() => setSection(key)}>
                {label}
              </button>
            ))}
          </div>
        </aside>

        <section className="ui2-panel u2-profile-content" role="tabpanel" id="u2-profile-panel"
          aria-labelledby={`u2-profile-tab-${section}`} aria-label={sectionLabel}>
          {section === 'profile' && (
            <>
              <h2>Profile details</h2>
              <p className="u2-profile-field-note">
                Your name and sign-in username.{user.role !== 'user' && ' Your administrator role is managed separately.'}
              </p>
              <form onSubmit={profile.save}>
                <div className="u2-profile-form">
                  <label>Name<input value={profile.name} onChange={e => profile.setName(e.target.value)} required /></label>
                  <label>Username<input value={profile.username} onChange={e => profile.setUsername(e.target.value)} required /></label>
                  <label>Current password confirmation
                    <input type="password" autoComplete="current-password" value={profile.password}
                      onChange={e => profile.setPassword(e.target.value)} required />
                  </label>
                </div>
                <div className="u2-profile-row"><strong>Role</strong><span className="u2-profile-role">{user.role}</span></div>
                <div className="u2-profile-row"><strong>Region</strong><span>{regionLabel}</span></div>
                <Message message={profile.msg} />
                <div className="ui2-dialog-actions">
                  <button type="submit" className="ui2-btn ui2-btn-primary" disabled={profile.saving}>
                    {profile.saving ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>
            </>
          )}

          {section === 'password' && (
            <>
              <h2>Change password</h2>
              <p className="u2-profile-field-note">Changing your password signs you out of other sessions.</p>
              <form onSubmit={password.save}>
                <div className="u2-profile-form">
                  <label>Current password
                    <input type="password" autoComplete="current-password" value={password.current}
                      onChange={e => password.setCurrent(e.target.value)} required />
                  </label>
                  <label>New password
                    <input type="password" autoComplete="new-password" value={password.next}
                      onChange={e => password.setNext(e.target.value)} required />
                  </label>
                  <label>Confirm new password
                    <input type="password" autoComplete="new-password" value={password.confirm}
                      onChange={e => password.setConfirm(e.target.value)} required />
                  </label>
                </div>
                <Message message={password.msg} />
                <div className="ui2-dialog-actions">
                  <button type="submit" className="ui2-btn ui2-btn-primary" disabled={password.saving}>
                    {password.saving ? 'Saving…' : 'Change password'}
                  </button>
                </div>
              </form>
            </>
          )}

          {section === 'security' && (
            <>
              <h2>Security questions</h2>
              <p className="u2-profile-field-note">
                Replace all three recovery questions together. You'll need them if you forget your password.
              </p>
              <form onSubmit={security.save}>
                <div className="u2-profile-form">
                  {security.qas.map((qa, index) => (
                    <div key={index} className="u2-profile-pair">
                      <label>Question {index + 1}
                        <select value={qa.questionId} required onChange={e => security.updateQA(index, { questionId: e.target.value })}>
                          <option value="">Choose a question</option>
                          {security.questions.map(question => (
                            <option key={question.id} value={question.id}
                              disabled={question.id !== qa.questionId && security.usedIds.has(question.id)}>
                              {question.prompt}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>Answer {index + 1}
                        <input type="password" autoComplete="off" value={qa.answer} required
                          onChange={e => security.updateQA(index, { answer: e.target.value })} />
                      </label>
                    </div>
                  ))}
                  <label>Current password confirmation
                    <input type="password" autoComplete="current-password" value={security.password}
                      onChange={e => security.setPassword(e.target.value)} required />
                  </label>
                </div>
                <Message message={security.msg} />
                <div className="ui2-dialog-actions">
                  <button type="submit" className="ui2-btn ui2-btn-primary" disabled={security.saving}>
                    {security.saving ? 'Saving…' : 'Save security questions'}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  )
}
```

* [ ] Create `frontend/src/ui2/profile/profile.css`:

```css
/* UI_2.0 Profile & security (PD-059 slice 25), ported from the handoff's
 * .profile-* rules onto the --u2-* palette. */

:root[data-ui="ui2"] .u2-profile-layout {
  display: grid;
  grid-template-columns: 230px 1fr;
  gap: 24px;
  align-items: start;
}

:root[data-ui="ui2"] .u2-profile-identity { padding: 24px; text-align: center; }
:root[data-ui="ui2"] .u2-profile-identity h2 { font: 700 17px var(--u2-font-display); margin: 0 0 8px; }

:root[data-ui="ui2"] .u2-profile-avatar {
  margin: 0 auto 16px;
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  border-radius: 18px;
  font-size: 21px;
  font-weight: 800;
}

:root[data-ui="ui2"] .u2-profile-role {
  display: inline-block;
  margin-top: 12px;
  font-size: 9px;
  letter-spacing: .7px;
  text-transform: uppercase;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  padding: 4px 6px;
  border-radius: 4px;
}

:root[data-ui="ui2"] .u2-profile-row .u2-profile-role { margin-top: 0; }

:root[data-ui="ui2"] .u2-profile-tabs { display: flex; flex-direction: column; gap: 5px; margin-top: 24px; }

:root[data-ui="ui2"] .u2-profile-tabs button {
  border: 0;
  background: transparent;
  color: var(--u2-muted);
  text-align: left;
  padding: 11px;
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
}

:root[data-ui="ui2"] .u2-profile-tabs button.active { background: var(--u2-accentsoft); color: var(--u2-accent); }

:root[data-ui="ui2"] .u2-profile-content { padding: 26px; max-width: 850px; }
:root[data-ui="ui2"] .u2-profile-content h2 { font: 700 18px var(--u2-font-display); margin: 0 0 8px; }
:root[data-ui="ui2"] .u2-profile-field-note { font-size: 11px; color: var(--u2-muted); line-height: 1.6; margin: 0; }

:root[data-ui="ui2"] .u2-profile-form { display: grid; gap: 16px; margin: 22px 0; }
:root[data-ui="ui2"] .u2-profile-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

:root[data-ui="ui2"] .u2-profile-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  color: var(--u2-muted);
  min-width: 0;
}

:root[data-ui="ui2"] .u2-profile-form input,
:root[data-ui="ui2"] .u2-profile-form select {
  width: 100%;
  min-width: 0;
  padding: 11px;
  background: var(--u2-bg);
  color: var(--u2-text);
  border: 1px solid var(--u2-border);
  border-radius: 7px;
}

:root[data-ui="ui2"] .u2-profile-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 14px 0;
  border-top: 1px solid var(--u2-border);
  font-size: 12px;
}

:root[data-ui="ui2"] .u2-profile-ok { color: var(--u2-green); font-size: 12px; }
:root[data-ui="ui2"] .u2-profile-error { color: var(--u2-red); font-size: 12px; }

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2-profile-layout { grid-template-columns: 1fr; }
  :root[data-ui="ui2"] .u2-profile-identity { text-align: left; }
  :root[data-ui="ui2"] .u2-profile-avatar { margin: 0 0 15px; }
  :root[data-ui="ui2"] .u2-profile-tabs { flex-direction: row; flex-wrap: wrap; margin-top: 18px; }
  :root[data-ui="ui2"] .u2-profile-content { padding: 20px; }
}

@media (max-width: 700px) {
  :root[data-ui="ui2"] .u2-profile-pair { grid-template-columns: 1fr; }
}
```

* [ ] Commit: `git add frontend/src/ui2/profile/Ui2ProfilePage.tsx frontend/src/ui2/profile/profile.css`

### Task 4 — Tests

**Files:** `frontend/src/ui2/profile/Ui2ProfilePage.test.tsx` (create)

* [ ] Create `frontend/src/ui2/profile/Ui2ProfilePage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type User } from '../../lib/api/client'
import { Ui2ProfilePage } from './Ui2ProfilePage'

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: {
      getQuestions: vi.fn(),
      getRegions: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn(),
      updateSecurityQs: vi.fn(),
    },
  }
})

const session = vi.hoisted(() => ({
  user: { id: 'u1', username: 'alice', name: 'Alice Morgan', role: 'admin', region: 'europe' } as User,
  refresh: vi.fn(),
}))
vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ user: session.user, refresh: session.refresh }),
  useAuthOptional: () => ({ user: session.user, refresh: session.refresh }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getQuestions).mockResolvedValue([
    { id: 'q1', prompt: 'First school' }, { id: 'q2', prompt: 'First pet' }, { id: 'q3', prompt: 'Birth city' },
  ])
  vi.mocked(api.getRegions).mockResolvedValue([{ id: 'europe', label: 'Europe' }])
  vi.mocked(api.updateProfile).mockResolvedValue(undefined as never)
  vi.mocked(api.updatePassword).mockResolvedValue(undefined as never)
  vi.mocked(api.updateSecurityQs).mockResolvedValue(undefined as never)
  session.refresh.mockResolvedValue(undefined)
})

const openTab = (name: string) => userEvent.click(screen.getByRole('tab', { name }))

describe('Ui2ProfilePage', () => {
  it('shows the identity panel and the profile form first', async () => {
    render(<Ui2ProfilePage />)
    expect(screen.getByRole('heading', { name: 'Your account, your preferences.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alice Morgan' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Name')).toHaveValue('Alice Morgan')
    expect(await screen.findByText('Europe')).toBeInTheDocument()
  })

  it('saves the profile with the current password and refreshes the session', async () => {
    render(<Ui2ProfilePage />)
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Alice M ')
    await userEvent.type(screen.getByLabelText('Current password confirmation'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({
      name: 'Alice M', username: 'alice', current_password: 'secret-pass',
    }))
    expect(session.refresh).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Profile updated.')
  })

  it('rejects a short or mismatched new password before calling the server', async () => {
    render(<Ui2ProfilePage />)
    await openTab('Password')
    const panel = screen.getByRole('tabpanel')
    await userEvent.type(within(panel).getByLabelText('Current password'), 'old-pass')
    await userEvent.type(within(panel).getByLabelText('New password'), 'short')
    await userEvent.type(within(panel).getByLabelText('Confirm new password'), 'short')
    await userEvent.click(within(panel).getByRole('button', { name: 'Change password' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('New password must be at least 8 chars')
    await userEvent.clear(within(panel).getByLabelText('New password'))
    await userEvent.type(within(panel).getByLabelText('New password'), 'long-enough-1')
    await userEvent.click(within(panel).getByRole('button', { name: 'Change password' }))
    expect(within(panel).getByRole('alert')).toHaveTextContent('Passwords do not match')
    expect(api.updatePassword).not.toHaveBeenCalled()
  })

  it('changes the password when the rules pass', async () => {
    render(<Ui2ProfilePage />)
    await openTab('Password')
    await userEvent.type(screen.getByLabelText('Current password'), 'old-pass')
    await userEvent.type(screen.getByLabelText('New password'), 'long-enough-1')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'long-enough-1')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(api.updatePassword).toHaveBeenCalledWith({ current_password: 'old-pass', new_password: 'long-enough-1' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Other sessions were signed out.')
  })

  it('replaces all three security questions, each question used once', async () => {
    render(<Ui2ProfilePage />)
    await openTab('Security questions')
    await within(screen.getByLabelText('Question 1')).findByRole('option', { name: 'First school' })
    await userEvent.selectOptions(screen.getByLabelText('Question 1'), 'q1')
    expect(within(screen.getByLabelText('Question 2')).getByRole('option', { name: 'First school' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Question 2'), 'q2')
    await userEvent.selectOptions(screen.getByLabelText('Question 3'), 'q3')
    for (const index of [1, 2, 3]) await userEvent.type(screen.getByLabelText(`Answer ${index}`), `answer ${index}`)
    await userEvent.type(screen.getByLabelText('Current password confirmation'), 'secret-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save security questions' }))
    await waitFor(() => expect(api.updateSecurityQs).toHaveBeenCalledWith({
      current_password: 'secret-pass',
      security_answers: [
        { question_id: 'q1', answer: 'answer 1' },
        { question_id: 'q2', answer: 'answer 2' },
        { question_id: 'q3', answer: 'answer 3' },
      ],
    }))
  })
})
```

* [ ] Verify: `cd frontend && npx vitest run src/ui2/profile 2>&1 | tail -4`

Expected: 5 tests pass.

* [ ] Commit: `git add frontend/src/ui2/profile/Ui2ProfilePage.test.tsx`

### Task 5 — Gate and PR

* [ ] `cd frontend && npm run test:run && npx tsc --noEmit && npm run build && npm run lint:changed`
* [ ] Open the slice 25 PR, label `ui-2.0`; set board row 25.

---

## 7. End-to-end verification scenarios

1. In UI_2.0, `/profile` shows the identity panel and Profile details with the current name, role and region.
2. Save the profile with the right password: "Profile updated." and the shell's account name changes.
3. Password: a 5-character password is refused before any request; a mismatch is refused; a valid change signs out other sessions.
4. Security questions: a question chosen once is disabled in the other selects; saving with all three replaces them.
5. At 390 px the panel stacks above the form and the tabs run in a row, with no horizontal overflow.
6. Switch the account to Classic: `/profile` is today's page.

---

## Done

* [ ] `feat/PD-059-profile` merged → slice 25 live

**Next:** slice 22 (act-as in UI_2.0) and slice 26 (auth screens in Light).
