# PRD-001: User authentication, roles, and regional multi-tenancy

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Type**: Product Requirements — the *what* and *why*. The *how*
  (data model, API, security mechanisms, rollout) lives in the companion
  technical design doc: [DD-001](../designs/DD-001-user-auth-and-multi-tenancy.md).

## 1. Problem

The portfolio dashboard is becoming publicly reachable (PD-012), but today it
has no accounts and no access control: anyone who opens the app can see and
edit one shared portfolio. That is unacceptable for a public deployment, and
it also blocks the thing we actually want — letting several people track their
own portfolios in one place, with a small set of administrators who can help
their users and keep an eye on activity.

## 2. Goals

1. Every person has their own private portfolio; they only see their own
   holdings.
2. People can sign up, log in, and log out with a username and password.
3. People can recover a forgotten password themselves, without email.
4. A small group of administrators can help and oversee users, organised by
   **region** so each admin only deals with their own group.
5. One top-level owner (super admin) can appoint and remove administrators.
6. The whole thing works on the existing public deployment without sending any
   email or standing up new infrastructure.

## 3. Non-goals (later, or never)

* Social / Google login, magic links, two-factor auth.
* Password reset by email (we deliberately avoid an email dependency in v1).
* More than three regions, or countries/sub-regions inside a region.
* Genuine data residency (keeping a region's data in that region) — see §5.
* More than one super admin.
* Sharing portfolios between people, or read-only share links.
* An audit log of who-did-what.

## 4. Who uses this — personas and roles

There are three kinds of account. Importantly, **an admin is just a normal user
with extra responsibilities** — same login, same private portfolio — not a
separate kind of account.

| Role | Who they are | What they can do |
|---|---|---|
| **User** | Anyone who signs up | Manage their own portfolio. Belong to one region. |
| **Admin** | A user the super admin has appointed | Everything a user can (including their own portfolio), **plus** help and oversee the users in their own region. |
| **Super admin** | The single owner of the deployment | Everything, everywhere. Appoints/removes admins and decides which region anyone belongs to. |

Rules of the hierarchy:

* There is exactly **one super admin** (the very first account).
* An admin oversees **exactly one region** — their own.
* A user **cannot** change their own region or grant themselves admin powers.
  Those are decisions made above them.

## 5. Regions

Every user (and admin) belongs to one of three regions: **India**, **Europe**,
or **US**. The super admin has no region — they see everyone.

A region answers one question: *which admin looks after this person?* An admin
sees and helps only the users in their region.

A region is **not** about where data is stored. All data lives together in the
one database; "region" is purely about who oversees whom. (Real per-region data
residency would be a much larger project and is explicitly out of scope.)

## 6. User journeys

Each journey below states the behaviour and the acceptance criteria. Exact
endpoints, screens, and validation rules are specified in
[DD-001](../designs/DD-001-user-auth-and-multi-tenancy.md).

### 6.1 Sign up

A new person provides a username, their name, a password, **their region**, and
answers to **three security questions** chosen from a fixed list. On success
they are logged in and land on their (empty) dashboard.

* Region is required and must be one of the three.
* Username must be unique (case-insensitive) but is shown back as typed.
* Security answers are stored so they can never be read back, only checked.

### 6.2 Log in / log out

A person logs in with username + password and stays logged in across visits
until they log out. Logging out ends the session.

* A disabled (hidden) or locked-out account cannot log in and is told why.
* After login a user lands on their dashboard; an admin additionally sees an
  **Admin** link; the super admin lands on the admin area.

### 6.3 Manage profile and password

While logged in, a person can change their name, username, and password, and
update their security questions. Changing the password signs out their other
sessions.

* A user cannot change their own region here (that is an oversight decision).
* The super admin can rename itself away from the default `admin` username.

### 6.4 Forgot password (no email)

A person who forgot their password enters their username, is shown their three
security questions, and regains access by answering all three correctly and
setting a new password.

* Getting the answers wrong **three times** locks recovery; someone above them
  must then reset it (an admin for a user; the super admin for an admin).
* The super admin can always recover via a documented owner-only fallback (no
  one is "above" them) — see DD-001.

### 6.5 First-run: the super admin

On a brand-new deployment the system creates a single super admin with the
well-known credentials **`admin` / `admin`**. On first login the super admin is
**forced** to set a real password and real security questions before they can
do anything else.

### 6.6 Admin: help and oversee users in my region

An admin has an **Admin** area listing the users in their region. For any of
those users the admin can:

* open the user's portfolio and view or edit it on their behalf (to help);
* reset a user who has locked themselves out of recovery;
* **hide** a user (reversibly block their access while keeping their data); or
* **delete** a user (permanently remove the user and their portfolio).

An admin never sees users outside their region, and never sees or manages other
admins.

### 6.7 Super admin: appoint admins and assign regions

The super admin has an **Admins** view across all regions and can:

* **promote** any user to admin (they keep their existing portfolio and region);
* **demote** an admin back to a normal user;
* **move** any user (or admin) to a different region;
* do anything a regional admin can do, in every region.

The super admin cannot remove, demote, or move *itself* — this prevents the
deployment from being accidentally left with no owner.

## 7. Functional requirements (acceptance criteria)

1. An unauthenticated visitor can reach only the login, signup, and
   forgot-password screens; everything else requires login.
2. A logged-in user sees only their own holdings and cannot reach any admin
   screen or API.
3. A regional admin sees exactly the users whose region equals theirs, and can
   act on those users' portfolios but no others.
4. The super admin can see and act on every account in every region.
5. Promotion/demotion changes a person's powers without touching their
   portfolio, region, or login.
6. A forgotten password is recoverable by security questions; three wrong
   attempts lock recovery until someone authorised resets it.
7. Hiding a user blocks their login but preserves their data and is reversible;
   deleting a user is permanent and removes their holdings too.
8. The first-ever account is a super admin with `admin`/`admin` that must be
   secured on first login.
9. No feature in this PRD sends email or requires new infrastructure.

## 8. Success criteria

* The shared public portfolio is gone; every holding has exactly one owner and
  is invisible to everyone else.
* The owner can stand up the system, secure the super admin, appoint a regional
  admin per region, and have ordinary users self-serve signup and password
  recovery — all without touching the database by hand (except the documented
  owner-only break-glass).
* Existing holdings from before this change are preserved and assigned to the
  owner.

## 9. Risks (product view)

* **Single super admin is a single point of failure.** Mitigated by a
  documented owner-only recovery; a second super admin is a future option.
* **Security questions are weaker than email reset.** Accepted for v1 to avoid
  an email dependency; answers are stored so they can't be read back, and the
  lockout caps guessing.
* **No login rate-limiting yet**, so brute-force is possible. Flagged for a
  fast follow.
* **"Region" implies data residency to some readers** — it does not. Called out
  explicitly in §5 and in DD-001's risks.

## 10. Resolved decisions

1. Three roles: super admin (single, bootstrap `admin`/`admin`) → admin
   (one region) → user.
2. An admin *is* a user with extra powers — same account and private portfolio.
3. Becoming an admin = sign up as a user, then the super admin promotes you.
   No separate admin-creation flow.
4. One region per admin; users pick their region at signup.
5. Regions are India, Europe, US — an oversight grouping, not data residency.
6. Deleting a user offers **Hide** (reversible) and **Delete** (permanent).
7. Usernames are unique case-insensitively but displayed as typed.
8. The super admin can rename itself; it is not forced to.
9. Region changes (for users and admins) are super-admin-only.

## 11. Open questions

None outstanding. New questions that surface during build should be raised in
DD-001 (if technical) or added here (if they change product behaviour).
