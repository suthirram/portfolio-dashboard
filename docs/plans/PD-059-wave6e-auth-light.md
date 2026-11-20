# PD-059: Wave 6e — Signup, forgot-password and onboarding in Light (slice 26)

* **Status**: Implemented and merged: slice 26 (#384); plan #378. Visual sign-off (PD-059-Q-6e-1) still open.
* **Updated**: 2026-11-20
* **Owner**: Claude
* **Goal**: Put the three remaining signed-out screens on the login's sunrise design (#330), Light only.
* **Architecture**: All three render through `AuthShell` and its primitives (`FormField`, `PrimaryButton`, `FormError`, `LinkText`, `authInputStyle`). Restyling those onto `LoginPage.css`'s sunrise classes, plus a small `AuthShell.css` for what the login lacks (plain inputs and selects, hints, field errors), changes every screen at once with no page edits. Theme tokens are pinned to light values inside `.sunrise-auth`, because the pages' own inline styles read them.
* **Tech stack**: React 18, CSS, Vitest + Testing Library. No backend change.
* **Spec links**: [handoff guide](../visuals/PD-059-ui-2-guide.md) ("Signup, forgot-password and onboarding … a separate Light-theme review; login stays as #330"), [status board](PD-059-ui-2-status.md).

---

## 1. Scope and dependencies

Built on #330 (`LoginPage.css`, `login-sunrise.webp`). Login is not touched. These screens are signed out (onboarding is the first-login password change), so the change applies to every account regardless of `ui_mode`, as #330 did.

---

## 2. Fidelity reference

The sunrise login: full-bleed sunrise background, a right-aligned glass card (centred under 900 px), a 28 px heading and muted subtitle, 48 px inputs with a 12 px radius, the gradient pill submit, the red-tinted error banner, and a footer between two hairlines. The handoff has no frames for these three screens; the owner reviews them on the PR preview.

---

## 3. File map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | `frontend/src/features/auth/AuthShell.tsx` | Primitives render sunrise markup; labels wrap their control |
| Create | `frontend/src/features/auth/AuthShell.css` | Light token pins, plain inputs/selects, hints, field errors, wider card |
| Create | `frontend/src/features/auth/AuthShell.test.tsx` | Card, labelling, alert, hint/error, submit, footer |

---

## 4. PR sequence

| Branch | Scope | No regression | Adds value | Test that fails without it |
| --- | --- | --- | --- | --- |
| `feat/PD-059-auth-light` | Slice 26 | Login untouched; `AuthShell` exports and props unchanged; page logic and validation unchanged | One signed-out design; fields gain accessible names | `AuthShell.test.tsx` |

---

## 5. Owner decisions and open questions

### Decisions taken in this plan (reversible)

* The card is 30 rem wide (login: 26.25 rem) because signup carries nine fields and three question blocks.
* No brand row above the heading, matching the login.

### Open question — awaiting owner

```text
ID: PD-059-Q-6e-1
Raised by / date: Claude / 2026-11-20
Affected slice and files: 26 — features/auth/AuthShell.*
Existing behaviour and evidence: the guide reserves these screens for "a
  separate Light-theme review"; the handoff has no frames for them.
What is missing or ambiguous: whether the sunrise card is the wanted look.
Options and consequences:
  (a) Approve as on the preview.
  (b) Ask for changes on the PR; nothing else depends on this slice.
Independent work that can continue: everything else.
Owner response (exact):
Status: awaiting owner
```

---

## 6. Task list

### Task 1 — Stylesheet

**Files:** `frontend/src/features/auth/AuthShell.css` (create)

* [ ] Create `frontend/src/features/auth/AuthShell.css`:

```css
/* Signup, forgot-password and onboarding on the login's sunrise design
 * (PD-059 slice 26, Light only; login itself is #330). The card, title,
 * subtitle, error, submit and footer reuse LoginPage.css; these rules add
 * what those forms have and the login does not: plain inputs and selects
 * without a leading icon, hints and field errors. */

/* Light only, whatever theme the browser last used: the pages' own inline
   styles read these tokens, so they are pinned to light values here. */
.sunrise-auth {
  --border: #d5d8e4;
  --bg-card: rgb(255 255 255 / 45%);
  --bg-input: rgb(255 255 255 / 42%);
  --text-primary: #0b1024;
  --text-secondary: #444d64;
  --text-muted: #555d73;
  --red: #a51b35;
  --blue: #073dc7;
}

.sunrise-auth .sunrise-login-card { width: min(100%, 30rem); }

.sunrise-auth .sunrise-login-field > label :is(input, select) { display: block; margin-top: .375rem; }

/* Every text field and select in the card, including the ones signup lays
   out itself (its security-question blocks) outside FormField. */
.sunrise-auth .sunrise-login-card :is(input:not([type="checkbox"]):not([type="radio"]), select) {
  width: 100%;
  min-width: 0;
  min-height: 3rem;
  padding: .625rem 1rem;
  color: #151b30;
  background: rgb(255 255 255 / 42%);
  border: 1px solid #858b9c;
  border-radius: var(--radius-sm, 12px);
  font-size: max(1rem, 1em);
}

.sunrise-auth .sunrise-login-card :is(input, select):focus { outline: none; box-shadow: var(--ring); border-color: #245dbb; }

.sunrise-auth-hint { margin-top: .375rem; font-size: .75rem; color: #555d73; }
.sunrise-auth-field-error { margin-top: .375rem; font-size: .75rem; color: #a51b35; }

.sunrise-auth .sunrise-login-submit { margin-top: .5rem; }
```

* [ ] Commit: `git add frontend/src/features/auth/AuthShell.css`

### Task 2 — Primitives

**Files:** `frontend/src/features/auth/AuthShell.tsx` (modify)

* [ ] `frontend/src/features/auth/AuthShell.tsx`, change 1 of 4. Current code:

```tsx
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChartLineIcon } from '../../components/Icon'

interface Props {
```

Replacement:

```tsx
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './LoginPage.css'
import './AuthShell.css'

interface Props {
```

* [ ] `frontend/src/features/auth/AuthShell.tsx`, change 2 of 4. Current code:

```tsx
}

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="page-art page-art-dashboard" style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '32px 16px',
    }}>
      <div className="card-elevated" style={{
        width: '100%',
        maxWidth: 420,
        padding: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div className="brand-tile" style={{ width: 36, height: 36 }}><ChartLineIcon size={20} /></div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Portfolio Dashboard</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 13 }}>{subtitle}</p>}
        {children}
        {footer && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function authInputStyle(): React.CSSProperties {
  return {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    outline: 'none',
    fontSize: 13,
  }
}

export function FormField({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 500 }}>
        {label}
      </label>
      {children}
      {error && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      {hint && !error && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )
```

Replacement:

```tsx
}

// The signed-out screens' frame: the login's sunrise card (#330) in Light,
// shared by signup, forgot-password and onboarding (PD-059 slice 26).
export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <main className="sunrise-login sunrise-auth">
      <section className="sunrise-login-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{title}</h1>
        {subtitle && <p className="sunrise-login-subtitle">{subtitle}</p>}
        {children}
        {footer && (
          <div className="sunrise-login-footer">
            <span>{footer}</span>
          </div>
        )}
      </section>
    </main>
  )
}

// authInputStyle stays for callers that spread it; the sunrise look now
// comes from AuthShell.css, so it adds nothing inline.
export function authInputStyle(): CSSProperties {
  return {}
}

export function FormField({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div className="sunrise-login-field">
      <label>
        {label}
        {children}
      </label>
      {error && <div className="sunrise-auth-field-error">{error}</div>}
      {hint && !error && <div className="sunrise-auth-hint">{hint}</div>}
    </div>
  )
```

* [ ] `frontend/src/features/auth/AuthShell.tsx`, change 3 of 4. Current code:

```tsx
}) {
  return (
    <button
      type={type}
      className="btn-primary"
      disabled={disabled || loading}
      onClick={onClick}
      style={{
        width: '100%',
        justifyContent: 'center',
        padding: '10px 16px',
        fontSize: 14,
        opacity: disabled || loading ? 0.6 : 1,
        marginTop: 4,
      }}>
      {loading ? <span className="spinner" style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> : children}
    </button>
  )
```

Replacement:

```tsx
}) {
  return (
    <button type={type} className="sunrise-login-submit" disabled={disabled || loading} onClick={onClick}
      aria-busy={loading || undefined}>
      {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : children}
    </button>
  )
```

* [ ] `frontend/src/features/auth/AuthShell.tsx`, change 4 of 4. Current code:

```tsx
export function FormError({ error }: { error?: string | null }) {
  if (!error) return null
  return (
    <div style={{
      background: 'var(--red-dim)',
      color: 'var(--red)',
      border: '1px solid var(--red)',
      padding: '10px 12px',
      borderRadius: 'var(--radius-sm)',
      marginBottom: 14,
      fontSize: 13,
    }}>
      {error}
    </div>
  )
}

export function LinkText({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{children}</Link>
  )
}
```

Replacement:

```tsx
export function FormError({ error }: { error?: string | null }) {
  if (!error) return null
  return <div className="sunrise-login-error" role="alert">{error}</div>
}

export function LinkText({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to}>{children}</Link>
}
```

* [ ] Commit: `git add frontend/src/features/auth/AuthShell.tsx`

### Task 3 — Tests

**Files:** `frontend/src/features/auth/AuthShell.test.tsx` (create)

* [ ] Create `frontend/src/features/auth/AuthShell.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthShell, FormError, FormField, LinkText, PrimaryButton } from './AuthShell'

const show = () => render(
  <MemoryRouter>
    <AuthShell title="Create your account" subtitle="Takes a minute." footer={<>Have one? <LinkText to="/login">Log in</LinkText></>}>
      <FormError error="That username is taken." />
      <FormField label="Username" hint="3–32 characters"><input /></FormField>
      <FormField label="Region" error="Pick a region"><select><option>India</option></select></FormField>
      <PrimaryButton>Create account</PrimaryButton>
    </AuthShell>
  </MemoryRouter>)

describe('AuthShell', () => {
  it('renders the login’s sunrise card with the title as the page heading', () => {
    show()
    const heading = screen.getByRole('heading', { level: 1, name: 'Create your account' })
    expect(heading.closest('section')).toHaveClass('sunrise-login-card')
    expect(heading.closest('main')).toHaveClass('sunrise-login', 'sunrise-auth')
    expect(screen.getByText('Takes a minute.')).toHaveClass('sunrise-login-subtitle')
  })

  it('names every control by its label', () => {
    show()
    expect(screen.getByLabelText('Username').tagName).toBe('INPUT')
    expect(screen.getByLabelText('Region').tagName).toBe('SELECT')
  })

  it('announces form errors and shows hints and field errors', () => {
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('That username is taken.')
    expect(screen.getByText('3–32 characters')).toHaveClass('sunrise-auth-hint')
    expect(screen.getByText('Pick a region')).toHaveClass('sunrise-auth-field-error')
  })

  it('uses the sunrise submit button and footer link', () => {
    show()
    expect(screen.getByRole('button', { name: 'Create account' })).toHaveClass('sunrise-login-submit')
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
```

* [ ] Verify: `cd frontend && npm run test:run && npx tsc --noEmit && npm run build && npm run lint:changed`

Expected: all pass; `AuthShell.test.tsx` 4 tests.

* [ ] Commit: `git add frontend/src/features/auth/AuthShell.test.tsx`

---

## 7. End-to-end verification scenarios

1. Signed out, `/signup`, `/forgot-password` and `/onboarding` show the sunrise card like `/login`.
2. With the browser on Dark or Cyber, the three screens are still Light.
3. At 390 px the card is centred and the page scrolls, with no horizontal overflow.
4. A screen reader names every field by its label.

---

## Done

* [x] `feat/PD-059-auth-light` merged → slice 26 live
* [ ] PD-059-Q-6e-1 answered

**Next:** R24, cutover readiness, once slices 13–26 are merged.
