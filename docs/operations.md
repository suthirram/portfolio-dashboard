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

## Seeding a demo user (`seed-max.sh`)

```bash
API=https://portfolio-dashboard-api-361268533788.europe-west1.run.app \
MONGO_URI='mongodb+srv://<user>:<pass>@<cluster>/portfolio' \
CONFIRM=yes ./scripts/seed-max.sh
```

| Var | What | Where to get it |
|---|---|---|
| `API` | Prod backend base URL (Cloud Run) | Cloud Run service URL for the Go API, or whatever the frontend's `VITE_API_URL` points at |
| `MONGO_URI` | Prod MongoDB connection string incl. `/portfolio` db | MongoDB Atlas → Connect → the `mongodb+srv://…` string with prod creds |
| `CONFIRM=yes` | Required guard | literal `yes` — the script refuses any non-localhost API without it |

Local prerequisites: `jq` and `mongosh` on PATH (`mongosh` is needed because the delete-existing/gold-enable/90-snapshot writes go direct to Mongo), and your host's public IP added to the Atlas Network Access allowlist.

Optional overrides: `HISTORY_DAYS=90` (snapshot backfill length), `MONGO_DB=portfolio` (db name if it differs).

Idempotent — re-running deletes the existing `maxmustermann` (holdings, transactions, snapshots, sessions) before re-seeding, so it won't pile up duplicates. Gold auto-skips (with a warning) if the backend returns 503 for gold (Postgres not wired in that env). After it runs, log in as `maxmustermann` / `Passw0rd!23`.

**Before pointing at prod:** this injects a fake demo user + 90 days of history straight into the production DB — reversible (re-run deletes Max, or delete by username) but real prod data meanwhile. `MONGO_URI` carries prod credentials — pass it via a shell that won't log to history (leading space, or a secrets manager), don't commit it. Signup goes through the prod API, so the account is a normal login on the live site until removed. Safer path: run against dev first (same command, dev API + dev `MONGO_URI`) and confirm it looks right before considering prod.

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

## OTel tracing — enabling on Cloud Run (Grafana Cloud)

See [`plan.md`](../plan.md) §"Prod Runbook (Owner Action — Agents Do Not Touch
Billing/Accounts)" for the full step-by-step: creating a Grafana Cloud stack,
the two GCP secrets it needs, granting the Cloud Run runtime SA access, and
verifying a deploy picked them up.
