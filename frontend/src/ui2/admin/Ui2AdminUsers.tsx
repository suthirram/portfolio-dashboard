import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { api, type Region, type User } from '../../lib/api/client'
import { UI_MODE_LABELS, type UiMode } from '../../lib/uiMode'
import { FEATURE_SWITCHES, initials, statusOf, type FeatureSwitch } from '../../features/admin/AdminUserSettings'
import { useAdminActions } from '../../features/admin/useAdminActions'
import { useAdminUsers } from '../../features/admin/useAdminUsers'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { Ui2Dialog } from '../shell/Ui2Dialog'
import './admin.css'

// Ui2AdminTabs is the handoff's Administration section switcher. Admins see
// Users only; the super admin also gets Administrators and Branding.
export function Ui2AdminTabs({ isSuper }: { isSuper: boolean }) {
  const tabs: Array<[string, string]> = [['/admin', 'Users'], ...(isSuper
    ? [['/admin/admins', 'Administrators'], ['/admin/branding', 'Branding']] as Array<[string, string]>
    : [])]
  return (
    <nav className="u2-admin-tabs" aria-label="Administration sections">
      {tabs.map(([path, label]) => (
        <NavLink key={path} to={path} end className={({ isActive }) => (isActive ? 'ui2-btn ui2-btn-primary' : 'ui2-btn')}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

interface Confirmation {
  title: string
  body: string
  confirmLabel: string
  run: () => Promise<void>
}

// The handoff's Administration → Users: a searchable account list beside the
// selected account's settings. Every permission rule and API call is the one
// Classic and Glass already use (useAdminActions); only the layout differs,
// and confirmations are dialogs instead of browser prompts.
export function Ui2AdminUsers() {
  const { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel } = useAdminUsers()
  const { caller, busy, runAction, toggleFeature, setUiMode } = useAdminActions(load)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [deleting, setDeleting] = useState<User | null>(null)
  const isSuper = caller?.role === 'superadmin'
  const scope = isSuper ? 'All regions' : caller?.region ? regionLabel(caller.region) : ''

  const listed = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return users.filter(listedUser => !needle
      || listedUser.username.toLowerCase().includes(needle) || listedUser.name.toLowerCase().includes(needle))
  }, [users, query])
  // The selection survives reloads by id and falls back to the first listed.
  const selected = listed.find(listedUser => listedUser.id === selectedId) ?? listed[0] ?? null

  return (
    <>
      <Ui2PageIntro
        title="A clear view of your users."
        subtitle={isSuper ? 'Manage accounts, features and interface settings across regions.' : 'Manage the accounts in your region.'}
      />
      <section className="u2-admin-root" aria-label="Administration">
        <Ui2AdminTabs isSuper={isSuper} />
        {caller && (
          <div className="u2-admin-context">
            <span className="u2-admin-role">{caller.role}</span>
            <span>{caller.name || caller.username} · {scope}</span>
          </div>
        )}
        {err && <p className="ui2-note" role="alert">{err}</p>}

        <div className="u2-admin-workspace">
          <section className="ui2-panel u2-admin-list" aria-label="Users">
            <div className="u2-admin-list-tools">
              <label htmlFor="u2-admin-search">Search users</label>
              <input id="u2-admin-search" type="search" placeholder="Name or username" value={query}
                onChange={event => setQuery(event.target.value)} />
              <label className="u2-admin-check">
                <input type="checkbox" checked={includeHidden} onChange={event => setIncludeHidden(event.target.checked)} />
                Include hidden accounts
              </label>
            </div>
            <div className="u2-admin-user-list">
              {loading && users.length === 0 && <p className="u2-admin-empty" aria-live="polite">Loading…</p>}
              {!loading && listed.length === 0 && <p className="u2-admin-empty">No matching accounts.</p>}
              {listed.map(listedUser => {
                const status = statusOf(listedUser)
                return (
                  <button key={listedUser.id} type="button" className="u2-admin-user"
                    aria-pressed={selected?.id === listedUser.id} onClick={() => setSelectedId(listedUser.id)}>
                    <span className="u2-admin-avatar" aria-hidden>{initials(listedUser)}</span>
                    <span>
                      <strong>{listedUser.name || listedUser.username}{listedUser.id === caller?.id ? ' (you)' : ''}</strong>
                      <small>@{listedUser.username} · {listedUser.role}</small>
                    </span>
                    <span className={`u2-admin-dot ${status.label.toLowerCase()}`} role="img" aria-label={status.label} />
                  </button>
                )
              })}
            </div>
            <div className="u2-admin-footer">{listed.length} accounts · {isSuper ? 'all regions' : scope}</div>
          </section>

          <div className="u2-admin-detail">
            {selected ? (
              <AccountDetail
                key={selected.id}
                account={selected}
                caller={caller}
                isSuper={isSuper}
                regions={regions}
                regionLabel={regionLabel}
                busy={busy === selected.id}
                ask={setConfirmation}
                onDelete={() => setDeleting(selected)}
                onRegion={region => runAction(selected.id, () => api.adminSetUserRegion(selected.id, { region }))}
                onFeature={(feature, confirmed) => toggleFeature(selected, feature, confirmed)}
                onUiMode={mode => setUiMode(selected, mode)}
                runAction={runAction}
              />
            ) : (
              <section className="ui2-panel u2-admin-empty">Select an account to see settings.</section>
            )}
          </div>
        </div>
      </section>

      {confirmation && (
        <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />
      )}
      {deleting && (
        <DeleteAccountDialog
          account={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => runAction(deleting.id, () => api.adminDeleteUser(deleting.id))}
        />
      )}
    </>
  )
}

function AccountDetail({
  account, caller, isSuper, regions, regionLabel, busy, ask, onDelete, onRegion, onFeature, onUiMode, runAction,
}: {
  account: User
  caller: User | null
  isSuper: boolean
  regions: Region[]
  regionLabel: (id: string) => string
  busy: boolean
  ask: (confirmation: Confirmation) => void
  onDelete: () => void
  onRegion: (region: string) => Promise<void>
  onFeature: (feature: FeatureSwitch, confirmed: boolean) => Promise<void>
  onUiMode: (mode: UiMode) => Promise<void>
  runAction: (id: string, action: () => Promise<unknown>) => Promise<void>
}) {
  const isSelf = account.id === caller?.id
  const isOwner = account.role === 'superadmin'
  const isProtected = isSelf || isOwner
  const status = statusOf(account)
  const name = account.name || account.username
  const [mode, setMode] = useState<UiMode>(account.ui_mode ?? 'classic')

  const changeRole = () => {
    const promote = account.role === 'user'
    ask({
      title: 'Change role?',
      body: `${promote ? 'Promote' : 'Demote'} ${name} ${promote ? 'to admin' : 'to user'}?`,
      confirmLabel: promote ? 'Promote to admin' : 'Demote to user',
      run: () => runAction(account.id, () => (promote ? api.adminPromoteUser(account.id) : api.adminDemoteUser(account.id))),
    })
  }

  const flipFeature = (feature: FeatureSwitch) => {
    if (account[feature.key] && feature.offConfirm) {
      ask({
        title: `Disable ${feature.label.toLowerCase()}?`,
        body: feature.offConfirm(account.username),
        confirmLabel: 'Disable',
        run: () => onFeature(feature, true),
      })
      return
    }
    void onFeature(feature, false)
  }

  return (
    <>
      <section className="ui2-panel u2-admin-head">
        <span className="u2-admin-avatar" aria-hidden>{initials(account)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{name}</h2>
          <div className="u2-admin-meta">
            <span>@{account.username}</span>
            <span className="u2-admin-role">{account.role}</span>
            <span className={`u2-admin-status ${status.label.toLowerCase()}`}>{status.label}</span>
          </div>
        </div>
        <Link className="ui2-btn ui2-btn-primary" to={isSelf ? '/' : `/admin/users/${account.id}`}>
          {isSelf ? 'My portfolio' : 'Open portfolio'}
        </Link>
      </section>

      <Section title="Account">
        <Row label="Role" description={isSelf ? 'Your own role is protected.' : isOwner ? 'The owner account cannot be demoted.' : 'Account permission level.'}>
          {isSuper && !isProtected
            ? <button type="button" className="ui2-btn" disabled={busy} onClick={changeRole}>
                {account.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
              </button>
            : <span className="u2-admin-role">{account.role}</span>}
        </Row>
        <Row label="Region" description={isSuper ? 'The region whose administrator can help this account.' : 'You can oversee accounts in your region only.'}>
          {isSuper && !isProtected ? (
            <label className="u2-admin-label">
              Region
              <select className="u2-admin-select" value={account.region} disabled={busy}
                onChange={event => void onRegion(event.target.value)}>
                {regions.map(region => <option key={region.id} value={region.id}>{region.label}</option>)}
              </select>
            </label>
          ) : <span>{account.region ? regionLabel(account.region) : 'All regions'}</span>}
        </Row>
      </Section>

      {isSuper && (
        <Section title="Features & interface">
          {FEATURE_SWITCHES.map(feature => (
            <Row key={feature.key} label={feature.label} description={feature.description}>
              <label className="u2-admin-check">
                <input type="checkbox" aria-label={feature.label} checked={Boolean(account[feature.key])} disabled={busy}
                  onChange={() => flipFeature(feature)} />
                Enabled
              </label>
            </Row>
          ))}
          <form onSubmit={event => { event.preventDefault(); void onUiMode(mode) }}>
            <Row label="Interface" description="Choose exactly one: Classic, Glass or UI_2.0.">
              <label className="u2-admin-label">
                Interface
                <select className="u2-admin-select" value={mode} disabled={busy}
                  onChange={event => setMode(event.target.value as UiMode)}>
                  {(Object.keys(UI_MODE_LABELS) as UiMode[]).map(option => (
                    <option key={option} value={option}>{UI_MODE_LABELS[option]}</option>
                  ))}
                </select>
              </label>
            </Row>
            <div className="ui2-dialog-actions">
              <button type="submit" className="ui2-btn ui2-btn-primary" disabled={busy || mode === (account.ui_mode ?? 'classic')}>
                Save interface
              </button>
            </div>
          </form>
        </Section>
      )}

      <Section title="Access">
        <Row label="Security questions" description={account.locked ? 'Recovery is locked.' : 'Recovery is available.'}>
          {account.locked
            ? <button type="button" className="ui2-btn" disabled={busy} onClick={() => ask({
                title: 'Unlock recovery?',
                body: `Clear the recovery lockout for ${name}?`,
                confirmLabel: 'Unlock recovery',
                run: () => runAction(account.id, () => api.adminResetLockout(account.id)),
              })}>Unlock recovery</button>
            : <span className="u2-admin-status">Available</span>}
        </Row>
        {isProtected ? (
          <p className="ui2-note">Your own account and the super-admin account cannot be hidden or deleted.</p>
        ) : (
          <Row label="Sign-in" description={account.disabled ? 'Hidden accounts cannot sign in.' : 'Hide disables sign-in; data is retained.'}>
            <button type="button" className="ui2-btn" disabled={busy} onClick={() => ask(account.disabled
              ? {
                  title: 'Reactivate account?',
                  body: `Allow ${name} to sign in again?`,
                  confirmLabel: 'Reactivate account',
                  run: () => runAction(account.id, () => api.adminReactivateUser(account.id)),
                }
              : {
                  title: 'Hide account?',
                  body: `${name} cannot sign in until reactivated. Their data is kept.`,
                  confirmLabel: 'Hide account',
                  run: () => runAction(account.id, () => api.adminHideUser(account.id)),
                })}>
              {account.disabled ? 'Reactivate account' : 'Hide account'}
            </button>
          </Row>
        )}
      </Section>

      {!isProtected && (
        <Section title="Delete account" danger>
          <p className="ui2-note">Removes the account and its portfolio permanently.</p>
          <div className="ui2-dialog-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="ui2-btn ui2-btn-danger" disabled={busy} onClick={onDelete}>Delete account</button>
          </div>
        </Section>
      )}
    </>
  )
}

function Section({ title, danger, children }: { title: string; danger?: boolean; children: ReactNode }) {
  return (
    <section className={danger ? 'ui2-panel u2-admin-section u2-admin-danger' : 'ui2-panel u2-admin-section'} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="u2-admin-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      {children}
    </div>
  )
}

function ConfirmDialog({ confirmation, onClose }: { confirmation: Confirmation; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      await confirmation.run()
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Ui2Dialog title={confirmation.title} onClose={onClose} busy={busy}>
      <p style={{ lineHeight: 1.7 }}>{confirmation.body}</p>
      <div className="ui2-dialog-actions">
        <button type="button" className="ui2-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="ui2-btn ui2-btn-primary" onClick={() => void confirm()} disabled={busy}>
          {confirmation.confirmLabel}
        </button>
      </div>
    </Ui2Dialog>
  )
}

function DeleteAccountDialog({ account, onClose, onConfirm }: {
  account: User
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (typed !== account.username) { setErr('Enter the exact username.'); return }
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setBusy(false)
    }
  }
  return (
    <Ui2Dialog title="Delete account" onClose={onClose} busy={busy}>
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        <p style={{ lineHeight: 1.7 }}>
          Type <strong>{account.username}</strong> to remove this account and its portfolio. This cannot be undone.
        </p>
        <input className="u2-admin-confirm-input" aria-label="Confirm username" autoComplete="off" value={typed}
          onChange={event => { setTyped(event.target.value); setErr('') }} />
        {err && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{err}</p>}
        <div className="ui2-dialog-actions">
          <button type="button" className="ui2-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ui2-btn ui2-btn-danger" disabled={busy}>Delete account</button>
        </div>
      </form>
    </Ui2Dialog>
  )
}
