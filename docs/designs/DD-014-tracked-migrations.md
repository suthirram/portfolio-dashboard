# DD-014: Tracked data migrations

* **Status**: Approved (owner, 2026-11-16)
* **Owner**: project owner
* **Implements**: [PRD-014](../prds/PRD-014-tracked-migrations.md)
* **Rollout plan**: [PD-057](../plans/PD-057-migration-runner.md)

## 1. Storage: the `migrations` collection

One document per step, keyed by the step's version:

| Field | Meaning |
| --- | --- |
| `_id` | Step version, `YYYYMMDD_NN` |
| `status` | `in_progress`, `done` or `failed` (no record = pending) |
| `cursor` | Step's last saved resume point; absent before the first batch and once done |
| `attempts` | Claims so far; 1 on the first run |
| `started_at` | When the current or last attempt was claimed |
| `finished_at` | When the step completed; only on `done` |
| `last_error` | Error of the last failed attempt; cleared on the next claim |
| `lease_owner` | `host-pid-objectid` of the run holding or last holding it |
| `lease_expires_at` | Claim is exclusive until then; renewed while the step runs |
| `updated_at` | Last write |

No secondary index: every access is by `_id`. `persistence.MigrationStore`
owns the collection.

**Why one document per step, not one watermark.** A single "last version
done" (the common pattern) silently skips a step merged later with an older
date, and it cannot show each step's status. Per-step records make every
step's state explicit, and a late step still runs.

## 2. Step contract and registry

```go
type Step interface {
    Version() string // "YYYYMMDD_NN", permanent once shipped
    Run(ctx context.Context, cursor *string) (next *string, err error)
}
```

`Run` does one batch. A nil `cursor` means the first batch. A non-nil `next`
asks to be called again with it; the runner saves it before the next batch.
Nil means the step is complete. Steps are not wrapped in a transaction, and a
retry restarts from the last saved cursor, so each batch must be idempotent.
A step that returns its input cursor fails (it would loop forever).

The registry is `migrationSteps(store, logger)` in `backend/cmd/migrate_pending.go`,
the composition root. `internal/migration` stays generic: it knows steps, not
holdings. `migration.Validate` rejects malformed, duplicate or out-of-order
versions, and a test runs it over the registry.

## 3. Claim and lease

`Claim` is one atomic `findOneAndUpdate` with `upsert`:

* Filter: `_id = version` and (`status = failed` or (`status = in_progress`
  and `lease_expires_at <= now`)).
* Update: set `in_progress`, owner, lease, `started_at`; `$inc attempts`;
  unset `finished_at`/`last_error`. `cursor` is untouched, so a claim resumes.

A missing record matches nothing, so the upsert inserts it. A `done` or
live-held record also matches nothing, but its upsert collides on `_id`
(duplicate key). The store then reads the record and returns it unclaimed. Of
two racing claimers at most one wins. This was verified against MongoDB 7, not
only the mock driver.

The lease is 2 minutes. A goroutine renews it every lease/3 while a batch runs,
and `SaveCursor` renews it too. Every held write (`SaveCursor`, `Renew`,
`Finish`) filters on `lease_owner` and `in_progress`. A run that lost its lease
gets `ErrNotFound`. A lost renewal cancels the step's context, so two runs
never write at once. A run killed without recording an outcome becomes
claimable two minutes after its last renewal. This replaces a fixed "stale
after an hour" rule, so a long but healthy step is never stolen.

## 4. Runner semantics

`migration.Runner.RunPending(ctx, steps)` validates, then for each step:

| Claim result | Action |
| --- | --- |
| claimed | run batches from the record's cursor; `Finish` done or failed |
| not claimed, `done` | skip, continue |
| not claimed, held | stop, exit 0 (`Report.Held`) |
| error | stop, exit non-zero |

A failed step stops the run, because a later step may depend on it. The
outcome is recorded with `context.WithoutCancel` and a 10-second timeout, so
SIGTERM still marks the step `failed`, and the next run resumes at once instead
of waiting out the lease. `Report{Ran, Skipped, Held, Failed}` is logged as
`migrations finished`.

## 5. CLI

Bare `go run . migrate` (cobra `RunE`, `Args: cobra.NoArgs`) runs pending
steps. Existing subcommands are unchanged and untracked. `cliSession` holds the
shared setup for long one-shot commands (config, logger, SIGTERM-aware ctx,
Mongo). `migrate sectors`, which exists only on the PD-056 feature branch,
adopts it in the sector-step PR.

## 6. First step: sector backfill (`20261116_01`)

This is the tracked form of `migrate sectors --all-users --apply`. Each batch
backfills up to 50 holdings across all users. A classified holding is no longer
eligible, so the cursor only counts batches. The real position lives in the
data, and a retry resumes by itself. The step continues while `Remaining > 0`.
A Yahoo rate limit, a session failure, or any per-holding lookup/write error
fails the step, so it is retried. Holdings already `needs_review` are not
retried (`--retry-unresolved` stays a manual, diagnosed action); owners resolve
them in the review queue.

## 7. Deployment

The `portfolio-dashboard-migrate` Cloud Run Job (prod, `europe-west1`, created
2026-11-16) and `portfolio-dashboard-migrate-dev` (dev, `portfolio_dev`) run
the service image with args `migrate`, `--max-retries 0` (the runner resumes;
an immediate retry only repeats a rate limit) and a 30-minute task timeout.

`deploy/cloudrun/run-migrations.sh` runs **after** the service rollout in both
deploy workflows and in `deploy.sh`. It pins the job to the service's new
image with `repoint-job.sh` (shared with `pd-snapshot`, so a job never runs a
stale image), then runs `gcloud run jobs execute --wait`. A failed execution
emits a workflow warning and the deploy stays green, because the step's status
is in the collection and the next deploy resumes it. A failed repoint fails
the deploy, so a stale image never runs. Until a job exists, its step skips.
Production got its job only after the owner took a backup.

## 8. Testing

* `internal/migration`: runner behaviour over an in-memory store with the
  same claim rules: order, skip-done, new step after done ones, cursor
  save/resume, failure stops later steps, retry resumes from the cursor,
  expired lease resumed, live lease stops, SIGTERM recorded failed, lost lease
  cancels, slow batch renews, repeated cursor rejected, invalid registry
  runs nothing.
* `persistence`: mtest checks the claim's filter and upsert, that a duplicate
  key comes back unclaimed, that a lost lease is `ErrNotFound`, and that
  Finish's done/failed updates are correct.
* `cmd`: registry validity, unknown-argument rejection, and the sector
  step's next-cursor decision.
