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
7. First admin: bootstrap credentials are `admin` / `admin`. The app forces
   a password change on this account's first login.

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

* `username`: 3–32 chars, `[a-z0-9_-]`, lowercase, unique.
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
`/admin`. Bootstrap admin (`admin`/`admin` still set) is forced through
`/profile/change-password` before anything else loads.

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
POST /api/admin/users/:id/reset-lockout → security_question_failures=0, locked=false
POST /api/admin/users/:id/disable       → disabled=true (login blocked)
POST /api/admin/users/:id/enable        → disabled=false
POST /api/admin/users/:id/role          → {role: "admin"|"user"}
```

Admin cannot demote themselves if they are the only remaining admin (server-
side check) — prevents accidental lockout of the whole app.

## 6. Data model

### 6.1 New collection: `users`

```go
type User struct {
    ID                       primitive.ObjectID `bson:"_id,omitempty"`
    Username                 string             `bson:"username"`         // unique, lowercase
    Name                     string             `bson:"name"`
    PasswordHash             string             `bson:"password_hash"`    // bcrypt
    Role                     string             `bson:"role"`             // "user" | "admin"
    Disabled                 bool               `bson:"disabled"`
    Locked                   bool               `bson:"locked"`           // sq_failures >= 3
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
`must_change_password=true`, plus 3 placeholder security questions with
random un-guessable answers (so step 5.5 can't be used to bypass the
password change). Admin is forced to set a real password and real
security questions before anything else loads. This work happens in
`cmd/serve.go` after `EnsureIndexes`.

### 9.4 Lockout reset by admin

Resetting `security_question_failures` does **not** clear `login_failures`.
Login failures don't lock the account in v1 (only sq failures do); they are
surfaced in the admin table for visibility and so a v2 lockout policy on
login attempts can be bolted on without schema changes.

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
5. Change `admin/admin` immediately on first login (the app forces it).

If step 3 needs to be rolled back, removing the middleware reverts the API
to public; data stays usable because every row already has a `user_id`.

## 12. Out of scope for v1 (call out so we don't scope-creep)

* Email verification on signup.
* "Reveal username from email" — there is no email on the user record.
* Profile fields beyond `name` (phone, avatar, currency preference).
* Audit log of admin actions.
* Per-user API tokens for scripting.
* Soft-delete of users (delete is hard-delete for now — admin must reassign
  or accept loss of that user's holdings; see open question).

## 13. Open questions

1. **Delete user**: when an admin deletes a user, what happens to their
   holdings? Options:
   * Hard delete the holdings too (current proposal).
   * Reassign to another user the admin picks.
   * Leave orphaned and surface in a "no owner" admin view.
2. Should `username` be case-insensitive on login but stored as the user
   typed it? (Current proposal: normalize to lowercase on write, simpler.)
3. Should we allow the bootstrap admin to **change** the username during
   the forced password-change step? (Current proposal: no — keep
   `admin` so the recovery story is obvious; can be added later.)
