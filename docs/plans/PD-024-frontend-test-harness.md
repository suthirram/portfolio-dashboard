# PD-024: Frontend test harness + pure-helper extraction

Implements the first follow-up flagged in
[PD-022 §Known follow-ups](./PD-022-user-auth-and-multi-tenancy.md) — the
auth and admin flows merged in #23 are covered only by `npm run typecheck`
and `npm run build`, with no behaviour tests. This PR **lands the harness
and the pure-helper extractions** so every later frontend test PR has
something to land into; component tests for the screens themselves are
intentionally deferred to follow-up PRs (one screen / concern per PR — see
[Follow-up PRs](#follow-up-prs)) to keep each review small.

## Goals (shipped in this PR)

* Run frontend tests with **Vitest + React Testing Library + jsdom**.
  Vitest because it shares Vite's config / module resolution, runs on the
  same TS pipeline as the build, and matches the toolchain the rest of the
  repo already uses (no Jest + Babel + ts-jest fan-out).
* Add `test` / `test:run` / `test:coverage` scripts. Expose Vitest + RTL
  globals via `tsconfig.compilerOptions.types`.
* Extract pure helpers from the auth + admin features (guard logic, post-login
  redirect, act-as routing decisions) into testable functions, then test
  every branch. JSX components become thin wrappers around the helpers.

## Non-goals (deferred to follow-up PRs)

* **Component tests for screens** — `AuthContext`, `LoginPage`,
  `OnboardingPage`, guard components, `AdminUserView` act-as wiring. Each
  ships as a separate small PR; see [Follow-up PRs](#follow-up-prs).
* **Pre-commit + CI gate** for the frontend test suite — defers until the
  first batch of screen tests has landed; otherwise the gate runs only the
  helper tests and gives a false sense of coverage.
* End-to-end / Playwright tests. Out of scope; the existing wire-level
  backend mtest suite + the planned component tests cover both ends of the
  request path well enough for now.
* Snapshot tests. Brittle on a styled SPA; not worth adding.
* Visual-regression / a11y testing. Worth doing later — separate PD.
* The other three PD-022 follow-ups (operation-driven auth gates,
  `COOKIE_SECURE` flag, single-round-trip holdings update). Each lands as
  its own PR; PD numbers will follow whatever GitHub assigns when the
  branches are pushed.

## Build order (this PR — steps 1–2 only)

1. **Vitest install + wiring** — add `vitest`, `@testing-library/react`,
   `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`,
   `@types/node`, `@vitest/coverage-v8` as dev deps. Add `vitest.config.ts`
   (jsdom env, setup file, `globals: true`). Add `vitest.setup.ts` that
   imports `@testing-library/jest-dom/vitest` and auto-runs `cleanup()`
   after each test. Add scripts: `"test": "vitest"`,
   `"test:run": "vitest run"`, `"test:coverage": "vitest run --coverage"`.
   Expose Vitest + jest-dom globals via `tsconfig.compilerOptions.types`.
   Smoke test (`smoke.test.ts`) that asserts `1 + 1 === 2` and that
   `document.createElement` works to prove the harness runs.
2. **Pure-helper extraction (no behaviour change)** —
   `features/auth/guardRules.ts` exports four pure decisions
   (`requireAuthDecision`, `requireAdminDecision`,
   `requireSuperAdminDecision`, `redirectIfAuthedDecision`) returning a
   `{ kind: 'loading' | 'render' | 'redirect' }` discriminated union;
   `guards.tsx` becomes a thin wrapper rendering whichever the helper
   returned. `features/admin/actAsRouting.ts` exports `holdingsPath` /
   `holdingPath` / `pricesPath` / `summaryPath` / `isActingAs` (empty or
   whitespace `userId` treated as no act-as); the api client calls them
   instead of duplicating the ternary five times. 19 vitest cases cover
   every branch.

## Follow-up PRs

Each lands on its own branch off `main`, with its own PD doc using the
**PR number it ends up with** as the filename prefix. Pre-commit + CI gate
(step 8 of the original plan) lands with the last frontend-tests PR so it
gates a useful suite, not just the helper tests.

| Slice | Original step | Approx scope |
|---|---|---|
| `AuthContext` + guard component tests | 3 + 6 | Mount `<AuthProvider>` around a probe, mock `/api/auth/me`, assert `loading → user` / `loading → null` and `setUser` propagates. Guard components: `RequireAuth` redirects to `/login` when anonymous, `RequireAdmin` redirects regular users to `/`, `RequireSuperAdmin` redirects regional admins to `/`. |
| `LoginPage` + `SignupPage` tests | 4 (+SignupPage extra) | RTL + `userEvent` form-fill, mock the auth endpoints, assert navigation on success and error rendering on failure. |
| `OnboardingPage` + `ProfilePage` tests | 5 (+ProfilePage extra) | Forced-onboarding flow: form renders when `must_change_password` is set, submit calls `/api/auth/onboarding`, `setUser` invoked with cleared flag. Profile-page change-password + security-questions plans. |
| Admin act-as + admin list tests | 7 | Render `AdminUserView` with a fake target user, assert banner + that API calls hit `/api/admin/users/:id/holdings` not `/api/holdings`. `AdminUserList` action-row spies. |
| Pre-commit + CI gate | 8 | Add a `local` hook to `.pre-commit-config.yaml` running `cd frontend && npm run test:run`, skip when no `frontend/**` file is staged. Update `CLAUDE.md` + `.claude/portfolio-dashboard.md` to capture the "every new auth/admin screen ships with a component test" convention. |

## Verification run

* `cd frontend && npm install` — clean.
* `cd frontend && npm run test:run` — 3 files, 21 cases pass (1 smoke, 15
  guard, 5 act-as routing).
* `cd frontend && npm run typecheck` — clean.
* `cd frontend && npm run build` — clean.
* `pre-commit run --all-files` — gofmt / golangci-lint / markdownlint /
  yamllint all pass. The vitest hook lands with the gating PR (last
  follow-up).

## Deviations from the design doc

None. This PR doesn't touch PRD-001 / DD-001 behaviour; it only adds tests
and pure-helper extractions of code that already exists.

## Known follow-ups

* Component-test PRs listed in [Follow-up PRs](#follow-up-prs) above —
  each lands as its own small PD-NNN PR.
* `ForgotPasswordPage` and `AdminManageAdmins` tests are not slotted into
  any of the planned follow-ups; add to whichever auth / admin batch they
  fit best, or land as a stand-alone PR.
* Storybook / visual regression — open question, defer.

## Rollout

Pure additive change (new dev-deps, new test files, helper extractions that
preserve behaviour). No runtime risk.

Rollback: revert the merge commit. No data or schema impact.
