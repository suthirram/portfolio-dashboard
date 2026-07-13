# Accounts & roles

Authentication and multi-tenancy are specified in
[PRD-001](prds/PRD-001-user-auth-and-multi-tenancy.md) /
[DD-001](designs/DD-001-user-auth-and-multi-tenancy.md).

* **User** — signs up (username, password, region, three security questions),
  manages their own private portfolio. Password recovery is by security
  questions only; there is **no email**.
* **Admin** — a user the super admin promoted; oversees the users in their own
  **region** (India / Europe / US): can act on their portfolios, hide,
  reactivate, reset lockouts, or delete them.
* **Super admin** — the single owner. On a fresh deployment the system creates
  `admin` / `admin` and **forces onboarding** (real password + security
  questions) on first login. Appoints/demotes admins and assigns regions.

See [First run & operations](operations.md).
