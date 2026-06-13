# PD-024: Frontend test harness + initial auth coverage

Implements the first follow-up flagged in
[PD-022 §Known follow-ups](./PD-022-user-auth-and-multi-tenancy.md) — the
auth and admin flows merged in #23 are covered only by `npm run typecheck`
and `npm run build`, with no behaviour tests. This PR lands the harness and
the first round of meaningful coverage so every later frontend change has a
test net to land into.

## Goals

* Run frontend tests with **Vitest + React Testing Library + jsdom**.
  Vitest because it shares Vite's config / module resolution, runs on the
  same TS pipeline as the build, and matches the toolchain the rest of the
  repo already uses (no Jest + Babel + ts-jest fan-out).
* Add `npm test` and `npm run test:run` scripts and gate every commit on
  `npm run test:run` via `.pre-commit-config.yaml`. CI calls the same
  command.
* Extract pure helpers from the auth + admin features (guard logic, post-login
  redirect, act-as routing decisions) into testable functions, then test them
  with `node:test`-style assertions executed by Vitest.
* Add component tests for the most load-bearing surfaces:
  `LoginPage` (happy path + error rendering), `OnboardingPage` (the forced-
  super-admin gate), `AuthContext` (the `/api/auth/me` boot + `setUser`
  flow), `RequireAuth` / `RequireAdmin` / `RequireSuperAdmin` (redirect
  paths), and the act-as banner / route resolution.
* Document the harness conventions in `CLAUDE.md` so the assistant defaults
  to writing component tests for new screens.

## Non-goals

* End-to-end / Playwright tests. Out of scope; the existing wire-level
  backend mtest suite + new component tests cover both ends of the request
  path well enough for now.
* Snapshot tests. Brittle on a styled SPA; the diff this PR adds is already
  big enough.
* Visual-regression / a11y testing. Worth doing later — separate PD.
* The other three PD-022 follow-ups (operation-driven auth gates,
  `COOKIE_SECURE` flag, single-round-trip holdings update). Each lands as its
  own PR (PD-025, PD-026, PD-027) so this one stays reviewable.

## Build order (each step = test-first)

1. **Vitest install + wiring** — add `vitest`, `@testing-library/react`,
   `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`,
   `@types/node` as dev deps. Add `vitest.config.ts` (jsdom env, setup file,
   `globals: true`). Add `vitest.setup.ts` that imports
   `@testing-library/jest-dom`. Add scripts: `"test": "vitest"`,
   `"test:run": "vitest run"`. Smoke test (`smoke.test.ts`) that asserts
   `1 + 1 === 2` to prove the harness runs.
2. **Pure-helper extraction (no behaviour change)** — move the redirect /
   guard / act-as decisions out of the JSX components into
   `features/auth/guardRules.ts` and `features/admin/actAsRouting.ts`. Each
   helper takes plain data, returns a discriminated union. Replace inline
   logic with calls to the helper. Tests:
   `features/auth/guardRules.test.ts`,
   `features/admin/actAsRouting.test.ts` — cover every branch.
3. **`AuthContext` test** — mount a `<AuthProvider>` around a probe
   component, mock `fetch` for `/api/auth/me`, assert it transitions
   `loading → user`, `loading → null` (no session), and that `setUser`
   propagates to consumers. Uses RTL's `renderHook` for the consumer.
4. **`LoginPage` test** — render under `MemoryRouter`, fill the form, mock
   the login endpoint, assert success navigates to `/` and failure renders
   the error string from `{"error": "..."}`. Use `userEvent` for typing.
5. **`OnboardingPage` test** — assert that when `user.must_change_password`
   is true the form mounts, that submitting calls `/api/auth/onboarding`,
   and that `setUser` is invoked with the cleared flag on success.
6. **Guard component tests** — `RequireAuth` redirects to `/login` when no
   user, renders children when present; `RequireAdmin` redirects to `/`
   when role is `user`; `RequireSuperAdmin` redirects to `/admin` when role
   is `admin`. Mount each under a memory router with a probe outlet.
7. **Act-as routing test** — render `AdminUserView` with a fake target user
   in router state, assert the act-as banner shows the target label and the
   API calls go to `/api/admin/users/:id/holdings` not `/api/holdings`.
   Stub `fetch` with a spy.
8. **Pre-commit + CI gate** — add a `local` hook to
   `.pre-commit-config.yaml` that runs `cd frontend && npm run test:run`
   (skip when no `frontend/**` file is staged so unrelated commits stay
   fast). Update CLAUDE.md + `.claude/portfolio-dashboard.md` to mention
   the harness and the convention "every new auth/admin screen ships with a
   component test."

## Verification run

* `cd frontend && npm install` — clean.
* `cd frontend && npm run test:run` — all tests pass.
* `cd frontend && npm run typecheck` — clean.
* `cd frontend && npm run build` — clean.
* `pre-commit run --all-files` — gofmt / golangci-lint / markdownlint /
  yamllint / new vitest hook all pass.

## Deviations from the design doc

None. This PR doesn't touch PRD-001 / DD-001 behaviour; it only adds tests
and pure-helper extractions of code that already exists.

## Known follow-ups

* Add Vitest coverage reporting (`vitest run --coverage`) once the suite
  grows past the first slice.
* Component tests for `SignupPage`, `ForgotPasswordPage`, `ProfilePage`,
  `AdminUserList`, `AdminManageAdmins` — start there in PD-024-followup
  once this harness lands.
* Storybook / visual regression — open question, defer.

## Rollout

Pure additive change (new dev-deps, new test files, helper extractions that
preserve behaviour). No runtime risk.

Rollback: revert the merge commit. No data or schema impact.
