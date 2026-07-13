# API endpoints

All routes except the public auth/catalogue endpoints require a session
cookie, and every state-changing request must send the
`X-Requested-With: portfolio-dashboard` header (CSRF). Holdings, prices, and
summary are scoped to the logged-in user.

## Auth (public)

| Method | Path | Description |
|---|---|---|
| GET | `/api/regions` | Region catalogue (signup dropdown) |
| GET | `/api/auth/security-questions` | Security-question catalogue |
| POST | `/api/auth/signup` | Create account + log in |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/recover/questions` | Fetch an account's questions (step 1) |
| POST | `/api/auth/recover` | Reset password via answers (step 2) |

## Auth (session)

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/me` | Current account |
| POST | `/api/auth/logout` | End the session |
| PUT | `/api/auth/password` | Change own password |
| PUT | `/api/auth/profile` | Change own name / username |
| PUT | `/api/auth/security-questions/answers` | Replace own questions |
| POST | `/api/auth/onboarding` | Forced first-login setup (super admin) |

## Portfolio (per-user)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/holdings` | List / add holdings (list carries `has_opening` + `opening_date`) |
| PUT/DELETE | `/api/holdings/{id}` | Edit a holding (incl. `opening_date`) / delete it |
| GET | `/api/prices` | Holdings with live prices + EUR |
| GET | `/api/summary` | Portfolio totals |
| GET | `/api/market/price?symbol=TCS.NS` | Live price for any symbol |
| GET | `/api/market/forex?from=INR&to=EUR` | Forex rate |

## Transactions (per-holding ledger)

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/holdings/{id}/transactions` | List / append the holding's ledger events |
| PUT/DELETE | `/api/transactions/{id}` | Edit / remove a ledger event (holding is recomputed) |

## History (per-user snapshots)

| Method | Path | Description |
|---|---|---|
| GET | `/api/history?from=YYYY-MM-DD&to=YYYY-MM-DD` | Snapshot rows in range (each row carries per-currency totals + per-stock `holdings`) |
| POST | `/api/history` | Add a manual row |
| PUT | `/api/history/{date}/regions` | Override specific currency buckets (flips them to `manual`) |
| DELETE | `/api/history/{date}` | Delete a row (cron rows protected; super admin can force) |
| POST | `/api/history/paste` | Bulk-paste a month of rows (TSV from a spreadsheet) |

**Admin** (region-scoped; super admin sees all) — `/api/admin/users`,
`/api/admin/users/{id}` (+ `/hide`, `/reactivate`, `/reset-lockout`,
`/promote`, `/demote`, `/region`, and act-as `/holdings`, `/prices`,
`/summary`), and `/api/admin/admins` (super admin only).

Full spec: `/api/specs/openapi.yaml`
