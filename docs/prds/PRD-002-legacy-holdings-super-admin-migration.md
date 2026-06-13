# PRD-002: Local legacy holdings migration to super admin ownership

* **Status**: Draft (PRD)
* **Owner**: project owner
* **Type**: Product / local operations requirements - the *what* and *why* for
  preserving pre-multi-user holdings in a local database after the
  multi-tenancy change.
* **Related**:
  [DD-002](../designs/DD-002-local-legacy-holdings-super-admin-migration.md),
  [PRD-001](./PRD-001-user-auth-and-multi-tenancy.md),
  [DD-001](../designs/DD-001-user-auth-and-multi-tenancy.md#10-migration),
  [PD-022](../plans/PD-022-user-auth-and-multi-tenancy.md)

## 1. Problem

Before multi-user authentication, the dashboard had one shared portfolio. Local
databases that predate multi-tenancy can still contain holdings without an
owning `user_id`. After multi-tenancy, every holding must belong to exactly one
account; otherwise it is invisible behind the scoped APIs and becomes a
data-integrity exception that future local development has to special-case.

The owner needs a clear, safe **local-only** migration that preserves those
pre-multi-user holdings and assigns them to the top-level account in the local
database. This must not be part of CI, test setup, build steps, or deployment
automation. In this repo, the product term for the top-level account is
**super admin** and the database role is `superadmin`.

## 2. Goals

1. Preserve every pre-multi-user holding in the local database.
2. Assign every local legacy holding to the single super admin account.
3. Ensure every holding has exactly one owner after migration.
4. Make the migration idempotent, so rerunning it after success changes
   nothing.
5. Prevent accidental assignment to a normal user or regional admin.
6. Give the local operator clear preflight and post-migration evidence: counts
   before, counts changed, and counts remaining unowned.
7. Keep the migration out of CI/CD: no CI workflow, automated test, build, or
   deploy job should invoke it.
8. Keep all existing scoped portfolio behavior unchanged for normal users,
   admins, and the super admin.

## 3. Non-goals

* Splitting the old shared portfolio across multiple people.
* Inferring historical ownership from holding metadata.
* Creating a frontend migration UI.
* Running the migration in CI, automated tests, preview environments, or deploy
  automation.
* Making this a production release gate.
* Deduplicating, editing, deleting, or repricing holdings as part of migration.
* Reassigning holdings that already have a valid `user_id`.
* Changing the role model from PRD-001.

## 4. Personas

| Persona | Need |
|---|---|
| **Local owner / super admin** | Keep the old local shared portfolio as their private portfolio after multi-tenancy is enabled locally. |
| **Regional admin** | Continue seeing only users in their region; never inherit or see old shared holdings. |
| **Normal user** | Start with their own empty or self-created portfolio; never see the old shared portfolio. |
| **Operator / maintainer** | Run and verify the local migration without direct manual database edits. |

## 5. Definitions

* **Legacy holding**: a local document in the `holdings` collection where
  `user_id` does not exist. This is the expected pre-multi-user data shape.
* **Invalid holding**: a document with `user_id: null`, a malformed `user_id`,
  or a `user_id` that does not resolve to an existing user. Invalid holdings
  are not silently migrated; they require explicit operator attention.
* **Migration owner**: the single user whose role is `superadmin`. The default
  bootstrap username is `admin`, but the user may have been renamed.

## 6. User Journeys

### 6.1 Operator runs migration locally

The operator chooses the current super admin account and runs the migration
against a local/developer MongoDB database.

Acceptance criteria:

* The command refuses to run if the target user does not exist.
* The command refuses to run if the target user is not the `superadmin`.
* The command reports how many legacy holdings exist before migration.
* The command updates only holdings without `user_id`.
* The command reports matched and modified counts.
* The command reports zero remaining legacy holdings after success.
* Project CI does not call this command.
* Any CI environment variables or workflow definitions are not required for the
  migration to succeed locally.

### 6.2 Super admin sees the old portfolio

After local migration, the super admin logs in and opens the local dashboard.

Acceptance criteria:

* The dashboard lists the holdings that existed before multi-tenancy.
* Prices, summary totals, create, edit, and delete continue to work through the
  normal `/api/holdings`, `/api/prices`, and `/api/summary` flows.
* The super admin's admin powers do not change ownership of those holdings.

### 6.3 Normal users and regional admins do not inherit legacy holdings

After local migration, other accounts log in or sign up locally.

Acceptance criteria:

* A normal user sees only their own holdings.
* A regional admin sees only their own portfolio under normal dashboard routes.
* A regional admin cannot see the super admin's migrated holdings through
  act-as routes.
* The super admin can still act on other users' portfolios through admin routes
  without moving the migrated holdings.

### 6.4 Operator reruns migration

The operator reruns the local migration after a successful first run, either by
mistake or as part of local verification.

Acceptance criteria:

* The command succeeds.
* Matched and modified counts are zero.
* No existing `user_id` values are changed.

## 7. Functional Requirements

1. The migration targets exactly one super admin account.
2. The migration must never assign holdings to an account with role `user` or
   `admin`.
3. The migration must only stamp documents where `user_id` is absent.
4. The migration must preserve every other holding field, including `_id`,
   script, symbol, exchange, quantity, cost basis, realised P&L, notes,
   currency, and timestamps.
5. Already-owned holdings must not be modified.
6. Invalid holdings must be surfaced in the migration output and must not be
   silently assigned.
7. The migration must be safe to run after the scoped API code exists but
   before local regular-user testing starts.
8. The migration must be documented as a local-only first-run / operations
   step.
9. The migration result must be verifiable without relying on the frontend.
10. After migration, the app must not require any unscoped holdings read path.
11. CI must not run this migration directly or indirectly through test setup,
    build scripts, Docker image builds, or deployment automation.

## 8. Operational Requirements

The standard local flow is:

1. Confirm the command is targeting the intended local MongoDB database.
2. Confirm the target owner is the single super admin.
3. Run the migration:

   ```bash
   cd backend
   go run . migrate users --owner admin
   ```

   If the super admin has been renamed, use the current username instead of
   `admin`.

4. Verify there are no legacy holdings remaining.
5. Log in locally as the super admin and confirm the migrated portfolio is
   visible.
6. Continue local multi-tenancy testing.

This is not a CI or deployment gate. CI should create isolated test data with
explicit owners instead of migrating legacy data.

## 9. Data Validation

Minimum validation evidence:

| Check | Expected result |
|---|---|
| Count local holdings where `user_id` is absent before migration | Equals the number of legacy holdings to migrate. |
| Count holdings where `user_id` is absent after migration | `0`. |
| Count holdings owned by the super admin after migration | Increases by the number of modified legacy holdings. |
| Count holdings with `user_id: null` or malformed owner references | `0`, or explicitly triaged before local use. |
| Rerun migration | `0` matched, `0` modified. |

## 10. Success Criteria

* No legacy holding is lost.
* No local holding remains without an owner after the migration runs.
* The super admin owns and can manage the pre-multi-user portfolio.
* Normal users and regional admins cannot see the migrated holdings unless they
  are acting within their authorized scope.
* The operator can prove the local migration outcome from logs and database
  counts.
* CI remains independent of legacy local data and does not run this migration.

## 11. Risks

* **Wrong owner selected locally.** Mitigate by requiring the target account to
  have role `superadmin` and by documenting the current super admin username
  before running the command.
* **Invalid legacy data shape.** Mitigate by detecting `null`, malformed, or
  dangling `user_id` values separately from absent `user_id`.
* **CI accidentally mutates state.** Mitigate by keeping the command out of CI
  workflows and by ensuring tests create owned fixture data directly.
* **Local rollout order.** If auth gates are enabled before local migration,
  the old portfolio may appear missing. Mitigate by running this as an explicit
  local first-run step.
* **Misinterpreting assignment as shared access.** Assigning the old portfolio
  to the super admin is a one-time ownership decision, not a shared portfolio
  feature.
* **Rollback requires local backup or deliberate cleanup.** The migration
  preserves fields and is idempotent, but undoing ownership assignment should
  use a local database backup or a deliberate follow-up reassignment tool.

## 12. Resolved Decisions

1. All local pre-multi-user holdings belong to the super admin after migration.
2. Legacy holdings are identified by missing `user_id`.
3. The migration does not split, duplicate, delete, or edit holdings.
4. The migration is a local operational step, not user-facing.
5. CI must not run this migration.

## 13. Open Questions

1. Should the existing CLI grow an explicit `--dry-run` mode, or are documented
   preflight counts sufficient?
2. Should a future admin-only reassignment tool exist for rare manual cleanup,
   or should reassignment remain a direct database operation?
