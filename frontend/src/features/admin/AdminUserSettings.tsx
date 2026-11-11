import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, type Region, type User } from '../../lib/api/client'

// The glass UI's Admin → Users (PD-054): a searchable list of accounts in a
// side pane and, for the selected account, its settings grouped as a
// settings page (Profile, Features, Access, Danger zone). Every action and
// permission rule is the one AdminUserList already applies; it passes
// runAction (confirm → call → reload) in, so only the layout differs.

export type RunAction = (id: string, action: () => Promise<unknown>, confirmMsg?: string) => Promise<void>

export interface FeatureSwitch {
  key: 'gold_enabled' | 'premium' | 'delta_from_history' | 'ui_revamp'
  label: string
  description: string
  // Asked before turning the feature off (data or look the user loses).
  offConfirm?: (username: string) => string
}

export const FEATURE_SWITCHES: FeatureSwitch[] = [
  {
    key: 'gold_enabled', label: 'Gold tracking', description: 'Physical gold ledger, prices and metrics.',
    offConfirm: username => `Disable gold tracking for ${username}? Data is kept, only hidden.`,
  },
  {
    key: 'premium', label: 'Premium', description: 'Unlocks the cyber theme.',
    offConfirm: username => `Disable premium for ${username}? Their theme falls back to dark.`,
  },
  { key: 'delta_from_history', label: 'Investment delta from History', description: 'Off: computed from the ledger (default).' },
  { key: 'ui_revamp', label: 'Glass UI', description: 'The glass look with sidebar, ⌘K palette and toasts.' },
]

export const initials = (listedUser: User) =>
  (listedUser.name || listedUser.username).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('')

function statusOf(listedUser: User): { label: string; tone: 'ok' | 'warn' | 'off' } {
  if (listedUser.disabled) return { label: 'Hidden', tone: 'off' }
  if (listedUser.locked) return { label: 'Locked', tone: 'warn' }
  return { label: 'Active', tone: 'ok' }
}

export function AdminUserSettings({
  users, regions, caller, busy, includeHidden = false, onIncludeHidden, runAction, onFeature, listLabel = 'Users',
}: {
  users: User[]
  regions: Region[]
  caller: User | null
  busy: string | null
  // The Active / All toggle; left out where nobody is hidden (Admins).
  includeHidden?: boolean
  onIncludeHidden?: (includeHidden: boolean) => void
  runAction: RunAction
  onFeature: (listedUser: User, feature: FeatureSwitch) => Promise<void>
  listLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const isSuper = caller?.role === 'superadmin'

  const listed = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return users.filter(listedUser => !needle
      || listedUser.username.toLowerCase().includes(needle) || listedUser.name.toLowerCase().includes(needle))
  }, [users, query])
  // The selection survives reloads by id; it falls back to the first listed.
  const selected = listed.find(listedUser => listedUser.id === selectedId) ?? listed[0] ?? null
  const regionLabel = (id: string) => regions.find(region => region.id === id)?.label ?? id

  return (
    <div className="admin-md">
      <aside className="admin-md-list glass-panel" aria-label={listLabel}>
        <input className="admin-md-search" value={query} placeholder={`Search ${listLabel.toLowerCase()}…`} aria-label={`Search ${listLabel.toLowerCase()}`}
          onChange={e => setQuery(e.target.value)} />
        {onIncludeHidden && (
          <div className="seg-group" role="group" aria-label="Which users">
            <button type="button" className="seg-btn" aria-pressed={!includeHidden} onClick={() => onIncludeHidden(false)}>Active</button>
            <button type="button" className="seg-btn" aria-pressed={includeHidden} onClick={() => onIncludeHidden(true)}>All</button>
          </div>
        )}
        <ul className="admin-md-items">
          {listed.length === 0 && <li className="admin-md-empty">No users found.</li>}
          {listed.map(listedUser => {
            const status = statusOf(listedUser)
            return (
              <li key={listedUser.id}>
                <button type="button" className="admin-md-item" aria-current={selected?.id === listedUser.id ? 'true' : undefined}
                  onClick={() => setSelectedId(listedUser.id)}>
                  <span className="admin-avatar" aria-hidden>{initials(listedUser)}</span>
                  <span className="admin-md-who">
                    <span className="admin-md-name">{listedUser.name || listedUser.username}{listedUser.id === caller?.id ? ' (you)' : ''}</span>
                    <span className="admin-md-meta">@{listedUser.username} · {listedUser.role}</span>
                  </span>
                  <span className={`admin-dot admin-dot-${status.tone}`} title={status.label} aria-label={status.label} />
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <section className="admin-md-detail" aria-label="User settings">
        {!selected ? (
          <div className="glass-panel admin-md-placeholder">Select a user to see their settings.</div>
        ) : (
          <UserDetail key={selected.id} listedUser={selected} caller={caller} isSuper={isSuper} regions={regions}
            regionLabel={regionLabel} busy={busy === selected.id} runAction={runAction} onFeature={onFeature} />
        )}
      </section>
    </div>
  )
}

function UserDetail({ listedUser, caller, isSuper, regions, regionLabel, busy, runAction, onFeature }: {
  listedUser: User
  caller: User | null
  isSuper: boolean
  regions: Region[]
  regionLabel: (id: string) => string
  busy: boolean
  runAction: RunAction
  onFeature: (listedUser: User, feature: FeatureSwitch) => Promise<void>
}) {
  const isSelf = listedUser.id === caller?.id
  const isRowSuper = listedUser.role === 'superadmin'
  const status = statusOf(listedUser)
  const { id, username } = listedUser

  return (
    <>
      <header className="glass-panel admin-md-head">
        <span className="admin-avatar admin-avatar-lg" aria-hidden>{initials(listedUser)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="admin-md-title">{listedUser.name || username}</h2>
          <div className="admin-md-meta">
            @{username} · <span className="admin-pill">{listedUser.role}</span>
            {listedUser.region && <> · {regionLabel(listedUser.region)}</>}
            {' · '}<span className={`admin-status admin-status-${status.tone}`}>{status.label}</span>
          </div>
        </div>
        <Link to={`/admin/users/${id}`} className="btn-primary">Open portfolio</Link>
      </header>

      <SettingsSection title="Profile">
        <SettingRow label="Role" description={listedUser.role === 'user' ? 'Can manage their own portfolio.' : 'Helps the users in their region.'}>
          {isSuper && !isRowSuper && !isSelf && listedUser.role === 'user' && (
            <button className="btn btn-sm" disabled={busy}
              onClick={() => runAction(id, () => api.adminPromoteUser(id), `Promote ${username} to admin?`)}>Promote to admin</button>
          )}
          {isSuper && listedUser.role === 'admin' && (
            <button className="btn btn-sm" disabled={busy}
              onClick={() => runAction(id, () => api.adminDemoteUser(id), `Demote ${username} back to user?`)}>Demote to user</button>
          )}
          {(!isSuper || isRowSuper) && <span className="admin-pill">{listedUser.role}</span>}
        </SettingRow>
        <SettingRow label="Region" description="The admins of this region can help the account.">
          {isSuper && !isRowSuper && !isSelf ? (
            <select aria-label="Region" value={listedUser.region} disabled={busy} className="admin-select"
              onChange={e => { const region = e.target.value; void runAction(id, () => api.adminSetUserRegion(id, { region })) }}>
              {regions.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}
            </select>
          ) : <span>{listedUser.region ? regionLabel(listedUser.region) : 'All regions'}</span>}
        </SettingRow>
      </SettingsSection>

      {isSuper && (
        <SettingsSection title="Features">
          {FEATURE_SWITCHES.map(feature => (
            <SettingRow key={feature.key} label={feature.label} description={feature.description}>
              <button type="button" role="switch" aria-checked={Boolean(listedUser[feature.key])} aria-label={feature.label}
                className="admin-switch" disabled={busy} onClick={() => void onFeature(listedUser, feature)}>
                <span className="admin-switch-knob" />
              </button>
            </SettingRow>
          ))}
        </SettingsSection>
      )}

      <SettingsSection title="Access">
        <SettingRow label="Security questions" description={listedUser.locked ? 'Locked after three wrong answers.' : 'Recovery is available.'}>
          {listedUser.locked
            ? <button className="btn btn-sm" disabled={busy} onClick={() => runAction(id, () => api.adminResetLockout(id))}>Unlock</button>
            : <span className="admin-status admin-status-ok">OK</span>}
        </SettingRow>
        {!isRowSuper && !isSelf && (
          <SettingRow label="Sign-in" description={listedUser.disabled ? 'Hidden: cannot log in.' : 'Can log in.'}>
            {listedUser.disabled
              ? <button className="btn btn-sm" disabled={busy} onClick={() => runAction(id, () => api.adminReactivateUser(id))}>Reactivate</button>
              : <button className="btn btn-sm" disabled={busy}
                onClick={() => runAction(id, () => api.adminHideUser(id), `Hide ${username}? They cannot log in until reactivated.`)}>Hide</button>}
          </SettingRow>
        )}
      </SettingsSection>

      {!isRowSuper && !isSelf && (
        <SettingsSection title="Danger zone" danger>
          <SettingRow label="Delete account" description="Removes the user and all their holdings. Cannot be undone.">
            <button className="btn btn-sm btn-danger" disabled={busy}
              onClick={() => runAction(id, () => api.adminDeleteUser(id), `Permanently delete ${username} and all their holdings? This cannot be undone.`)}>Delete</button>
          </SettingRow>
        </SettingsSection>
      )}
    </>
  )
}

function SettingsSection({ title, danger, children }: { title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={danger ? 'glass-panel admin-section admin-section-danger' : 'glass-panel admin-section'} aria-label={title}>
      <h3 className="admin-section-title">{title}</h3>
      {children}
    </section>
  )
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="admin-row">
      <div className="admin-row-text">
        <div className="admin-row-label">{label}</div>
        <div className="admin-row-desc">{description}</div>
      </div>
      <div className="admin-row-control">{children}</div>
    </div>
  )
}
