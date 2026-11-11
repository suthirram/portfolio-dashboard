# DD-011: Glass UI behind a per-account switch

* **Status**: Accepted
* **Owner**: project owner
* **Implements**: [PRD-011](../prds/PRD-011-glass-ui.md)
* **Rollout plan**: [PD-054](../plans/PD-054-glass-ui.md)

## 1. Storage and API

`users.ui_revamp` (bool, `omitempty`; absent = off), exposed as the required
`ui_revamp` on `User` (so `/auth/me` and the admin user list carry it).
`PUT /admin/users/{id}/ui-revamp` with `UserFlagToggleRequest`, tier
`tierSuperAdmin`, handled by the shared `setUserFlag` (403 for anyone but the
super admin, 404 for an unknown target, 204 on success). No migration.

## 2. Turning the mode on

`lib/uiMode.ts` mirrors the account's switch to `<html data-ui="v2">`
(`UiModeSync`, mounted inside `AuthProvider`) and remembers it in
`localStorage.pd_ui`; `initUiMode()` applies the remembered value before
first paint, so signed-out pages keep the last look. `useUiRevamp()` reads
the switch for components.

## 3. Styles

`styles/glass.css`, imported after `components.css`. Every rule is scoped
under `:root[data-ui="v2"]` (light and cyber add `[data-theme=…]`), so the
current UI is unchanged. Three layers:

1. **Tokens**: the 600+ inline `style={{}}` objects read `var(--bg-card)`,
   `var(--border)`, `var(--radius)`…; v2 redefines them as translucent values
   and larger radii, which restyles every page without touching them.
2. **Surfaces**: `.card`, `.modal-card`, `.menu-pop`, `.glass-panel`,
   `.page-toolbar` and any `div/section/aside/header/form` whose inline style
   paints `--bg-card` or `--bg-secondary` get `backdrop-filter: blur()
   saturate()`. Table parts are excluded (one blur per row is too costly).
3. **Shell**: layout for the sidebar, tab bar, page toolbars, hero, palette
   and toasts.

The one global rule is `.shell-only { display: none }`, for markup that
exists only for the shell. Fallbacks: `prefers-reduced-motion` stops the
mesh and entry animations; `prefers-reduced-transparency` and browsers
without `backdrop-filter` get solid surface tokens.

## 4. Shell

`App.tsx` puts the signed-in routes under a layout route, `ShellLayout`,
which renders `<AppShell>` around the page for glass accounts and the page
alone otherwise. `AppShell`: brand, search (opens the palette), nav
(`NavLink`, so `aria-current` marks the page; Gold and Admin only when the
account has them), **Add holding**, theme picker, account, log out; a
bottom tab bar under 860 px; the command palette; the toaster. A hamburger
button folds the sidebar into a 72 px icon rail (labels hidden, every control
keeps its name as `aria-label` and a `title` tooltip); the choice is kept per
browser in `localStorage.pd_sidebar`, and the palette offers it too.

Pages keep their headers. In the shell they become floating toolbars, and
their copies of the shell's controls are hidden: elements marked
`.shell-dup`, the header theme picker (`.theme-picker-inline`) and
back-to-own-dashboard links (`a.btn-icon[href="/"]`). Act-as links are not
marked, because they point at the target user's pages.

## 5. Command palette and toasts

`CommandPalette`: ARIA combobox + listbox; every typed word must match the
label, group or keywords (`matchCommands`); ↑/↓ move, Enter runs, Escape
closes. Commands: every nav page, Account settings, Add holding
(navigates to `/` with `state.openAdd`, which the dashboard turns into the
add modal once and clears), each theme the account may use, Log out.

`lib/toast.ts`: a small external store (`toast`, `dismissToast`,
`subscribeToasts`) read by `<Toaster>` through `useSyncExternalStore`, in a
polite live region; toasts leave after 4.5 s. `notify()` replaces
`window.alert` where touched: a toast in the glass UI, the alert elsewhere.

## 6. Pages

* **Dashboard**: `PortfolioHero` (glass only; each "Today" chip carries its
  currency's flag, India or the EU, drawn as SVG) above the cards, reading the
  same summary and per-currency `GroupDayChange` the cards use; a skeleton
  while the first summary loads; a page title; header copies marked
  `.shell-dup` (page links only outside act-as).
* **Admin**: the shell hides `AdminShell`'s header; its tab row gains a
  title. Admin → Users gets **Glass UI on/off** (`aria-pressed`); switching
  your own account refreshes the session user, so the look flips at once.
* **History, Transactions**: the filter bars become glass toolbars
  (`.page-toolbar`).
* **Every other page**: tokens and surface rules.

## 7. Theme

`useTheme` instances keep separate state (the shell's picker and the page's,
which charts read). Each theme change is broadcast on `window`
(`pd:theme`) and every mounted instance follows it.

## 8. Testing

Go: the switch handler (204 with `$set.ui_revamp`, 403 for a regional
admin, 404 for an unknown target). Frontend: UI mode (attribute,
persistence, follows the account, kept while signed out); toasts (expiry,
live region, dismiss; `notify` alert vs toast); palette (matching, typing +
Enter, arrows, Escape, empty state); shell (current UI without the switch,
current page, Gold/Admin gating, Ctrl+K navigation, Add holding state,
log out); hero (value split, chips, missing currency, skeleton); dashboard
(hero only for glass, `.shell-dup` marking and act-as exemption, `openAdd`
and its act-as guard); admin switch (on/off, self-refresh); theme sync.

## 9. Risks

* Backdrop blur costs GPU on low-end devices: limited to panels, never
  table rows; solid fallback when transparency is reduced.
* Matching inline style text (`[style*="var(--bg-card)"]`) is coupled to how
  components spell their styles; a component that stops using the token
  simply loses the blur, nothing breaks.
* Two UIs to maintain until the current one is retired.
