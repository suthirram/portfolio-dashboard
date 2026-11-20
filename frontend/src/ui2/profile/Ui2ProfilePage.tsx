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
