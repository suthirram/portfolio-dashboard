# PD-022: Implementation plan — user auth, roles, and regional multi-tenancy

* **Status**: implemented (2026-06-13) — branch `feature/PRD-001-auth-multi-tenancy`, [PR #23](https://github.com/suthirram/portfolio-dashboard/pull/23)
* **Owner**: project owner
* **Implements**: [PRD-001](../prds/PRD-001-user-auth-and-multi-tenancy.md) (the *what/why*) via [DD-001](../designs/DD-001-user-auth-and-multi-tenancy.md) (the *how*)
* **Related**: [PD-012 deploy runbook](./PD-012-cloudflare-flyio-deploy.md)

This is the build log / implementation plan: the order work landed, the
test-first evidence, deviations from DD-001, and known follow-ups. PRD-001 owns
behaviour; DD-001 owns the design. This doc owns *how it was actually built*.

## Skills used

* **`tdd-no-fix-without-test`** — test-first practice enforced on every backend
  slice (test written and seen to fail before production code). Frontend slices
  verified via `tsc --noEmit` + `vite build` (no component test harness in repo).
* **`anthropic-skills:portfolio-dashboard`** — consulted as context for stack
  conventions (Go backend, OpenAPI-first, feature-folder React). Note: this
  repo already uses **echo** (not chi) and **cobra**; existing conventions won
  over the skill's chi suggestion.
* **`code-review` (high, --comment)** — started against the PR; the finder
  subagents were interrupted by a session limit and need a re-run (see
  Follow-ups).

## Test policy (project-specific, from skill + owner feedback)

Behavioural tests only. **No** DB-availability or DB-error negative-path tests
beyond `mongo.ErrNoDocuments` → 404. The database is assumed available. All
backend tests use the `mtest` mock driver, so the suite is deterministic and
needs no live Mongo.

## Build order (each step = test-first)

1. **`internal/auth` primitives** — `regions.go`, `questions.go` catalogues;
   `password.go` (bcrypt password + normalized-answer hashing, `crypto/rand`
   session ids); `context.go` (user/session on request context).
   Tests: `catalogues_test.go`, `password_test.go`.
2. **Domain + indexes** — `domain.User`, `domain.Session`, `Holding.UserID`;
   `db.EnsureIndexes` extended for `users` (unique username, role, region+role),
   `sessions` (user_id, `expires_at` TTL), and `{user_id, script}` on holdings.
   Test: `mongo_test.go` (asserts an index command per collection).
3. **OpenAPI contract** — extended `api/openapi.yaml` (auth + admin operations,
   `cookieAuth` security scheme, 401/403/409/423 responses); regenerated
   `api/api.gen.go` (`make generate`) and `frontend/src/lib/api/schema.gen.ts`
   (`npm run gen:api`).
4. **Auth handlers** — `handlers/auth.go` + `session.go` + `context.go`:
   signup, login, logout, me, recover (two-step), change password, update
   profile, update security questions, onboarding. Cookie issue/clear via the
   stashed echo context. Test: `auth_test.go`.
5. **Per-user scoping** — `handlers/holdings.go` reworked around scoped cores;
   `scopedFilter(uid, extra)` pins `user_id` on every holdings query;
   `market.go`/`summary.go` gained `pricesFor`/`summaryFor`. Tests:
   `holdings_scope_test.go` (wire-level: inspects the issued Mongo command's
   filter/document to prove `user_id` is present); legacy integration tests
   updated to inject a user context.
6. **Admin + super-admin** — `handlers/admin.go`: region-scoped user list/get,
   hide/reactivate, delete (cascades holdings + sessions), reset-lockout,
   act-as holdings CRUD/prices/summary; super-admin promote/demote/region.
   `loadTargetUser` makes out-of-scope ids read as 404. Test: `admin_test.go`.
7. **Middleware** — `httpserver/auth.go`: `CSRFCheck` (X-Requested-With on state
   changes) and `AuthGate` (session → user, public allowlist, admin/super-admin
   route gates, forced-onboarding gate); `server.go` switched CORS to
   credentialed with explicit origins and added a strict middleware that stashes
   the echo context. Test: `auth_test.go` (httpserver).
8. **Bootstrap + ops** — `auth.EnsureSuperAdmin` (first-run `admin`/`admin`,
   `must_change_password`, random placeholder answers); `cmd/migrate.go`
   (`migrate users --owner`, break-glass `admin reset-lockout|set-password`).
   Test: `bootstrap_test.go`.
9. **Frontend** — `react-router-dom` with guards; login/signup/forgot/
   onboarding/profile pages; `AuthContext`; admin user list, act-as dashboard,
   super-admin admins view; `useHoldings(userId?)` + `AddEditModal` act-as
   wiring; `client.ts` sends `credentials: 'include'` + CSRF header.

## Verification run

* Backend: `go vet ./...` clean; `go test ./...` — all 8 packages `ok`.
* Frontend: `npm run typecheck` clean; `npm run build` succeeds (bundle-size
  warning only, pre-existing single-chunk build).
* `gofmt -w` applied across `internal/` and `cmd/`.

## Deviations from DD-001 (and why)

1. **`POST /api/auth/onboarding`** added (not in the DD §3 endpoint table) so
   onboarding sets password + 3 security answers and clears
   `must_change_password` atomically in one call.
2. **Recovery step 1 is `POST /api/auth/recover/questions`** (username in the
   body, not the URL) to keep usernames out of access logs.
3. **Security-questions replace route is `PUT /api/auth/security-questions/answers`**
   to avoid colliding with the public `GET /api/auth/security-questions`
   catalogue path.
4. **Dev cookie fallback**: on plain-HTTP localhost the session cookie uses
   `SameSite=Lax` without `Secure` (browsers silently drop `Secure` cookies over
   HTTP); production (HTTPS) emits `SameSite=None; Secure` exactly per DD-001 §5.
   Avoids the `vite --https` dev gotcha.
5. **CORS dev fallback** is `http://localhost:3000,http://localhost:5173`
   instead of `*`, because credentialed CORS forbids the wildcard; production
   still requires `CORS_ALLOWED_ORIGINS`.
6. **`admin set-password` reads `PD_NEW_PASSWORD`** from the environment rather
   than a TTY prompt, so it works under `flyctl ssh console` and stays out of
   shell history.

## Post-review refinements (2026-06-13)

Landed after the initial implementation, in order:

1. **Persistence layer extracted** — every MongoDB read/write moved out of the
   handlers, middleware, and CLI into a dedicated package, one store type per
   collection (`HoldingStore`/`UserStore`/`SessionStore`) with `ErrNotFound`/
   `ErrDuplicate` sentinels. Holdings are owner-scoped by construction. The
   wire-level mtest suite passed unchanged, proving the move was
   behaviour-preserving.
2. **Package renamed** `internal/store` → **`internal/persistence`** (directory,
   package, and qualified references; `store.go` → `persistence.go`). The
   `Handler.store` field and the per-collection type names are unchanged.
3. **Quality gate enforced** — the configured `.pre-commit-config.yaml` hook was
   never installed; ran `pre-commit install` and fixed every `golangci-lint`
   finding (`modernize` → `maps.Copy` / `for range n`; dropped a pass-through
   `withTimeout` wrapper and always-constant test params; reasoned
   `//nolint:gosec` on request-side cookies). `golangci-lint run ./...` is now
   clean and gates every commit.
4. **Code review completed** — `migrate users` no longer opens a second Mongo
   connection for the index rebuild. Flagged but not changed: the session
   cookie's `Secure`/`SameSite` derive from `c.Scheme()` (works with the PD-012
   proxy stack; a `COOKIE_SECURE` config flag is the hardening follow-up).
5. **Go conventions captured** — added a strict-typing / idiomatic-Go / naming /
   comments section plus the lint gate to `.claude/portfolio-dashboard.md`.

Verification after refinements: `go test ./...` green across **9** packages
(adds `internal/persistence`), `golangci-lint` 0 issues, frontend
`typecheck` / `build` clean.

## Known follow-ups

* Frontend has no component-test harness; auth flows are covered only by
  typecheck/build. Adding Vitest + Testing Library is the next step — the
  sibling PR #22 extracts pure routing/profile helpers and tests them with
  `node:test`, a pattern worth borrowing (with a cleaner harness).
* The session cookie's `Secure`/`SameSite` derive from `c.Scheme()`; consider a
  `COOKIE_SECURE` config flag so it does not depend on the proxy forwarding
  `X-Forwarded-Proto`.
* Bundle is a single >500 kB chunk (pre-existing); code-splitting the admin
  area is optional.
* v2 items already noted in PRD-001 §9 / DD-001 §12: login rate-limiting,
  uniform error text to remove username enumeration, optional Pages Function
  proxy to drop `SameSite=None`.

## Rollout (mirrors DD-001 §11)

1. Deploy; new endpoints live, bootstrap creates the super admin.
2. `portfolio-api migrate users --owner admin` stamps legacy holdings.
3. Log in as `admin`/`admin` → forced onboarding secures the account.
4. Regional admins self-signup, then the super admin promotes them.

Rollback: remove the `AuthGate` wiring; data stays usable because every holding
already carries a `user_id`.
