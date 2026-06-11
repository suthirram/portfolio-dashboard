# DD-001: Technical design — user auth, roles, and regional multi-tenancy

* **Status**: Draft (technical design)
* **Owner**: project owner
* **Implements**: [PRD-001](../prds/PRD-001-user-auth-and-multi-tenancy.md)
* **Related**: [PD-012 deploy runbook](../plans/PD-012-cloudflare-flyio-deploy.md)

This is the *how* for PRD-001. The product behaviour, roles, and acceptance
criteria live in the PRD; this doc covers the data model, API surface, auth and
authorization mechanisms, frontend wiring, migration, and rollout.

## 1. Current state

Every `Holding` lives in one collection with no owner field
(`backend/internal/domain/holding.go:10` — `ID, Script, Symbol, …`, no
`UserID`), and every handler does an unscoped `Find/Insert/Update/Delete`
(`backend/internal/handlers/holdings.go:23,77,128,162`). No route requires
authentication. The handler resolves its collection via
`Handler.col()` (`handlers.go:53`), which we extend to scope by user.

## 2. Data model

### 2.1 New collection: `users`

```go
type User struct {
    ID                       primitive.ObjectID `bson:"_id,omitempty"`
    Username                 string             `bson:"username"`          // lowercase, uniqueness + login
    UsernameDisplay          string             `bson:"username_display"`  // as typed, for the UI
    Name                     string             `bson:"name"`
    PasswordHash             string             `bson:"password_hash"`     // bcrypt
    Role                     string             `bson:"role"`              // "user" | "admin" | "superadmin"
    Region                   string             `bson:"region,omitempty"`  // "india"|"europe"|"us"; "" for super admin (= all)
    Disabled                 bool               `bson:"disabled"`          // hide / soft-delete flag
    Locked                   bool               `bson:"locked"`            // sq_failures >= 3
    LoginFailures            int                `bson:"login_failures"`
    SecurityQuestionFailures int                `bson:"security_question_failures"`
    SecurityQuestions        []SecurityAnswer   `bson:"security_questions"` // len == 3
    MustChangePassword       bool               `bson:"must_change_password"`
    CreatedAt                time.Time          `bson:"created_at"`
    UpdatedAt                time.Time          `bson:"updated_at"`
    LastLoginAt              *time.Time         `bson:"last_login_at,omitempty"`
}

type SecurityAnswer struct {
    QuestionID string `bson:"question_id"`  // e.g. "first_pet"
    AnswerHash string `bson:"answer_hash"`  // bcrypt(normalize(answer))
}
```

`Region` is double-duty: for a `user` it's their membership; for an `admin`
it's both their own membership and the region they oversee; for `superadmin`
it's empty and treated as "all" in code.

Indexes:

* `{username: 1}` unique
* `{role: 1}` — bootstrap check ("does a super admin exist?") and the
  super-admin "list of admins" view
* `{region: 1, role: 1}` — region-scoped user listing for admins
  (`region == caller.region AND role == "user"`)

### 2.2 New collection: `sessions`

```go
type Session struct {
    ID        string             `bson:"_id"`        // opaque, 32 bytes base64url
    UserID    primitive.ObjectID `bson:"user_id"`
    CreatedAt time.Time          `bson:"created_at"`
    ExpiresAt time.Time          `bson:"expires_at"` // CreatedAt + 30 days, sliding
    UserAgent string             `bson:"user_agent,omitempty"`
}
```

Indexes: `{user_id: 1}` (bulk-invalidate on password change),
`{expires_at: 1}` TTL (auto-expiry).

Server-side sessions over stateless JWT because revocation is trivial (hide a
user → next request 401) and "log out my other sessions on password change" is
a single delete.

### 2.3 Modify collection: `holdings`

Add `UserID primitive.ObjectID bson:"user_id"`. New index
`{user_id: 1, script: 1}` replaces the existing `{script: 1}` sort index
(redundant once everything is user-scoped). Holdings are **not** region-tagged —
region is derived from the owning user, so moving a user's region needs no
holdings rewrite.

### 2.4 Static catalogues

Region catalogue — `backend/internal/auth/regions.go`:

```
india    "India"
europe   "Europe"
us       "US"
```

Security-question catalogue — `backend/internal/auth/questions.go`:

```
first_pet           "Name of your first pet"
mothers_maiden      "Mother's maiden name"
birth_city          "City you were born in"
first_school        "Name of your first school"
favourite_teacher   "Name of your favourite teacher"
oldest_friend       "Name of your oldest friend"
first_car           "Make/model of your first car"
favourite_book      "Title of a favourite book"
nickname_child      "Childhood nickname"
street_grew_up      "Street you grew up on"
```

Both are the single source of truth for validation and for the public
catalogue endpoints.

## 3. API contract

### 3.1 Public (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/regions` | Region catalogue for the signup dropdown |
| GET | `/api/auth/security-questions` | Catalogue for signup / recover step 2 |
| POST | `/api/auth/signup` | Create user (incl. region), auto-login |
| POST | `/api/auth/login` | Username + password → session cookie |
| POST | `/api/auth/recover` | Username + 3 answers + new password |
| GET | `/api/healthz` | Unchanged |

### 3.2 Authenticated (any role)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/me` | Current user (id, username, name, role, region, must_change_password) |
| POST | `/api/auth/logout` | Invalidate current session |
| PUT | `/api/auth/password` | Change own password (requires current) |
| PUT | `/api/auth/profile` | Change own name / username (requires current password) |
| PUT | `/api/auth/security-questions` | Replace own questions/answers (requires current password) |
| GET/POST/PUT/DELETE | `/api/holdings…` | Existing, now scoped to caller's `user_id` |
| GET | `/api/prices`, `/api/summary` | Scoped to caller |
| GET | `/api/market/price`, `/api/market/forex` | Market data, no scoping |

### 3.3 Admin + super admin (region-scoped)

For an admin caller, every `:id` must reference a `role:"user"` row in the same
region. The super admin can target any `:id`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users` | List users in caller's region (`?include_hidden=1`); super admin sees all |
| GET | `/api/admin/users/:id` | Get one user (region + role-checked) |
| POST | `/api/admin/users/:id/reset-lockout` | sq_failures=0, locked=false |
| POST | `/api/admin/users/:id/hide` / `/reactivate` | Soft-delete / restore |
| DELETE | `/api/admin/users/:id` | Hard-delete user + holdings |
| GET/POST/PUT/DELETE | `/api/admin/users/:id/holdings…` | Act on user's portfolio |
| GET | `/api/admin/users/:id/prices`, `/summary` | Read scoped to that user |

### 3.4 Super admin only

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/admins` | List accounts where `role ∈ {admin, superadmin}` (filtered users view) |
| POST | `/api/admin/users/:id/promote` | `role: user → admin` (keeps region + holdings) |
| POST | `/api/admin/users/:id/demote` | `role: admin → user` |
| PUT | `/api/admin/users/:id/region` | Reassign any account's region |

Note there is no separate "admins" collection — admins are users with
`role:"admin"`, so the super admin reuses the `/api/admin/users/:id/...`
endpoints on admin rows.

## 4. Request flows (server logic)

### 4.1 Signup (`POST /api/auth/signup`)

Validates: `username` 3–32 chars `[A-Za-z0-9_-]`, unique on the lowercased
form; `name` 1–80 chars; `password` ≥ 8 chars; `region` ∈ catalogue; exactly
3 security questions from the catalogue. Answers normalized via
`strings.ToLower(strings.TrimSpace(a))` then bcrypt-hashed; raw answers never
stored. Creates `role:"user"`, `region:<chosen>`, counters zeroed, then issues
a session (auto-login).

### 4.2 Login (`POST /api/auth/login`)

`disabled → 403`; `locked → 423`; wrong password → `401` and increment
`login_failures`; success → issue session cookie, set `LastLoginAt`. Redirect
target is decided by the frontend from `role` + `must_change_password`.

### 4.3 Recover (`POST /api/auth/recover`)

Step 2 returns the three question prompts for the username. Step 3:
`security_question_failures >= 3 → 423`; compare all three normalized answers;
full match → reset password, zero the counter, invalidate all sessions; any
mismatch → increment the counter, and at 3 set `locked = true`.

### 4.4 Promote / demote / region (super admin)

Promote: `role` user→admin; keeps region, holdings, sessions, security
questions. Demote: admin→user, mirror image. Existing sessions stay valid; the
next `/admin/*` call from a demoted user is rejected by `requireAdmin`. Region:
`PUT` sets `region` on any account. All three reject `id == self`.

## 5. Authentication

* **Passwords**: `golang.org/x/crypto/bcrypt`, default cost. No new C deps.
* **Sessions**: opaque random id (`crypto/rand` → 32 bytes → base64url) in the
  `sessions` collection. Cookie `pd_session`, `HttpOnly`, `Secure`,
  `SameSite=None` (cross-origin Pages → Fly requires `None`).
* **CSRF**: with `SameSite=None`, every state-changing request must carry
  `X-Requested-With: portfolio-dashboard`, verified by middleware. A
  cross-origin form attack cannot add custom headers without a preflight, which
  CORS denies. (JWT-in-header was considered and rejected: revocation and "log
  out everywhere" are harder, for no gain in this threat model.)

## 6. Authorization

Two orthogonal checks, both enforced server-side on every admin request:

1. **Role** — is the caller `admin` or `superadmin`?
2. **Scope** (admin callers only) — does
   `target.role == "user" AND target.region == caller.region`?
   The super admin bypasses; no scope check applies.

Never trust the frontend to scope: the region filter on `/api/admin/users` is
applied in the Mongo query, and single-resource routes re-check the target's
region before acting.

Middleware chain: `requireAuth` on everything under `/api` except the public
list; `requireAdmin` on `/api/admin/users*` (with the role+region scope check);
`requireSuperAdmin` on `/api/admin/admins`, `/promote`, `/demote`, `/region`.
These slot into the existing echo middleware stack in
`backend/internal/httpserver/server.go` (where `RequestLogger`, `Recover`, and
CORS are already wired).

## 7. Bootstrap super admin

On boot, if no `role:"superadmin"` exists, create `username:"admin"`,
`password:"admin"`, `role:"superadmin"`, `must_change_password:true`, with
three placeholder security questions whose answers are random and un-guessable.
The random placeholders matter: until onboarding completes, the recover flow
can't bypass it because nobody knows the answers. Onboarding then sets a real
password + three real security answers and clears `must_change_password`. This
runs in `cmd/serve.go` after `EnsureIndexes`.

Promotion does **not** trigger onboarding — a promoted user already chose a
real password and security questions at signup. There is no "create admin from
scratch" code path.

## 8. Lockout and recovery

Resetting `security_question_failures` does **not** clear `login_failures`
(login failures don't lock in v1; surfaced for visibility so a v2 login
rate-limit can be added without a schema change).

Recovery follows the hierarchy:

* A locked **user** is reset by an admin in their region (or the super admin),
  via `POST /api/admin/users/:id/reset-lockout`.
* A locked **admin** is reset by the super admin via the same endpoint (only
  the super admin's role check lets it target an admin row).
* The **super admin** has no peer, so its recovery is its own security questions
  plus a **break-glass CLI** (the primary path, not a fallback):
  * `portfolio-api admin reset-lockout --username <name>` — clears `locked` and
    `security_question_failures` directly in MongoDB.
  * `portfolio-api admin set-password --username <name>` — resets the password.

  Both need only `MONGODB_URI` and no login, so they run on the Fly machine via
  `flyctl ssh console` (see §11).

## 9. Frontend

### 9.1 Routing

`frontend/src/App.tsx:65` is currently a single page with no router. Add
`react-router-dom`:

```
/login              LoginPage
/signup             SignupPage          (region dropdown)
/forgot-password    ForgotPasswordPage
/onboarding         OnboardingPage      (forced when must_change_password)
/                   DashboardPage       (auth-required)
/profile            ProfilePage         (auth-required)
/admin              AdminUserList       (admin or super admin)
/admin/users/:id    AdminUserView       (admin or super admin, region-checked)
/admin/admins       AdminManageAdmins   (super admin only)
```

Guards: `<RequireAuth>`, `<RequireAdmin>`, `<RequireSuperAdmin>`.

### 9.2 Auth context

`frontend/src/features/auth/AuthContext.tsx` — calls `/api/auth/me` on mount,
exposes `{user, login, logout, refresh}`. The shell uses it to render the
name + role/region badge and logout menu; show an **Admin** link for `admin`
and `superadmin`; show an **Admins** tab only for `superadmin`; and force a
redirect to `/onboarding` while `must_change_password`.

### 9.3 Existing screens

* `useHoldings.ts` — when a `userId` prop is set (admin acting-as), it targets
  `/api/admin/users/:id/...`; otherwise `/api/holdings`. Stays the source of
  truth for fetch state.
* `HoldingsTable` / `AddEditModal` operate on `Holding[]` and need no change
  beyond what the hook passes.
* Add a region badge in the header, a region column in the admin user list, and
  a region banner on the act-as view.

## 10. Migration

`backend/cmd/migrate.go` — one-shot cobra subcommand
`portfolio-api migrate users --owner <username>`:

1. Ensure the named user exists; else exit with an error.
2. `holdings.updateMany({user_id: {$exists: false}}, {$set: {user_id: <id>}})`.
3. Rebuild indexes.

Run once after deploy to assign all legacy rows to the bootstrap super admin.

## 11. Rollout

1. Land schema + auth code; new auth/region endpoints exist but `/api/holdings`
   stays open (no middleware yet).
2. `portfolio-api migrate users --owner admin` against prod, stamping every
   existing holding with the super admin's `user_id`.
3. Flip `requireAuth` on for `/api/holdings`, `/api/prices`, `/api/summary`.
   Prod data is already scoped, so the super admin sees everything.
4. Ship the new frontend (login/signup/onboarding/profile/admin/admins).
5. Log in as `admin`/`admin`; forced onboarding secures the super admin.
6. Regional admins self-sign-up via `/signup` (choosing region + own
   password + security questions); the super admin promotes them.

Rollback: removing the middleware reverts the API to public; data stays usable
because every row already has a `user_id`.

Break-glass (super admin locked out):

```bash
flyctl ssh console -a portfolio-dashboard-api
./portfolio-api admin reset-lockout --username admin   # clears the lock
./portfolio-api admin set-password   --username admin   # prompts for a new password
```

## 12. Security trade-offs

* **"Region" is visibility, not residency.** All data sits in one Atlas cluster
  (eu-west-1 per PD-012). Separate-cluster residency is out of scope.
* **Username enumeration** at signup, recover step 2, and login errors.
  Accepted for v1; mitigate with rate limiting + uniform error text in v2.
* **No login rate limit** in v1. Mitigate with a sensible bcrypt cost; add
  rate limiting (Fly edge or middleware) in v2.
* **Single super admin** is a single point of failure — mitigated by the
  break-glass CLI; a second super admin is a v2 option.
* **Cross-origin cookies** need `SameSite=None;Secure` → production only; dev
  keeps the same-origin Vite proxy.
* **Atlas free tier** has no field-level encryption at rest. We store hashed
  (not encrypted) passwords + answer hashes, and only fixed `question_id`s
  (never user-entered prompt text), so a full read reveals no hints.

## 13. Out of scope (engineering)

* Email verification / any email on the user record.
* Profile fields beyond `name` (phone, avatar, currency preference).
* Reassigning *holdings* between users (region moves carry the whole user).
* Audit trail of admin/super-admin actions.
* Per-user API tokens.
* A second super admin or an admin-creates-admin flow.

## 14. Open technical questions

None outstanding. Add new ones here as they surface during implementation.
