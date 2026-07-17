# Conventions

## Go Code Style

### Naming

* **camelCase** for variables, methods, functions. TitleCase for exported struct fields.
* Abbreviations: only first letter capitalised — `senderAddressId`, `restApiClient`, `getBranchId`.  
  Never `senderAddressIDs`, `restAPIClient`, `getBranchID`. (`Id` not `ID` is intentional — don't flag it.)
* File names: lowercase + underscores, no hyphens or camelCase. e.g. `email_editing.go`.

### File structure (per file)

Order declarations by visibility, exported first:

1. Public types
2. Public functions
3. Private types
4. Private functions

Package-level `var`/`const` blocks stay at top after `import` regardless of visibility.

### Logging

`zap` only. Never concatenate with `fmt.Sprintf` or string ops.

```go
// correct
logger.Info("price fetched", zap.String("symbol", sym), zap.Float64("price", p))
// wrong
logger.Info(fmt.Sprintf("price fetched: %s %.2f", sym, p))
```

* Bind logger once per method: `logger := s.log(ctx)` (or `s.log()` / `r.log()` for non-ctx services).
* `log(ctx)` delegates to `logging.FromContextOr(ctx, s.logger)` — new services reuse this pattern.
* **Never** chain `s.log(ctx).Error(...)` inline — CI greps for it.
* Attach errors as `zap.Error(err)` in new code. Legacy `zap.String("error", err.Error())` sites: migrate opportunistically, don't sweep.

### Error handling

* Never silently ignore errors — add a comment when you must.
* Wrap with `fmt.Errorf("context: %w", err)` to preserve chain.

### Utility helpers

Prefer `lo` (`github.com/samber/lo`) over manual `for` loops:

```go
symbols := lo.Map(holdings, func(h domain.Holding, _ int) string { return h.Symbol })
```

---

## Auth (PRD-001 / DD-001)

* Session cookie: `pd_session`, `HttpOnly`, `Secure`, `SameSite=None`, 30-day sliding expiry. Opaque 32-byte base64url id; revoke by deleting row.
* CSRF enforced server-side on every POST/PUT/DELETE via `CSRFCheck` middleware. Rule: see CLAUDE.md Hard Rules.
* Region scope: admin against user `:id` requires `target.role == "user" AND target.region == caller.region`. Superadmin bypasses; superadmin cannot demote/move/delete itself.
* Recovery lockout: 3 wrong security-question answers → `423`; reset via `POST /admin/users/:id/reset-lockout` or break-glass CLI.

---

## Transactions Ledger

* `stocks_owned`/`avg_cost_price`/`realized_pnl`/`total_dividends` are derived via average-cost and rewritten by `recomputeAndPersist` on every ledger mutation. Rule: see CLAUDE.md Hard Rules.
* Money = **total cash amount** per event (fees folded in), not per-share price. Fractional shares allowed.
* `opening` event = timeless baseline — sorts first in `RecomputePosition` regardless of date. Its `OpeningDate` is user-set effective date; nil = unset → dashboard prompts.
* `setOpeningDate` syncs both the event's ordering `Date` and `OpeningDate` to the user's chosen date. Editing opening via `TransactionsService.Update` stamps `opening_date` whenever effective day changes — the two must never desync (`asOfLedger` gates baseline on `OpeningDate`).
* An **unset** `OpeningDate` is retained unconditionally by `asOfLedger` to avoid dropping the holding when an unrelated backdated edit re-heals an earlier row.
* A backdated edit triggers `healSnapshots` → `RecomputeFrom` — rewrites snapshots from earliest affected date forward.

---

## Snapshots / History (PRD-002 / DD-002)

* `snapshot` job: idempotent per (user, date), keyed on IST trading day (08:00 cut-over).
* Snapshot row = per-currency `Buckets` (INR/EUR/USD `invested`/`current`) + per-stock `Lines` (symbol, qty, avg cost, close, price date). Cron rows carry lines; manual-only rows don't.
* Manual edits override a currency bucket and flip `source` to `manual`, preserving `original_cron_*` for audit.
* Cron rows cannot be deleted except by superadmin (`ErrCronProtected`).
