# PD-059: Wave 6a — Administration users page (slice 23)

* **Status**: Amendment in review (this doc). Code below is implemented and verified on the slice branch.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: Render Administration → Users in the UI_2.0 shell, matching the handoff's Administration frame: a searchable account list beside the selected account's settings (Account, Features & interface, Access, Delete account), with dialog confirmations instead of browser prompts.
* **Architecture**: `AdminUserList` becomes a pure `useUiMode()` dispatcher; its Classic and Glass body moves into `ClassicAdminUserList`. The list loading moves into `useAdminUsers`, shared by every interface. Every permission rule and API call stays in `useAdminActions`; the UI_2.0 page only lays them out. `toggleFeature` gains a `confirmed` flag so UI_2.0 can confirm in its own dialog without the browser prompt firing too. The page is `ui2/admin/Ui2AdminUsers.tsx` with its own `admin.css`, prefixed `u2-admin-` because Glass already owns the bare `.admin-*` names.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library. No new dependencies; no backend change.
* **Spec links**: [PRD-001](../prds/PRD-001-user-auth-and-multi-tenancy.md), [DD-001](../designs/DD-001-user-auth-and-multi-tenancy.md), [PRD-015](../prds/PRD-015-ui-2.md), [DD-015](../designs/DD-015-ui-2.md), [handoff HTML](../visuals/PD-059-ui-2-reference.html) (the final `renderAdmin` override, `adminActionDialog`, `perspectiveAdminTabs`), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Built on: slice 2 (`Ui2PageIntro`, `primitives.css`), slice 14 (`Ui2Dialog`, `.ui2-dialog-actions`, `.ui2-btn-danger`).

Reused: `useAdminActions`, `FEATURE_SWITCHES`, `initials`, `statusOf` (now exported), `UI_MODE_LABELS`, every `api.admin*` call, the existing `/admin/users/:id` act-as route for **Open portfolio**.

Out of scope: act-as inside UI_2.0 (slice 22) — **Open portfolio** opens today's act-as view; Administrators and Branding (slice 24) — their tabs link to today's pages.

---

## 2. Handoff fidelity reference

The handoff's final `renderAdmin` override (the "perspective" version) supersedes the earlier `renderAdmin`, so it is the one followed; it has no stat cards.

**Intro**: title `A clear view of your users.`; subtitle `Manage accounts, features and interface settings across regions.` for the super admin, `Manage the accounts in your region.` for an admin.

**Section tabs** (`nav`, `aria-label="Administration sections"`): `Users`; the super admin also gets `Administrators` and `Branding`. The active one is primary.

**Context line**: the caller's role chip, then `<name> · All regions` (super admin) or `<name> · <region>`.

**List panel**: `Search users` label and a search input (`Name or username`); `Include hidden accounts` checkbox; one button per account — avatar initials, name (`(you)` on the caller), `@username · role`, and a status dot (Active / Locked / Hidden) with an accessible label; selected = accent background with an inset bar; footer `<n> accounts · all regions|<region>`; empty `No matching accounts.`

**Detail head**: avatar, name, `@username`, role chip, status chip; primary `Open portfolio` (or `My portfolio` on the caller's own account).

**Account**: Role — `Your own role is protected.` / `The owner account cannot be demoted.` / `Account permission level.`; the super admin gets `Promote to admin` / `Demote to user` on unprotected accounts. Region — a `Region` select for the super admin on unprotected accounts, otherwise the region text.

**Features & interface** (super admin only): one `Enabled` checkbox each for Gold tracking, Premium and Investment delta from History; turning Gold or Premium off asks first. Interface — `Choose exactly one: Classic, Glass or UI_2.0.` with a select and a save button.

**Access**: Security questions — `Unlock recovery` when locked, else an `Available` chip. Sign-in — `Hide account` / `Reactivate account`; on protected accounts the note `Your own account and the super-admin account cannot be hidden or deleted.`

**Delete account** (unprotected only): a danger panel; the button opens a dialog that requires typing the exact username (`Enter the exact username.` otherwise).

**Confirmations** (`adminActionDialog`): a dialog with the action's title and body, `Cancel` and a primary confirm.

**Layout**: list `300px` beside the detail; `240px` under 1050 px; one column under 700 px with the list capped at 230 px.

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/features/admin/useAdminUsers.ts` | Users list, regions, include-hidden, load, `regionLabel` for every interface |
| Modify | `frontend/src/features/admin/useAdminActions.ts` | `toggleFeature(…, confirmed)` skips the browser prompt |
| Modify | `frontend/src/features/admin/AdminUserSettings.tsx` | Export `statusOf` |
| Modify | `frontend/src/features/admin/AdminUserList.tsx` | Pure dispatcher; Classic/Glass body → `ClassicAdminUserList` on `useAdminUsers` |
| Create | `frontend/src/ui2/admin/admin.css` | `u2-admin-*` styles from the handoff |
| Create | `frontend/src/ui2/admin/Ui2AdminUsers.tsx` | The page, `Ui2AdminTabs` (reused by slice 24), confirm and delete dialogs |
| Create | `frontend/src/ui2/admin/Ui2AdminUsers.test.tsx` | Scope, sections, confirmations, protections, every action |

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `docs/PD-059-wave6a-admin-users` | This amendment + board row | Docs only | Reviewable plan for slice 23 | `markdownlint` |
| `feat/PD-059-admin-users` | Slice 23 | `AdminUserList.test.tsx` (Classic and Glass) passes unmodified; `toggleFeature`'s new parameter defaults to the old behaviour | UI_2.0 admins manage accounts in the handoff's layout with in-app confirmations | `Ui2AdminUsers.test.tsx` |

---

## 5. Owner decisions and open questions

### Standing decisions applied

* "Admin/super-admin pages designed by Claude (visuals per wave)" — the handoff now carries the Administration design, so it is the visual for this wave and nothing new is drawn.
* "Act-as in UI_2.0 under the banner" is slice 22; this slice links to today's act-as view.
* Region scope stays server-side (DD-001): the list is whatever `GET /admin/users` returns for the caller.

### Decisions taken in this plan (reversible)

* The handoff's sample-only copy is replaced: `Delete sample account` → `Delete account`, `Save sample interface` → `Save interface`, `Confirm sample change` → the action's own label; the "Fictional preview" note is dropped.
* Confirmations are `Ui2Dialog`s, matching the handoff's `adminActionDialog`; Classic and Glass keep their browser prompts.
* Turning Delta from History off asks nothing, as today: only switches with an `offConfirm` (Gold, Premium) ask.
* Region changes apply on select, as Glass does; the handoff's sample also applies on change.

### Open questions

None.

---

## 6. Task list

### Task 1 — Extract `useAdminUsers`

**Files:** `frontend/src/features/admin/useAdminUsers.ts` (create)

`AdminUserList` loads the scoped list and the region catalogue inline; UI_2.0 needs the same reads and the same include-hidden reload, so they move into a hook.

* [ ] Create `frontend/src/features/admin/useAdminUsers.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, type Region, type User } from '../../lib/api/client'

// useAdminUsers loads Admin → Users for every interface (PD-059 slice 23):
// the caller's scoped account list (the server applies region scope), the
// region catalogue, and whether hidden accounts are included.
export function useAdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [includeHidden, setIncludeHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setUsers(await api.adminListUsers(includeHidden))
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [includeHidden])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const regionLabel = useCallback((id: string) =>
    regions.find(region => region.id === id)?.label ?? id, [regions])

  return { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel }
}
```

* [ ] Commit: `git add frontend/src/features/admin/useAdminUsers.ts`

### Task 2 — Let a caller confirm a feature switch itself

**Files:** `frontend/src/features/admin/useAdminActions.ts` (modify)

Without the flag, turning Gold off in UI_2.0 would show the in-app dialog and then the browser prompt as well.

* [ ] `frontend/src/features/admin/useAdminActions.ts`, change 1 of 2. Current code:

```ts
  // the glass settings' switches. On the caller's own account the session
  // user is refreshed, so the delta panel follows without a page reload.
  const toggleFeature = (listedUser: User, feature: FeatureSwitch) => {
    const enabled = !listedUser[feature.key]
    const body = { enabled }
```

Replacement:

```ts
  // the glass settings' switches. On the caller's own account the session
  // user is refreshed, so the delta panel follows without a page reload.
  // confirmed skips the browser prompt when the caller already asked in its
  // own dialog (UI_2.0).
  const toggleFeature = (listedUser: User, feature: FeatureSwitch, confirmed = false) => {
    const enabled = !listedUser[feature.key]
    const body = { enabled }
```

* [ ] `frontend/src/features/admin/useAdminActions.ts`, change 2 of 2. Current code:

```ts
      await calls[feature.key]()
      if (listedUser.id === caller?.id && feature.key === 'delta_from_history') await refreshCaller()
    }, !enabled && feature.offConfirm ? feature.offConfirm(listedUser.username) : undefined)
  }

```

Replacement:

```ts
      await calls[feature.key]()
      if (listedUser.id === caller?.id && feature.key === 'delta_from_history') await refreshCaller()
    }, !confirmed && !enabled && feature.offConfirm ? feature.offConfirm(listedUser.username) : undefined)
  }

```

* [ ] Commit: `git add frontend/src/features/admin/useAdminActions.ts`

### Task 3 — Export `statusOf`

**Files:** `frontend/src/features/admin/AdminUserSettings.tsx` (modify)

* [ ] `frontend/src/features/admin/AdminUserSettings.tsx`, change 1 of 1. Current code:

```tsx
  (listedUser.name || listedUser.username).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('')

function statusOf(listedUser: User): { label: string; tone: 'ok' | 'warn' | 'off' } {
  if (listedUser.disabled) return { label: 'Hidden', tone: 'off' }
  if (listedUser.locked) return { label: 'Locked', tone: 'warn' }
```

Replacement:

```tsx
  (listedUser.name || listedUser.username).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('')

export function statusOf(listedUser: User): { label: string; tone: 'ok' | 'warn' | 'off' } {
  if (listedUser.disabled) return { label: 'Hidden', tone: 'off' }
  if (listedUser.locked) return { label: 'Locked', tone: 'warn' }
```

* [ ] Commit: `git add frontend/src/features/admin/AdminUserSettings.tsx`

### Task 4 — Make `AdminUserList` a dispatcher

**Files:** `frontend/src/features/admin/AdminUserList.tsx` (modify)

Only `useUiMode()` runs in the dispatcher so the hook count is stable when the account's mode changes while mounted. The Classic table and the Glass layout keep their markup.

* [ ] `frontend/src/features/admin/AdminUserList.tsx`, change 1 of 1. Current code:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useUiRevamp } from '../../lib/uiMode'
import { AdminShell } from './AdminShell'
import { AdminUserSettings, FEATURE_SWITCHES, UiModeSelect, type FeatureSwitch } from './AdminUserSettings'
import { useAdminActions } from './useAdminActions'

type StatusFilter = 'active' | 'all'

export default function AdminUserList() {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const revamp = useUiRevamp()

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.adminListUsers(status === 'all')
      setUsers(data)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const regionLabel = useCallback((id: string) =>
    regions.find(region => region.id === id)?.label ?? id, [regions])

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
```

Replacement:

```tsx
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type User } from '../../lib/api/client'
import { useUiMode, useUiRevamp } from '../../lib/uiMode'
import { Ui2AdminUsers } from '../../ui2/admin/Ui2AdminUsers'
import { AdminShell } from './AdminShell'
import { AdminUserSettings, FEATURE_SWITCHES, UiModeSelect, type FeatureSwitch } from './AdminUserSettings'
import { useAdminActions } from './useAdminActions'
import { useAdminUsers } from './useAdminUsers'

type StatusFilter = 'active' | 'all'

// AdminUserList is a pure dispatcher: only useUiMode() lives here. All
// Classic and Glass hooks live in ClassicAdminUserList so the hook count is
// stable across mode changes.
export default function AdminUserList() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2AdminUsers />
  return <ClassicAdminUserList />
}

function ClassicAdminUserList() {
  const { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel } = useAdminUsers()
  const [filter, setFilter] = useState('')
  const status: StatusFilter = includeHidden ? 'all' : 'active'
  const setStatus = (next: StatusFilter) => setIncludeHidden(next === 'all')

  const revamp = useUiRevamp()

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
```

* [ ] Verify: `cd frontend && npx vitest run src/features/admin 2>&1 | tail -4`

Expected: every Classic and Glass admin test passes, unmodified.

* [ ] Commit: `git add frontend/src/features/admin/AdminUserList.tsx`

### Task 5 — Styles

**Files:** `frontend/src/ui2/admin/admin.css` (create)

* [ ] Create `frontend/src/ui2/admin/admin.css`:

```css
/* UI_2.0 Administration (PD-059 slices 23–24), ported from the handoff's
 * .admin-* / .perspective-* rules onto the --u2-* palette. Prefixed u2-admin-
 * because Glass already owns the bare .admin-* names. */

:root[data-ui="ui2"] .u2-admin-root { display: grid; gap: 20px; }

:root[data-ui="ui2"] .u2-admin-tabs { display: flex; flex-wrap: wrap; gap: 8px; }

:root[data-ui="ui2"] .u2-admin-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

:root[data-ui="ui2"] .u2-admin-workspace {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  align-items: start;
}

:root[data-ui="ui2"] .u2-admin-list { overflow: hidden; padding: 0; }

:root[data-ui="ui2"] .u2-admin-list-tools {
  padding: 16px;
  display: grid;
  gap: 12px;
  border-bottom: 1px solid var(--u2-border);
  font-size: 12px;
  color: var(--u2-muted);
}

:root[data-ui="ui2"] .u2-admin-list-tools input[type="search"] {
  width: 100%;
  background: var(--u2-bg);
  color: var(--u2-text);
  border: 1px solid var(--u2-border);
  border-radius: 8px;
  padding: 11px;
}

:root[data-ui="ui2"] .u2-admin-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  font-size: 12px;
}

:root[data-ui="ui2"] .u2-admin-check input { accent-color: var(--u2-accent); min-width: 18px; min-height: 18px; }

:root[data-ui="ui2"] .u2-admin-user-list { max-height: 600px; overflow: auto; }

:root[data-ui="ui2"] .u2-admin-user {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 18px 16px;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--u2-border);
  background: transparent;
  color: var(--u2-text);
  cursor: pointer;
  font: inherit;
}

:root[data-ui="ui2"] .u2-admin-user[aria-pressed="true"] {
  background: var(--u2-accentsoft);
  box-shadow: inset 3px 0 var(--u2-accent);
}

:root[data-ui="ui2"] .u2-admin-user strong { display: block; font-size: 12px; margin-bottom: 5px; }
:root[data-ui="ui2"] .u2-admin-user small { font-size: 11px; color: var(--u2-muted); }

:root[data-ui="ui2"] .u2-admin-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  border-radius: 14px;
  font-weight: 800;
}

:root[data-ui="ui2"] .u2-admin-dot {
  width: 7px;
  height: 7px;
  background: var(--u2-green);
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}

:root[data-ui="ui2"] .u2-admin-dot.locked { background: #c99b42; }
:root[data-ui="ui2"] .u2-admin-dot.hidden { background: var(--u2-muted); }

:root[data-ui="ui2"] .u2-admin-footer { padding: 15px 18px; color: var(--u2-muted); font-size: 11px; }

:root[data-ui="ui2"] .u2-admin-detail { display: grid; gap: 16px; min-width: 0; }

:root[data-ui="ui2"] .u2-admin-head {
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}

:root[data-ui="ui2"] .u2-admin-head h2 { font: 800 21px var(--u2-font-display); margin: 0 0 7px; }

:root[data-ui="ui2"] .u2-admin-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  color: var(--u2-muted);
  font-size: 12px;
}

:root[data-ui="ui2"] .u2-admin-role {
  display: inline-block;
  font-size: 9px;
  letter-spacing: .7px;
  text-transform: uppercase;
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  padding: 4px 6px;
  border-radius: 4px;
}

:root[data-ui="ui2"] .u2-admin-status {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  background: var(--u2-greensoft);
  color: var(--u2-green);
}

:root[data-ui="ui2"] .u2-admin-status.locked { background: #bc973020; color: #bd9434; }
:root[data-ui="ui2"] .u2-admin-status.hidden { background: var(--u2-bg); color: var(--u2-muted); }

:root[data-ui="ui2"] .u2-admin-section { padding: 22px; }
:root[data-ui="ui2"] .u2-admin-section h2 { font: 700 15px var(--u2-font-display); margin: 0 0 8px; }
:root[data-ui="ui2"] .u2-admin-danger { border-color: color-mix(in srgb, var(--u2-red) 35%, var(--u2-border)); }

:root[data-ui="ui2"] .u2-admin-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 0;
  border-bottom: 1px solid var(--u2-border);
}

:root[data-ui="ui2"] .u2-admin-row:last-child { border-bottom: 0; padding-bottom: 0; }
:root[data-ui="ui2"] .u2-admin-row strong { font-size: 12px; font-weight: 600; }
:root[data-ui="ui2"] .u2-admin-row p { font-size: 11px; color: var(--u2-muted); line-height: 1.6; margin: 6px 0 0; }

:root[data-ui="ui2"] .u2-admin-label { display: grid; gap: 7px; font-size: 12px; color: var(--u2-muted); }

:root[data-ui="ui2"] .u2-admin-select {
  border: 1px solid var(--u2-border);
  background: var(--u2-panel);
  color: var(--u2-text);
  padding: 8px;
  border-radius: 7px;
  font-size: 11px;
  max-width: 170px;
}

:root[data-ui="ui2"] .u2-admin-confirm-input {
  width: 100%;
  margin: 18px 0 0;
  padding: 11px;
  color: var(--u2-text);
  background: var(--u2-bg);
  border: 1px solid var(--u2-border);
  border-radius: 7px;
}

:root[data-ui="ui2"] .u2-admin-empty { text-align: center; color: var(--u2-muted); padding: 34px 16px; }

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2-admin-workspace { grid-template-columns: 240px 1fr; }
}

@media (max-width: 700px) {
  :root[data-ui="ui2"] .u2-admin-workspace { grid-template-columns: 1fr; }
  :root[data-ui="ui2"] .u2-admin-user-list { max-height: 230px; }
  :root[data-ui="ui2"] .u2-admin-row { gap: 12px; flex-wrap: wrap; }
  :root[data-ui="ui2"] .u2-admin-section { padding: 18px; }
  :root[data-ui="ui2"] .u2-admin-head .ui2-btn { width: 100%; text-align: center; }
}
```

* [ ] Commit: `git add frontend/src/ui2/admin/admin.css`

### Task 6 — The page

**Files:** `frontend/src/ui2/admin/Ui2AdminUsers.tsx` (create)

`AccountDetail` is keyed by account id so its interface choice resets when another account is selected.

* [ ] Create `frontend/src/ui2/admin/Ui2AdminUsers.tsx`:

```tsx
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
```

* [ ] Commit: `git add frontend/src/ui2/admin/Ui2AdminUsers.tsx`

### Task 7 — Tests

**Files:** `frontend/src/ui2/admin/Ui2AdminUsers.test.tsx` (create)

* [ ] Create `frontend/src/ui2/admin/Ui2AdminUsers.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api, type User } from '../../lib/api/client'
import { Ui2AdminUsers } from './Ui2AdminUsers'

const owner = { id: 'sa1', username: 'root', name: 'Root Owner', role: 'superadmin', region: '' } as User
const europeAdmin = { id: 'a1', username: 'eve', name: 'Eve Admin', role: 'admin', region: 'europe' } as User
const alice = {
  id: 'u1', username: 'alice', name: 'Alice Morgan', role: 'user', region: 'india',
  locked: true, disabled: false, gold_enabled: true, premium: false, ui_mode: 'classic',
} as User
const bob = { id: 'u2', username: 'bob', name: 'Bob Lee', role: 'user', region: 'europe', disabled: true } as User

vi.mock('../../lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api/client')>('../../lib/api/client')
  return {
    ...actual,
    api: {
      adminListUsers: vi.fn(),
      getRegions: vi.fn(),
      adminSetUserRegion: vi.fn(),
      adminPromoteUser: vi.fn(),
      adminDemoteUser: vi.fn(),
      adminResetLockout: vi.fn(),
      adminHideUser: vi.fn(),
      adminReactivateUser: vi.fn(),
      adminDeleteUser: vi.fn(),
      adminSetUserGold: vi.fn(),
      adminSetUserPremium: vi.fn(),
      adminSetUserDeltaFromHistory: vi.fn(),
      adminSetUserUiMode: vi.fn(),
    },
  }
})

const session = vi.hoisted(() => ({ caller: null as User | null }))
vi.mock('../../features/auth/AuthContext', () => {
  const auth = () => ({ user: session.caller, loading: false, logout: vi.fn(), refresh: vi.fn() })
  return { useAuth: auth, useAuthOptional: auth }
})

const show = () => render(<MemoryRouter initialEntries={['/admin']}><Ui2AdminUsers /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  session.caller = owner
  vi.mocked(api.adminListUsers).mockImplementation(async includeHidden => (includeHidden ? [owner, alice, bob] : [owner, alice]))
  vi.mocked(api.getRegions).mockResolvedValue([{ id: 'india', label: 'India' }, { id: 'europe', label: 'Europe' }])
  for (const call of ['adminSetUserRegion', 'adminPromoteUser', 'adminResetLockout', 'adminHideUser', 'adminDeleteUser',
    'adminSetUserGold', 'adminSetUserUiMode'] as const) {
    vi.mocked(api[call]).mockResolvedValue(undefined as never)
  }
})

const pick = async (name: RegExp) => userEvent.click(await screen.findByRole('button', { name }))

describe('Ui2AdminUsers', () => {
  it('shows the super admin all three sections and the account list', async () => {
    show()
    expect(screen.getByRole('heading', { name: 'A clear view of your users.' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Administration sections' })
    expect(within(tabs).getAllByRole('link').map(link => link.textContent)).toEqual(['Users', 'Administrators', 'Branding'])
    expect(await screen.findByRole('button', { name: /Alice Morgan/ })).toBeInTheDocument()
    expect(screen.getByText('2 accounts · all regions')).toBeInTheDocument()
  })

  it('gives a region admin the Users tab only and no feature controls', async () => {
    session.caller = europeAdmin
    vi.mocked(api.adminListUsers).mockResolvedValue([alice])
    show()
    expect(within(screen.getByRole('navigation', { name: 'Administration sections' })).getAllByRole('link')).toHaveLength(1)
    await screen.findByRole('heading', { name: 'Alice Morgan' })
    expect(screen.queryByRole('region', { name: 'Features & interface' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Promote to admin' })).not.toBeInTheDocument()
  })

  it('includes hidden accounts on request', async () => {
    show()
    await screen.findByRole('button', { name: /Alice Morgan/ })
    await userEvent.click(screen.getByLabelText('Include hidden accounts'))
    await waitFor(() => expect(api.adminListUsers).toHaveBeenLastCalledWith(true))
    expect(await screen.findByRole('button', { name: /Bob Lee/ })).toBeInTheDocument()
  })

  it('protects the owner account: no role change, hide or delete', async () => {
    show()
    await pick(/Root Owner/)
    expect(screen.getByRole('heading', { name: 'Root Owner' })).toBeInTheDocument()
    expect(screen.getByText('Your own account and the super-admin account cannot be hidden or deleted.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My portfolio' })).toHaveAttribute('href', '/')
  })

  it('promotes after a confirmation dialog, not a browser prompt', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('button', { name: 'Promote to admin' }))
    const dialog = screen.getByRole('dialog', { name: 'Change role?' })
    expect(api.adminPromoteUser).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Promote to admin' }))
    await waitFor(() => expect(api.adminPromoteUser).toHaveBeenCalledWith('u1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('unlocks recovery for a locked account', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('button', { name: 'Unlock recovery' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Unlock recovery?' })).getByRole('button', { name: 'Unlock recovery' }))
    await waitFor(() => expect(api.adminResetLockout).toHaveBeenCalledWith('u1'))
  })

  it('asks before turning a feature off, then skips the browser prompt', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm')
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Gold tracking' }))
    const dialog = screen.getByRole('dialog', { name: 'Disable gold tracking?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(api.adminSetUserGold).toHaveBeenCalledWith('u1', { enabled: false }))
    expect(browserConfirm).not.toHaveBeenCalled()
  })

  it('saves the chosen interface', async () => {
    show()
    await pick(/Alice Morgan/)
    const save = screen.getByRole('button', { name: 'Save interface' })
    expect(save).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Interface'), 'ui2')
    await userEvent.click(save)
    await waitFor(() => expect(api.adminSetUserUiMode).toHaveBeenCalledWith('u1', { mode: 'ui2' }))
  })

  it('moves an account to another region', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.selectOptions(screen.getByLabelText('Region'), 'europe')
    await waitFor(() => expect(api.adminSetUserRegion).toHaveBeenCalledWith('u1', { region: 'europe' }))
  })

  it('deletes only after the exact username is typed', async () => {
    show()
    await pick(/Alice Morgan/)
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete account' })
    await userEvent.type(within(dialog).getByLabelText('Confirm username'), 'alic')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter the exact username.')
    expect(api.adminDeleteUser).not.toHaveBeenCalled()
    await userEvent.type(within(dialog).getByLabelText('Confirm username'), 'e')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(api.adminDeleteUser).toHaveBeenCalledWith('u1'))
  })

  it('opens another account’s portfolio through act-as', async () => {
    show()
    await pick(/Alice Morgan/)
    expect(screen.getByRole('link', { name: 'Open portfolio' })).toHaveAttribute('href', '/admin/users/u1')
  })
})
```

* [ ] Verify: `cd frontend && npx vitest run src/ui2/admin 2>&1 | tail -4`

Expected: 11 tests pass.

* [ ] Commit: `git add frontend/src/ui2/admin/Ui2AdminUsers.test.tsx`

### Task 8 — Gate and PR

* [ ] `cd frontend && npm run test:run && npx tsc --noEmit && npm run build && npm run lint:changed`

Expected: every suite passes, no type or lint errors, build succeeds.

* [ ] Open the slice 23 PR (`feat/PD-059-admin-users`), label `ui-2.0`; set board row 23; add `useAdminUsers`, `Ui2AdminTabs` and `admin.css` to the registry on merge.

---

## 7. End-to-end verification scenarios

1. As the super admin with `ui_mode = ui2`, `/admin` shows the intro, three section tabs, the context line, the list and the first account's settings.
2. Search narrows the list; Include hidden accounts adds hidden ones.
3. Select your own account: no role change, region select, hide or delete; `My portfolio` links home.
4. Promote a user: a dialog asks first; confirming promotes and the list refreshes.
5. Turn Gold tracking off: one in-app dialog, no browser prompt; confirming disables it.
6. Change the interface and save; the account's interface changes.
7. Delete an account: the button stays ineffective until the exact username is typed.
8. As a region admin, only the Users tab shows and Features & interface is absent.
9. At 390 px the list stacks above the detail with no horizontal overflow.
10. Switch the account to Classic or Glass: `/admin` is today's page.

---

## Done

* [ ] `feat/PD-059-admin-users` merged → slice 23 live
* [ ] Board row 23 merged; registry updated

**Next:** slice 22 (act-as in UI_2.0 under the banner) and slice 24 (Administrators and Branding), both reusing `Ui2AdminTabs` and `admin.css`.
