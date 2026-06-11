# PD-013: User authentication and multi-tenant holdings

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Related**: [PD-012 deploy runbook](../plans/PD-012-cloudflare-flyio-deploy.md)

## 1. Context

Today the portfolio dashboard is a single shared portfolio with no auth — anyone
who hits the API can list, edit, or delete holdings. With the app moving to a
public URL via PD-012, this stops being acceptable. We also want to let multiple
people use one deployment for their own portfolios.

Concretely: every `Holding` lives in one collection with no owner field
(`backend/internal/domain/holding.go:10` — `ID, Script, Symbol, …` but no
`UserID`), and every handler does an unscoped `Find/Insert/Update/Delete` on
that collection (`backend/internal/handlers/holdings.go:23,77,128,162`). None
of the routes require authentication.

## 2. Goals (in scope for v1)

1. Each holding is owned by exactly one user; users only see their own.
2. Username + password signup and login.
3. Security questions captured at signup, used for self-service password reset.
4. Logout, change password (while logged in), and forgot-password (via security
   questions) flows.
5. An **admin** role:
   * sees a list of all users on `/admin`
   * can open any user's portfolio (read + add + edit + delete on their behalf)
   * can reset the lockout counter on a locked-out user
   * can disable/enable a user and promote/demote admins
6. Normal users cannot reach `/admin` (the API returns 403; the UI hides links).
7. First admin: bootstrap credentials are `admin` / `admin`. On this account's
   first login the app forces an onboarding step that sets a real password
   **and** real security questions before anything else loads.
8. The admin is a full participant in the auth model: the admin has security
   questions and can self-recover via the forgot-password flow exactly like a
   normal user.

## 3. Non-goals (v2+)

* OAuth/social login, magic-link login, MFA/TOTP.
* Email-based password reset (no SMTP dependency in v1).
* Per-holding sharing / read-only links / team workspaces.
* Audit log of admin actions.
* Password complexity policy beyond a minimum length.
* Rate limiting of login (deferred but flagged as risk).

## 4. User roles

| Role | Can | Cannot |
|---|---|---|
| `user` | sign up, log in, manage own holdings, change own password, reset own password via security questions, change own security questions | see other users, reach admin pages |
| `admin` | everything a user can do **for any user**; reset a user's lockout counter; disable / enable / promote / demote users | n/a |

Role is a single string field on the user document (`"user"` or `"admin"`).

## 5. User flows

### 5.1 Signup

```
/signup → POST /api/auth/signup
  username, name, password, password_confirm,
  3 × {question_id, answer}
→ creates user with role="user", security_question_failures=0,
  locked=false; auto-logs in; redirects to /
```

Validation:

* `username`: 3–32 chars, `[A-Za-z0-9_-]`. Stored both as
  `username` (lowercased, for uniqueness + login lookups) and
  `username_display` (as the user typed it, for the UI). Login matches
  case-insensitively against `username`.
* `name`: free text, 1–80 chars.
* `password`: min 8 chars.
* Security questions: exactly 3 chosen from a fixed list of ~10 (see §6.2);
  answers normalized (`strings.ToLower(strings.TrimSpace(a))`) and hashed
  before storage; original answer text is never persisted.

### 5.2 Login

```
/login → POST /api/auth/login (username, password)
  if account.locked → 423 Locked
  if password wrong → 401, increment login_failures (not the security-question counter)
  else → 200, session cookie set
```

After a normal user login, redirect to `/`. After an admin login, redirect to
`/admin`. While the bootstrap admin still has `must_change_password=true`
(i.e. password `admin` and placeholder questions), it is forced through
`/onboarding` — a single screen that sets a real password **and** three real
security questions — before anything else loads. The flow clears
`must_change_password` only when both are saved.

### 5.3 Logout

```
POST /api/auth/logout → invalidates the current session (server side) and clears the cookie.
```

UI: top-right menu next to the user name.

### 5.4 Change password (while logged in)

```
/profile → PUT /api/auth/password
  current_password, new_password, new_password_confirm
```

Validates `current_password` against the stored hash. Invalidates all
other sessions for this user (forces re-login elsewhere).

### 5.5 Forgot password (security questions)

```
/forgot-password
  Step 1: enter username
  Step 2: server returns the 3 question prompts for this user
  Step 3: submit all 3 answers + new password + confirm
```

Server logic (`POST /api/auth/recover`):

* If `security_question_failures >= 3` → 423 Locked with message
  "Locked out. Ask an admin to reset."
* Compare all 3 normalized answers against stored hashes.
* On full match → reset password, set `security_question_failures = 0`,
  invalidate all sessions.
* On any mismatch → increment `security_question_failures`. At 3, set
  `locked = true` and require admin reset.

This flow is identical for admins — an admin recovers via its own security
questions. If an admin also fails recovery 3 times and no second admin exists
to reset it, use the break-glass CLI in §9.4 / §11.

Username-enumeration trade-off: to keep the flow usable, we do reveal whether
a username exists at step 2. Flagged in §10 as accepted risk for a personal
app; mitigated by rate limiting in a follow-up.

### 5.6 Admin: list users

```
/admin (admin only)
  GET /api/admin/users → [{id, username, name, role, locked, login_failures, security_question_failures, created_at, last_login_at}]
  Table with: username, name, role, status (active/locked/disabled),
              login_failures, sq_failures, last_login.
  Actions per row: View, Promote/Demote, Disable/Enable, Reset lockout.
```

### 5.7 Admin: view a specific user's holdings

```
/admin/users/:id → loads as if "acting as" that user
  GET /api/admin/users/:id/holdings  (full HoldingsTable for that user)
  GET /api/admin/users/:id/prices
  GET /api/admin/users/:id/summary
  POST/PUT/DELETE /api/admin/users/:id/holdings[/:holdingId]
```

Top of the page shows a banner: **"Viewing <name> (@<username>) — changes
write to their portfolio"** with a "Back to user list" link.

### 5.8 Admin: reset lockout / manage user

```
POST   /api/admin/users/:id/reset-lockout → security_question_failures=0, locked=false
POST   /api/admin/users/:id/hide          → disabled=true (login blocked, holdings preserved)
POST   /api/admin/users/:id/reactivate    → disabled=false
POST   /api/admin/users/:id/role          → {role: "admin"|"user"}
DELETE /api/admin/users/:id               → hard-delete user AND all their holdings (irreversible)
```

**Hide vs. delete (resolved):**

* **Hide** = soft-delete the account. Login is blocked, the row stays in the
  database with `disabled=true`, the user is hidden from the default admin
  list (a "Show hidden" toggle reveals them), and their holdings are kept
  intact. Reversible via **Reactivate**.
* **Delete** is the hard option: removes the user document and all their
  holdings in the same operation. Asks the admin to confirm by re-typing
  the username. Not reversible.

Admin cannot demote, hide, or delete themselves if they are the only
remaining admin (server-side check) — prevents accidental lockout of the
whole app.

## 6. Data model

### 6.1 New collection: `users`

```go
type User struct {
    ID                       primitive.ObjectID `bson:"_id,omitempty"`
    Username                 string             `bson:"username"`          // lowercase, used for uniqueness + login
    UsernameDisplay          string             `bson:"username_display"`  // as the user typed it, used in UI
    Name                     string             `bson:"name"`
    PasswordHash             string             `bson:"password_hash"`     // bcrypt
    Role                     string             `bson:"role"`              // "user" | "admin"
    Disabled                 bool               `bson:"disabled"`          // soft-delete / hide flag
    Locked                   bool               `bson:"locked"`            // sq_failures >= 3
    LoginFailures            int                `bson:"login_failures"`
    SecurityQuestionFailures int                `bson:"security_question_failures"`
    SecurityQuestions        []SecurityAnswer   `bson:"security_questions"` // len == 3
    MustChangePassword       bool               `bson:"must_change_password"` // true for bootstrap admin
    CreatedAt                time.Time          `bson:"created_at"`
    UpdatedAt                time.Time          `bson:"updated_at"`
    LastLoginAt              *time.Time         `bson:"last_login_at,omitempty"`
}

type SecurityAnswer struct {
    QuestionID string `bson:"question_id"`  // e.g. "first_pet"
    AnswerHash string `bson:"answer_hash"`  // bcrypt(normalize(answer))
}
```

Indexes:

* `{username: 1}` unique
* `{role: 1}` for admin-only counting (the "last admin" guard)

### 6.2 Security question catalogue

Static list, defined in `backend/internal/auth/questions.go`. Initial set:

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

Surfaced via `GET /api/auth/security-questions` (public, returns the list for
signup and for step 2 of recover).

### 6.3 New collection: `sessions`

```go
type Session struct {
    ID         string    `bson:"_id"`        // opaque, 32 bytes base64url
    UserID     primitive.ObjectID `bson:"user_id"`
    CreatedAt  time.Time `bson:"created_at"`
    ExpiresAt  time.Time `bson:"expires_at"` // CreatedAt + 30 days, sliding
    UserAgent  string    `bson:"user_agent,omitempty"`
}
```

Indexes:

* `{user_id: 1}` for bulk-invalidate on password change.
* `{expires_at: 1}` TTL index for auto-expiry.

Why a server-side session table instead of a stateless JWT: revocation is
trivial (admin disables a user → next request 401), and "log out other
sessions on password change" becomes a single delete.

### 6.4 Modify collection: `holdings`

Add field:

```go
UserID primitive.ObjectID `bson:"user_id"`
```

New index: `{user_id: 1, script: 1}` (replaces the existing `{script: 1}`
sort index, which becomes redundant once everything is user-scoped).

### 6.5 Migration of existing data

`backend/cmd/migrate.go` — new one-shot cobra subcommand
`portfolio-api migrate users --owner <username>`:

1. Ensures the named user exists; if not, exits with an error.
2. `holdings.updateMany({user_id: {$exists: false}}, {$set: {user_id: <id>}})`.
3. Rebuilds indexes.

Run once after deploying v1 to assign all legacy rows to the bootstrap admin
(or a designated user). Documented in §11.

## 7. API contract

### Public (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/security-questions` | Catalogue for signup / recover step 2 |
| POST | `/api/auth/signup` | Create user, auto-login |
| POST | `/api/auth/login` | Username + password → session cookie |
| POST | `/api/auth/recover` | Username + 3 answers + new password |
| GET | `/api/healthz` | Unchanged |

### Authenticated (any role)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/me` | Current user (id, username, name, role, must_change_password) |
| POST | `/api/auth/logout` | Invalidate current session |
| PUT | `/api/auth/password` | Change own password (requires current) |
| PUT | `/api/auth/profile` | Change own `name` and/or `username` (requires current password; bootstrap admin uses this to rename `admin`) |
| PUT | `/api/auth/security-questions` | Replace own questions/answers (requires current password) |
| GET/POST/PUT/DELETE | `/api/holdings…` | Existing, now scoped to caller's user_id |
| GET | `/api/prices`, `/api/summary` | Scoped to caller |
| GET | `/api/market/price`, `/api/market/forex` | Market data, no scoping needed |

### Admin only

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/:id` | Get one user |
| POST | `/api/admin/users/:id/reset-lockout` | sq_failures=0, locked=false |
| POST | `/api/admin/users/:id/disable` | disabled=true |
| POST | `/api/admin/users/:id/enable` | disabled=false |
| POST | `/api/admin/users/:id/role` | Promote/demote (with last-admin guard) |
| GET/POST/PUT/DELETE | `/api/admin/users/:id/holdings…` | Act on user's portfolio |
| GET | `/api/admin/users/:id/prices`, `/summary` | Read scoped to that user |

All `/api/admin/*` routes go through an `adminOnly` middleware in addition to
the standard `requireAuth` middleware.

## 8. Frontend

### 8.1 Routing

Currently `frontend/src/App.tsx:65` is a single page with no router. Add
`react-router-dom` and split into routes:

```
/login                  LoginPage
/signup                 SignupPage
/forgot-password        ForgotPasswordPage
/                       DashboardPage (auth-required)
/profile                ProfilePage    (auth-required)
/admin                  AdminUserList  (admin-required)
/admin/users/:id        AdminUserView  (admin-required)
```

Two route guards:

* `<RequireAuth>` — wraps protected routes; redirects to `/login` if no
  session (`GET /api/auth/me` returned 401).
* `<RequireAdmin>` — wraps admin routes; redirects normal users to `/`.

### 8.2 Auth context

`frontend/src/features/auth/AuthContext.tsx` — provider that calls
`/api/auth/me` on mount and exposes `{user, login, logout, refresh}`. App
shell uses it to:

* Conditionally render the **Add Holding** button (always for own portfolio).
* Show the user's name + role badge in the header, with a logout menu.
* Show an **Admin** link in the header only for `role === "admin"`.
* Force a redirect to `/profile?force=1` while `user.must_change_password`.

### 8.3 Existing screens

* `useHoldings.ts` — when `userId` prop is set (admin acting-as), it switches
  to the `/api/admin/users/:id/...` URLs; otherwise it uses the standard
  `/api/holdings`. The hook stays the source of truth for fetching state.
* `HoldingsTable` and `AddEditModal` already operate on a `Holding[]`; they
  don't need changes beyond what the hook passes in.
* Header (banner) on the admin-acting-as view.

## 9. Security decisions

### 9.1 Password storage

`golang.org/x/crypto/bcrypt`, default cost. Already idiomatic for Go and
brings no new C dependencies.

### 9.2 Sessions

Opaque random session ID (`crypto/rand` → 32 bytes → base64url) stored in
the `sessions` collection. Set as an HTTP-only, `Secure`, `SameSite=None`
cookie named `pd_session`. Cross-origin (Pages → Fly) requires
`SameSite=None`. To defend against CSRF given `SameSite=None`, every
state-changing request must include a custom header
`X-Requested-With: portfolio-dashboard` — verified by middleware. The
frontend already uses `fetch` and can add this header; browsers won't let
a cross-origin form attack add custom headers without a preflight, which
CORS denies. (Alternative considered: JWT in Authorization header, rejected
because it makes "log out everywhere on password change" harder to do
correctly and gains nothing for our threat model.)

### 9.3 Bootstrap admin

On boot, if no user with `role:"admin"` exists, the backend creates a user
`username="admin"`, `password="admin"`, `role="admin"`,
`must_change_password=true`, plus 3 placeholder security questions whose
answers are random and un-guessable. The random placeholders matter: until
the admin finishes onboarding, the forgot-password flow (§5.5) cannot be used
to bypass the forced onboarding, because nobody knows the answers. The
onboarding screen (§5.2) then replaces both the password and all three
security answers with real ones and clears `must_change_password`. After
that, the admin participates in recovery exactly like any user. This work
happens in `cmd/serve.go` after `EnsureIndexes`.

### 9.4 Lockout reset for users and admins

Resetting `security_question_failures` does **not** clear `login_failures`.
Login failures don't lock the account in v1 (only sq failures do); they are
surfaced in the admin table for visibility and so a v2 lockout policy on
login attempts can be bolted on without schema changes.

An admin can reset any user's lockout (§5.8). But the admin can lock
*itself* out of recovery (3 wrong security answers on its own account), and
in a single-admin deployment there is no second admin to reset it. Two
mitigations, both required:

* **Another admin** can reset a locked admin's counter via the same
  `POST /api/admin/users/:id/reset-lockout` — admins are not special-cased
  in that endpoint.
* **Break-glass CLI** for the single-admin case: a new cobra subcommand
  `portfolio-api admin reset-lockout --username <name>` clears
  `locked` and `security_question_failures` directly against MongoDB. It
  needs only `MONGODB_URI`, so it can be run on the Fly machine
  (`flyctl ssh console`) without any login. Documented in §11. A sibling
  `portfolio-api admin set-password --username <name>` is included as the
  ultimate recovery for a fully locked-out admin.

## 10. Risks / accepted trade-offs

* **Username enumeration** at signup, recover-step-2, and login error messages.
  Accepted for v1; mitigate in v2 with rate limiting + uniform error text.
* **No login rate limit** in v1. A determined attacker can brute force.
  Mitigate by setting a sensible bcrypt cost and adding rate limiting in
  v2 (e.g. via Fly's edge or middleware).
* **Cross-origin cookies** require `SameSite=None;Secure`, which means
  every dev hitting the deployed API needs HTTPS locally too. Dev keeps
  the existing same-origin Vite proxy, so this only affects production.
* **Atlas free tier** has no field-level encryption at rest. We're storing
  hashed (not encrypted) password + answer hashes, which is fine. We are
  **not** storing security-question prompts as user-entered text — only the
  fixed `question_id` — so even a full Atlas read doesn't reveal hints.

## 11. Rollout plan

1. Land schema + auth code behind the existing `/api/holdings` routes but
   keep them open (no middleware yet) — only the new auth endpoints exist.
2. Run `portfolio-api migrate users --owner admin` against prod, stamping
   every existing holding with the bootstrap admin's `user_id`.
3. Flip `requireAuth` middleware on for `/api/holdings`, `/api/prices`,
   `/api/summary`. Existing prod data is already scoped, so the admin login
   sees everything they had before.
4. Ship the new frontend (login/signup/profile/admin) at the same time.
5. Log in as `admin`/`admin`; the forced onboarding screen makes you set a
   real password **and** three real security questions before the dashboard
   loads. Do this immediately on first deploy.

If step 3 needs to be rolled back, removing the middleware reverts the API
to public; data stays usable because every row already has a `user_id`.

**Break-glass (admin locked out):** if the admin forgets its password and
then fails security-question recovery 3 times, run on the Fly machine:

```bash
flyctl ssh console -a portfolio-dashboard-api
./portfolio-api admin reset-lockout --username admin   # clears the lock
./portfolio-api admin set-password   --username admin   # prompts for a new password
```

These subcommands talk to MongoDB directly via `MONGODB_URI` and require no
login, so they always work as long as you can reach the machine.

## 12. Out of scope for v1 (call out so we don't scope-creep)

* Email verification on signup.
* "Reveal username from email" — there is no email on the user record.
* Profile fields beyond `name` (phone, avatar, currency preference).
* Audit log of admin actions.
* Per-user API tokens for scripting.
* Reassigning holdings between users (the only options are hide-then-restore
  or hard-delete; merging accounts is a v2 problem).
* Audit trail of admin actions.

## 13. Resolved decisions

(Previously open questions, settled before implementation.)

1. **Delete user**: the admin gets two actions — **Hide** (soft, reversible,
   holdings preserved) and **Delete** (hard, cascades to holdings,
   irreversible, requires re-typing the username to confirm). See §5.8.
2. **Username case**: case-insensitive uniqueness and login; the as-typed
   form is stored separately in `username_display` and used in the UI. See
   §6.1.
3. **Bootstrap admin rename**: not forced. The bootstrap admin can change
   its username from `/profile` via `PUT /api/auth/profile` like any other
   user, after the forced password change. See §5.4 / §7.
