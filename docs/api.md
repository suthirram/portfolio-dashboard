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
| GET | `/api/transactions` | Every ledger event across the caller's holdings, newest first, with `script`/`symbol` (read-only) |
| GET/POST | `/api/holdings/{id}/transactions` | List / append the holding's ledger events |
| PUT/DELETE | `/api/transactions/{id}` | Edit / remove a ledger event (holding is recomputed) |

## Dividends (per-user, one currency tab)

| Method | Path | Description |
|---|---|---|
| GET | `/api/dividends?currency=INR\|EUR` | The caller's dividend ledger events in one currency, oldest first, as a `DividendView` |
| GET | `/api/admin/users/{id}/dividends?currency=INR\|EUR` | Act-as: a target user's tab (region-scoped; out of scope ⇒ 404) |
| POST | `/api/dividends/import/preview` | Evaluate a CSV import without writing anything |
| POST | `/api/admin/users/{id}/dividends/import/preview` | Act-as mirror of the preview |
| POST | `/api/dividends/import` | Commit the import atomically: 200 `DividendImportResult`, 400 malformed, 422 fresh preview when rows are invalid (nothing written) |
| POST | `/api/admin/users/{id}/dividends/import` | Act-as mirror of the import |
| DELETE | `/api/dividends?currency=INR\|EUR` | Delete every dividend of the tab (imported and hand-entered) and recompute the affected holdings, atomically → `{"deleted": N}`; holdings and other event types untouched |
| DELETE | `/api/admin/users/{id}/dividends?currency=INR\|EUR` | Act-as mirror of delete-all |

Dividends are `transactions` documents with `type = dividend`; add / edit /
delete one through the ledger endpoints above. Any other `currency` is a 400.
A `DividendView` is computed on read (integer cents, so totals never drift):
`rows` (each with `cumulative` across the tab and `holding_cumulative` for its
holding), `summary` (`total`, `count`, `holdings`, `first_date`, `last_date`),
`by_year`, `by_month` (`period`, `total`, `count`) and `by_holding` (biggest
total first, with `share` of the tab total). Example row:

```json
{"id": "6720…", "holding_id": "6650…", "script": "TCS", "symbol": "TCS.NS",
 "date": "2020-01-01", "amount": 300, "currency": "INR", "notes": "",
 "cumulative": 300, "holding_cumulative": 300}
```

**Import preview.** The client parses the CSV and sends the rows it could
read (≤ 5,000) plus the name-popup answers:

```json
{"currency": "INR",
 "rows": [{"line": 2, "date": "2020-01-01", "share_name": "TCS", "amount": 300, "cumulative": 300}],
 "mappings": {"jio": "<holding id>", "JLP": null}}
```

The response (`DividendImportPreview`) has `counts` (`ready`, `duplicate`,
`invalid`, `total`), `names` (one per distinct sheet name: `status` =
`auto` | `confirmed` | `needs_confirmation` | `ambiguous` | `unresolved`,
with `suggestions` and an optional `preselect`), `rows` (per line: `ready` |
`duplicate` | `invalid` + `reason`) and `warnings` (CUMULATIVE mismatches).
Only the holding's display name or a previously confirmed alias matches
automatically; a duplicate is the same holding, day and amount, counted by
occurrence against what is already stored.

**Import.** Same request as the preview. The server re-runs the preview inside
one MongoDB transaction and, when no row is invalid, inserts every new
dividend, saves confirmed names as aliases and recomputes the affected
holdings — all or nothing. The result is `{imported, duplicates (the skipped
rows), batch_id, warnings}`; re-sending the same file imports 0.

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
`/summary`, `/transactions`, `/dividends`), and `/api/admin/admins` (super
admin only). Act-as ledger writes reuse the user's own write path (validation
and recompute included): `GET/POST /api/admin/users/{id}/holdings/{holdingId}/transactions`
and `PUT/DELETE /api/admin/users/{id}/transactions/{transactionId}`; an
out-of-region target is a 404 and nothing is written.

Full spec: `/api/specs/openapi.yaml`
