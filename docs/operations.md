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

## Tracked migrations (`migrate`)

`go run . migrate` (no subcommand) runs every registered migration step not
yet done in the database named by `MONGODB_DATABASE`, in version order
([DD-014](designs/DD-014-tracked-migrations.md)). Each step's state is one
document in the `migrations` collection: `status` is `in_progress`, `done` or
`failed`, with `attempts`, `cursor`, `last_error` and timestamps.

```bash
cd backend
go run . migrate                                  # local DB
MONGODB_DATABASE=portfolio_dev go run . migrate   # another DB on the same URI

# Inspect status
docker exec portfolio_mongo_dev mongosh --quiet portfolio \
  --eval 'db.migrations.find({}, {lease_owner: 0}).toArray()'
```

* A `done` step never runs again. A `failed` one is retried from its saved
  cursor on the next run, and the command exits non-zero.
* `migration held by another run` means a live run holds the step. This run
  stops with exit 0. A run killed without recording its outcome is claimable
  2 minutes after its last lease renewal.
* To force a step to rerun, which is rare and must be deliberate, delete its
  record: `db.migrations.deleteOne({_id: "YYYYMMDD_NN"})`.
* Adding a migration: implement `migration.Step` (`Version()` is
  `YYYYMMDD_NN`, the date it was written; `Run(ctx, cursor)` does one
  idempotent batch) and append it to `migrationSteps` in
  `backend/cmd/migrate_pending.go`. Never change a shipped version.

The `migrate <name>` subcommands are separate, manual and untracked.

### On deploy (Cloud Run Jobs)

After every rollout, both deploy workflows (and `deploy/cloudrun/deploy.sh`)
run `deploy/cloudrun/run-migrations.sh`. It pins the migrate job to the image
that was just deployed, executes it and waits. A failed step only warns; its
status is in `migrations`, and the next deploy resumes it. The step is skipped
while the job does not exist. Create each job once:

```bash
REGION=europe-west1

# prod: take a backup first
IMAGE=$(gcloud run services describe portfolio-dashboard-api --region $REGION \
  --format='value(spec.template.spec.containers[0].image)')
gcloud run jobs create portfolio-dashboard-migrate \
  --region $REGION --image "$IMAGE" \
  --command /app/portfolio-api --args migrate \
  --set-env-vars LOG_FORMAT=json,MONGODB_DATABASE=portfolio \
  --set-secrets MONGODB_URI=MONGODB_URI:latest \
  --service-account 361268533788-compute@developer.gserviceaccount.com \
  --task-timeout 30m --max-retries 0 --tasks 1

# dev: dev image, portfolio_dev database
IMAGE=$(gcloud run services describe portfolio-dashboard-api-dev --region $REGION \
  --format='value(spec.template.spec.containers[0].image)')
gcloud run jobs create portfolio-dashboard-migrate-dev \
  --region $REGION --image "$IMAGE" \
  --command /app/portfolio-api --args migrate \
  --set-env-vars LOG_FORMAT=json,MONGODB_DATABASE=portfolio_dev \
  --set-secrets MONGODB_URI=MONGODB_URI:latest \
  --service-account 361268533788-compute@developer.gserviceaccount.com \
  --task-timeout 30m --max-retries 0 --tasks 1
```

Never pair a dev image with `MONGODB_DATABASE=portfolio`. The job must live in
the service's region: `run-migrations.sh` looks it up there. To run it by hand:
`./deploy/cloudrun/run-migrations.sh portfolio-dashboard-api portfolio-dashboard-migrate europe-west1`.

### Registered steps

| Version | What it does | Verify | Roll back |
| --- | --- | --- | --- |
| `20261116_01` | PD-056 sector backfill | see PD-056 | n/a |
| `20261118_01` | PD-059: sets `ui_mode: "glass"` on accounts with `ui_revamp: true` and no `ui_mode` yet; one idempotent `updateMany` | `db.users.countDocuments({ui_revamp: true, ui_mode: {$exists: false}})` is `0`; `GET /api/admin/users` shows `ui_mode` on every account | Not needed: `ui_revamp` is never unset, and accounts without `ui_mode` derive it (`glass` when `ui_revamp`, else `classic`). To undo: `db.users.updateMany({ui_mode: "glass"}, {$unset: {ui_mode: ""}})` and delete the step's `migrations` record |

Ordering: the step ships with the backend that reads `ui_mode`
(`domain.User.EffectiveUiMode`), so the deploy can run it in any order with
the rollout; until it runs, every account already reports the right mode.
Plan: PD-059 (`docs/plans/PD-059-ui-2.md`, docs PR #332).

## Overall-worth backfill (PD-059)

`portfolio_overall` is derived from `portfolio_snapshots` plus one stored
EUR→INR rate per day. The backfill only reads snapshots.

1. Back up: `mongodump --uri "$MONGODB_URI" --db "$MONGODB_DATABASE" --collection portfolio_snapshots --out backup-$(date +%F)`.
   Record the row count: `db.portfolio_snapshots.countDocuments()`.
2. Dry run: `go run . migrate overall --dry-run`. It makes apply's exact
   selection without writing. Review per user `skipped_rated` (left alone),
   `to_write`, `without_rate` (written without a rate, offered for re-fetch)
   and `min/max_current_inr` (over `to_write` only) against the History page.
3. Apply: `go run . migrate overall` (fills days without a rate only; safe
   to re-run). After slice 9b the deploy runs it as step `20261118_02`.
4. Post-check: the snapshot row count is unchanged;
   `db.portfolio_overall.countDocuments({user_id: …})` equals that user's
   snapshot rows.
5. Repair drift: `go run . migrate overall --rebuild [--user <id>]`
   recomputes totals and keeps stored rates; Yahoo is only called for days
   that have no rate, so it works during a Yahoo outage when every rate is
   stored.

Restore (only if a snapshot row was ever changed, which the backfill never
does): `mongorestore --uri "$MONGODB_URI" --nsInclude "$MONGODB_DATABASE.portfolio_snapshots" --drop backup-<date>`.

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
