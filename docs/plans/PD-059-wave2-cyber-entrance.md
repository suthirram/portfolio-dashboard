# PD-059: Wave 2a amendment — Cyber entrance (slice 3)

* Status: Draft amendment; implementation starts after this docs PR merges
* Owner: Codex; product decisions remain with the project owner
* Updated: 2026-11-18
* Implements: [PRD-015 §4.2](../prds/PRD-015-ui-2.md#42-shell-and-themes)
* Technical design: [DD-015 §1.5](../designs/DD-015-ui-2.md#15-themes)
* Parent plan: [PD-059](PD-059-ui-2.md)
* Coordination: [status board](PD-059-ui-2-status.md)
* Visual authority: [owner reference](../visuals/PD-059-ui-2-reference.html)
* Review companion: [frame 12](../visuals/PD-059-ui-2.html#frame-12)

## 1. Goal and boundaries

Deliver slice 3 independently of the overall-worth backend (slice 8).
The dependency is the merged UI_2.0 shell (#334), not a portfolio endpoint.
This amendment supplies the complete implementation and tests for the first
Wave 2 slice. Slices 4–7 keep their amendment gates; this document does not
authorize their implementation.

The reference's Cyber entrance starts on load and on entering Cyber. Its
topbar reveals over 650 ms with a 12 px rise, its brand mark glows over
1,100 ms, and its run marker clears at 1,600 ms. Port those shell values.
The sidebar's position, layout, widths, Branding font and route controls stay
as merged. Light and Dark get no entrance. Reuse `useTheme` for persistence,
premium eligibility and fallback; do not add a second theme policy.

This is decoration: it makes no API calls and never disables controls,
steals focus, installs a loading gate or blocks pointer input. No command
palette, Ambient switch, new font loader or separate currency atmosphere is
introduced. `CurrencySprinkle` remains the existing application component.

The reference's Overview panel stagger belongs with those new components,
not with the existing fallback pages. The CSS below offers an explicit
`.ui2-entrance-item` opt-in for their later amendment; it does not select
legacy `.panel` or `.summary-card` elements or scan and mutate page DOM.

## 2. Architecture and decisions

* Put the entrance lifecycle in `useCyberEntrance`, mounted by `Ui2Shell`.
  It returns a shell ref and observes only theme and Premium changes.
  Ordinary renders and navigation inside the shell do not replay it.
* Set `data-cyber-entrance` after two animation frames, as in the reference.
  Clear it after 1,600 ms. Cancel both pending frames and the timer on theme
  exit, Premium revocation, unmount or reduced-motion activation. React
  StrictMode's effect replay must not leave extra callbacks or markers.
* Skip motion if `matchMedia` is unavailable. With reduced motion on load,
  do not schedule the entrance. Changing to reduced motion during a run
  cancels it immediately. Changing back does not create a new entrance;
  entering Cyber again does.
* CSS opts in under `prefers-reduced-motion: no-preference`, scoped to
  `:root[data-ui="ui2"][data-theme="cyberpunk"]`. Without the marker the
  final, static state is the default. Cleanup uses a timer, so it does not
  depend on `animationend` firing under reduced motion.
* Preserve the reference's bounded brightness/glow keyframes. Opacity and
  translation do the reveal; do not animate layout, expand effects to the
  whole main column or add `will-change` permanently. A transformed main
  container could change fixed-position dialog placement.
* No storage, OpenAPI, backend, infrastructure or dependency changes.
  Existing React, Vitest, Playwright and the browser harness are sufficient.

## 3. File map and PR sequence

| Action | File | Responsibility |
|---|---|---|
| Create | `frontend/src/ui2/shell/useCyberEntrance.ts` | Marker lifecycle and cancellation |
| Create | `frontend/src/ui2/shell/useCyberEntrance.test.tsx` | Lifecycle, motion preference, entitlement and interaction tests |
| Create | `frontend/src/ui2/cyberEntrance.css` | Reference shell keyframes, scoped and motion-gated |
| Modify | `frontend/src/ui2/shell/Ui2Shell.tsx` | Import stylesheet/hook; attach returned ref |
| Create | `frontend/src/test/browser/ui2CyberEntrance.fixture.html` | Browser fixture document |
| Create | `frontend/src/test/browser/ui2CyberEntrance.fixture.tsx` | Real auth/shell/theme integration with a fictional page |
| Create | `frontend/src/ui2/ui2CyberEntrance.browser.test.ts` | Real CSS animation, theme switching and isolation tests |
| Modify | `docs/plans/PD-059-ui-2-status.md` | Slice state, PR and shared hook registration |

All branches start from merged `main`; the implementation branch is created
after this amendment merges. Label both PRs `ui-2.0`. No slice 8 files or
APIs are imported, cherry-picked or awaited.

| Order | Branch | Scope | No regression | Adds value | Test anchor |
|---|---|---|---|---|---|
| Amendment | `docs/PD-059-wave2` | This complete slice 3 plan and ownership | Docs only | Unlocks independent frontend work | markdownlint; draft code verified in scratch worktree |
| Slice 3 | `feat/PD-059-cyber-entrance` | Hook, reference animation and shell wiring | UI_2.0 + Premium + Cyber only; controls remain usable | Cyber has the approved entrance | `useCyberEntrance.test.tsx`, `ui2CyberEntrance.browser.test.ts` |

## 4. Task 1 — entrance lifecycle and styles

**Files:** `frontend/src/ui2/shell/useCyberEntrance.ts`,
`frontend/src/ui2/shell/useCyberEntrance.test.tsx`,
`frontend/src/ui2/cyberEntrance.css`.

* [ ] Create the hook below. Its ref limits mutations to this shell;
  removing the marker restores static content without waiting for a CSS
  animation event. No dependency on route state is introduced.

```ts
import { useEffect, useRef } from 'react'
import type { ThemeName } from '../../lib/useTheme'

// One entrance per Cyber activation in this mounted shell. Route renders
// leave it alone; theme changes, entitlement changes and unmount cancel it.
export function useCyberEntrance(theme: ThemeName, premium: boolean) {
  const shellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const shell = shellRef.current
    if (!shell || theme !== 'cyberpunk' || !premium || !window.matchMedia) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let firstFrame = 0
    let secondFrame = 0
    let timer = 0

    const stop = () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(timer)
      shell.removeAttribute('data-cyber-entrance')
    }
    const onMotionChange = () => { if (motion.matches) stop() }
    motion.addEventListener('change', onMotionChange)

    // Match the reference's two-frame restart without forcing layout.
    // The shell and its controls render immediately, before this effect.
    if (!motion.matches) {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          if (motion.matches) return
          shell.setAttribute('data-cyber-entrance', 'true')
          timer = window.setTimeout(stop, 1600)
        })
      })
    }

    return () => {
      motion.removeEventListener('change', onMotionChange)
      stop()
    }
  }, [theme, premium])

  return shellRef
}
```

* [ ] Create the behavioral tests below. They exercise replay, cancellation,
  immediate control availability and cleanup rather than asserting source
  text or a class-name snapshot.

```tsx
import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeName } from '../../lib/useTheme'
import { useCyberEntrance } from './useCyberEntrance'

class MotionQuery extends EventTarget {
  matches = false
  change(matches: boolean) {
    this.matches = matches
    this.dispatchEvent(new Event('change'))
  }
}

let motion: MotionQuery
const clicked = vi.fn()
function Preview({ theme = 'cyberpunk', premium = true, route = '/' }: {
  theme?: ThemeName; premium?: boolean; route?: string
}) {
  const shellRef = useCyberEntrance(theme, premium)
  return <div ref={shellRef} data-testid="shell">
    <button onClick={clicked}>Refresh</button><span>{route}</span>
  </div>
}
const advance = (milliseconds: number) => act(() => vi.advanceTimersByTime(milliseconds))
const playing = () => screen.getByTestId('shell').hasAttribute('data-cyber-entrance')

beforeEach(() => {
  vi.useFakeTimers()
  clicked.mockClear()
  motion = new MotionQuery()
  vi.stubGlobal('matchMedia', vi.fn(() => motion))
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCyberEntrance', () => {
  it('plays on Cyber load and removes the marker after the reference duration', () => {
    render(<Preview />)
    advance(50)
    expect(playing()).toBe(true)
    advance(1600)
    expect(playing()).toBe(false)
  })

  it('keeps controls usable before and during the entrance', () => {
    render(<Preview />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    advance(50)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(clicked).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it.each<ThemeName>(['light', 'dark'])('does not play in %s', theme => {
    render(<Preview theme={theme} />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('does not play for a non-premium account even with a stored Cyber theme', () => {
    render(<Preview premium={false} />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('plays when entering Cyber, cancels on exit and replays on re-entry', () => {
    const { rerender } = render(<Preview theme="light" />)
    rerender(<Preview theme="cyberpunk" />)
    advance(50)
    expect(playing()).toBe(true)
    rerender(<Preview theme="dark" />)
    expect(playing()).toBe(false)
    rerender(<Preview theme="cyberpunk" />)
    advance(50)
    expect(playing()).toBe(true)
  })

  it('does not replay on a route render', () => {
    const { rerender } = render(<Preview />)
    advance(1700)
    rerender(<Preview route="/history" />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('skips reduced motion and cancels immediately when the preference changes', () => {
    motion.matches = true
    const { unmount } = render(<Preview />)
    advance(50)
    expect(playing()).toBe(false)
    unmount()
    motion.matches = false
    render(<Preview />)
    advance(50)
    expect(playing()).toBe(true)
    act(() => motion.change(true))
    expect(playing()).toBe(false)
    act(() => motion.change(false))
    advance(50)
    expect(playing()).toBe(false)
  })

  it('cancels when Premium is revoked', () => {
    const { rerender } = render(<Preview />)
    advance(50)
    rerender(<Preview premium={false} />)
    expect(playing()).toBe(false)
  })

  it('cancels queued frames when leaving Cyber before the entrance starts', () => {
    const { rerender } = render(<Preview />)
    rerender(<Preview theme="dark" />)
    advance(50)
    expect(playing()).toBe(false)
  })

  it('cleans up on unmount, including StrictMode effect replay', () => {
    const { unmount } = render(<StrictMode><Preview /></StrictMode>)
    advance(50)
    const shell = screen.getByTestId('shell')
    expect(playing()).toBe(true)
    unmount()
    advance(1700)
    expect(shell).not.toHaveAttribute('data-cyber-entrance')
    expect(vi.getTimerCount()).toBe(0)
  })
})
```

* [ ] Create the stylesheet below. The topbar and brand keyframes retain the
  reference's durations and final states. New Overview elements can opt in
  later without changing fallback page animation or the currency sprinkle.

```css
/* Port the reference's shell entrance. Future Overview components opt in
 * with .ui2-entrance-item; existing fallback pages are not retargeted. */
@media (prefers-reduced-motion: no-preference) {
  :root[data-ui="ui2"][data-theme="cyberpunk"]
    .ui2-shell[data-cyber-entrance="true"] .ui2-topbar {
    animation: ui2-cyber-reveal 650ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }

  :root[data-ui="ui2"][data-theme="cyberpunk"]
    .ui2-shell[data-cyber-entrance="true"] .ui2-entrance-item {
    animation: ui2-cyber-reveal 800ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
    animation-delay: var(--ui2-entrance-delay, 100ms);
  }

  :root[data-ui="ui2"][data-theme="cyberpunk"]
    .ui2-shell[data-cyber-entrance="true"] .ui2-brand-mark {
    animation: ui2-cyber-mark 1100ms ease-out both;
  }
}

@keyframes ui2-cyber-reveal {
  from { opacity: 0; transform: translateY(12px); filter: brightness(1.2); }
  to { opacity: 1; transform: translateY(0); filter: brightness(1); }
}

@keyframes ui2-cyber-mark {
  0%, 100% { box-shadow: 0 0 0 #6ee7ef00; }
  45% { box-shadow: 0 0 28px #6ee7ef85, 0 0 45px #bd45ff40; }
}
```

* [ ] Verify: `cd frontend && npx vitest run src/ui2/shell/useCyberEntrance.test.tsx`.
  Expected: 11 tests pass; no real network or database is needed.

Do not commit this task as a standalone feature: the hook alone adds no
visible value. Ship it with task 2 and the real-browser tests in task 3.

## 5. Task 2 — attach to the merged shell

**File:** `frontend/src/ui2/shell/Ui2Shell.tsx`.

* [ ] Import the hook and stylesheet. Current:

```tsx
import '../ui2.css'
```

Replacement:

```tsx
import '../ui2.css'
import '../cyberEntrance.css'
import { useCyberEntrance } from './useCyberEntrance'
```

* [ ] Pass the existing theme and actual entitlement to the hook. Current:

```tsx
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
```

Replacement:

```tsx
  const { theme, set: setTheme } = useTheme({ premium: user ? user.premium : undefined })
  const entranceRef = useCyberEntrance(theme, Boolean(user?.premium))
```

* [ ] Attach the ref without changing any sidebar or page markup. Current:

```tsx
    <div className="ui2-shell">
```

Replacement:

```tsx
    <div ref={entranceRef} className="ui2-shell">
```

* [ ] Verify: `cd frontend && npx tsc -b && npx vitest run src/ui2/shell/Ui2Shell.test.tsx src/components/shell/AppShell.test.tsx src/ui2/shell/useCyberEntrance.test.tsx`.
  Expected: TypeScript clean and all selected tests pass. Existing account,
  drawer, Branding link and role-specific navigation assertions stay green.

## 6. Task 3 — real-browser verification

**Files:** `frontend/src/test/browser/ui2CyberEntrance.fixture.html`,
`frontend/src/test/browser/ui2CyberEntrance.fixture.tsx`,
`frontend/src/ui2/ui2CyberEntrance.browser.test.ts`.

* [ ] Create the fixture HTML. It needs the standard viewport and doctype
  so the real app styles run in their normal layout mode.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>UI_2.0 Cyber entrance fixture</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./ui2CyberEntrance.fixture.tsx"></script>
  </body>
</html>
```

* [ ] Create its entry point using the real `ShellLayout`, `AuthProvider`,
  `UiModeSync` and theme initialization. A small fictional child verifies
  controls and route renders without needing portfolio data or a backend.

```tsx
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../../features/auth/AuthContext'
import { ShellLayout } from '../../components/shell/AppShell'
import { initTheme } from '../../lib/useTheme'
import { initUiMode, UiModeSync } from '../../lib/uiMode'
import '../../index.css'

function Page() {
  const [clicks, setClicks] = useState(0)
  return <main><button onClick={() => setClicks(count => count + 1)}>Refresh fixture</button>
    <output aria-label="Refresh count">{clicks}</output><Link to="/history">Fixture History</Link>
  </main>
}

initTheme()
initUiMode()
createRoot(document.getElementById('root')!).render(
  <AuthProvider><UiModeSync /><MemoryRouter>
    <Routes><Route element={<ShellLayout />}><Route path="*" element={<Page />} /></Route></Routes>
  </MemoryRouter></AuthProvider>,
)
```

* [ ] Create the browser test. Match endpoint paths only: a broad `/api/`
  glob can intercept Vite's `src/lib/api/client.ts` module. Keep the
  existing `REQUIRE_BROWSER_TESTS=1` convention so CI fails instead of
  silently skipping when Chromium is unavailable.

```ts
// @vitest-environment node
/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import type { ViteDevServer } from 'vite'
import { launchBrowser, startFixtureServer } from '../test/browser/harness'

const browser = await launchBrowser()
let server: ViteDevServer
let baseUrl: string

async function preview({ mode = 'ui2', premium = true, reduced = false, theme = 'cyberpunk' } = {}) {
  const page = await browser!.newPage({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
  await page.addInitScript(initialTheme => {
    localStorage.setItem('pd_theme', initialTheme)
    localStorage.setItem('pd_theme_chosen', '1')
    document.addEventListener('animationstart', event => {
      const animation = event as AnimationEvent
      if (animation.animationName === 'ui2-cyber-reveal' && (animation.target as HTMLElement).classList.contains('ui2-topbar')) {
        document.documentElement.dataset.entrances = String(Number(document.documentElement.dataset.entrances ?? 0) + 1)
      }
    })
  }, theme)
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: {
    id: 'cyber-review', username: 'cyber-review', name: 'Cyber Review', role: 'user', region: 'india',
    premium, ui_mode: mode, ui_revamp: mode === 'glass', gold_enabled: false, disabled: false,
    locked: false, must_change_password: false,
  } }))
  await page.goto(`${baseUrl}/src/test/browser/ui2CyberEntrance.fixture.html`)
  await page.waitForFunction(expected => document.documentElement.dataset.ui === expected,
    mode === 'ui2' ? 'ui2' : mode === 'glass' ? 'v2' : undefined)
  return page
}
const entrances = (page: Page) => page.evaluate(() => Number(document.documentElement.dataset.entrances ?? 0))
const marked = (page: Page) => page.locator('.ui2-shell[data-cyber-entrance]').count()

describe.skipIf(!browser)('UI_2.0 Cyber entrance in Chromium', () => {
  beforeAll(async () => {
    const fixture = await startFixtureServer()
    server = fixture.server
    baseUrl = fixture.baseUrl
  }, 60_000)
  afterAll(async () => { await browser?.close(); await server?.close() })

  it('plays once on load, keeps controls usable, does not replay on routing and replays on Cyber selection', async () => {
    const page = await preview()
    try {
      await expect.poll(() => entrances(page)).toBe(1)
      await page.getByRole('button', { name: 'Refresh fixture' }).click()
      expect(await page.getByRole('status', { name: 'Refresh count' }).textContent()).toBe('1')
      await expect.poll(() => marked(page), { timeout: 3000 }).toBe(0)
      await page.getByRole('link', { name: 'Fixture History' }).click()
      expect(await entrances(page)).toBe(1)
      const themes = page.getByRole('group', { name: 'Choose theme' })
      await themes.getByRole('button', { name: /Dark/ }).click()
      await themes.getByRole('button', { name: /Cyber/ }).click()
      await expect.poll(() => entrances(page)).toBe(2)
    } finally { await page.close() }
  })

  it('skips reduced motion and stops a running entrance when the preference changes', async () => {
    const reduced = await preview({ reduced: true })
    const normal = await preview()
    try {
      expect(await marked(reduced)).toBe(0)
      expect(await entrances(reduced)).toBe(0)
      await expect.poll(() => entrances(normal)).toBe(1)
      await normal.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => marked(normal)).toBe(0)
      expect(await normal.locator('.ui2-topbar').evaluate(element => getComputedStyle(element).animationName)).toBe('none')
    } finally { await reduced.close(); await normal.close() }
  })

  it('never plays for a non-premium account with a stored Cyber theme', async () => {
    const page = await preview({ premium: false })
    try {
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
      expect(await entrances(page)).toBe(0)
      expect(await marked(page)).toBe(0)
    } finally { await page.close() }
  })

  it.each(['classic', 'glass'])('leaves the %s interface without a UI_2.0 entrance', async mode => {
    const page = await preview({ mode })
    try {
      expect(await page.locator('.ui2-shell').count()).toBe(0)
      expect(await entrances(page)).toBe(0)
    } finally { await page.close() }
  })
})
```

* [ ] Verify from `frontend/`:

```bash
REQUIRE_BROWSER_TESTS=1 npx vitest run src/ui2/shell/useCyberEntrance.test.tsx src/ui2/ui2CyberEntrance.browser.test.ts
npx tsc -b
npm run lint:changed
```

Expected: 16 selected tests pass, no TypeScript errors and no changed-file
lint errors. The explicit 3-second poll covers the reference's 1.6-second
marker lifetime; it is not a change to the animation duration.

* [ ] Run the required full frontend checks before opening the code PR:
  `cd frontend && REQUIRE_BROWSER_TESTS=1 npx vitest run && npm run build`.
  Expected: all tests and the production build pass.

## 7. End-to-end verification and rollback

Use the repository's [run-app skill](../../.claude/skills/run-app/SKILL.md)
to launch/authenticate against the verified local or dev stack. Preserve
pre-existing processes and portfolio data.

* [ ] Premium UI_2.0 + stored Cyber: reload at desktop and 390 px. Observe
  one shell entrance; use Refresh and the sidebar while it runs. No input
  is disabled and the sidebar layout stays as the reference.
* [ ] Switch Cyber → Dark → Cyber: one new entrance; leave Cyber during
  it and confirm the static Dark state immediately.
* [ ] Navigate Overview → History inside UI_2.0: no entrance replay for
  the same theme. Reload History: one new load entrance is expected.
* [ ] Reduced motion on load: no entrance. Enable it mid-run: motion
  stops and final content remains visible; focus stays on the current
  control. Turning it off does not play an unsolicited entrance.
* [ ] Revoke Premium: no Cyber entrance and the existing theme hook falls
  back to Dark. Classic and Glass stay as they are.
* [ ] Verify drawer close, keyboard focus return, desktop resize and the
  super-admin Branding link remain correct after the reveal settles.
* [ ] Compare shell keyframes with frame 12/reference and inspect desktop
  and narrow screenshots. Browser fixtures prove behavior, not pixel parity
  with loaded production fonts or deployed authentication.

Rollback is a single frontend revert: remove the three shell wiring edits
and the new entrance files. Existing `useTheme` and `CurrencySprinkle`
remain untouched. There are no migration, storage or environment changes.

## 8. Commit, handoff and validation record

* [ ] Create `feat/PD-059-cyber-entrance` from current `main` after this
  amendment merges. Set slice 3's board row to in progress and register
  `useCyberEntrance` in the shared component registry in the code PR.
* [ ] Commit the feature and tests together after verification:

```bash
git add frontend/src/ui2/shell/useCyberEntrance.ts frontend/src/ui2/shell/useCyberEntrance.test.tsx frontend/src/ui2/shell/Ui2Shell.tsx frontend/src/ui2/cyberEntrance.css frontend/src/ui2/ui2CyberEntrance.browser.test.ts frontend/src/test/browser/ui2CyberEntrance.fixture.html frontend/src/test/browser/ui2CyberEntrance.fixture.tsx docs/plans/PD-059-ui-2-status.md
git commit -m "✨ Add the UI_2.0 Cyber entrance"
```

* [ ] Open a frontend-only PR with the three required description sections,
  concrete test steps, automated commands and the `ui-2.0` label. When it
  merges, update slice 3's board row and component registry.

Draft validation (2026-11-18): the exact hook, wiring, CSS and test code
above were applied to an isolated scratch worktree at `a8f8048` for plan
verification. TypeScript and the 16 selected unit/Chromium tests passed.
These scratch files are not shipped by this docs PR. Full frontend CI,
manual dev-stack review and the implementation PR remain future gates.

Done for this amendment: slice 3 has an independent branch, complete code,
behavior tests, motion policy, runbook and rollback with no slice 8 dependency.
Next: merge this amendment, implement slice 3, and specify Overview slices
4–7 in their own amendment from the owner's reference.
