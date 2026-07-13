# First run & operations

On a brand-new database the backend creates a single super admin
`admin` / `admin` with `must_change_password` set. Log in and complete the
forced onboarding (real password + three security questions) before anything
else works.

```bash
cd backend

# Assign any pre-auth holdings to an owner (run once after upgrading):
go run . migrate users --owner admin

# Seed an `opening` ledger event for every existing holding so its position
# becomes a projection of the new transactions ledger (idempotent):
go run . migrate transactions

# Copy the super admin's holdings into another database (e.g. local → prod):
MONGODB_URI='mongodb://localhost:27017/portfolio' \
  go run . migrate copy-holdings --to-uri '<dest-uri>' --to-db portfolio

# Break-glass for a locked-out super admin (no login; needs MONGODB_URI):
go run . admin reset-lockout --username admin
PD_NEW_PASSWORD='a-strong-password' go run . admin set-password --username admin
```

## Daily snapshot job

The history is fed by the `snapshot` subcommand, invoked by an external cron
(Cloud Run Job `pd-snapshot` in production). It runs the **same binary/image**
as the API, so a deploy that updates the API also repoints the job.

```bash
# Snapshot the current IST trading day for every active user:
go run . snapshot

# Re-run a specific day (idempotent; preserves manual overrides):
go run . snapshot --date 2026-06-24
```
