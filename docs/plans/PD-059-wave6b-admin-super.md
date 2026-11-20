# PD-059: Wave 6b — Administrators and Branding (slice 24)

* **Status**: Amendment in review (this doc). Code below is implemented and verified on the slice branch.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: Render the super admin's Administrators and Branding sections in the UI_2.0 shell, matching the handoff's `perspectiveAdminTabs` sections and `renderBrandingPreview`.
* **Architecture**: The handoff's Administrators tab is the Users layout filtered to administrators, so `Ui2AdminUsers` (slice 23) takes a `section` prop and `useAdminUsers` loads `GET /admin/admins` for it. Branding is a new `Ui2AdminBranding` on the existing `useBranding` hook; its choices are the server's `allowed_fonts`. `AdminManageAdmins` and `AdminBranding` become pure `useUiMode()` dispatchers like every other page.
* **Tech stack**: React 18, TypeScript, Vitest + Testing Library. No new dependencies; no backend change.
* **Spec links**: [wave 6a](PD-059-wave6a-admin-users.md), [PRD-015](../prds/PRD-015-ui-2.md), [handoff HTML](../visuals/PD-059-ui-2-reference.html) (`perspectiveAdminTabs`, `renderAdminSection`, `renderBrandingPreview`), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Stacks on slice 23 (`Ui2AdminUsers`, `Ui2AdminTabs`, `admin.css`, `useAdminUsers`). Reuses `useBranding`, `FONT_CATALOG`, `useAdminActions`.

Roadmap R18 ("allowed Branding fonts from the server, only if not already exposed") is unnecessary: `GET /branding` already returns `allowed_fonts`, and this page renders whatever it lists. Adding DM Sans and Manrope is therefore a backend-only change to the font catalogue (open question below), not a dependency of this slice.

---

## 2. Handoff fidelity reference

**Administrators**: same intro, tabs and list/detail as Users, listing administrators; search label `Search administrators`; no `Include hidden accounts`.

**Branding**: intro `Make Portfolio feel like yours.` / `Choose a typeface for the shared application look.`; the section tabs with Branding active; a panel with eyebrow `SUPER ADMIN · BRANDING`, `h2` `Find your portfolio’s typeface`, a note, and a `<n> FONTS` badge; an `Applied: <font>` status line; a `Brand font` fieldset of font cards, each a radio with the font name and a sample (`Aa Bb 0123`, `Portfolio performance`, `₹1,23,456.78 · €2,610.50`, `+12.34% · −0.56%`) set in that font; the checked card highlighted; a primary apply button.

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `frontend/src/features/admin/useAdminUsers.ts` | `section` parameter: `users` or `admins` |
| Modify | `frontend/src/features/admin/AdminManageAdmins.tsx` | Dispatcher; Classic/Glass body on `useAdminUsers('admins')` |
| Modify | `frontend/src/features/admin/AdminBranding.tsx` | Dispatcher; Classic/Glass body unchanged |
| Modify | `frontend/src/features/admin/AdminBranding.test.tsx` | Its `lib/uiMode` mock also returns `useUiMode` (no assertion changes) |
| Modify | `frontend/src/ui2/admin/Ui2AdminUsers.tsx` | `section` prop |
| Modify | `frontend/src/ui2/admin/admin.css` | Branding card styles |
| Create | `frontend/src/ui2/admin/Ui2AdminBranding.tsx` (+ test) | Branding page |
| Modify | `frontend/src/ui2/admin/Ui2AdminUsers.test.tsx` | Administrators section case |

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `feat/PD-059-admin-super` | Slice 24, stacked on slice 23 | Classic and Glass admin tests pass; their only change is a mock gaining `useUiMode` | The super admin manages admins and the app font in UI_2.0 | `Ui2AdminBranding.test.tsx`, the Administrators case |

---

## 5. Owner decisions and open questions

### Decisions taken in this plan (reversible)

* Fonts are not previewed against the whole page before saving: the handoff's "apply to preview" was a mockup-only device, and the production choice is deployment-wide, so the button is `Apply font` and saves at once with a toast.
* The handoff's per-font descriptions are not shown; the server's options carry no description.
* `Restore original typography` is omitted: the mockup's original faces (DM Sans / Manrope) are not yet server choices.

### Open question — awaiting owner

```text
ID: PD-059-Q-6b-1
Raised by / date: Claude / 2026-11-20
Affected slice and files: backend font catalogue (domain/branding.go,
  controllers/branding.go, portfolio-api.yaml enum), frontend base.css
  fallbacks and index.html font link
Existing behaviour and evidence: allowed fonts are Roboto and JetBrains Mono.
  Each stack names a metric-adjusted fallback face (PD-058 Task 15) whose
  size-adjust / ascent / descent overrides come from the font files' hhea and
  hmtx tables.
What is missing or ambiguous: DM Sans and Manrope need those metrics; the
  font files must be downloaded from Google Fonts to read them.
Options and consequences:
  (a) Approve downloading the two font files; add both fonts with measured
      fallbacks (backend PR, then a one-line frontend link change).
  (b) Add both fonts without fallback faces — a visible layout shift while
      they load, breaking the PD-058 rule.
Independent work that can continue: all of slice 24.
Owner response (exact):
Status: awaiting owner
```

---

## 6. Task list

### Task 1 — `useAdminUsers` serves both sections

**Files:** `frontend/src/features/admin/useAdminUsers.ts` (modify)

* [ ] `frontend/src/features/admin/useAdminUsers.ts`, change 1 of 2. Current code:

```ts
import { api, ApiError, type Region, type User } from '../../lib/api/client'

// useAdminUsers loads Admin → Users for every interface (PD-059 slice 23):
// the caller's scoped account list (the server applies region scope), the
// region catalogue, and whether hidden accounts are included.
export function useAdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
```

Replacement:

```ts
import { api, ApiError, type Region, type User } from '../../lib/api/client'

export type AdminSection = 'users' | 'admins'

// useAdminUsers loads an Administration account list for every interface
// (PD-059 slices 23–24): the caller's scoped users (the server applies region
// scope) or, for the super admin, the administrators; plus the region
// catalogue and, for users, whether hidden accounts are included.
export function useAdminUsers(section: AdminSection = 'users') {
  const [users, setUsers] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
```

* [ ] `frontend/src/features/admin/useAdminUsers.ts`, change 2 of 2. Current code:

```ts
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
```

Replacement:

```ts
    setErr(null)
    try {
      setUsers(section === 'admins' ? await api.adminListAdmins() : await api.adminListUsers(includeHidden))
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : section === 'admins' ? 'Failed to load admins' : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [section, includeHidden])

  useEffect(() => { void load() }, [load])
```

* [ ] Commit: `git add frontend/src/features/admin/useAdminUsers.ts`

### Task 2 — `Ui2AdminUsers` takes a section

**Files:** `frontend/src/ui2/admin/Ui2AdminUsers.tsx` (modify)

* [ ] `frontend/src/ui2/admin/Ui2AdminUsers.tsx`, change 1 of 3. Current code:

```tsx
import { FEATURE_SWITCHES, initials, statusOf, type FeatureSwitch } from '../../features/admin/AdminUserSettings'
import { useAdminActions } from '../../features/admin/useAdminActions'
import { useAdminUsers } from '../../features/admin/useAdminUsers'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { Ui2Dialog } from '../shell/Ui2Dialog'
```

Replacement:

```tsx
import { FEATURE_SWITCHES, initials, statusOf, type FeatureSwitch } from '../../features/admin/AdminUserSettings'
import { useAdminActions } from '../../features/admin/useAdminActions'
import { useAdminUsers, type AdminSection } from '../../features/admin/useAdminUsers'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { Ui2Dialog } from '../shell/Ui2Dialog'
```

* [ ] `frontend/src/ui2/admin/Ui2AdminUsers.tsx`, change 2 of 3. Current code:

```tsx
// Classic and Glass already use (useAdminActions); only the layout differs,
// and confirmations are dialogs instead of browser prompts.
export function Ui2AdminUsers() {
  const { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel } = useAdminUsers()
  const { caller, busy, runAction, toggleFeature, setUiMode } = useAdminActions(load)
  const [query, setQuery] = useState('')
```

Replacement:

```tsx
// Classic and Glass already use (useAdminActions); only the layout differs,
// and confirmations are dialogs instead of browser prompts.
// section 'admins' is the super admin's Administrators tab: the same layout
// over the administrator list, which has no hidden accounts to include.
export function Ui2AdminUsers({ section = 'users' }: { section?: AdminSection }) {
  const { users, regions, includeHidden, setIncludeHidden, loading, err, load, regionLabel } = useAdminUsers(section)
  const listLabel = section === 'admins' ? 'Administrators' : 'Users'
  const { caller, busy, runAction, toggleFeature, setUiMode } = useAdminActions(load)
  const [query, setQuery] = useState('')
```

* [ ] `frontend/src/ui2/admin/Ui2AdminUsers.tsx`, change 3 of 3. Current code:

```tsx

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
```

Replacement:

```tsx

        <div className="u2-admin-workspace">
          <section className="ui2-panel u2-admin-list" aria-label={listLabel}>
            <div className="u2-admin-list-tools">
              <label htmlFor="u2-admin-search">Search {listLabel.toLowerCase()}</label>
              <input id="u2-admin-search" type="search" placeholder="Name or username" value={query}
                onChange={event => setQuery(event.target.value)} />
              {section === 'users' && (
                <label className="u2-admin-check">
                  <input type="checkbox" checked={includeHidden} onChange={event => setIncludeHidden(event.target.checked)} />
                  Include hidden accounts
                </label>
              )}
            </div>
            <div className="u2-admin-user-list">
```

* [ ] Commit: `git add frontend/src/ui2/admin/Ui2AdminUsers.tsx`

### Task 3 — Dispatchers

**Files:** `frontend/src/features/admin/AdminManageAdmins.tsx`, `AdminBranding.tsx`, `AdminBranding.test.tsx` (modify)

Only `useUiMode()` runs in each dispatcher. `AdminBranding.test.tsx` replaces the whole `lib/uiMode` module, so its mock must now also provide `useUiMode`.

* [ ] `frontend/src/features/admin/AdminManageAdmins.tsx`, change 1 of 1. Current code:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type Region, type User } from '../../lib/api/client'
import { useUiRevamp } from '../../lib/uiMode'
import { AdminShell } from './AdminShell'
import { AdminUserSettings } from './AdminUserSettings'
import { useAdminActions } from './useAdminActions'

export default function AdminManageAdmins() {
  const [admins, setAdmins] = useState<User[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const revamp = useUiRevamp()

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const data = await api.adminListAdmins()
      setAdmins(data)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load admins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void api.getRegions().then(setRegions).catch(console.error) }, [])

  const { caller, busy, runAction, toggleFeature, setUiMode } = useAdminActions(load)
  const regionLabel = (id: string) => regions.find(region => region.id === id)?.label ?? id

  const setRegionFor = async (listedAdmin: User) => {
```

Replacement:

```tsx
import { Link } from 'react-router-dom'
import { api, type User } from '../../lib/api/client'
import { useUiMode, useUiRevamp } from '../../lib/uiMode'
import { Ui2AdminUsers } from '../../ui2/admin/Ui2AdminUsers'
import { AdminShell } from './AdminShell'
import { AdminUserSettings } from './AdminUserSettings'
import { useAdminActions } from './useAdminActions'
import { useAdminUsers } from './useAdminUsers'

// AdminManageAdmins is a pure dispatcher: only useUiMode() lives here, so
// the hook count is stable across mode changes.
export default function AdminManageAdmins() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2AdminUsers section="admins" />
  return <ClassicAdminManageAdmins />
}

function ClassicAdminManageAdmins() {
  const { users: admins, regions, loading, err, load, regionLabel } = useAdminUsers('admins')
  const revamp = useUiRevamp()

  const { caller, busy, runAction, toggleFeature, setUiMode } = useAdminActions(load)

  const setRegionFor = async (listedAdmin: User) => {
```

* [ ] `frontend/src/features/admin/AdminBranding.tsx`, change 1 of 1. Current code:

```tsx
import { ApiError, type BrandingFont } from '../../lib/api/client'
import { FONT_CATALOG, useBranding } from '../../lib/useBranding'
import { useUiRevamp } from '../../lib/uiMode'
import { AdminShell } from './AdminShell'

export default function AdminBranding() {
  const { settings, font, loading, error, setFont } = useBranding()
  const [saving, setSaving] = useState<BrandingFont | null>(null)
```

Replacement:

```tsx
import { ApiError, type BrandingFont } from '../../lib/api/client'
import { FONT_CATALOG, useBranding } from '../../lib/useBranding'
import { useUiMode, useUiRevamp } from '../../lib/uiMode'
import { Ui2AdminBranding } from '../../ui2/admin/Ui2AdminBranding'
import { AdminShell } from './AdminShell'

// AdminBranding is a pure dispatcher: only useUiMode() lives here, so the
// hook count is stable across mode changes.
export default function AdminBranding() {
  const ui2 = useUiMode() === 'ui2'
  if (ui2) return <Ui2AdminBranding />
  return <ClassicAdminBranding />
}

function ClassicAdminBranding() {
  const { settings, font, loading, error, setFont } = useBranding()
  const [saving, setSaving] = useState<BrandingFont | null>(null)
```

* [ ] `frontend/src/features/admin/AdminBranding.test.tsx`, change 1 of 1. Current code:

```tsx
// Whether the signed-in account has the glass UI (PD-054).
const glass = vi.hoisted(() => ({ on: false }))
vi.mock('../../lib/uiMode', () => ({ useUiRevamp: () => glass.on }))

vi.mock('./AdminShell', () => ({
```

Replacement:

```tsx
// Whether the signed-in account has the glass UI (PD-054).
const glass = vi.hoisted(() => ({ on: false }))
vi.mock('../../lib/uiMode', () => ({ useUiRevamp: () => glass.on, useUiMode: () => 'classic' }))

vi.mock('./AdminShell', () => ({
```

* [ ] Verify: `cd frontend && npx vitest run src/features/admin 2>&1 | tail -4`

Expected: every Classic and Glass admin test passes.

* [ ] Commit: `git add frontend/src/features/admin/`

### Task 4 — Branding page and styles

**Files:** `frontend/src/ui2/admin/Ui2AdminBranding.tsx` (create), `admin.css` (modify)

* [ ] Create `frontend/src/ui2/admin/Ui2AdminBranding.tsx`:

```tsx
import { useState } from 'react'
import { ApiError, type BrandingFont } from '../../lib/api/client'
import { FONT_CATALOG, useBranding } from '../../lib/useBranding'
import { toast } from '../../lib/toast'
import { Ui2PageIntro } from '../shell/Ui2PageIntro'
import { Ui2AdminTabs } from './Ui2AdminUsers'
import './admin.css'

// The handoff's Branding section (super admin): pick a typeface by comparing
// letters and financial figures, then apply it for every user. The choices
// are the server's allowed_fonts, so a font added on the server appears here
// with no frontend change.
export function Ui2AdminBranding() {
  const { settings, font, loading, error, setFont } = useBranding()
  const options = settings?.allowed_fonts ?? FONT_CATALOG
  const [choice, setChoice] = useState<BrandingFont | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const selected = choice ?? font
  const appliedLabel = options.find(option => option.id === font)?.label ?? '—'

  const apply = async () => {
    if (selected === font) return
    setSaving(true)
    setSaveError(null)
    try {
      await setFont(selected)
      setChoice(null)
      toast(`${options.find(option => option.id === selected)?.label ?? selected} applied for every user`, 'success')
    } catch (failure) {
      setSaveError(failure instanceof ApiError ? failure.message : 'Could not save branding')
    } finally {
      setSaving(false)
    }
  }

  const errorText = saveError ?? error

  return (
    <>
      <Ui2PageIntro title="Make Portfolio feel like yours." subtitle="Choose a typeface for the shared application look." />
      <section className="u2-admin-root" aria-label="Administration">
        <Ui2AdminTabs isSuper />
        <section className="ui2-panel u2-admin-section">
          <div className="u2-brand-heading">
            <div>
              <span className="u2-brand-eyebrow">SUPER ADMIN · BRANDING</span>
              <h2>Find your portfolio’s typeface</h2>
              <p className="ui2-note">Select a font, compare its letters and financial figures, then apply it for every user.</p>
            </div>
            <span className="u2-brand-badge">{options.length} FONTS</span>
          </div>
          <p className="u2-brand-applied" role="status">Applied: {appliedLabel}</p>
          {errorText && <p className="ui2-note" role="alert" style={{ color: 'var(--u2-red)' }}>{errorText}</p>}
          <form onSubmit={event => { event.preventDefault(); void apply() }} aria-label="Brand font settings">
            <fieldset className="u2-brand-fonts" disabled={loading || saving}>
              <legend>Brand font</legend>
              {options.map(option => (
                <label key={option.id} className="u2-brand-card">
                  <span className="u2-brand-choice">
                    <input type="radio" name="font" value={option.id} checked={selected === option.id}
                      onChange={() => setChoice(option.id)} />
                    <strong>{option.label}</strong>
                  </span>
                  <span className="u2-brand-sample" style={{ fontFamily: option.css_family }} aria-hidden>
                    <span className="u2-brand-alphabet">Aa Bb 0123</span>
                    <span>Portfolio performance</span>
                    <span>₹1,23,456.78 · €2,610.50</span>
                    <span>+12.34% · −0.56%</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="ui2-dialog-actions">
              <button type="submit" className="ui2-btn ui2-btn-primary" disabled={saving || selected === font}>
                {saving ? 'Applying…' : 'Apply font'}
              </button>
            </div>
          </form>
        </section>
      </section>
    </>
  )
}
```

* [ ] `frontend/src/ui2/admin/admin.css`, change 1 of 1. Current code:

```css
:root[data-ui="ui2"] .u2-admin-empty { text-align: center; color: var(--u2-muted); padding: 34px 16px; }

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2-admin-workspace { grid-template-columns: 240px 1fr; }
```

Replacement:

```css
:root[data-ui="ui2"] .u2-admin-empty { text-align: center; color: var(--u2-muted); padding: 34px 16px; }

/* Branding (handoff .perspective-brand-* / .perspective-font-*) */
:root[data-ui="ui2"] .u2-brand-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
:root[data-ui="ui2"] .u2-brand-heading h2 { font: 700 24px var(--u2-font-display); margin: 12px 0 8px; }
:root[data-ui="ui2"] .u2-brand-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: var(--u2-muted); }

:root[data-ui="ui2"] .u2-brand-badge {
  background: var(--u2-accentsoft);
  color: var(--u2-accent);
  border-radius: 5px;
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .7px;
  white-space: nowrap;
}

:root[data-ui="ui2"] .u2-brand-applied {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--u2-border);
  background: var(--u2-accentsoft);
  font-size: 12px;
}

:root[data-ui="ui2"] .u2-brand-fonts {
  border: 0;
  padding: 0;
  margin: 20px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

:root[data-ui="ui2"] .u2-brand-fonts legend { font-weight: 600; margin-bottom: 12px; }

:root[data-ui="ui2"] .u2-brand-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--u2-border);
  border-radius: 10px;
  background: var(--u2-bg);
  cursor: pointer;
}

:root[data-ui="ui2"] .u2-brand-card:has(input:checked) { border-color: var(--u2-accent); background: var(--u2-accentsoft); }
:root[data-ui="ui2"] .u2-brand-card:focus-within { outline: 3px solid var(--u2-accent); outline-offset: 3px; }
:root[data-ui="ui2"] .u2-brand-choice { display: flex; align-items: center; gap: 9px; }
:root[data-ui="ui2"] .u2-brand-choice input { accent-color: var(--u2-accent); min-width: 18px; min-height: 18px; }

:root[data-ui="ui2"] .u2-brand-sample {
  display: grid;
  gap: 10px;
  padding-top: 10px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

:root[data-ui="ui2"] .u2-brand-alphabet { font-size: 30px; font-weight: 600; }

@media (max-width: 1050px) {
  :root[data-ui="ui2"] .u2-admin-workspace { grid-template-columns: 240px 1fr; }
```

* [ ] Commit: `git add frontend/src/ui2/admin/Ui2AdminBranding.tsx frontend/src/ui2/admin/admin.css`

### Task 5 — Tests

**Files:** `frontend/src/ui2/admin/Ui2AdminBranding.test.tsx` (create), `Ui2AdminUsers.test.tsx` (modify)

* [ ] Create `frontend/src/ui2/admin/Ui2AdminBranding.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Ui2AdminBranding } from './Ui2AdminBranding'

const branding = vi.hoisted(() => ({
  font: 'roboto' as string,
  setFont: vi.fn(),
  allowed: [
    { id: 'roboto', label: 'Roboto', css_family: 'Roboto, "Roboto Fallback", Arial, sans-serif' },
    { id: 'jetbrains_mono', label: 'JetBrains Mono', css_family: '"JetBrains Mono", "JetBrains Mono Fallback", monospace' },
  ],
}))

vi.mock('../../lib/useBranding', () => ({
  FONT_CATALOG: [],
  useBranding: () => ({
    settings: { font: branding.font, allowed_fonts: branding.allowed },
    font: branding.font,
    loading: false,
    error: null,
    setFont: branding.setFont,
  }),
}))

const show = () => render(<MemoryRouter initialEntries={['/admin/branding']}><Ui2AdminBranding /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  branding.setFont.mockResolvedValue(undefined)
})

describe('Ui2AdminBranding', () => {
  it('offers every server-allowed font with the applied one marked', () => {
    show()
    expect(screen.getByRole('heading', { name: 'Make Portfolio feel like yours.' })).toBeInTheDocument()
    expect(screen.getByText('2 FONTS')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Applied: Roboto')
    expect(screen.getByRole('radio', { name: 'Roboto' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Apply font' })).toBeDisabled()
  })

  it('applies the chosen font for every user', async () => {
    show()
    await userEvent.click(screen.getByRole('radio', { name: 'JetBrains Mono' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply font' }))
    await waitFor(() => expect(branding.setFont).toHaveBeenCalledWith('jetbrains_mono'))
  })

  it('shows a save failure without losing the choice', async () => {
    const { ApiError } = await import('../../lib/api/client')
    branding.setFont.mockRejectedValueOnce(new ApiError(403, 'super admin only'))
    show()
    await userEvent.click(screen.getByRole('radio', { name: 'JetBrains Mono' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply font' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('super admin only')
    expect(screen.getByRole('radio', { name: 'JetBrains Mono' })).toBeChecked()
  })
})
```

* [ ] `frontend/src/ui2/admin/Ui2AdminUsers.test.tsx`, change 1 of 2. Current code:

```tsx
    api: {
      adminListUsers: vi.fn(),
      getRegions: vi.fn(),
      adminSetUserRegion: vi.fn(),
```

Replacement:

```tsx
    api: {
      adminListUsers: vi.fn(),
      adminListAdmins: vi.fn(),
      getRegions: vi.fn(),
      adminSetUserRegion: vi.fn(),
```

* [ ] `frontend/src/ui2/admin/Ui2AdminUsers.test.tsx`, change 2 of 2. Current code:

```tsx
  })

  it('opens another account’s portfolio through act-as', async () => {
    show()
```

Replacement:

```tsx
  })

  it('lists administrators in the Administrators section, with no hidden toggle', async () => {
    vi.mocked(api.adminListAdmins).mockResolvedValue([owner, europeAdmin])
    render(<MemoryRouter initialEntries={['/admin/admins']}><Ui2AdminUsers section="admins" /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /Eve Admin/ })).toBeInTheDocument()
    expect(api.adminListUsers).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Search administrators')).toBeInTheDocument()
    expect(screen.queryByLabelText('Include hidden accounts')).not.toBeInTheDocument()
    await pick(/Eve Admin/)
    expect(screen.getByRole('button', { name: 'Demote to user' })).toBeInTheDocument()
  })

  it('opens another account’s portfolio through act-as', async () => {
    show()
```

* [ ] Verify: `cd frontend && npx vitest run src/ui2/admin 2>&1 | tail -4`

Expected: 2 files, 15 tests pass.

* [ ] Commit: `git add frontend/src/ui2/admin/`

### Task 6 — Gate and PR

* [ ] `cd frontend && npm run test:run && npx tsc --noEmit && npm run build && npm run lint:changed`
* [ ] Open the slice 24 PR (base `feat/PD-059-admin-users`), label `ui-2.0`; set board row 24.

---

## 7. End-to-end verification scenarios

1. As the super admin in UI_2.0, the Administrators tab lists the administrators; selecting one offers Demote to user and Region.
2. The Branding tab shows one card per allowed font, the applied one checked; Apply font is disabled until another is chosen.
3. Choose another font and apply: a toast confirms and every page switches font; reload keeps it.
4. A region admin cannot reach either tab (the routes stay super-admin only).
5. Switch the account to Classic or Glass: both pages are today's.

---

## Done

* [ ] `feat/PD-059-admin-super` merged → slice 24 live
* [ ] PD-059-Q-6b-1 answered

**Next:** slice 25 (Profile), slice 22 (act-as), slice 26 (auth screens).
