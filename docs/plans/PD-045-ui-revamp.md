# PD-045: UI revamp — modern design system

* **Status**: In progress
* **Owner**: project owner
* **Scope**: frontend only — no API, backend, or data-model changes

## 1. Goal

Modernize the whole UI — visual depth, motion, and polish — without a
rewrite. The app's styling model is a small CSS-variable token layer
(`index.css`) consumed by inline `style={{}}` objects across ~25
components. That model is the leverage point: **every inline style
references `var(--...)` tokens, so redesigning the token values and the
global element styles restyles the entire app without touching most
components.** Targeted class adoption covers what tokens can't reach
(animations, backdrop blur, hover elevation).

## 2. Non-goals

* No component-library dependency (no Tailwind/MUI/shadcn — zero new deps).
* No layout or information-architecture changes; every page keeps its
  structure, routes, and behavior.
* No test-visible behavior change — the vitest suite must pass unmodified.
* No backend or spec changes.

## 3. Structural change log

### 3.1 New files

```text
frontend/src/styles/
├── tokens.css       # design tokens — palette, elevation, radii, motion, gradients
├── base.css         # reset, body backdrop, typography, focus ring, scrollbar
└── components.css   # shared classes: buttons, cards, badges, modals, nav, tables
```

### 3.2 Changed files

| File | Change |
|---|---|
| `src/index.css` | Becomes an import aggregator (`@import` the three layers) + keeps the app-specific responsive rules (nav wrap, column hiding, table scroll). All token/element/utility rules move to the layers. |
| `index.html` | Inter weights extended (300–800), `theme-color` meta. |
| `features/dashboard/DashboardPage.tsx` | Nav → `.nav-glass` (translucent, blurred, sticky); brand tile → `.brand-tile` gradient; nav buttons/links → `.btn`/`.btn-ghost`/`.btn-primary`; user dropdown → `.menu-pop` (animated); footer polish. |
| `components/SummaryCards.tsx` | Cards → `.card` (hover elevation) + `.card-highlight` (gradient accent). Inline layout styles stay. |
| `features/auth/AuthShell.tsx` | Backdrop glow, card → `.card-elevated`, brand tile → `.brand-tile`. |
| Modal sites (6): `AddEditModal`, `TransactionsModal`, `OpeningDateModal`, `GoldTxnModal`, `MissingPricesModal`, `HistoryModals` (via `historyShared.ts`) | Overlay div gets `className="modal-overlay"`, dialog div gets `className="modal-card"` — CSS supplies backdrop blur + enter animation; existing inline styles keep supplying layout. |

### 3.3 Token contract (compatibility rule)

**Every pre-existing CSS variable name is preserved** (`--bg-*`, `--text-*`,
`--green/--red/--blue/...`, `--border*`, `--shadow`, `--radius*`,
`--nav-height`, `--card-highlight-*`). Inline styles across the app keep
working untouched; only the values change. New tokens are additive:
`--radius-lg`, `--shadow-sm`, `--shadow-lg`, `--ring`, `--gradient-brand`,
`--bg-glass`, `--ease`, `--speed`, `--speed-slow`. Both themes (dark
default, light via `<html data-theme="light">`) get the same treatment.

## 4. Design decisions

* **Dark theme**: deeper blue-black backdrop with two fixed radial glows
  (blue top-left, purple bottom-right) painted on `body` — ambient depth on
  every page for zero component edits. Slightly higher-contrast text scale.
* **Motion**: one shared easing (`--ease`, an ease-out-quint) and two
  durations. Modals fade + scale in; dropdown pops; cards lift on hover;
  buttons brighten via `filter` on hover (CSS `filter` is never set inline,
  so the rule applies even to inline-styled buttons). All motion is wrapped
  in `@media (prefers-reduced-motion: reduce)` guards.
* **Focus**: visible `:focus-visible` ring (`--ring`) on inputs and
  buttons via `box-shadow`, which inline styles don't set — accessibility
  win with no component edits.
* **Tables**: row hover tint + smoother sticky-header shadow via existing
  wrapper classes.
* **No new dependencies** — plain CSS, the Inter font already loaded.

## 5. Testing

* Full vitest suite unchanged and green (`npx vitest run`) — the revamp
  must not alter text, roles, or interaction behavior.
* New render test asserting the modal class contract (`.modal-overlay` /
  `.modal-card` present on a representative modal) — fails without the
  change.
* `npm run build` (tsc + vite) green.
* Manual pass via the `run-app` skill: dashboard, history, gold, auth
  screens in both themes; mobile-width spot check (responsive rules are
  moved verbatim, not rewritten).

## 6. Rollback

Single squash commit on `main`; revert restores the previous flat theme.
No data, API, or storage surface is touched, so rollback is purely visual.
