# PD-059: Wave 6d — Act-as in UI_2.0 (slice 22)

* **Status**: Amendment in review (this doc). Code below is implemented and verified on the slice branch.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: Keep an admin's act-as session coherent in UI_2.0: a persistent banner names the viewed account, the sidebar keeps the supported pages on that account, and the unsupported ones say why.
* **Architecture**: A pure helper (`actAsNav.ts`) reads the viewed account from the act-as route and maps each sidebar item: Overview, Transactions and Dividends to the account's act-as routes; History and Gold to nothing (outside act-as); Administration and Branding unchanged. `Ui2Shell` renders unmapped items as dimmed buttons that explain themselves. The banner (`Ui2ActAsBanner`, from #373) now also heads the UI_2.0 Overview in place of the Classic act-as strip.
* **Tech stack**: React 18, TypeScript, React Router `matchPath`, Vitest + Testing Library. No backend change.
* **Spec links**: [PRD-015](../prds/PRD-015-ui-2.md) §4.9, [handoff HTML](../visuals/PD-059-ui-2-reference.html) (`adminUpdateBanner`, `adminActAs`, the act-as nav guard), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Stacks on #373, which adds `Ui2ActAsBanner` and shows it on the UI_2.0 Transactions and Dividends pages. Uses the existing act-as routes (`/admin/users/:id`, `/transactions`, `/dividends`) and `ActAsShell`.

---

## 2. Handoff fidelity reference

* **Banner** (`actas-banner`): sticky, gold-bordered; `Viewing <account>` and a muted line; `Exit act-as` back to Administration.
* **Supported routes**: "Act-as persists only across its supported Overview/Transactions/Dividends paths" (owner, 2026-11-18). Selecting History or Gold during act-as shows `<page> is outside the supported act-as routes. Exit act-as to open your own page.` and stays put.
* Gold stays out of act-as (owner decision).

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Create | `frontend/src/ui2/shell/actAsNav.ts` (+ test) | `actAsUserIdOf`, `actAsLink` |
| Modify | `frontend/src/ui2/shell/Ui2Shell.tsx` (+ test) | Act-as nav mapping; outside items as explaining buttons |
| Modify | `frontend/src/ui2/ui2.css` | `.ui2-nav-outside` |
| Modify | `frontend/src/ui2/shell/Ui2ActAsBanner.tsx` | "Changes save to this account" line |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | Banner on the UI_2.0 Overview; Classic strip and header shortcuts hidden in UI_2.0; title no longer doubles "'s portfolio" |

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `feat/PD-059-act-as` | Slice 22, stacked on #373 | Outside act-as the nav is identical (existing shell tests); Classic and Glass act-as keep their strip and header links | An admin always sees whose data they are changing and cannot drift onto their own History or Gold mid-session | `actAsNav.test.ts`, the two act-as shell cases |

---

## 5. Owner decisions and open questions

### Decisions taken in this plan (reversible)

* History and Gold stay listed but dimmed during act-as (rather than hidden) so the sidebar does not change shape; selecting one explains why, as the handoff's toast does.
* The Classic strip's "all changes will save to their portfolio" warning moves into the banner's second line.

### Open questions

None.

---

## 6. Task list

### Task 1 — The mapping

**Files:** `frontend/src/ui2/shell/actAsNav.ts`, `actAsNav.test.ts` (create)

* [ ] Create `frontend/src/ui2/shell/actAsNav.ts`:

```ts
import { matchPath } from 'react-router-dom'

// Act-as in UI_2.0 (PD-059 slice 22): while an admin views another account,
// the portfolio pages that support act-as keep pointing at that account, and
// the ones that do not (History, Gold: owner decision, gold stays out) say so
// instead of silently switching to the admin's own data.

const ACT_AS_ROUTES: Record<string, (userId: string) => string> = {
  '/': userId => `/admin/users/${userId}`,
  '/transactions': userId => `/admin/users/${userId}/transactions`,
  '/dividends': userId => `/admin/users/${userId}/dividends`,
}

const OUTSIDE_ACT_AS = new Set(['/history', '/gold'])

// actAsUserIdOf is the viewed account's id when pathname is an act-as route.
export function actAsUserIdOf(pathname: string): string | null {
  return matchPath('/admin/users/:userId/*', pathname)?.params.userId ?? null
}

// actAsLink is where a nav item leads during act-as: the target's page, null
// when the page is outside act-as, or the item's own route (Administration,
// Branding) which leaves act-as.
export function actAsLink(to: string, userId: string): string | null {
  if (OUTSIDE_ACT_AS.has(to)) return null
  return ACT_AS_ROUTES[to]?.(userId) ?? to
}
```

* [ ] Create `frontend/src/ui2/shell/actAsNav.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { actAsLink, actAsUserIdOf } from './actAsNav'

describe('actAsUserIdOf', () => {
  it('finds the viewed account on every act-as route', () => {
    expect(actAsUserIdOf('/admin/users/u9')).toBe('u9')
    expect(actAsUserIdOf('/admin/users/u9/transactions')).toBe('u9')
    expect(actAsUserIdOf('/admin/users/u9/dividends')).toBe('u9')
  })

  it('is null outside act-as', () => {
    expect(actAsUserIdOf('/admin')).toBeNull()
    expect(actAsUserIdOf('/transactions')).toBeNull()
  })
})

describe('actAsLink', () => {
  it('keeps Overview, Transactions and Dividends on the viewed account', () => {
    expect(actAsLink('/', 'u9')).toBe('/admin/users/u9')
    expect(actAsLink('/transactions', 'u9')).toBe('/admin/users/u9/transactions')
    expect(actAsLink('/dividends', 'u9')).toBe('/admin/users/u9/dividends')
  })

  it('marks History and Gold as outside act-as', () => {
    expect(actAsLink('/history', 'u9')).toBeNull()
    expect(actAsLink('/gold', 'u9')).toBeNull()
  })

  it('leaves Administration and Branding as they are', () => {
    expect(actAsLink('/admin', 'u9')).toBe('/admin')
    expect(actAsLink('/admin/branding', 'u9')).toBe('/admin/branding')
  })
})
```

* [ ] Commit: `git add frontend/src/ui2/shell/actAsNav.ts frontend/src/ui2/shell/actAsNav.test.ts`

### Task 2 — The shell

**Files:** `frontend/src/ui2/shell/Ui2Shell.tsx`, `Ui2Shell.test.tsx`, `frontend/src/ui2/ui2.css` (modify)

The most-specific-link rule now compares mapped hrefs, so on `/admin/users/:id/transactions` Transactions is current, not Administration.

* [ ] `frontend/src/ui2/shell/Ui2Shell.tsx`, change 1 of 3. Current code:

```tsx
// Dialog buttons, including the older modals a UI_2.0 account still reaches.
import '../dialogButtons.css'
import { useCyberEntrance } from './useCyberEntrance'
import { Ui2Toaster } from './Ui2Toaster'
```

Replacement:

```tsx
// Dialog buttons, including the older modals a UI_2.0 account still reaches.
import '../dialogButtons.css'
import { toast } from '../../lib/toast'
import { actAsLink, actAsUserIdOf } from './actAsNav'
import { useCyberEntrance } from './useCyberEntrance'
import { Ui2Toaster } from './Ui2Toaster'
```

* [ ] `frontend/src/ui2/shell/Ui2Shell.tsx`, change 2 of 3. Current code:

```tsx
  const items = [...navItems(Boolean(user?.gold_enabled), isAdmin), ...(user?.role === 'superadmin' ? [BRANDING] : [])]
  const labelOf = (to: string, label: string) => LABELS[to] ?? label
  const matches = (item: NavItem) => (item.end ? pathname === item.to : pathname.startsWith(item.to))
  // The most specific link wins: /admin/branding is Branding, not Administration.
  const current = items.filter(matches).sort((first, second) => second.to.length - first.to.length)[0]
  const pageLabel = current ? labelOf(current.to, current.label) : pathname.startsWith('/profile') ? 'Profile & security' : ''
  const userName = user?.name || user?.username || 'Account'
```

Replacement:

```tsx
  const items = [...navItems(Boolean(user?.gold_enabled), isAdmin), ...(user?.role === 'superadmin' ? [BRANDING] : [])]
  const labelOf = (to: string, label: string) => LABELS[to] ?? label
  // During act-as each item leads to the viewed account's page, or nowhere
  // (null) when that page is outside act-as.
  const actAsUserId = actAsUserIdOf(pathname)
  const links = items.map(item => ({ item, href: actAsUserId ? actAsLink(item.to, actAsUserId) : item.to }))
  const matches = (item: NavItem, href: string) => (item.end ? pathname === href : pathname.startsWith(href))
  // The most specific link wins: /admin/branding is Branding, not Administration.
  const current = links
    .filter((link): link is { item: NavItem; href: string } => link.href !== null && matches(link.item, link.href))
    .sort((first, second) => second.href.length - first.href.length)[0]?.item
  const pageLabel = current ? labelOf(current.to, current.label) : pathname.startsWith('/profile') ? 'Profile & security' : ''
  const userName = user?.name || user?.username || 'Account'
```

* [ ] `frontend/src/ui2/shell/Ui2Shell.tsx`, change 3 of 3. Current code:

```tsx
        <div className="ui2-nav-label">WORKSPACE</div>
        <nav className="ui2-nav" aria-label="Main navigation">
          {items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setDrawerOpen(false)}
              className={() => (current?.to === item.to ? 'active' : undefined)}
              aria-current={current?.to === item.to ? 'page' : 'false'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{ICON_PATHS[item.to]}</svg>
              {labelOf(item.to, item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="ui2-sidebar-bottom">
```

Replacement:

```tsx
        <div className="ui2-nav-label">WORKSPACE</div>
        <nav className="ui2-nav" aria-label="Main navigation">
          {links.map(({ item, href }) => {
            const icon = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{ICON_PATHS[item.to]}</svg>
            const label = labelOf(item.to, item.label)
            if (href === null) {
              return (
                <button key={item.to} type="button" className="ui2-nav-outside" aria-disabled="true"
                  onClick={() => toast(`${label} is outside act-as. Exit act-as to open your own ${label}.`)}>
                  {icon}{label}
                </button>
              )
            }
            return (
              <NavLink key={item.to} to={href} end={item.end} onClick={() => setDrawerOpen(false)}
                className={() => (current?.to === item.to ? 'active' : undefined)}
                aria-current={current?.to === item.to ? 'page' : 'false'}>
                {icon}{label}
              </NavLink>
            )
          })}
        </nav>
        <div className="ui2-sidebar-bottom">
```

* [ ] `frontend/src/ui2/shell/Ui2Shell.test.tsx`, change 1 of 1. Current code:

```tsx
  })

  it('names the current page in the breadcrumb', () => {
    renderShell({ role: 'user' }, '/history')
```

Replacement:

```tsx
  })

  it('keeps Overview, Transactions and Dividends on the viewed account during act-as', () => {
    renderShell({ role: 'admin', gold_enabled: true }, '/admin/users/u9/transactions')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/admin/users/u9')
    expect(within(nav).getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/admin/users/u9/transactions')
    expect(within(nav).getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Dividends' })).toHaveAttribute('href', '/admin/users/u9/dividends')
    expect(within(nav).getByRole('link', { name: 'Administration' })).not.toHaveAttribute('aria-current', 'page')
  })

  it('keeps History and Gold out of act-as and says why', () => {
    renderShell({ role: 'admin', gold_enabled: true }, '/admin/users/u9')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(nav).queryByRole('link', { name: 'History' })).not.toBeInTheDocument()
    const history = within(nav).getByRole('button', { name: 'History' })
    expect(history).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(history)
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/users/u9')
    expect(within(nav).getByRole('button', { name: 'Gold' })).toBeInTheDocument()
  })

  it('names the current page in the breadcrumb', () => {
    renderShell({ role: 'user' }, '/history')
```

* [ ] `frontend/src/ui2/ui2.css`, change 1 of 2. Current code:

```css
}

:root[data-ui="ui2"] .ui2-nav a {
  display: flex;
  align-items: center;
```

Replacement:

```css
}

:root[data-ui="ui2"] .ui2-nav a,
:root[data-ui="ui2"] .ui2-nav .ui2-nav-outside {
  display: flex;
  align-items: center;
```

* [ ] `frontend/src/ui2/ui2.css`, change 2 of 2. Current code:

```css
}

:root[data-ui="ui2"] .ui2-nav a svg {
  width: 19px;
  height: 19px;
```

Replacement:

```css
}

/* A page outside act-as (PD-059 slice 22): visible but dimmed; selecting it
   explains why instead of switching to the admin's own data. */
:root[data-ui="ui2"] .ui2-nav .ui2-nav-outside {
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  opacity: .5;
  cursor: not-allowed;
}

:root[data-ui="ui2"] .ui2-nav a svg,
:root[data-ui="ui2"] .ui2-nav .ui2-nav-outside svg {
  width: 19px;
  height: 19px;
```

* [ ] Commit: `git add frontend/src/ui2/shell/Ui2Shell.tsx frontend/src/ui2/shell/Ui2Shell.test.tsx frontend/src/ui2/ui2.css`

### Task 3 — Banner on the Overview

**Files:** `frontend/src/features/dashboard/DashboardPage.tsx`, `frontend/src/ui2/shell/Ui2ActAsBanner.tsx` (modify)

* [ ] `frontend/src/features/dashboard/DashboardPage.tsx`, change 1 of 4. Current code:

```tsx
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Ui2PageIntro } from '../../ui2/shell/Ui2PageIntro'
import SummaryCards from '../../components/SummaryCards'
import { PortfolioHero } from '../../components/PortfolioHero'
```

Replacement:

```tsx
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Ui2PageIntro } from '../../ui2/shell/Ui2PageIntro'
import { Ui2ActAsBanner } from '../../ui2/shell/Ui2ActAsBanner'
import SummaryCards from '../../components/SummaryCards'
import { PortfolioHero } from '../../components/PortfolioHero'
```

* [ ] `frontend/src/features/dashboard/DashboardPage.tsx`, change 2 of 4. Current code:

```tsx
  // the sidebar, so the header's copies are hidden there. In act-as the page
  // links stay: they point at the target user's pages, the sidebar's don't.
  const shellDup = actAsUserId ? '' : ' shell-dup'

  // The shell's "Add holding" (sidebar button, command palette) lands here
```

Replacement:

```tsx
  // the sidebar, so the header's copies are hidden there. In act-as the page
  // links stay: they point at the target user's pages, the sidebar's don't.
  // UI_2.0 act-as moves between the target's pages through the shell's nav
  // and the act-as banner, so these header shortcuts stay hidden there.
  const shellDup = actAsUserId && !ui2 ? '' : ' shell-dup'

  // The shell's "Add holding" (sidebar button, command palette) lands here
```

* [ ] `frontend/src/features/dashboard/DashboardPage.tsx`, change 3 of 4. Current code:

```tsx

      <main className="dash-main page-main" style={{ maxWidth: 1600, margin: '0 auto' }}>
        {ui2 && <Ui2PageIntro title={actAsLabel ? actAsLabel + "'s portfolio" : 'Your portfolio, at a glance'}
          subtitle="A little clarity for every investment decision."
          actions={<>
```

Replacement:

```tsx

      <main className="dash-main page-main" style={{ maxWidth: 1600, margin: '0 auto' }}>
        {ui2 && actAsLabel && <Ui2ActAsBanner label={actAsLabel} />}
        {ui2 && <Ui2PageIntro title={actAsLabel ? `${actAsLabel}, at a glance` : 'Your portfolio, at a glance'}
          subtitle="A little clarity for every investment decision."
          actions={<>
```

* [ ] `frontend/src/features/dashboard/DashboardPage.tsx`, change 4 of 4. Current code:

```tsx
            </button>
          </>} />}
        {actAsUserId && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link to="/admin" aria-label="Back to admin" title="Back to admin" style={{
```

Replacement:

```tsx
            </button>
          </>} />}
        {actAsUserId && !ui2 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <Link to="/admin" aria-label="Back to admin" title="Back to admin" style={{
```

* [ ] `frontend/src/ui2/shell/Ui2ActAsBanner.tsx`, change 1 of 1. Current code:

```tsx
      <div>
        <strong>Viewing {label}</strong>
        {caller && <small>You are signed in as {caller.name || caller.username}</small>}
      </div>
      <Link to="/admin" className="ui2-btn">Exit act-as</Link>
```

Replacement:

```tsx
      <div>
        <strong>Viewing {label}</strong>
        <small>
          Changes save to this account{caller && ` · You are signed in as ${caller.name || caller.username}`}
        </small>
      </div>
      <Link to="/admin" className="ui2-btn">Exit act-as</Link>
```

* [ ] Verify: `cd frontend && npm run test:run && npx tsc --noEmit && npm run build && npm run lint:changed`

Expected: all pass.

* [ ] Commit: `git add frontend/src/features/dashboard/DashboardPage.tsx frontend/src/ui2/shell/Ui2ActAsBanner.tsx`

---

## 7. End-to-end verification scenarios

1. Administration → a user → Open portfolio: the banner names the account; the title reads "<user>'s portfolio, at a glance".
2. Sidebar Transactions and Dividends open that user's pages, with the banner.
3. History or Gold: a toast explains they are outside act-as; the page does not change.
4. Exit act-as returns to Administration; the sidebar links are the admin's own again.
5. Classic or Glass act-as is unchanged.

---

## Done

* [ ] `feat/PD-059-act-as` merged → slice 22 live

**Next:** slice 26 (auth screens in Light).
