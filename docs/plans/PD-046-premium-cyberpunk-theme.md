# PD-046: Premium flag + cyberpunk theme

* **Status**: In progress
* **Owner**: project owner
* **Builds on**: [PD-045](PD-045-ui-revamp.md) (design-token system)

## 1. Goal

A **premium** tier flag on user accounts, toggled by the super admin (same
model as `gold_enabled`, PRD-003 §2.4), gating a new **cyberpunk theme** —
a third theme alongside dark/light: neon magenta/cyan accents on a deep
violet-black backdrop, neon glows on cards, brand, and primary buttons.
Non-premium users keep exactly the dark/light pair they have today.

## 2. Non-goals

* No billing/payment integration — "premium" is a manually granted flag.
* No other premium-gated features in this plan; the flag is generic so
  future features can reuse it.
* No per-user server-side theme storage — theme choice stays a local
  browser preference (`pd_theme` in localStorage); the server only gates
  *eligibility* via the flag.

## 3. Design

* **Flag**: `premium` bool on `users` (bson `premium,omitempty`), exposed
  on the `User` API schema. Default false; omitted = false for existing
  rows — no migration.
* **Toggle endpoint**: `PUT /admin/users/{id}/premium` `{enabled: bool}`,
  super-admin only, self-toggle allowed — an exact mirror of
  `PUT /admin/users/{id}/gold` (`AdminSetUserGold`). 204 on success.
* **Theme**: `data-theme="cyberpunk"` token set in
  `frontend/src/styles/tokens.css` (all existing variable names, PD-045
  contract) plus a small `[data-theme="cyberpunk"]`-scoped flair block in
  `components.css` (neon card/button glows). `useTheme` grows
  `ThemeName = 'light' | 'dark' | 'cyberpunk'`.
* **Gating (frontend)**: the cyberpunk option is offered only when
  `user.premium`; if a stored theme is `cyberpunk` but the session user is
  not premium (flag revoked), the app falls back to dark. The theme is
  cosmetic, so client-side gating is sufficient — no server enforcement
  beyond the flag itself.
* **Admin UI**: `Enable premium` / `Disable premium` action in
  `AdminUserList`, super-admin only, next to the gold toggle.

## 4. PR sequence (FE/BE split)

| # | Branch | Scope | Test anchor |
|---|---|---|---|
| PR1 | `feat/PD-046-premium-flag` | this doc; `premium` on domain + API `User`; `PremiumToggleRequest`; `users_id_premium` spec path; `AdminSetUserPremium` controller; codegen | controller tests: super-admin 204 (any account + self), regional admin 403 |
| PR2 | `feat/PD-046-cyberpunk-theme` | regen frontend types; cyberpunk tokens + flair CSS; `useTheme` third theme; premium-gated theme button on dashboard nav; non-premium fallback; admin premium toggle button | vitest: theme cycles for premium, hidden + fallback for non-premium; admin button fires the API call |

## 5. Rollback

Each PR reverts independently. The flag is additive (`omitempty`); no data
migration either way. Reverting PR2 leaves the flag inert server-side.
