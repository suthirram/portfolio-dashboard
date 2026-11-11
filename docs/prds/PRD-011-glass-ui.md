# PRD-011: Glass UI behind a per-account switch

* **Status**: Accepted (owner request, 2026-11-11)
* **Owner**: project owner
* **Design**: [DD-011](../designs/DD-011-glass-ui.md)
* **Rollout**: [PD-054](../plans/PD-054-glass-ui.md)
* **Visual spec**: [PD-054-glass-ui.html](../visuals/PD-054-glass-ui.html)

## 1. Problem

The app's look dates from PD-045: a top bar of buttons on every page, flat
cards, spinners while data loads and browser alerts for errors. Moving
between pages means going back to the dashboard first, and nothing can be
reached from the keyboard.

## 2. Goals

1. A modern "glass and depth" UI: translucent frosted surfaces over a slowly
   drifting gradient mesh, layered shadows, and gains and losses that glow.
2. Better navigation: a persistent sidebar on every signed-in page, a
   bottom tab bar on phones, and a ⌘K / Ctrl+K command palette for pages,
   themes, Add holding and Log out.
3. Better feedback: toasts instead of browser alerts, skeletons instead of
   blank space while the first figures load, gentle motion on page entry.
4. Every page reworked: the dashboard gains a hero panel (current value,
   today per currency, unrealised gain, the INR/EUR split); page headers
   become floating toolbars; filters, tables, modals and menus turn to glass.
5. Opt-in per account: the super admin switches it on or off for each user
   in Admin → Users. Everyone else keeps the current UI exactly as it is.

## 3. Non-goals

* Changing any figure, calculation, route or API other than the switch.
* A component library or new dependencies.
* Retiring the current UI (a later decision, once the glass UI has run).
* Regional admins flipping the switch (gold, premium and the delta switch
  are super-admin only; this one follows them).

## 4. Who uses this

* **Super admin**: turns the glass UI on for themselves first, then for
  chosen users, from Admin → Users (**Glass UI on** / **Glass UI off**).
* **Users with the switch on**: see the glass UI on every signed-in page,
  in dark, light and (premium) cyber themes.
* **Everyone else**: no visible change.

## 5. Behaviour

* The switch is stored on the account and returned by `/auth/me`, so it
  follows the user across browsers. Turning it on for your own account
  takes effect at once, without a reload.
* After a logout, the login screen keeps the look the last account had.
* Admin act-as keeps its own page links (they point at the target user's
  pages); the sidebar's links are the admin's own.
* Reduced motion: no drifting mesh or entry animation. Reduced
  transparency, or a browser without backdrop blur: solid surfaces.

## 6. Open questions

RESOLVED (owner, 2026-11-11): direction "glass and depth"; every page in
scope; one implementation PR covering frontend and backend (exception to
the split rule), all other rules apply.

## 7. Success criteria

* With the switch off, every page renders as today (existing tests pass
  unchanged apart from fixtures that list every user field).
* With it on, every signed-in page shows the shell, the palette opens with
  ⌘K / Ctrl+K and runs commands, and errors arrive as toasts.
* The super admin can switch any account, including their own.
