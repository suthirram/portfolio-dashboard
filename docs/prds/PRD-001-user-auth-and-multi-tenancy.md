# PRD-001: User authentication, roles, and regional multi-tenancy

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Related**: [PD-012 deploy runbook](../plans/PD-012-cloudflare-flyio-deploy.md)

## 1. Context

Today the portfolio dashboard is a single shared portfolio with no auth — anyone
who hits the API can list, edit, or delete holdings. With the app moving to a
public URL via PD-012, this stops being acceptable. We also want multiple people
to use one deployment for their own portfolios, overseen by a small set of
region-scoped administrators.

Concretely: every `Holding` lives in one collection with no owner field
(`backend/internal/domain/holding.go:10` — `ID, Script, Symbol, …` but no
`UserID`), and every handler does an unscoped `Find/Insert/Update/Delete` on
that collection (`backend/internal/handlers/holdings.go:23,77,128,162`). None
of the routes require authentication.

## 2. Goals (in scope for v1)

1. Each holding is owned by exactly one user; users only see their own.
2. Username + password signup and login.
3. Users pick a **region** at signup: India, Europe, or US.
4. Security questions captured at signup, used for self-service password reset.
5. Logout, change password (while logged in), and forgot-password (via security
   questions) flows.
6. A three-tier role model — **super admin → admin → user** (see §2.1):
   * **super admin** (single, bootstrap `admin`/`admin`): manages admins,
     assigns each admin one or more regions, and can see/manage every user in
     every region.
   * **admin**: created by the super admin and assigned region(s); can see and
     manage only the users whose region is in their assigned set.
   * **user**: owns their holdings; belongs to one region.
7. Region is an **access-control / visibility** construct, not data residency —
   all data still lives in the single Atlas cluster. "Region" decides who
   oversees you, not where your bytes are stored (§10).
8. Admins and the super admin are full participants in the auth model: they have
   security questions and self-recover via the forgot-password flow like any
   user.

### 2.1 Role hierarchy and region scoping

```
super admin ── sees all regions, manages admins + all users
   │  assigns regions to
   ▼
admin (region: e.g. {india})  ── sees only users whose region ∈ its set
   │  oversees
   ▼
user (region: india)          ── sees only their own holdings
```

* Exactly **one super admin** in v1 (the bootstrap account). There is no UI to
  create a second super admin; the `role` field leaves room for it in v2.
* Admins are created **by the super admin only**. Users never self-promote.
* An admin's authority is the set of regions assigned to it. v1 supports one or
  more regions per admin (modelled as a list; the common case is one).
* A user belongs to exactly one region, chosen at signup. Changing a user's
  region is an admin/super-admin action (§5.9), never self-service — otherwise
  a user could move themselves out of their admin's view.

## 3. Non-goals (v2+)

* OAuth/social login, magic-link login, MFA/TOTP.
* Email-based password reset (no SMTP dependency in v1).
* More than three regions, or sub-regions / countries within a region.
* True data residency per region (regions are a visibility filter only).
* A second super admin, or admin-creates-admin.
* Per-holding sharing / read-only links / team workspaces.
* Audit log of admin actions.
* Password complexity policy beyond a minimum length.
* Rate limiting of login (deferred but flagged as risk).

## 4. Roles

| Role | Can | Cannot |
|---|---|---|
| `user` | sign up, log in, manage own holdings, change own password, self-recover via security questions, change own security questions | see other users; reach any admin page; change own region |
| `admin` | everything a user can do **for any user in its assigned region(s)**: view/act-as, reset lockout, hide / reactivate / hard-delete, reassign region within its own set | see users outside its regions; see or manage other admins; change its own region set |
| `super admin` | everything, in every region; create admins and assign their regions; demote/hide/delete/reset admins; reassign any user's region | (single account; cannot delete or demote itself) |

`role` is a single string on the user document (`"user" | "admin" | "superadmin"`).
In v1 exactly one document has `role:"superadmin"`.

## 5. User flows

### 5.1 Signup (user)

```
/signup → POST /api/auth/signup
  username, name, password, password_confirm,
  region ∈ {india, europe, us},
  3 × {question_id, answer}
→ creates user with role="user", region=<chosen>,
  security_question_failures=0, locked=false; auto-logs in; redirects to /
```

Validation:

* `username`: 3–32 chars, `[A-Za-z0-9_-]`. Stored both as `username`
  (lowercased, for uniqueness + login lookups) and `username_display` (as
  typed, for the UI). Login matches case-insensitively against `username`.
* `name`: free text, 1–80 chars.
* `password`: min 8 chars.
* `region`: required; must be one of the three (`GET /api/regions`).
* Security questions: exactly 3 chosen from a fixed list of ~10 (see §6.2);
  answers normalized (`strings.ToLower(strings.TrimSpace(a))`) and hashed
  before storage; original answer text is never persisted.

### 5.2 Login + forced onboarding

```
/login → POST /api/auth/login (username, password)
  if account.disabled → 403
  if account.locked   → 423 Locked
  if password wrong   → 401, increment login_failures
  else                → 200, session cookie set
```

Redirects after login: `user` → `/`, `admin` → `/admin`,
`superadmin` → `/admin` (with the Admins tab visible).

While an account has `must_change_password=true` it is forced through
`/onboarding` — one screen that sets a real password **and** three real
security questions — before anything else loads. This applies to:

* the bootstrap super admin (`admin`/`admin`), and
* any admin the super admin just created with a temporary password.

### 5.3 Logout

```
POST /api/auth/logout → invalidates the current session (server side) and clears the cookie.
```

UI: top-right menu next to the user name.

### 5.4 Profile: change password / name / username

```
/profile
  PUT /api/auth/password  (current_password, new_password, new_password_confirm)
  PUT /api/auth/profile   (name?, username?)  — requires current_password
  PUT /api/auth/security-questions (current_password, 3×{question_id, answer})
```

Changing the password invalidates all *other* sessions for the account.
Users cannot change their own `region` here (§2.1). The bootstrap super admin
can rename itself from `admin` via `PUT /api/auth/profile` like anyone else.

### 5.5 Forgot password (security questions)

```
/forgot-password
  Step 1: enter username
  Step 2: server returns the 3 question prompts for this user
  Step 3: submit all 3 answers + new password + confirm
```

Server logic (`POST /api/auth/recover`):

* If `security_question_failures >= 3` → 423 Locked, "Locked out. Ask an
  admin to reset."
* Compare all 3 normalized answers against stored hashes.
* On full match → reset password, `security_question_failures = 0`,
  invalidate all sessions.
* On any mismatch → increment `security_question_failures`; at 3, set
  `locked = true`.

This flow is identical for every role. A locked-out user/admin is reset by
someone above them (admin → super admin); the super admin has no peer and
recovers via the break-glass CLI (§9.4).

Username-enumeration trade-off: step 2 reveals whether a username exists.
Accepted for v1 (§10); mitigated by rate limiting later.

### 5.6 Admin: list users (region-scoped)

```
/admin (admin or super admin)
  GET /api/admin/users  → users where region ∈ caller's authority
                          (super admin: all regions; ?include_hidden=1 to show disabled)
  Columns: username, name, region, status (active/locked/disabled),
           login_failures, sq_failures, last_login.
  Row actions: View, Hide/Reactivate, Reset lockout, Delete, Change region.
```

An admin's list is filtered server-side to `region ∈ managed_regions`. The
super admin sees everyone and additionally gets a **Region** filter and the
**Admins** tab (§5.9).

### 5.7 Admin: view a specific user's holdings (act-as)

```
/admin/users/:id → loads as if "acting as" that user (must be in caller's region scope)
  GET    /api/admin/users/:id/holdings
  GET    /api/admin/users/:id/prices
  GET    /api/admin/users/:id/summary
  POST/PUT/DELETE /api/admin/users/:id/holdings[/:holdingId]
```

Banner: **"Viewing &lt;name&gt; (@&lt;username&gt;) — &lt;region&gt; — changes write to
their portfolio"** with a "Back to user list" link.

### 5.8 Admin: manage a user (region-scoped)

```
POST   /api/admin/users/:id/reset-lockout → sq_failures=0, locked=false
POST   /api/admin/users/:id/hide          → disabled=true (login blocked, holdings preserved)
POST   /api/admin/users/:id/reactivate    → disabled=false
PUT    /api/admin/users/:id/region        → {region}  (target region must also be in caller's authority)
DELETE /api/admin/users/:id               → hard-delete user AND all their holdings (irreversible)
```

**Hide vs. delete:**

* **Hide** = soft-delete. Login blocked, row kept (`disabled=true`), removed
  from the default list (a "Show hidden" toggle reveals it), holdings intact.
  Reversible via **Reactivate**.
* **Delete** = hard. Removes the user document and all their holdings in one
  operation; admin confirms by re-typing the username. Not reversible.

Every `/api/admin/users/:id*` call is authorized twice: the caller is an
admin/super admin (role check) **and** the target user's region is within the
caller's authority (scope check). A regional admin reassigning a user's region
(`PUT …/region`) may only move them between regions it manages; moving a user
out of all its regions is a super-admin action.

### 5.9 Super admin: manage admins + regions

```
/admin/admins (super admin only)
  GET    /api/admin/admins                 → list all admins (+ their regions, status)
  POST   /api/admin/admins                 → {username, name, regions[], temp_password}
                                             creates role="admin", must_change_password=true
  PUT    /api/admin/admins/:id/regions     → {regions[]}  reassign coverage
  POST   /api/admin/admins/:id/demote      → role="user" (must then carry a region; super admin sets one)
  POST   /api/admin/admins/:id/reset-lockout
  POST   /api/admin/admins/:id/hide | /reactivate
  DELETE /api/admin/admins/:id             → hard-delete admin (admins own no holdings of their own unless they also signed up; see open Q)
```

The super admin cannot demote, hide, or delete **itself** (server-side
`id != self`). There is no endpoint to create another super admin in v1.

## 6. Data model

### 6.1 New collection: `users`

```go
type User struct {
    ID                       primitive.ObjectID `bson:"_id,omitempty"`
    Username                 string             `bson:"username"`          // lowercase, uniqueness + login
    UsernameDisplay          string             `bson:"username_display"`  // as typed, for the UI
    Name                     string             `bson:"name"`
    PasswordHash             string             `bson:"password_hash"`     // bcrypt
    Role                     string             `bson:"role"`              // "user" | "admin" | "superadmin"
    Region                   string             `bson:"region,omitempty"`  // "india"|"europe"|"us" for users; "" for super admin
    ManagedRegions           []string           `bson:"managed_regions,omitempty"` // for admins: regions they oversee
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

Field semantics by role:

| Role | `Region` | `ManagedRegions` |
|---|---|---|
| `user` | their one region | unused |
| `admin` | unused (empty) | regions they oversee (≥1) |
| `superadmin` | empty | empty = treated as "all regions" in code |

Indexes:

* `{username: 1}` unique
* `{role: 1}` — bootstrap check ("does a super admin exist?") and admin listing
* `{region: 1}` — region-scoped user listing for admins

### 6.2 Region catalogue

Static, defined in `backend/internal/auth/regions.go`:

```
india    "India"
europe   "Europe"
us       "US"
```

Surfaced via `GET /api/regions` (public, for the signup dropdown). A single
source of truth shared by signup validation and admin region-assignment.

### 6.3 Security question catalogue

Static list in `backend/internal/auth/questions.go`. Initial set:

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

Surfaced via `GET /api/auth/security-questions` (public; used by signup and by
step 2 of recover).

### 6.4 New collection: `sessions`

```go
type Session struct {
    ID         string             `bson:"_id"`        // opaque, 32 bytes base64url
    UserID     primitive.ObjectID `bson:"user_id"`
    CreatedAt  time.Time          `bson:"created_at"`
    ExpiresAt  time.Time          `bson:"expires_at"` // CreatedAt + 30 days, sliding
    UserAgent  string             `bson:"user_agent,omitempty"`
}
```

Indexes: `{user_id: 1}` (bulk-invalidate on password change),
`{expires_at: 1}` TTL (auto-expiry).

Why a server-side session table instead of a stateless JWT: revocation is
trivial (admin hides a user → next request 401) and "log out other sessions on
password change" is a single delete.

### 6.5 Modify collection: `holdings`

Add field:

```go
UserID primitive.ObjectID `bson:"user_id"`
```

New index `{user_id: 1, script: 1}` replaces the existing `{script: 1}` sort
index, redundant once everything is user-scoped. Holdings are **not** tagged
with a region — region is derived from the owning user, so a user moving region
needs no holdings rewrite.

### 6.6 Migration of existing data

`backend/cmd/migrate.go` — one-shot cobra subcommand
`portfolio-api migrate users --owner <username>`:

1. Ensures the named user exists; else exits with an error.
2. `holdings.updateMany({user_id: {$exists: false}}, {$set: {user_id: <id>}})`.
3. Rebuilds indexes.

Run once after deploying v1 to assign all legacy rows to the bootstrap super
admin. Documented in §11.

## 7. API contract

### Public (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/regions` | Region catalogue for the signup dropdown |
| GET | `/api/auth/security-questions` | Catalogue for signup / recover step 2 |
| POST | `/api/auth/signup` | Create user (incl. region), auto-login |
| POST | `/api/auth/login` | Username + password → session cookie |
| POST | `/api/auth/recover` | Username + 3 answers + new password |
| GET | `/api/healthz` | Unchanged |

### Authenticated (any role)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/me` | Current user (id, username, name, role, region, managed_regions, must_change_password) |
| POST | `/api/auth/logout` | Invalidate current session |
| PUT | `/api/auth/password` | Change own password (requires current) |
| PUT | `/api/auth/profile` | Change own name / username (requires current password) |
| PUT | `/api/auth/security-questions` | Replace own questions/answers (requires current password) |
| GET/POST/PUT/DELETE | `/api/holdings…` | Existing, now scoped to caller's `user_id` |
| GET | `/api/prices`, `/api/summary` | Scoped to caller |
| GET | `/api/market/price`, `/api/market/forex` | Market data, no scoping |

### Admin + super admin (region-scoped)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users` | List users in caller's region authority (`?include_hidden=1`) |
| GET | `/api/admin/users/:id` | Get one user (region-checked) |
| POST | `/api/admin/users/:id/reset-lockout` | sq_failures=0, locked=false |
| POST | `/api/admin/users/:id/hide` / `/reactivate` | Soft-delete / restore |
| PUT | `/api/admin/users/:id/region` | Reassign region (within caller's authority) |
| DELETE | `/api/admin/users/:id` | Hard-delete user + holdings |
| GET/POST/PUT/DELETE | `/api/admin/users/:id/holdings…` | Act on user's portfolio |
| GET | `/api/admin/users/:id/prices`, `/summary` | Read scoped to that user |

### Super admin only

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/admins` | List admins + their regions |
| POST | `/api/admin/admins` | Create admin (username, name, regions[], temp password) |
| PUT | `/api/admin/admins/:id/regions` | Reassign an admin's regions |
| POST | `/api/admin/admins/:id/demote` | Admin → user |
| POST | `/api/admin/admins/:id/reset-lockout` / `/hide` / `/reactivate` | Manage admin account |
| DELETE | `/api/admin/admins/:id` | Hard-delete an admin |

Middleware chain: `requireAuth` everywhere under `/api` (except the public
list above); `requireAdmin` (admin or super admin) on `/api/admin/users*`,
with a per-request **region scope check** comparing the target user's region to
the caller's `managed_regions` (super admin bypasses); `requireSuperAdmin` on
`/api/admin/admins*`.

## 8. Frontend

### 8.1 Routing

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

Guards: `<RequireAuth>`, `<RequireAdmin>` (admin or super admin),
`<RequireSuperAdmin>`.

### 8.2 Auth context

`frontend/src/features/auth/AuthContext.tsx` — calls `/api/auth/me` on mount,
exposes `{user, login, logout, refresh}`. The shell uses it to:

* render the user's name + a role/region badge in the header, with a logout menu;
* show an **Admin** link for `admin` and `superadmin`;
* show an **Admins** tab inside `/admin` only for `superadmin`;
* force a redirect to `/onboarding` while `user.must_change_password`.

### 8.3 Existing screens

* `useHoldings.ts` — when a `userId` prop is set (admin acting-as), it switches
  to `/api/admin/users/:id/...`; otherwise it uses `/api/holdings`. Stays the
  source of truth for fetch state.
* `HoldingsTable` and `AddEditModal` operate on `Holding[]` and need no change
  beyond what the hook passes in.
* Region badge in the header; region column in the admin user list; region
  banner on the act-as view.

## 9. Security decisions

### 9.1 Password storage

`golang.org/x/crypto/bcrypt`, default cost. Idiomatic for Go, no new C deps.

### 9.2 Sessions

Opaque random session ID (`crypto/rand` → 32 bytes → base64url) in the
`sessions` collection. Set as an HTTP-only, `Secure`, `SameSite=None` cookie
`pd_session` (cross-origin Pages → Fly requires `SameSite=None`). CSRF defence:
every state-changing request must carry `X-Requested-With: portfolio-dashboard`,
verified by middleware — a cross-origin form attack can't add custom headers
without a preflight, which CORS denies. (JWT-in-header was considered and
rejected: revocation and "log out everywhere" are harder for no gain here.)

### 9.3 Bootstrap super admin

On boot, if no `role:"superadmin"` exists, the backend creates
`username="admin"`, `password="admin"`, `role="superadmin"`,
`must_change_password=true`, with three placeholder security questions whose
answers are random and un-guessable. The random placeholders matter: until
onboarding completes, the forgot-password flow can't bypass it because nobody
knows the answers. Onboarding (§5.2) then sets a real password and three real
security answers and clears `must_change_password`. This runs in
`cmd/serve.go` after `EnsureIndexes`.

Newly created admins follow the same pattern: the super admin sets a temporary
password, `must_change_password=true` and random placeholder answers, so the
admin is forced through onboarding on first login.

### 9.4 Lockout reset, by tier

Resetting `security_question_failures` does **not** clear `login_failures`
(login failures don't lock in v1; they're surfaced for visibility so a v2
login-rate-limit policy can be added without schema change).

Recovery chain follows the hierarchy:

* A locked **user** is reset by an admin in their region (or the super admin).
* A locked **admin** is reset by the super admin (`/api/admin/admins/:id/reset-lockout`).
* The **super admin** has no peer, so its recovery is its own security
  questions plus a **break-glass CLI** (the primary path, not a fallback):
  * `portfolio-api admin reset-lockout --username <name>` — clears `locked`
    and `security_question_failures` directly in MongoDB.
  * `portfolio-api admin set-password --username <name>` — resets the password.

  Both need only `MONGODB_URI` and no login, so they run on the Fly machine via
  `flyctl ssh console`. Documented in §11.

### 9.5 Authorization model

Two orthogonal checks, both enforced server-side on every admin request:

1. **Role**: is the caller an admin / super admin?
2. **Scope**: is the target user's `region` in the caller's authority?
   (`managed_regions` for an admin; unrestricted for a super admin.)

Never trust the frontend to scope — the region filter on `/api/admin/users`
is applied in the Mongo query, and single-resource routes re-check the target's
region before acting.

## 10. Risks / accepted trade-offs

* **"Region" is visibility, not residency.** All data sits in one Atlas cluster
  (eu-west-1 per PD-012). Region controls *who can see a user*, not where the
  data physically lives. If real data-residency is ever needed, that's a much
  bigger project (separate clusters) — explicitly out of scope.
* **Username enumeration** at signup, recover step 2, and login errors.
  Accepted for v1; mitigate with rate limiting + uniform error text in v2.
* **No login rate limit** in v1. Mitigate with a sensible bcrypt cost; add
  rate limiting (Fly edge or middleware) in v2.
* **Single super admin = single point of failure.** Mitigated by the
  break-glass CLI; a second super admin is a v2 option (the `role` field
  already allows it).
* **Cross-origin cookies** need `SameSite=None;Secure` → production only; dev
  keeps the same-origin Vite proxy.
* **Atlas free tier** has no field-level encryption at rest. We store hashed
  (not encrypted) passwords + answer hashes, and only fixed `question_id`s
  (never user-entered prompt text), so a full read reveals no hints.

## 11. Rollout plan

1. Land schema + auth code; new auth/region endpoints exist but `/api/holdings`
   stays open (no middleware yet).
2. Run `portfolio-api migrate users --owner admin` against prod, stamping every
   existing holding with the bootstrap super admin's `user_id`.
3. Flip `requireAuth` on for `/api/holdings`, `/api/prices`, `/api/summary`.
   Existing prod data is already scoped, so the super admin sees everything.
4. Ship the new frontend (login/signup/onboarding/profile/admin/admins).
5. Log in as `admin`/`admin`; forced onboarding sets a real password + security
   questions. Then create regional admins from `/admin/admins` and assign their
   regions.

Rollback: removing the middleware reverts the API to public; data stays usable
because every row already has a `user_id`.

**Break-glass (super admin locked out):**

```bash
flyctl ssh console -a portfolio-dashboard-api
./portfolio-api admin reset-lockout --username admin   # clears the lock
./portfolio-api admin set-password   --username admin   # prompts for a new password
```

## 12. Out of scope for v1 (so we don't scope-creep)

* Email verification on signup; email on the user record at all.
* Profile fields beyond `name` (phone, avatar, currency preference).
* Reassigning *holdings* between users (region moves carry the whole user).
* Audit trail of admin/super-admin actions.
* Per-user API tokens for scripting.
* A second super admin or admin-creates-admin.

## 13. Resolved decisions

1. **Roles**: three tiers — super admin (single, bootstrap `admin`/`admin`) →
   admin (region-scoped, created by super admin) → user.
2. **Regions**: India, Europe, US. Users pick one at signup; admins are
   assigned one or more; region is a visibility filter, not data residency.
3. **Delete user**: admin gets **Hide** (soft, reversible, keeps holdings) and
   **Delete** (hard, cascades to holdings, confirm-by-retype).
4. **Username case**: case-insensitive uniqueness/login; as-typed form stored in
   `username_display` for the UI.
5. **Bootstrap rename**: the super admin can rename itself from `/profile`; not
   forced.
6. **User region change**: admin/super-admin only, never self-service.

## 14. Open questions

1. **Admins and holdings**: does an admin (or super admin) have a portfolio of
   their own? Current assumption: admins are oversight accounts with no
   holdings and no region membership; if they want a portfolio they'd need a
   separate `user` account. Confirm, or let admins own holdings too.
2. **Multiple regions per admin**: modelled as a list to be safe. If you want
   strictly one region per admin, we can make it a scalar and simplify the UI.
