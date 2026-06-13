# DD-002: Technical design - local legacy holdings migration

* **Status**: Draft (technical design)
* **Owner**: project owner
* **Implements**:
  [PRD-002](../prds/PRD-002-legacy-holdings-super-admin-migration.md)
* **Related**:
  [PRD-001](../prds/PRD-001-user-auth-and-multi-tenancy.md),
  [DD-001 migration](./DD-001-user-auth-and-multi-tenancy.md#10-migration)

This is the *how* for PRD-002. The migration is explicitly **local-only**:
it is a manual developer/owner command for a local MongoDB database that still
contains pre-multi-user holdings. It must not run in CI, tests, build scripts,
Docker image builds, or deployment automation.

## 1. Current State

The multi-tenancy implementation already added `Holding.UserID`, owner-scoped
persistence methods, and a one-shot CLI command:

```bash
cd backend
go run . migrate users --owner admin
```

Today `backend/cmd/migrate.go` looks up `--owner`, calls
`HoldingStore.AssignUnownedTo`, logs matched/modified counts, and rebuilds
indexes. `AssignUnownedTo` updates only documents where `user_id` is absent:

```go
bson.M{"user_id": bson.M{"$exists": false}}
```

That behavior is directionally right, but PRD-002 adds stricter local-only
requirements:

* refuse non-superadmin owners;
* produce preflight and postflight counts;
* surface invalid owner fields separately from missing `user_id`;
* refuse CI execution;
* keep this command out of automated workflows.

## 2. Scope

### 2.1 In Scope

* Enhance the existing `migrate users --owner <username>` command.
* Add local/CI guardrails to that command.
* Add persistence helpers for counting and validating legacy holdings.
* Update local operations documentation.
* Add tests around command behavior and persistence filters.

### 2.2 Out of Scope

* Any frontend UI.
* Any GitHub Actions workflow step.
* Any `make ci`, build, pre-commit, Docker image build, or test setup hook.
* Production or preview deployment automation.
* Automatic reassignment of already-owned holdings.
* Splitting the old portfolio across multiple users.

## 3. Command Contract

Keep the existing command name:

```bash
go run . migrate users --owner <username>
```

The command remains idempotent. It changes only holdings where `user_id` is
absent.

### 3.1 Inputs

| Input | Source | Required | Notes |
|---|---|---:|---|
| `--owner` | CLI flag | yes | Case-insensitive username lookup. Must resolve to role `superadmin`. |
| `MONGODB_URI` | env / default config | no | Must point to an allowed local database target. |
| `MONGODB_DATABASE` | env / default config | no | Uses existing config behavior. |

Do not add CI-specific inputs. CI should not know about this migration.

### 3.2 Output

Log structured fields through the existing logger:

| Field | Meaning |
|---|---|
| `owner` | Super admin username that received legacy holdings. |
| `owner_id` | Super admin ObjectID. |
| `legacy_before` | Holdings where `user_id` is absent before update. |
| `matched` | MongoDB matched count from `UpdateMany`. |
| `modified` | MongoDB modified count from `UpdateMany`. |
| `legacy_after` | Holdings where `user_id` is absent after update. |
| `invalid_owner_shape_count` | Holdings with `user_id` present but malformed. |
| `dangling_owner_count` | Holdings whose `user_id` does not resolve to a user. |

Exit code is non-zero for validation failures, connection failures, invalid
owner data, and failed writes.

## 4. Local-Only Guard

The command must refuse to run in CI-like environments before connecting to
MongoDB.

### 4.1 CI Environment Check

Add a small helper in `backend/cmd/migrate.go`:

```go
func runningInCI() bool {
    return os.Getenv("CI") == "true" ||
        os.Getenv("GITHUB_ACTIONS") == "true" ||
        os.Getenv("BUILDKITE") == "true" ||
        os.Getenv("CIRCLECI") == "true" ||
        os.Getenv("GITLAB_CI") == "true"
}
```

`runMigrateUsers` returns an error if `runningInCI()` is true:

```text
migrate users is local-only and must not run in CI
```

This check protects accidental workflow inclusion. It is not a security
boundary; repository review still keeps workflow files and build scripts from
calling the command.

### 4.2 Local Mongo Target Check

Before connecting, parse `cfg.MongoURI` and refuse obvious remote targets.
Allowed local targets:

* `localhost`
* `127.0.0.1`
* `[::1]` / `::1`
* `mongodb`
* `host.docker.internal`

Allowed schemes:

* `mongodb`

Disallowed:

* `mongodb+srv`
* Atlas hosts
* arbitrary public hostnames
* empty or malformed hostnames after parsing

The `mongodb` hostname is allowed because local Docker Compose uses a service
network where the backend container reaches the local MongoDB service by that
name.

Do not add an override flag in this design. PRD-002 says local only; adding
`--allow-remote` would weaken the contract and invite misuse.

## 5. Owner Validation

After connecting, `runMigrateUsers` resolves the owner through
`st.Users.FindByUsername(ctx, migrateOwner)`.

Validation:

1. missing `--owner` -> error;
2. owner lookup error -> wrap as `owner lookup`;
3. owner not found -> error;
4. owner role is not `domain.RoleSuperAdmin` -> error;
5. owner disabled or locked -> warn but do not block.

The role check is mandatory. A local admin or normal user must never inherit
legacy holdings by mistake.

## 6. Persistence Design

Keep raw MongoDB access inside `internal/persistence`, not in `cmd`.

### 6.1 New HoldingStore Helpers

Add helpers to `backend/internal/persistence/holdings.go`:

```go
func (s *HoldingStore) CountLegacy(ctx context.Context) (int64, error)
func (s *HoldingStore) CountInvalidOwners(ctx context.Context) (int64, error)
func (s *HoldingStore) CountByUser(ctx context.Context, uid primitive.ObjectID) (int64, error)
```

Filters:

```go
// Legacy holding: pre-multi-user document.
bson.M{"user_id": bson.M{"$exists": false}}

// Invalid owner shape. This deliberately excludes missing user_id because
// missing is the legacy case this migration handles.
bson.M{
    "$or": bson.A{
        bson.M{"user_id": nil},
        bson.M{"user_id": bson.M{"$not": bson.M{"$type": "objectId"}}},
    },
    "user_id": bson.M{"$exists": true},
}

// Super admin-owned holdings.
bson.M{"user_id": uid}
```

MongoDB query syntax may need to be expressed with `$and` to combine
`$exists` and `$not` safely:

```go
bson.M{"$and": bson.A{
    bson.M{"user_id": bson.M{"$exists": true}},
    bson.M{"user_id": bson.M{"$not": bson.M{"$type": "objectId"}}},
}}
```

Use whichever form the MongoDB driver accepts cleanly in tests.

### 6.2 Dangling Owner References

PRD-002 defines invalid holdings as including dangling `user_id` references, so
the first implementation must detect them before mutating any holdings.

Add a persistence helper:

```go
func (s *HoldingStore) CountDanglingOwners(ctx context.Context, users *UserStore) (int64, error)
```

Implementation options:

1. aggregation: `$match` holdings where `user_id` is an ObjectID, `$lookup`
   into `users`, then count rows with an empty joined user array;
2. two-query local scan: get distinct ObjectID `user_id` values from holdings,
   query `users` with `_id: {$in: ids}`, and count the ids absent from users.

Prefer the two-query scan unless the data volume makes it problematic. This is
a local-only maintenance command, so clarity and testability matter more than a
single complex aggregation.

Do not put aggregation or distinct-scan code in `cmd`; command code should call
persistence helpers and react to counts.

## 7. Migration Flow

`runMigrateUsers` flow:

1. Validate `--owner`.
2. Refuse CI environment.
3. Load config.
4. Refuse non-local MongoDB URI.
5. Connect with `cliConnect`.
6. Find owner by username.
7. Refuse owner unless `owner.Role == domain.RoleSuperAdmin`.
8. Count malformed owner fields with `CountInvalidOwners`.
9. Count dangling owner references with `CountDanglingOwners`.
10. If either invalid count is greater than zero, return an error before
    updating anything.
11. Count legacy holdings before update.
12. Count owner holdings before update.
13. Run `AssignUnownedTo(ctx, owner.ID)`.
14. Count legacy holdings after update.
15. Count owner holdings after update.
16. Log all counts.
17. If `legacy_after != 0`, return an error.
18. Rebuild indexes via `db.EnsureIndexes`.

The update remains a single `UpdateMany`, so the core mutation is still
idempotent and narrowly scoped.

## 8. CI and Workflow Constraints

The repo must not call this command from:

* GitHub Actions or other CI workflow files;
* `Makefile` CI targets;
* `npm` scripts;
* Go tests;
* frontend tests;
* Dockerfiles;
* `docker-compose` health checks;
* pre-commit hooks.

Tests may execute command logic with mocked MongoDB only when they explicitly
set CI environment variables to prove the command refuses CI. Tests must not
run the real migration against a live database.

Recommended review grep before merging future changes:

```bash
rg -n "migrate users|AssignUnownedTo|runMigrateUsers" .github Makefile backend frontend docker-compose*.yml
```

If `.github` does not exist locally, the command should be adjusted to the
workflow locations present in the repository.

## 9. Documentation

Update local operations docs only:

* `README.md` first-run section: label the command as local-only.
* `CLAUDE.md`: keep architecture notes accurate, but avoid implying CI or
  production rollout should run the migration.
* `PRD-002`: already owns the local-only product requirement.

Do not add deployment runbook steps for this migration.

## 10. Testing

### 10.1 Unit Tests

Add tests in `backend/cmd` for:

* missing owner flag fails;
* CI environment fails before Mongo connection;
* non-local Mongo URI fails before Mongo connection;
* target owner with role `user` fails;
* target owner with role `admin` fails;
* target owner with role `superadmin` proceeds to holdings migration.

Use existing `mtest` patterns where Mongo command verification is needed.

### 10.2 Persistence Tests

Add or extend tests in `backend/internal/persistence` for:

* `AssignUnownedTo` filter includes only missing `user_id`;
* `CountLegacy` counts missing `user_id`;
* `CountInvalidOwners` excludes missing `user_id` and counts present invalid
  owner shapes;
* `CountDanglingOwners` counts holdings whose ObjectID `user_id` is absent
  from the users collection;
* `CountByUser` filters by exact owner ObjectID.

### 10.3 No Live DB Tests

Do not introduce tests that require a real MongoDB process. CI should continue
to use mocks and deterministic fixture data.

## 11. Manual Local Verification

A local operator can verify with:

```bash
cd backend
go run . migrate users --owner admin
go run . migrate users --owner admin
```

Expected first run:

* `legacy_before` equals the number of unowned local holdings;
* `modified` equals `legacy_before`;
* `legacy_after` is `0`.

Expected second run:

* `legacy_before` is `0`;
* `matched` is `0`;
* `modified` is `0`;
* `legacy_after` is `0`.

Then start the local app and confirm the super admin dashboard shows the old
portfolio.

## 12. Rollback

There is no automated rollback command in this design. Because the command is
local-only, rollback options are:

* restore a local MongoDB backup or dump;
* manually unset `user_id` on the affected local holdings if the operator
  intentionally wants to replay the migration;
* write a separate one-off local cleanup script if a specific mistake needs
  correction.

Do not add rollback behavior to CI.

## 13. Open Questions

1. Should the implementation include `--dry-run`, or is pre/post count logging
   enough for local use?
2. Should invalid-owner reporting print sample holding ids for faster local
   cleanup, or are counts enough?
