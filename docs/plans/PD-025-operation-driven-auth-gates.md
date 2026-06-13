# PD-025: Operation-driven auth gates

Implements the auth-wiring hardening flagged in
[PD-022 §Known follow-ups](./PD-022-user-auth-and-multi-tenancy.md) and in
the final review of #23. Today `AuthGate` decides whether the caller needs
admin or super-admin by string-matching on the request path
(`strings.HasSuffix(path, "/promote")` plus a `strings.HasPrefix("/api/admin")`
catch-all). It works because every admin route happens to start with
`/api/admin` and the super-admin endpoints all end in `/promote`, `/demote`,
`/region`, or are exactly `/admin/admins`. That coincidence is the bug
waiting to happen: a future operation that breaks any of those conventions
silently lands in the wrong tier.

## Goals

* Replace the `superAdminRoute(path)` suffix check and the
  `strings.HasPrefix(path, "/api/admin")` catch-all with an **explicit
  per-route tier table** keyed by `"<METHOD> <echo route pattern>"`, the
  same key shape `publicRoutes` and `onboardingRoutes` already use.
* Preserve every existing semantic — deny-by-default for unknown routes,
  super-admin still bypasses admin gates, `must_change_password` still
  blocks everything except `onboardingRoutes`.
* Add a sanity test that fails if any route registered by the generated
  server (`api/api.gen.go`) lacks a tier entry. That way, a new admin
  operation cannot ship without an explicit tier decision.

## Non-goals

* Reorganising the auth handler / mapper layer. Out of scope.
* Operation-IDs instead of "METHOD path" keys. Tempting (the generated
  server hangs middleware off operationID), but the existing public /
  onboarding maps already use the path-shape key; changing both keys at
  once is two refactors in one diff. Park as a follow-up.
* The two other PD-022 backend follow-ups (`COOKIE_SECURE` config flag,
  single-round-trip holdings update). Each ships as its own PR.

## Build order (each step = test-first)

1. **Tier enum + table** — add a private `routeTier` enum
   (`tierUser`, `tierAdmin`, `tierSuperAdmin`) and a `routeTiers` map in
   `internal/httpserver/auth.go`. Map every admin / super-admin route
   currently registered by `api.gen.go` to its tier; comment groups the
   entries by tier for readability. Failing test
   (`TestAuthGate_TierTableMatchesGeneratedRoutes`) walks the registered
   routes and asserts every `/api/admin/...` path has a `routeTiers`
   entry.
2. **Gate by tier** — replace the two string-match checks in `AuthGate`
   with a single `routeTiers[key]` lookup that allows the request when
   `user` satisfies the tier (admin → admin-or-superadmin, superadmin →
   superadmin only). Default tier (key missing) stays `tierUser` so
   non-admin routes still need only a login. Tests added in step 1 go
   green.
3. **Behavioural tests** — for each tier transition that used to be
   covered by `TestAuthGate_*`, assert the same outcomes (403 for a user
   hitting `/api/admin/...`, 403 for an admin hitting a super-admin
   route, 200 for a super-admin hitting either). Existing
   `httpserver` tests should already cover most of these; add the
   missing ones rather than regress.

## Verification run

* `go test ./...` — all packages `ok`.
* `golangci-lint run ./...` — 0 issues.
* `pre-commit run --all-files` — passes.

## Deviations from the design doc

None. DD-001 §6 says "/api/admin requires admin role; super-admin actions
require super-admin"; this PR encodes the same rule, just less
fragilely.

## Known follow-ups

* Migrate the public / onboarding / tier maps to operationID keys (drops
  the dependency on the URL shape). Defer.
* Hook a sanity check into CI (or generator post-step) so a new admin
  operation that lacks a tier entry fails the build, not just the test.

## Rollout

Pure refactor of the middleware. No DB or API contract change. Rollback:
revert the merge.
