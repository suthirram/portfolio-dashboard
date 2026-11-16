# PRD-014: Tracked data migrations

* **Status**: Approved (owner, 2026-11-16)
* **Owner**: project owner
* **Design**: [DD-014](../designs/DD-014-tracked-migrations.md)
* **Rollout**: [PD-057](../plans/PD-057-migration-runner.md)

## 1. Problem

Data migrations are one-shot CLI subcommands (`migrate users`, `migrate
transactions`, `migrate currencies`, `migrate sectors`). Someone has to
remember to run each one in every environment, with the right flags. Nothing
records whether a migration ran, finished, or stopped halfway. The PD-056
sector backfill showed the cost: a dry run left local holdings needing review,
and production has no record of which backfill batches ran.

## 2. Goals

* One command, `go run . migrate`, runs every migration not yet done in that
  database.
* A migration is a step with a version: `YYYYMMDD_NN`, the date it was
  written plus a same-day sequence number. Adding a step to the registry is
  all it takes to schedule it.
* A finished step never runs again.
* Each step's status is explicit in the database (`in_progress`, `done`,
  `failed`), with attempts, timestamps and the last error.
* A step that is killed, or that fails part-way, resumes where it stopped on
  the next run: after a redeploy or a manual rerun.
* Two runners at once (overlapping deploys, a manual run during a deploy)
  never execute the same step together.

## 3. Non-goals

Schema/index management (`db.EnsureIndexes` stays at boot), rollback or
"down" migrations, a UI for migration status, running steps inside the web
server, and converting the existing manual subcommands. `migrate users
--owner` takes an argument, `copy-holdings` targets another database, and
`transactions`/`currencies` already ran everywhere. They stay manual tools.

## 4. Behaviour

1. `migrate` with no subcommand loads the registry, checks it (versions well
   formed, unique, in order), and walks it in version order.
2. A step with no record, or a `failed` one, is claimed and run. So is an
   `in_progress` one whose run has died.
3. A `done` step is skipped.
4. A step currently held by another live run stops this run cleanly (exit 0),
   so later steps never overtake one they may depend on.
5. A failed step is recorded `failed` with its error and stops the run (exit
   non-zero). The next run retries it from its saved resume point.
6. Ctrl-C/SIGTERM records the current step as `failed` (interrupted) so the
   next run can resume it immediately.
7. A typo such as `migrate sector` is an error, never a silent full run.

## 5. Success criteria

* Running `migrate` twice runs each step once; the second run skips all.
* Killing a run mid-step and rerunning continues from the last saved cursor.
* The sector backfill (PD-056) becomes step `20261116_01` and fills every
  environment's holdings through `migrate`, with no manual flags.

## 6. Rollout constraints

Production writes stay owner-gated. The backend command ships first. Running
it from the deploy pipeline (a `pd-migrate` Cloud Run Job executed after the
service rollout) is a follow-up, and production gets that job only after the
owner takes a backup. A failed step marks itself `failed`, but the deploy
stays green (owner decision, 2026-11-16).
