# PD-057: Tracked migration runner

* **Status**: PR1 (#299) and PR2 (#300) merged; PR3 (deploy wiring) open
* **Owner**: project owner
* **Goal**: `go run . migrate` runs every registered migration step not yet
  done in that database, records each step's status (`in_progress`, `done`,
  `failed`) in a `migrations` collection, and resumes a killed or failed
  step from its saved cursor. The PD-056 sector backfill becomes the first
  step, so every environment classifies its holdings without manual flags.
* **Architecture**: generic `internal/migration` package (`Step` contract,
  `Validate`, `Runner`) over a `persistence.MigrationStore`. One record per
  step keyed by version, plus an atomic claim (`findOneAndUpdate` upsert) and
  a renewed lease for exclusivity. The registry of concrete steps lives in
  the `cmd` composition root.
* **Tech stack**: Go 1.26, cobra, mongo-driver v1, zap, OpenTelemetry; MongoDB 7.
  No new dependencies.
* **Spec**: [PRD-014](../prds/PRD-014-tracked-migrations.md) ·
  [DD-014](../designs/DD-014-tracked-migrations.md). No UI, so no visual spec.

## Rules this plan follows

| Rule | Source | How it shows up here |
|---|---|---|
| Reuse before writing | CLAUDE.md | `endSpan`/`tracer` moved to `telemetry` (services delegates); `cliSession` shared by `migrate` and `migrate sectors`; `logSectorBackfillReport` shared by the manual command and the step; the step reuses `SectorBackfill` and `sectorBackfillUsers` |
| Branch → PR | CLAUDE.md | PR1 is generic and independent of PD-056, so it targets `main` (owner, 2026-11-16). PR2 needs `SectorBackfill`, which exists only on the feature branch, so it targets `feat/PD-056-holding-sectors`. It carries PR1's commit until `main` is merged into the feature branch |
| Docs before code | CLAUDE.md | owner asked for docs and runner in one PR (2026-11-16) |
| Three gates | `task-breakdown` | see PR sequence |
| Behaviour tests only, mtest | CLAUDE.md | runner tests over an in-memory store; mtest for the store's queries; no DB-availability tests |
| `Id` casing, descriptive names | CLAUDE.md | `userIds`, `version`, `record`; no single-letter locals |
| Tracing and logging | CLAUDE.md | `RunPending` opens a span; `logger := r.log(ctx)` bound once |
| Edit tool for source | CLAUDE.md | Modify steps show current → replacement |

## File map

| Action | File | Responsibility |
|---|---|---|
| Create | `backend/internal/telemetry/tracing.go` | `Tracer`, `EndSpan` shared by every package |
| Modify | `backend/internal/services/tracing.go` | delegate to `telemetry` |
| Create | `backend/internal/domain/migration.go` | statuses, `MigrationRecord` |
| Create | `backend/internal/persistence/migrations.go`, `_test.go` | `MigrationStore`: `Claim`, `Get`, `SaveCursor`, `Renew`, `Finish` |
| Modify | `backend/internal/persistence/persistence.go` | wire `Store.Migrations` |
| Create | `backend/internal/migration/migration.go`, `_test.go` | `Step`, `Validate` |
| Create | `backend/internal/migration/runner.go`, `runner_test.go` | `Runner.RunPending`, lease renewal, cursor loop |
| Create | `backend/cmd/migrate_pending.go`, `_test.go` | registry, `runMigratePending`, `cliSession` |
| Modify | `backend/cmd/migrate.go` | bare `migrate` runs pending steps; `NoArgs` |
| Modify | `backend/cmd/migrate_sectors.go` | reuse `cliSession`; extract `logSectorBackfillReport` (PR2; the file exists only on the feature branch) |
| Create | `backend/cmd/migration_sector_backfill.go`, `_test.go` | step `20261116_01` (PR2) |
| Create | `docs/prds/PRD-014-…`, `docs/designs/DD-014-…`, this plan | spec |
| Modify | `docs/operations.md`, `CLAUDE.md` | runbook, architecture |
| Modify | `docs/plans/PD-056-holding-sectors.md` | §8 rollout note (PR2) |

## PR sequence

| # | Branch → base | Scope | No regression | Adds value | Test that fails without it |
|---|---|---|---|---|---|
| 1 | `feat/PD-057-migration-runner` → `main` | docs + runner + store + bare `migrate` (empty registry) | bare `migrate` printed help before; subcommands unchanged; services tracing is a pure move | any database gets tracked, resumable, exclusive migrations; the next step is one registry line | runner/store/registry tests |
| 2 | `feat/PD-057-sector-migration-step` → `feat/PD-056-holding-sectors` | sector backfill step `20261116_01`; `migrate sectors` reuses `cliSession` | `migrate sectors` behaviour and log identical | `migrate` classifies every environment's holdings with no flags | `TestSectorBackfillIsRegistered`, `TestSectorBackfillNext` |
| 3 | `feat/PD-057-deploy-migrations` → `main` | `run-migrations.sh` + shared `repoint-job.sh`; step after rollout in both deploy workflows and `deploy.sh`; CI job for the script tests | `pd-snapshot` repointing behaves as before; the step skips while a job is missing | migrations run on every deploy, and the job can never run a stale image again | `deploy/cloudrun/test.sh` (13 checks, fake `gcloud`) |

## Task 1: Shared tracing helpers

**Files:** `backend/internal/telemetry/tracing.go` (create), `backend/internal/services/tracing.go` (modify)

The runner is a new package and must open spans like every service method.
`endSpan` is unexported in `services`, so it moves to `telemetry` rather than
being copied. Services keeps its two names as one-line delegates, so no
service file changes.

* [ ] Create `backend/internal/telemetry/tracing.go`:

```go
package telemetry

import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/codes"
    "go.opentelemetry.io/otel/trace"
)

// Tracer is the application tracer every package opens spans on. It
// delegates to the global provider, so spans are dropped until Setup
// installs one.
var Tracer = otel.Tracer("portfolio-dashboard")

// EndSpan records *err on span, when set, and ends it. Call it deferred with
// the method's named error return: defer telemetry.EndSpan(span, &retErr).
func EndSpan(span trace.Span, err *error) {
    if err != nil && *err != nil {
        span.RecordError(*err)
        span.SetStatus(codes.Error, (*err).Error())
    }
    span.End()
}
```

* [ ] Modify `backend/internal/services/tracing.go`. Current:

```go
package services

import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/codes"
    "go.opentelemetry.io/otel/trace"
)

var tracer = otel.Tracer("portfolio-dashboard")

func endSpan(span trace.Span, err *error) {
    if err != nil && *err != nil {
        span.RecordError(*err)
        span.SetStatus(codes.Error, (*err).Error())
    }
    span.End()
}
```

  Replacement:

```go
package services

import (
    "go.opentelemetry.io/otel/trace"

    "portfolio-dashboard/internal/telemetry"
)

var tracer = telemetry.Tracer

func endSpan(span trace.Span, err *error) {
    telemetry.EndSpan(span, err)
}
```

* [ ] Verify: `cd backend && go test ./internal/services/`. Expected: `ok`.

## Task 2: Migration record and store

**Files:** `backend/internal/domain/migration.go`, `backend/internal/persistence/migrations.go`, `backend/internal/persistence/migrations_test.go` (create); `backend/internal/persistence/persistence.go` (modify)

One record per step keeps every status explicit and lets a late, older-dated
step still run (DD-014 §1). The claim is a single atomic upsert. A record that
exists but is not claimable makes the insert collide on `_id`, so racing
claimers cannot both win (DD-014 §3). Held writes filter on the lease owner,
so a run that lost its lease is told so (`ErrNotFound`).

* [ ] Create `backend/internal/domain/migration.go`:

```go
package domain

import "time"

// Migration statuses (DD-014 §1). A step with no record has never run and is
// pending; the runner creates the record on its first claim.
const (
    MigrationInProgress = "in_progress"
    MigrationDone       = "done"
    MigrationFailed     = "failed"
)

// MigrationRecord is one migration step's run state in the migrations
// collection, keyed by the step's version. Cursor is the step's saved resume
// point, so a killed or failed run continues where it stopped. The lease
// makes a run exclusive: an in_progress record whose lease has expired
// belongs to a dead run and may be claimed again.
type MigrationRecord struct {
    Version        string     `bson:"_id"`
    Status         string     `bson:"status"`
    Cursor         *string    `bson:"cursor,omitempty"`
    Attempts       int        `bson:"attempts"`
    StartedAt      time.Time  `bson:"started_at"`
    FinishedAt     *time.Time `bson:"finished_at,omitempty"`
    LeaseOwner     string     `bson:"lease_owner"`
    LeaseExpiresAt time.Time  `bson:"lease_expires_at"`
    LastError      string     `bson:"last_error,omitempty"`
    UpdatedAt      time.Time  `bson:"updated_at"`
}
```

* [ ] Create `backend/internal/persistence/migrations.go`:

```go
package persistence

import (
    "context"
    "time"

    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"

    "portfolio-dashboard/internal/domain"
)

// MigrationStore owns the migrations collection: one record per migration
// step, keyed by the step's version (DD-014 §1).
type MigrationStore struct {
    col *mongo.Collection
}

// Claim takes the lease on step version for owner until leaseUntil and marks
// it in_progress, creating the record on the step's first run. A missing or
// failed record is claimable, and so is an in_progress one whose lease has
// expired (a run that was killed or redeployed). The saved cursor is kept so
// the run resumes. claimed=false returns the current record: done, or held
// by a live run.
//
// Filter and upsert are one atomic findAndModify. When the record exists but
// is not claimable, the upsert's insert collides on _id, so of two racing
// claimers at most one wins.
func (s *MigrationStore) Claim(ctx context.Context, version, owner string, now, leaseUntil time.Time) (_ domain.MigrationRecord, claimed bool, _ error) {
    ctx, cancel := context.WithTimeout(ctx, writeTimeout)
    defer cancel()
    filter := bson.M{
        "_id": version,
        "$or": bson.A{
            bson.M{"status": domain.MigrationFailed},
            bson.M{"status": domain.MigrationInProgress, "lease_expires_at": bson.M{"$lte": now}},
        },
    }
    update := bson.M{
        "$set": bson.M{
            "status":           domain.MigrationInProgress,
            "lease_owner":      owner,
            "lease_expires_at": leaseUntil,
            "started_at":       now,
            "updated_at":       now,
        },
        "$inc":   bson.M{"attempts": 1},
        "$unset": bson.M{"finished_at": "", "last_error": ""},
    }
    opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
    var record domain.MigrationRecord
    err := s.col.FindOneAndUpdate(ctx, filter, update, opts).Decode(&record)
    if mongo.IsDuplicateKeyError(err) {
        current, err := s.Get(ctx, version)
        return current, false, err
    }
    if err != nil {
        return domain.MigrationRecord{}, false, err
    }
    return record, true, nil
}

// Get returns step version's record, or ErrNotFound when it never ran.
func (s *MigrationStore) Get(ctx context.Context, version string) (domain.MigrationRecord, error) {
    ctx, cancel := context.WithTimeout(ctx, readTimeout)
    defer cancel()
    var record domain.MigrationRecord
    if err := s.col.FindOne(ctx, bson.M{"_id": version}).Decode(&record); err != nil {
        return domain.MigrationRecord{}, translateFindErr(err)
    }
    return record, nil
}

// SaveCursor stores the step's resume point and extends owner's lease.
// ErrNotFound means owner lost the lease and must stop.
func (s *MigrationStore) SaveCursor(ctx context.Context, version, owner string, cursor string, now, leaseUntil time.Time) error {
    return s.updateHeld(ctx, version, owner, bson.M{"$set": bson.M{
        "cursor":           cursor,
        "lease_expires_at": leaseUntil,
        "updated_at":       now,
    }})
}

// Renew extends owner's lease on step version while a long batch runs.
// ErrNotFound means owner lost the lease and must stop.
func (s *MigrationStore) Renew(ctx context.Context, version, owner string, now, leaseUntil time.Time) error {
    return s.updateHeld(ctx, version, owner, bson.M{"$set": bson.M{
        "lease_expires_at": leaseUntil,
        "updated_at":       now,
    }})
}

// Finish records owner's run of step version as done, or as failed with
// runErr's message, and releases the lease. A done step drops its cursor; a
// failed one keeps it so the retry resumes there. ErrNotFound means owner
// no longer held the lease.
func (s *MigrationStore) Finish(ctx context.Context, version, owner string, runErr error, now time.Time) error {
    set := bson.M{"lease_expires_at": now, "updated_at": now}
    update := bson.M{"$set": set}
    if runErr == nil {
        set["status"] = domain.MigrationDone
        set["finished_at"] = now
        update["$unset"] = bson.M{"cursor": ""}
    } else {
        set["status"] = domain.MigrationFailed
        set["last_error"] = runErr.Error()
    }
    return s.updateHeld(ctx, version, owner, update)
}

// updateHeld applies update to step version only while owner holds its
// in_progress lease.
func (s *MigrationStore) updateHeld(ctx context.Context, version, owner string, update bson.M) error {
    ctx, cancel := context.WithTimeout(ctx, writeTimeout)
    defer cancel()
    filter := bson.M{"_id": version, "lease_owner": owner, "status": domain.MigrationInProgress}
    result, err := s.col.UpdateOne(ctx, filter, update)
    if err != nil {
        return err
    }
    if result.MatchedCount == 0 {
        return ErrNotFound
    }
    return nil
}
```

* [ ] Modify `backend/internal/persistence/persistence.go`. Current:

```go
    Branding     *BrandingStore

    client *mongo.Client // for InTransaction
```

```go
        Branding:     &BrandingStore{col: db.Collection("app_branding")},
        client:       db.Client(),
```

  Replacement:

```go
    Branding     *BrandingStore
    Migrations   *MigrationStore

    client *mongo.Client // for InTransaction
```

```go
        Branding:     &BrandingStore{col: db.Collection("app_branding")},
        Migrations:   &MigrationStore{col: db.Collection("migrations")},
        client:       db.Client(),
```

* [ ] Create `backend/internal/persistence/migrations_test.go`. These tests
  pin the claim query (upsert, the two claimable clauses, cursor untouched),
  the duplicate-key path, lease loss and the Finish updates:

```go
package persistence

import (
    "context"
    "errors"
    "testing"
    "time"

    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/mongo/integration/mtest"

    "portfolio-dashboard/internal/domain"
)

func migrationRecordBSON(status string, cursor string) bson.D {
    record := bson.D{
        {Key: "_id", Value: "20261116_01"},
        {Key: "status", Value: status},
        {Key: "attempts", Value: 1},
        {Key: "lease_owner", Value: "run-a"},
    }
    if cursor != "" {
        record = append(record, bson.E{Key: "cursor", Value: cursor})
    }
    return record
}

func TestMigrationClaim_ClaimableRecordIsClaimedAndKeepsItsCursor(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    mt.Run("claimed", func(mt *mtest.T) {
        mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: migrationRecordBSON(domain.MigrationInProgress, "42")}))

        now := time.Now()
        record, claimed, err := New(mt.DB).Migrations.Claim(context.Background(), "20261116_01", "run-a", now, now.Add(time.Minute))
        if err != nil || !claimed {
            t.Fatalf("Claim = claimed %v, %v; want claimed", claimed, err)
        }
        if record.Cursor == nil || *record.Cursor != "42" {
            t.Errorf("cursor = %v; want the saved cursor 42 returned for resume", record.Cursor)
        }

        command := mt.GetStartedEvent().Command
        if upsert, _ := command.Lookup("upsert").BooleanOK(); !upsert {
            t.Error("claim must upsert so a step's first run creates its record")
        }
        if _, err := command.LookupErr("update", "$set", "cursor"); err == nil {
            t.Error("claim must not overwrite the saved cursor")
        }
        clauses := command.Lookup("query", "$or").Array()
        values, _ := clauses.Values()
        if len(values) != 2 {
            t.Fatalf("claim filter has %d $or clauses; want failed and expired in_progress", len(values))
        }
        if status := values[0].Document().Lookup("status").StringValue(); status != domain.MigrationFailed {
            t.Errorf("first clause status = %q; want failed", status)
        }
        expired := values[1].Document()
        if status := expired.Lookup("status").StringValue(); status != domain.MigrationInProgress {
            t.Errorf("second clause status = %q; want in_progress", status)
        }
        if _, err := expired.LookupErr("lease_expires_at", "$lte"); err != nil {
            t.Error("in_progress is claimable only once its lease has expired")
        }
    })
}

func TestMigrationClaim_DoneOrHeldRecordIsNotClaimed(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    mt.Run("duplicate key", func(mt *mtest.T) {
        mt.AddMockResponses(
            mtest.CreateCommandErrorResponse(mtest.CommandError{Code: 11000, Name: "DuplicateKey", Message: "E11000 duplicate key error"}),
            mtest.CreateCursorResponse(0, "portfolio.migrations", mtest.FirstBatch, migrationRecordBSON(domain.MigrationDone, "")),
        )

        now := time.Now()
        record, claimed, err := New(mt.DB).Migrations.Claim(context.Background(), "20261116_01", "run-b", now, now.Add(time.Minute))
        if err != nil || claimed {
            t.Fatalf("Claim = claimed %v, %v; want not claimed", claimed, err)
        }
        if record.Status != domain.MigrationDone {
            t.Errorf("status = %q; want the current record returned", record.Status)
        }
    })
}

func TestMigrationLease_LostLeaseIsNotFound(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    notMatched := func() bson.D {
        return mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 0}, bson.E{Key: "nModified", Value: 0})
    }
    now := time.Now()
    mt.Run("save cursor", func(mt *mtest.T) {
        mt.AddMockResponses(notMatched())
        if err := New(mt.DB).Migrations.SaveCursor(context.Background(), "20261116_01", "run-a", "7", now, now); !errors.Is(err, ErrNotFound) {
            t.Errorf("SaveCursor = %v; want ErrNotFound", err)
        }
    })
    mt.Run("renew", func(mt *mtest.T) {
        mt.AddMockResponses(notMatched())
        if err := New(mt.DB).Migrations.Renew(context.Background(), "20261116_01", "run-a", now, now); !errors.Is(err, ErrNotFound) {
            t.Errorf("Renew = %v; want ErrNotFound", err)
        }
    })
    mt.Run("finish", func(mt *mtest.T) {
        mt.AddMockResponses(notMatched())
        if err := New(mt.DB).Migrations.Finish(context.Background(), "20261116_01", "run-a", nil, now); !errors.Is(err, ErrNotFound) {
            t.Errorf("Finish = %v; want ErrNotFound", err)
        }
    })
}

func TestMigrationFinish_RecordsOutcome(t *testing.T) {
    mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
    matched := mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}, bson.E{Key: "nModified", Value: 1})
    now := time.Now()
    sentUpdate := func(mt *mtest.T) bson.Raw {
        updates, _ := mt.GetStartedEvent().Command.Lookup("updates").Array().Values()
        statement := updates[0].Document()
        if owner := statement.Lookup("q", "lease_owner").StringValue(); owner != "run-a" {
            t.Errorf("filter lease_owner = %q; want only the lease holder to finish", owner)
        }
        return statement.Lookup("u").Document()
    }
    mt.Run("done clears the cursor", func(mt *mtest.T) {
        mt.AddMockResponses(matched)
        if err := New(mt.DB).Migrations.Finish(context.Background(), "20261116_01", "run-a", nil, now); err != nil {
            t.Fatalf("Finish: %v", err)
        }
        update := sentUpdate(mt)
        if status := update.Lookup("$set", "status").StringValue(); status != domain.MigrationDone {
            t.Errorf("status = %q; want done", status)
        }
        if _, err := update.LookupErr("$set", "finished_at"); err != nil {
            t.Error("done must stamp finished_at")
        }
        if _, err := update.LookupErr("$unset", "cursor"); err != nil {
            t.Error("done must clear the cursor")
        }
    })
    mt.Run("failed keeps the cursor and the error", func(mt *mtest.T) {
        mt.AddMockResponses(matched)
        if err := New(mt.DB).Migrations.Finish(context.Background(), "20261116_01", "run-a", errors.New("yahoo rate limit"), now); err != nil {
            t.Fatalf("Finish: %v", err)
        }
        update := sentUpdate(mt)
        if status := update.Lookup("$set", "status").StringValue(); status != domain.MigrationFailed {
            t.Errorf("status = %q; want failed", status)
        }
        if message := update.Lookup("$set", "last_error").StringValue(); message != "yahoo rate limit" {
            t.Errorf("last_error = %q; want the run's error", message)
        }
        if _, err := update.LookupErr("$unset"); err == nil {
            t.Error("failed must keep the cursor for the retry")
        }
    })
}
```

* [ ] Verify: `cd backend && go test ./internal/persistence/ -run Migration -v`.
  Expected: 4 tests `PASS`.

## Task 3: Step contract and runner

**Files:** `backend/internal/migration/migration.go`, `migration_test.go`, `runner.go`, `runner_test.go` (create)

The package knows steps, not holdings, so any future migration plugs in. The
cursor loop saves progress between batches. A renewal goroutine keeps the
lease through a slow batch and cancels the step if the lease is lost. The
outcome is recorded on an uncancelled context, so SIGTERM still marks the
step failed (DD-014 §4).

* [ ] Create `backend/internal/migration/migration.go`:

```go
// Package migration runs registered data migrations once per database
// (DD-014). Each step's state lives in the migrations collection, keyed by
// its version: `go run . migrate` runs every step not yet done, in version
// order, resuming a failed or interrupted step from its saved cursor.
package migration

import (
    "context"
    "fmt"
    "regexp"
)

// Step is one data migration.
type Step interface {
    // Version identifies the step as "YYYYMMDD_NN" (the date it was written
    // and a same-day sequence number). It orders the steps and is permanent
    // once shipped: changing it runs the step again.
    Version() string
    // Run does one batch of work. cursor is nil on the first batch, else the
    // value the previous batch returned. Return a non-nil cursor to be called
    // again with it: the runner saves it first, so a killed run resumes
    // there. Return nil when the step is complete. A step is not run in a
    // transaction and may be retried from its last saved cursor, so each
    // batch must be idempotent.
    Run(ctx context.Context, cursor *string) (next *string, err error)
}

var versionPattern = regexp.MustCompile(`^\d{8}_\d{2}$`)

// Validate rejects a malformed registry: a version not in YYYYMMDD_NN form,
// a duplicate, or steps out of version order. Registry order is run order,
// so it must read the same as the versions.
func Validate(steps []Step) error {
    for index, step := range steps {
        version := step.Version()
        if !versionPattern.MatchString(version) {
            return fmt.Errorf("migration version %q: want YYYYMMDD_NN", version)
        }
        if index > 0 && version <= steps[index-1].Version() {
            return fmt.Errorf("migration %s must come after %s in the registry", version, steps[index-1].Version())
        }
    }
    return nil
}
```

* [ ] Create `backend/internal/migration/runner.go`:

```go
package migration

import (
    "context"
    "errors"
    "fmt"
    "os"
    "time"

    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/domain"
    "portfolio-dashboard/internal/logging"
    "portfolio-dashboard/internal/telemetry"
)

// Store is the slice of persistence.MigrationStore the runner uses; tests
// substitute an in-memory store with the same claim rules.
type Store interface {
    Claim(ctx context.Context, version, owner string, now, leaseUntil time.Time) (domain.MigrationRecord, bool, error)
    SaveCursor(ctx context.Context, version, owner string, cursor string, now, leaseUntil time.Time) error
    Renew(ctx context.Context, version, owner string, now, leaseUntil time.Time) error
    Finish(ctx context.Context, version, owner string, runErr error, now time.Time) error
}

const (
    // defaultLease is how long a claim stays exclusive without renewal. A run
    // killed without recording its outcome is claimable this long after its
    // last renewal.
    defaultLease = 2 * time.Minute
    // finishTimeout bounds recording the outcome after ctx was cancelled.
    finishTimeout = 10 * time.Second
)

// Report summarises one RunPending call.
type Report struct {
    Ran     []string // steps that completed in this run
    Skipped []string // steps already done
    Held    string   // step held by another live run; it and later steps did not run
    Failed  string   // step that failed; later steps did not run
}

// Runner claims and runs pending migration steps.
type Runner struct {
    store  Store
    logger *zap.Logger
    owner  string
    lease  time.Duration
    now    func() time.Time
}

// NewRunner builds a runner whose lease owner names this process.
func NewRunner(store Store, logger *zap.Logger) *Runner {
    host, _ := os.Hostname()
    owner := fmt.Sprintf("%s-%d-%s", host, os.Getpid(), primitive.NewObjectID().Hex())
    return &Runner{store: store, logger: logger, owner: owner, lease: defaultLease, now: time.Now}
}

func (r *Runner) log(ctx context.Context) *zap.Logger {
    return logging.FromContextOr(ctx, r.logger)
}

// RunPending runs, in version order, every step not yet done. A failed step
// is recorded failed with its error and stops the run, because a later step
// may depend on it; the next run retries it from its saved cursor. A step
// held by another live run also stops the run, without error. Cancelling ctx
// stops the current step, which is recorded failed so the next run can
// resume it at once.
func (r *Runner) RunPending(ctx context.Context, steps []Step) (_ Report, retErr error) {
    ctx, span := telemetry.Tracer.Start(ctx, "migration.RunPending")
    defer telemetry.EndSpan(span, &retErr)
    logger := r.log(ctx)
    var report Report
    if err := Validate(steps); err != nil {
        return report, err
    }
    for _, step := range steps {
        version := step.Version()
        now := r.now()
        record, claimed, err := r.store.Claim(ctx, version, r.owner, now, now.Add(r.lease))
        if err != nil {
            return report, fmt.Errorf("claim migration %s: %w", version, err)
        }
        if !claimed {
            if record.Status == domain.MigrationDone {
                report.Skipped = append(report.Skipped, version)
                continue
            }
            report.Held = version
            logger.Info("migration held by another run", zap.String("version", version), zap.Time("lease_expires_at", record.LeaseExpiresAt))
            return report, nil
        }
        logger.Info("migration started", zap.String("version", version), zap.Int("attempt", record.Attempts), zap.Bool("resumed", record.Cursor != nil))
        runErr := r.runLeased(ctx, step, record.Cursor)
        // Record the outcome even when ctx was cancelled (SIGTERM).
        finishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), finishTimeout)
        finishErr := r.store.Finish(finishCtx, version, r.owner, runErr, r.now())
        cancel()
        if runErr != nil {
            report.Failed = version
            logger.Error("migration failed", zap.String("version", version), zap.Error(runErr))
            return report, fmt.Errorf("migration %s: %w", version, runErr)
        }
        if finishErr != nil {
            return report, fmt.Errorf("record migration %s done: %w", version, finishErr)
        }
        report.Ran = append(report.Ran, version)
        logger.Info("migration done", zap.String("version", version))
    }
    return report, nil
}

// runLeased calls step's batches from cursor until it returns nil, saving
// each returned cursor before the next batch. A goroutine renews the lease
// every third of its length, so one slow batch keeps it; losing the lease
// (another run claimed it after a stall) cancels the step so two runs never
// write at once.
func (r *Runner) runLeased(ctx context.Context, step Step, cursor *string) error {
    version := step.Version()
    runCtx, cancel := context.WithCancelCause(ctx)
    defer cancel(nil)
    stopRenewing := make(chan struct{})
    renewerDone := make(chan struct{})
    go func() {
        defer close(renewerDone)
        ticker := time.NewTicker(r.lease / 3)
        defer ticker.Stop()
        for {
            select {
            case <-stopRenewing:
                return
            case <-runCtx.Done():
                return
            case <-ticker.C:
                now := r.now()
                if err := r.store.Renew(runCtx, version, r.owner, now, now.Add(r.lease)); err != nil {
                    cancel(fmt.Errorf("lease renewal: %w", err))
                    return
                }
            }
        }
    }()
    err := r.runBatches(runCtx, step, cursor)
    close(stopRenewing)
    <-renewerDone
    if cause := context.Cause(runCtx); err != nil && cause != nil && !errors.Is(err, cause) {
        return fmt.Errorf("%w (%w)", err, cause)
    }
    return err
}

func (r *Runner) runBatches(ctx context.Context, step Step, cursor *string) error {
    version := step.Version()
    for {
        if err := context.Cause(ctx); err != nil {
            return err
        }
        next, err := step.Run(ctx, cursor)
        if err != nil {
            return err
        }
        if next == nil {
            return nil
        }
        if cursor != nil && *next == *cursor {
            return fmt.Errorf("step returned its input cursor %q; it would never finish", *next)
        }
        now := r.now()
        if err := r.store.SaveCursor(ctx, version, r.owner, *next, now, now.Add(r.lease)); err != nil {
            return fmt.Errorf("save cursor: %w", err)
        }
        cursor = next
    }
}
```

* [ ] Create `backend/internal/migration/migration_test.go`:

```go
package migration

import "testing"

func TestValidate(t *testing.T) {
    steps := func(versions ...string) []Step {
        registry := make([]Step, 0, len(versions))
        for _, version := range versions {
            registry = append(registry, &batchStep{version: version, batches: 1})
        }
        return registry
    }
    testCases := []struct {
        name    string
        steps   []Step
        wantErr bool
    }{
        {"empty registry", nil, false},
        {"ordered versions", steps("20261116_01", "20261116_02", "20261201_01"), false},
        {"dashes instead of underscore", steps("2026-11-16"), true},
        {"missing sequence number", steps("20261116"), true},
        {"slug instead of number", steps("20261116_sectors"), true},
        {"duplicate version", steps("20261116_01", "20261116_01"), true},
        {"out of order", steps("20261120_01", "20261116_01"), true},
    }
    for _, testCase := range testCases {
        t.Run(testCase.name, func(t *testing.T) {
            if err := Validate(testCase.steps); (err != nil) != testCase.wantErr {
                t.Errorf("Validate = %v; wantErr %v", err, testCase.wantErr)
            }
        })
    }
}
```

* [ ] Create `backend/internal/migration/runner_test.go`. The in-memory store
  applies the same claim rules as Mongo:

```go
package migration

import (
    "context"
    "errors"
    "slices"
    "strconv"
    "sync"
    "testing"
    "time"

    "go.uber.org/zap"

    "portfolio-dashboard/internal/domain"
    "portfolio-dashboard/internal/persistence"
)

// memoryStore applies the same claim and lease rules as
// persistence.MigrationStore, in memory.
type memoryStore struct {
    mu        sync.Mutex
    records   map[string]domain.MigrationRecord
    renewals  int
    renewErr  error
    cursorLog []string
}

func newMemoryStore() *memoryStore {
    return &memoryStore{records: map[string]domain.MigrationRecord{}}
}

func (m *memoryStore) Claim(_ context.Context, version, owner string, now, leaseUntil time.Time) (domain.MigrationRecord, bool, error) {
    m.mu.Lock()
    defer m.mu.Unlock()
    record, exists := m.records[version]
    claimable := !exists || record.Status == domain.MigrationFailed ||
        (record.Status == domain.MigrationInProgress && !record.LeaseExpiresAt.After(now))
    if !claimable {
        return record, false, nil
    }
    record.Version = version
    record.Status = domain.MigrationInProgress
    record.LeaseOwner = owner
    record.LeaseExpiresAt = leaseUntil
    record.StartedAt = now
    record.Attempts++
    record.FinishedAt = nil
    record.LastError = ""
    m.records[version] = record
    return record, true, nil
}

func (m *memoryStore) held(version, owner string) (domain.MigrationRecord, error) {
    record, exists := m.records[version]
    if !exists || record.LeaseOwner != owner || record.Status != domain.MigrationInProgress {
        return domain.MigrationRecord{}, persistence.ErrNotFound
    }
    return record, nil
}

func (m *memoryStore) SaveCursor(_ context.Context, version, owner string, cursor string, _, leaseUntil time.Time) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    record, err := m.held(version, owner)
    if err != nil {
        return err
    }
    record.Cursor = &cursor
    record.LeaseExpiresAt = leaseUntil
    m.records[version] = record
    m.cursorLog = append(m.cursorLog, cursor)
    return nil
}

func (m *memoryStore) Renew(_ context.Context, version, owner string, _, leaseUntil time.Time) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    m.renewals++
    if m.renewErr != nil {
        return m.renewErr
    }
    record, err := m.held(version, owner)
    if err != nil {
        return err
    }
    record.LeaseExpiresAt = leaseUntil
    m.records[version] = record
    return nil
}

func (m *memoryStore) Finish(_ context.Context, version, owner string, runErr error, now time.Time) error {
    m.mu.Lock()
    defer m.mu.Unlock()
    record, err := m.held(version, owner)
    if err != nil {
        return err
    }
    record.LeaseExpiresAt = now
    if runErr == nil {
        record.Status = domain.MigrationDone
        record.FinishedAt = &now
        record.Cursor = nil
    } else {
        record.Status = domain.MigrationFailed
        record.LastError = runErr.Error()
    }
    m.records[version] = record
    return nil
}

func (m *memoryStore) record(version string) domain.MigrationRecord {
    m.mu.Lock()
    defer m.mu.Unlock()
    return m.records[version]
}

// batchStep counts down batches: each Run advances the cursor by one until
// it reaches batches. failAt makes the batch starting at that cursor fail.
type batchStep struct {
    version string
    batches int
    failAt  int
    runs    []string // cursors Run was called with ("" for nil)
    run     func(ctx context.Context) error
}

func (s *batchStep) Version() string { return s.version }

func (s *batchStep) Run(ctx context.Context, cursor *string) (*string, error) {
    position := 0
    if cursor != nil {
        position, _ = strconv.Atoi(*cursor)
        s.runs = append(s.runs, *cursor)
    } else {
        s.runs = append(s.runs, "")
    }
    if s.run != nil {
        if err := s.run(ctx); err != nil {
            return nil, err
        }
    }
    if s.failAt > 0 && position == s.failAt {
        return nil, errors.New("batch failed")
    }
    if position+1 >= s.batches {
        return nil, nil
    }
    return new(strconv.Itoa(position + 1)), nil
}

func testRunner(store Store) *Runner {
    return &Runner{store: store, logger: zap.NewNop(), owner: "test-runner", lease: time.Minute, now: time.Now}
}

func TestRunPending_RunsNewStepsInOrderAndMarksThemDone(t *testing.T) {
    store := newMemoryStore()
    first := &batchStep{version: "20261116_01", batches: 1}
    second := &batchStep{version: "20261116_02", batches: 1}

    report, err := testRunner(store).RunPending(context.Background(), []Step{first, second})
    if err != nil {
        t.Fatalf("RunPending: %v", err)
    }
    if !slices.Equal(report.Ran, []string{"20261116_01", "20261116_02"}) {
        t.Errorf("Ran = %v; want both steps in order", report.Ran)
    }
    for _, version := range report.Ran {
        record := store.record(version)
        if record.Status != domain.MigrationDone || record.FinishedAt == nil || record.Attempts != 1 {
            t.Errorf("%s = %+v; want done after one attempt", version, record)
        }
    }
}

func TestRunPending_DoneStepNeverRunsAgain(t *testing.T) {
    store := newMemoryStore()
    step := &batchStep{version: "20261116_01", batches: 1}
    runner := testRunner(store)
    if _, err := runner.RunPending(context.Background(), []Step{step}); err != nil {
        t.Fatalf("first RunPending: %v", err)
    }

    report, err := runner.RunPending(context.Background(), []Step{step})
    if err != nil {
        t.Fatalf("second RunPending: %v", err)
    }
    if len(step.runs) != 1 {
        t.Errorf("step ran %d times; want once", len(step.runs))
    }
    if !slices.Equal(report.Skipped, []string{"20261116_01"}) || len(report.Ran) != 0 {
        t.Errorf("report = %+v; want the step skipped", report)
    }
}

func TestRunPending_NewStepRunsWhenOlderStepsAreDone(t *testing.T) {
    store := newMemoryStore()
    first := &batchStep{version: "20261116_01", batches: 1}
    runner := testRunner(store)
    if _, err := runner.RunPending(context.Background(), []Step{first}); err != nil {
        t.Fatalf("first RunPending: %v", err)
    }

    added := &batchStep{version: "20261120_01", batches: 1}
    report, err := runner.RunPending(context.Background(), []Step{first, added})
    if err != nil {
        t.Fatalf("second RunPending: %v", err)
    }
    if !slices.Equal(report.Ran, []string{"20261120_01"}) || len(added.runs) != 1 {
        t.Errorf("report = %+v, added ran %d times; want only the new step run", report, len(added.runs))
    }
}

func TestRunPending_SavesEachCursorAndPassesItToTheNextBatch(t *testing.T) {
    store := newMemoryStore()
    step := &batchStep{version: "20261116_01", batches: 3}

    if _, err := testRunner(store).RunPending(context.Background(), []Step{step}); err != nil {
        t.Fatalf("RunPending: %v", err)
    }
    if !slices.Equal(step.runs, []string{"", "1", "2"}) {
        t.Errorf("Run cursors = %v; want nil, 1, 2", step.runs)
    }
    if !slices.Equal(store.cursorLog, []string{"1", "2"}) {
        t.Errorf("saved cursors = %v; want 1, 2", store.cursorLog)
    }
    if record := store.record("20261116_01"); record.Cursor != nil {
        t.Errorf("done record cursor = %q; want cleared", *record.Cursor)
    }
}

func TestRunPending_FailureIsRecordedAndStopsLaterSteps(t *testing.T) {
    store := newMemoryStore()
    failing := &batchStep{version: "20261116_01", batches: 3, failAt: 1}
    later := &batchStep{version: "20261116_02", batches: 1}

    report, err := testRunner(store).RunPending(context.Background(), []Step{failing, later})
    if err == nil {
        t.Fatal("RunPending = nil error; want the step's failure")
    }
    if report.Failed != "20261116_01" || len(later.runs) != 0 {
        t.Errorf("report = %+v, later ran %d times; want failure to stop the run", report, len(later.runs))
    }
    record := store.record("20261116_01")
    if record.Status != domain.MigrationFailed || record.LastError != "batch failed" {
        t.Errorf("record = %+v; want failed with the error", record)
    }
    if record.Cursor == nil || *record.Cursor != "1" {
        t.Errorf("record cursor = %v; want the last saved cursor 1 kept", record.Cursor)
    }
}

func TestRunPending_RetryResumesFailedStepFromItsSavedCursor(t *testing.T) {
    store := newMemoryStore()
    step := &batchStep{version: "20261116_01", batches: 3, failAt: 2}
    runner := testRunner(store)
    if _, err := runner.RunPending(context.Background(), []Step{step}); err == nil {
        t.Fatal("first RunPending = nil error; want failure")
    }

    step.failAt = 0
    step.runs = nil
    report, err := runner.RunPending(context.Background(), []Step{step})
    if err != nil {
        t.Fatalf("retry RunPending: %v", err)
    }
    if !slices.Equal(step.runs, []string{"2"}) {
        t.Errorf("retry Run cursors = %v; want to resume at 2", step.runs)
    }
    record := store.record("20261116_01")
    if !slices.Equal(report.Ran, []string{"20261116_01"}) || record.Status != domain.MigrationDone || record.Attempts != 2 {
        t.Errorf("report = %+v, record = %+v; want done on the second attempt", report, record)
    }
}

func TestRunPending_ExpiredLeaseIsClaimedAndResumed(t *testing.T) {
    store := newMemoryStore()
    cursor := "1"
    store.records["20261116_01"] = domain.MigrationRecord{
        Version: "20261116_01", Status: domain.MigrationInProgress, Cursor: &cursor, Attempts: 1,
        LeaseOwner: "killed-run", LeaseExpiresAt: time.Now().Add(-time.Second),
    }
    step := &batchStep{version: "20261116_01", batches: 2}

    report, err := testRunner(store).RunPending(context.Background(), []Step{step})
    if err != nil {
        t.Fatalf("RunPending: %v", err)
    }
    if !slices.Equal(step.runs, []string{"1"}) || !slices.Equal(report.Ran, []string{"20261116_01"}) {
        t.Errorf("runs = %v, report = %+v; want the dead run resumed from its cursor", step.runs, report)
    }
}

func TestRunPending_LiveLeaseStopsTheRunWithoutError(t *testing.T) {
    store := newMemoryStore()
    store.records["20261116_01"] = domain.MigrationRecord{
        Version: "20261116_01", Status: domain.MigrationInProgress,
        LeaseOwner: "other-run", LeaseExpiresAt: time.Now().Add(time.Minute),
    }
    held := &batchStep{version: "20261116_01", batches: 1}
    later := &batchStep{version: "20261116_02", batches: 1}

    report, err := testRunner(store).RunPending(context.Background(), []Step{held, later})
    if err != nil {
        t.Fatalf("RunPending: %v", err)
    }
    if report.Held != "20261116_01" || len(held.runs) != 0 || len(later.runs) != 0 {
        t.Errorf("report = %+v; want the held step and every later one left alone", report)
    }
}

func TestRunPending_CancelledRunIsRecordedFailed(t *testing.T) {
    store := newMemoryStore()
    ctx, cancel := context.WithCancel(context.Background())
    step := &batchStep{version: "20261116_01", batches: 3, run: func(ctx context.Context) error {
        cancel() // SIGTERM arrives during the first batch
        return ctx.Err()
    }}

    report, err := testRunner(store).RunPending(ctx, []Step{step})
    if !errors.Is(err, context.Canceled) {
        t.Fatalf("RunPending error = %v; want context.Canceled", err)
    }
    if record := store.record("20261116_01"); report.Failed != "20261116_01" || record.Status != domain.MigrationFailed {
        t.Errorf("record = %+v; want failed so the next run resumes at once", record)
    }
}

func TestRunPending_LostLeaseCancelsTheStep(t *testing.T) {
    store := newMemoryStore()
    store.renewErr = persistence.ErrNotFound
    runner := testRunner(store)
    runner.lease = 30 * time.Millisecond
    step := &batchStep{version: "20261116_01", batches: 1, run: func(ctx context.Context) error {
        <-ctx.Done() // a slow batch outlives the lease
        return ctx.Err()
    }}

    _, err := runner.RunPending(context.Background(), []Step{step})
    if !errors.Is(err, persistence.ErrNotFound) {
        t.Fatalf("RunPending error = %v; want the lost-lease cause", err)
    }
}

func TestRunPending_SlowBatchRenewsItsLease(t *testing.T) {
    store := newMemoryStore()
    runner := testRunner(store)
    runner.lease = 30 * time.Millisecond
    step := &batchStep{version: "20261116_01", batches: 1, run: func(context.Context) error {
        time.Sleep(100 * time.Millisecond)
        return nil
    }}

    if _, err := runner.RunPending(context.Background(), []Step{step}); err != nil {
        t.Fatalf("RunPending: %v", err)
    }
    store.mu.Lock()
    defer store.mu.Unlock()
    if store.renewals == 0 {
        t.Error("lease never renewed during a batch longer than the lease")
    }
}

func TestRunPending_StepRepeatingItsCursorFails(t *testing.T) {
    store := newMemoryStore()
    step := stuckStep{}

    _, err := testRunner(store).RunPending(context.Background(), []Step{step})
    if err == nil {
        t.Fatal("RunPending = nil error; want the repeated cursor rejected")
    }
    if record := store.record("20261116_01"); record.Status != domain.MigrationFailed {
        t.Errorf("record = %+v; want failed", record)
    }
}

type stuckStep struct{}

func (stuckStep) Version() string { return "20261116_01" }

func (stuckStep) Run(context.Context, *string) (*string, error) { return new("same"), nil }

func TestRunPending_InvalidRegistryRunsNothing(t *testing.T) {
    store := newMemoryStore()
    valid := &batchStep{version: "20261116_01", batches: 1}
    invalid := &batchStep{version: "2026-11-16", batches: 1}

    if _, err := testRunner(store).RunPending(context.Background(), []Step{valid, invalid}); err == nil {
        t.Fatal("RunPending = nil error; want the registry rejected")
    }
    if len(valid.runs) != 0 {
        t.Error("a step ran although the registry was invalid")
    }
}
```

* [ ] Verify: `cd backend && go test -race ./internal/migration/ -v`.
  Expected: 13 `RunPending` tests and `TestValidate` `PASS`, no race.

## Task 4: Bare `migrate` command

**Files:** `backend/cmd/migrate_pending.go`, `backend/cmd/migrate_pending_test.go` (create); `backend/cmd/migrate.go` (modify)

The registry lives in the composition root, which owns the stores and
services that steps need. The setup a long one-shot command needs (config,
logger, SIGTERM context, Mongo) is `cliSession`. `migrate sectors` does the same
setup inline on the feature branch and adopts it in PR2. `NoArgs` turns a typo such as `migrate sector` into an
error instead of a full run.

* [ ] Create `backend/cmd/migrate_pending.go`:

```go
package cmd

import (
    "context"
    "os"
    "os/signal"
    "syscall"

    "github.com/spf13/cobra"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/config"
    "portfolio-dashboard/internal/logging"
    "portfolio-dashboard/internal/migration"
    "portfolio-dashboard/internal/persistence"
)

// migrationSteps is the registry `migrate` runs (DD-014 §2), in version
// order. Add a step by appending it with a version dated the day it is
// written ("YYYYMMDD_NN"); never change or remove a shipped version.
func migrationSteps(_ *persistence.Store, _ *zap.Logger) []migration.Step {
    return []migration.Step{}
}

// runMigratePending runs every registered step not yet done, recording each
// step's status in the migrations collection. A failed step exits non-zero;
// the next run retries it from its saved cursor.
func runMigratePending(cmd *cobra.Command, _ []string) error {
    ctx, store, logger, closeSession, err := cliSession(cmd)
    if err != nil {
        return err
    }
    defer closeSession()

    report, err := migration.NewRunner(store.Migrations, logger).RunPending(ctx, migrationSteps(store, logger))
    logger.Info("migrations finished",
        zap.Strings("ran", report.Ran),
        zap.Strings("skipped", report.Skipped),
        zap.String("held", report.Held),
        zap.String("failed", report.Failed),
    )
    return err
}

// cliSession loads config, builds the logger and connects Mongo for a
// long-running one-shot command. ctx is cancelled on Ctrl-C or SIGTERM so the
// command stops before its next write; closeSession disconnects and releases
// the signal handler.
func cliSession(cmd *cobra.Command) (_ context.Context, _ *persistence.Store, _ *zap.Logger, closeSession func(), _ error) {
    cfg := config.Default()
    cfg.ApplyEnv()
    logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
    if err != nil {
        return nil, nil, nil, nil, err
    }
    ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
    connectCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
    defer cancel()
    store, _, disconnect, err := cliConnect(connectCtx, logger, cfg)
    if err != nil {
        stop()
        return nil, nil, nil, nil, err
    }
    return ctx, store, logger, func() { disconnect(); stop() }, nil
}
```

* [ ] Modify `backend/cmd/migrate.go`. Current:

```go
var migrateCmd = &cobra.Command{
    Use:   "migrate",
    Short: "One-shot migrations for schema changes",
}
```

  Replacement:

```go
var migrateCmd = &cobra.Command{
    Use:   "migrate",
    Short: "Run pending data migrations; subcommands are one-shot manual migrations",
    Long: `Without a subcommand, runs every registered migration step not yet done,
in version order, and records each step's status (in_progress, done, failed)
in the migrations collection. A done step never runs again. A failed or
interrupted step resumes from its saved cursor on the next run. A step held by
another live run stops this run without error (DD-014).

The subcommands below are manual, one-shot tools and are not tracked.`,
    Args: cobra.NoArgs,
    RunE: runMigratePending,
}
```

* [ ] Create `backend/cmd/migrate_pending_test.go`:

```go
package cmd

import (
    "testing"

    "go.uber.org/zap"

    "portfolio-dashboard/internal/migration"
    "portfolio-dashboard/internal/persistence"
)

func TestMigrationStepsRegistryIsValid(t *testing.T) {
    t.Parallel()
    if err := migration.Validate(migrationSteps(&persistence.Store{}, zap.NewNop())); err != nil {
        t.Fatalf("registry: %v", err)
    }
}

func TestMigrateRejectsUnknownSubcommand(t *testing.T) {
    t.Parallel()
    // A typo such as `migrate sector` must not silently run every pending
    // step instead of the intended manual subcommand.
    if err := migrateCmd.Args(migrateCmd, []string{"sector"}); err == nil {
        t.Error("migrate accepted an unknown argument; want an error")
    }
}
```

* [ ] Verify: `cd backend && go test -race ./... && golangci-lint run ./...`.
  Expected: every package `ok`, `0 issues`.
* [ ] Verify against a throwaway database: `cd backend && MONGODB_DATABASE=pd_migrate_smoke go run . migrate`.
  Expected: `"msg":"migrations finished"` with `"ran":[]`. Then `go run . migrate sector`.
  Expected: `unknown command "sector"`.
* [ ] Commit: `git add backend/cmd/migrate.go backend/cmd/migrate_pending.go backend/cmd/migrate_pending_test.go backend/internal/persistence/persistence.go backend/internal/persistence/migrations.go backend/internal/persistence/migrations_test.go backend/internal/services/tracing.go backend/internal/telemetry/tracing.go backend/internal/domain/migration.go backend/internal/migration`,
  then `git commit -m "✨ Run tracked migrations with go run . migrate"`.

## Task 5: Docs

**Files:** `docs/prds/PRD-014-tracked-migrations.md`, `docs/designs/DD-014-tracked-migrations.md`, `docs/plans/PD-057-migration-runner.md` (create); `docs/operations.md`, `CLAUDE.md` (modify)

Operators need the runbook. CLAUDE.md's architecture map must name the new
package and collection.

* [ ] Add the "Tracked migrations" section to `docs/operations.md`, the
  `internal/migration` / `migrate_pending.go` entries to CLAUDE.md (text as in
  this PR).
* [ ] Verify: `npx markdownlint-cli docs/prds/PRD-014-tracked-migrations.md docs/designs/DD-014-tracked-migrations.md docs/plans/PD-057-migration-runner.md docs/operations.md`.
  Expected: no output.
* [ ] Commit: `git add docs/prds/PRD-014-tracked-migrations.md docs/designs/DD-014-tracked-migrations.md docs/plans/PD-057-migration-runner.md docs/operations.md CLAUDE.md`,
  then `git commit -m "📝 Specify tracked migrations (PRD-014, DD-014)"`.

## Task 6 (PR2): Sector backfill step

**Files:** `backend/cmd/migration_sector_backfill.go`, `_test.go` (create); `backend/cmd/migrate_pending.go`, `backend/cmd/migrate_sectors.go`, `docs/plans/PD-056-holding-sectors.md` (modify)

Branch from `feat/PD-056-holding-sectors` and cherry-pick PR1's code commit, since the step needs both.

This is the tracked form of `migrate sectors --all-users --apply`. A classified
holding drops out of eligibility, so the data is the resume point and the
cursor only counts batches (DD-014 §6). A rate limit or holding error fails
the step, which the next run retries. The report log moves into a shared
function so the manual command and the step log identically.

* [ ] Create `backend/cmd/migration_sector_backfill.go`:

```go
package cmd

import (
    "context"
    "errors"
    "fmt"
    "strconv"

    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/persistence"
    "portfolio-dashboard/internal/services"
)

// sectorBackfillBatch is how many holdings one batch classifies. Lookups run
// at most one new symbol per second, so a batch takes about a minute and the
// runner saves progress between batches.
const sectorBackfillBatch = 50

// sectorBackfillStep is the tracked form of `migrate sectors --all-users
// --apply` (PD-056): it classifies every user's holdings that have no
// classification for their current symbol. Progress needs no stored
// position: a classified holding is no longer eligible, so each batch picks
// up the next sectorBackfillBatch holdings and a retry resumes by itself.
// The cursor only counts batches. Holdings already needs-review are not
// retried; owners resolve them in the review queue.
type sectorBackfillStep struct {
    store    *persistence.Store
    backfill *services.SectorBackfill
    logger   *zap.Logger
}

func newSectorBackfillStep(store *persistence.Store, logger *zap.Logger) sectorBackfillStep {
    backfill := services.NewSectorBackfill(store.Holdings, services.NewCompanyProfileService(logger), logger)
    return sectorBackfillStep{store: store, backfill: backfill, logger: logger}
}

func (sectorBackfillStep) Version() string { return "20261116_01" }

func (s sectorBackfillStep) Run(ctx context.Context, cursor *string) (*string, error) {
    userIds, err := sectorBackfillUsers(ctx, s.store.Users, primitive.ObjectID{})
    if err != nil {
        return nil, err
    }
    report, err := s.backfill.Run(ctx, services.SectorBackfillOptions{
        UserIds: userIds,
        Apply:   true,
        Limit:   sectorBackfillBatch,
    })
    logSectorBackfillReport(s.logger, true, len(userIds), report)
    if err != nil {
        return nil, err
    }
    return sectorBackfillNext(report, cursor)
}

// sectorBackfillNext decides what follows a batch. A Yahoo rate limit or a
// holding that could not be looked up or written fails the step, so it is
// recorded failed and the next deploy retries it. Otherwise the step
// continues while holdings remain beyond the batch limit, and is done when
// none do.
func sectorBackfillNext(report services.SectorBackfillReport, cursor *string) (*string, error) {
    switch {
    case report.RateLimited:
        return nil, errors.New("yahoo rate-limited the lookups; the next run resumes")
    case report.Errors > 0:
        return nil, fmt.Errorf("%d holdings failed lookup or write; the next run retries them", report.Errors)
    case report.Remaining == 0:
        return nil, nil
    }
    batch := 0
    if cursor != nil {
        batch, _ = strconv.Atoi(*cursor)
    }
    return new(strconv.Itoa(batch + 1)), nil
}
```

* [ ] Modify `backend/cmd/migrate_pending.go`. Current:

```go
func migrationSteps(_ *persistence.Store, _ *zap.Logger) []migration.Step {
    return []migration.Step{}
}
```

  Replacement:

```go
func migrationSteps(store *persistence.Store, logger *zap.Logger) []migration.Step {
    return []migration.Step{
        newSectorBackfillStep(store, logger), // 20261116_01
    }
}
```

* [ ] Modify `backend/cmd/migrate_sectors.go` to reuse `cliSession`. Current
  imports and setup:

```go
import (
    "context"
    "errors"
    "fmt"
    "os"
    "os/signal"
    "syscall"

    "github.com/spf13/cobra"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/config"
    "portfolio-dashboard/internal/logging"
    "portfolio-dashboard/internal/persistence"
    "portfolio-dashboard/internal/services"
)
```

```go
    cfg := config.Default()
    cfg.ApplyEnv()
    logger, err := logging.New(os.Stdout, cfg.LogFormat, cfg.LogLevel)
    if err != nil {
        return err
    }
    // Ctrl-C or SIGTERM stops the run before its next write.
    ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
    defer stop()
    connectCtx, cancel := context.WithTimeout(ctx, cfg.StartupTimeout)
    defer cancel()
    store, _, disconnect, err := cliConnect(connectCtx, logger, cfg)
    if err != nil {
        return err
    }
    defer disconnect()
```

  Replacement:

```go
import (
    "context"
    "errors"
    "fmt"

    "github.com/spf13/cobra"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.uber.org/zap"

    "portfolio-dashboard/internal/persistence"
    "portfolio-dashboard/internal/services"
)
```

```go
    // Ctrl-C or SIGTERM stops the run before its next write.
    ctx, store, logger, closeSession, err := cliSession(cmd)
    if err != nil {
        return err
    }
    defer closeSession()
```

* [ ] In the same file, move the report log into a shared function. Current:

```go
    logger.Info("sector backfill finished",
        zap.Bool("applied", migrateSectorsApply),
        zap.Int("users", len(userIds)),
        zap.Int("eligible", report.Eligible),
        zap.Int("resolved", report.Resolved),
        zap.Int("needs_review", report.NeedsReview),
        zap.Int("skipped", report.Skipped),
        zap.Int("conflicts", report.Conflicts),
        zap.Int("errors", report.Errors),
        zap.Int("remaining", report.Remaining),
        zap.Bool("rate_limited", report.RateLimited),
    )
    switch {
    case runErr != nil:
        return fmt.Errorf("sector backfill stopped early: %w", runErr)
    case report.RateLimited:
        return errors.New("sector backfill stopped: Yahoo rate-limited the lookups; rerun later to resume")
    }
    return nil
}
```

  Replacement:

```go
    logSectorBackfillReport(logger, migrateSectorsApply, len(userIds), report)
    switch {
    case runErr != nil:
        return fmt.Errorf("sector backfill stopped early: %w", runErr)
    case report.RateLimited:
        return errors.New("sector backfill stopped: Yahoo rate-limited the lookups; rerun later to resume")
    }
    return nil
}

// logSectorBackfillReport logs one backfill run's counts; shared by the
// manual `migrate sectors` command and the tracked migration step.
func logSectorBackfillReport(logger *zap.Logger, applied bool, users int, report services.SectorBackfillReport) {
    logger.Info("sector backfill finished",
        zap.Bool("applied", applied),
        zap.Int("users", users),
        zap.Int("eligible", report.Eligible),
        zap.Int("resolved", report.Resolved),
        zap.Int("needs_review", report.NeedsReview),
        zap.Int("skipped", report.Skipped),
        zap.Int("conflicts", report.Conflicts),
        zap.Int("errors", report.Errors),
        zap.Int("remaining", report.Remaining),
        zap.Bool("rate_limited", report.RateLimited),
    )
}
```

* [ ] Create `backend/cmd/migration_sector_backfill_test.go`:

```go
package cmd

import (
    "testing"

    "go.uber.org/zap"

    "portfolio-dashboard/internal/persistence"
    "portfolio-dashboard/internal/services"
)

func TestSectorBackfillIsRegistered(t *testing.T) {
    t.Parallel()
    for _, step := range migrationSteps(&persistence.Store{}, zap.NewNop()) {
        if step.Version() == "20261116_01" {
            return
        }
    }
    t.Fatal("sector backfill step 20261116_01 is not in the migration registry")
}

func TestSectorBackfillNext(t *testing.T) {
    t.Parallel()
    testCases := []struct {
        name       string
        report     services.SectorBackfillReport
        cursor     *string
        wantCursor string // "" means the step is done
        wantErr    bool
    }{
        {name: "nothing left is done", report: services.SectorBackfillReport{Eligible: 3}},
        {name: "remaining holdings start batch 1", report: services.SectorBackfillReport{Eligible: 50, Remaining: 9}, wantCursor: "1"},
        {name: "remaining holdings advance the batch", report: services.SectorBackfillReport{Eligible: 50, Remaining: 9}, cursor: new("1"), wantCursor: "2"},
        {name: "rate limit fails for a retry", report: services.SectorBackfillReport{Eligible: 4, Remaining: 9, RateLimited: true}, wantErr: true},
        {name: "holding errors fail for a retry", report: services.SectorBackfillReport{Eligible: 4, Errors: 1}, wantErr: true},
    }
    for _, testCase := range testCases {
        t.Run(testCase.name, func(t *testing.T) {
            t.Parallel()
            next, err := sectorBackfillNext(testCase.report, testCase.cursor)
            if (err != nil) != testCase.wantErr {
                t.Fatalf("err = %v; wantErr %v", err, testCase.wantErr)
            }
            got := ""
            if next != nil {
                got = *next
            }
            if got != testCase.wantCursor {
                t.Errorf("next cursor = %q; want %q", got, testCase.wantCursor)
            }
        })
    }
}
```

* [ ] Verify: `cd backend && go test -race ./cmd && golangci-lint run ./...`.
  Expected: `ok`, `0 issues`.
* [ ] Verify on a throwaway copy of the local database (never the real one):

  ```bash
  docker exec portfolio_mongo_dev sh -c 'mongodump --quiet --db portfolio --archive | mongorestore --quiet --archive --nsFrom "portfolio.*" --nsTo "pd_migrate_smoke.*" --drop'
  cd backend && MONGODB_DATABASE=pd_migrate_smoke go run . migrate
  MONGODB_DATABASE=pd_migrate_smoke go run . migrate   # second run
  docker exec portfolio_mongo_dev mongosh --quiet --eval 'db.getSiblingDB("pd_migrate_smoke").dropDatabase()'
  ```

  Expected: first run logs one `sector backfill finished` per batch, then
  `"ran":["20261116_01"]`. Second run: `"skipped":["20261116_01"]`.
  Observed 2026-11-16: 60 holdings in 2 batches, 45 resolved, 14
  needs-review, 0 errors. The record was `done` after 1 attempt.
* [ ] Commit: `git add backend/cmd/migrate_sectors.go backend/cmd/migrate_pending.go backend/cmd/migration_sector_backfill.go backend/cmd/migration_sector_backfill_test.go`,
  then `git commit -m "✨ Register sector backfill as tracked migration"`.
* [ ] Add the 2026-11-16 note to PD-056 §8: the backfill is now step
  `20261116_01`, and running it automatically on deploy reverses "do not run
  production migration automatically". Commit: `git add docs/plans/PD-056-holding-sectors.md`,
  then `git commit -m "📝 Note PD-056 backfill moved to migrate step"`.

## Task 8 (PR3): Run migrations on deploy

**Files:** `deploy/cloudrun/repoint-job.sh`, `deploy/cloudrun/run-migrations.sh`, `deploy/cloudrun/test.sh` (create); `.github/workflows/deploy-cloudrun.yml`, `.github/workflows/deploy-dev.yml`, `.github/workflows/lint.yml`, `deploy/cloudrun/deploy.sh`, `docs/operations.md`, `docs/designs/DD-014-tracked-migrations.md`, `docs/prds/PRD-014-tracked-migrations.md` (modify)

The prod job's first runs used a stale dev image: they printed `migrate`'s old
help and exited 0, with nothing migrated. Pinning the job to the image just
deployed, in the same step that runs it, makes that impossible. The pinning
logic already existed inline for `pd-snapshot` (workflow and `deploy.sh`), so
it moves into `repoint-job.sh` and all three callers share it. A failed
execution warns instead of failing (owner decision). A failed repoint fails the
deploy, because the alternative is running stale code.

* [ ] Create `deploy/cloudrun/repoint-job.sh` (`chmod +x`):

```bash
#!/usr/bin/env bash
# Pins a Cloud Run Job to the image a Cloud Run service is running, so the
# job and the web app always run identical code. Exits 3 when the job does
# not exist, so a caller can skip a job that has not been created yet.
#
# Usage: repoint-job.sh <service> <job> <region>
# The project comes from gcloud config or CLOUDSDK_CORE_PROJECT.

set -euo pipefail

SERVICE="$1"
JOB="$2"
REGION="$3"

if ! gcloud run jobs describe "${JOB}" --region "${REGION}" >/dev/null 2>&1; then
  echo ">> Job ${JOB} not found in ${REGION}"
  exit 3
fi
IMAGE=$(gcloud run services describe "${SERVICE}" --region "${REGION}" \
  --format 'value(spec.template.spec.containers[0].image)')
echo ">> Repointing ${JOB} to ${IMAGE}"
gcloud run jobs update "${JOB}" --region "${REGION}" --image "${IMAGE}"
```

* [ ] Create `deploy/cloudrun/run-migrations.sh` (`chmod +x`):

```bash
#!/usr/bin/env bash
# Runs pending data migrations after a deploy (DD-014 §7): pins the migrate
# job to the service's freshly deployed image, executes it and waits.
#
# A failed migration step is recorded `failed` in the migrations collection
# and the next run resumes it, so a failed execution warns instead of failing
# the deploy (owner decision, 2026-11-16). Skips when the job does not exist
# yet; create it as described in docs/operations.md.
#
# Usage: run-migrations.sh <service> <job> <region>
# The project comes from gcloud config or CLOUDSDK_CORE_PROJECT.

set -euo pipefail

SERVICE="$1"
JOB="$2"
REGION="$3"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STATUS=0
"${HERE}/repoint-job.sh" "${SERVICE}" "${JOB}" "${REGION}" || STATUS=$?
if (( STATUS == 3 )); then
  echo ">> Skipping migrations — job ${JOB} does not exist yet (see docs/operations.md)"
  exit 0
fi
(( STATUS == 0 )) || exit "${STATUS}"

if gcloud run jobs execute "${JOB}" --region "${REGION}" --wait; then
  echo ">> Migrations finished"
else
  echo "::warning title=Migrations::Job ${JOB} failed; its step status is in the migrations collection and the next deploy resumes it"
fi
```

* [ ] Create `deploy/cloudrun/test.sh`. A fake `gcloud` on `PATH` records the
  calls; the checks cover: pin before run, skip a missing job, warn on a failed
  run, fail on a failed repoint, and exit 3 for a missing job:

```bash
#!/usr/bin/env bash
# Self-tests for repoint-job.sh and run-migrations.sh against a fake gcloud
# on PATH: no network, no GCP project. Run: bash deploy/cloudrun/test.sh

set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The fake records every call and answers per FAKE_* switches.
cat > "$tmp/gcloud" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$GCLOUD_LOG"
case "$*" in
  "run jobs describe"*)     [[ "${FAKE_JOB_EXISTS:-1}" == 1 ]] ;;
  "run services describe"*) echo "registry/app@sha256:new" ;;
  "run jobs update"*)       [[ "${FAKE_UPDATE_FAILS:-0}" == 0 ]] ;;
  "run jobs execute"*)      [[ "${FAKE_EXECUTE_FAILS:-0}" == 0 ]] ;;
esac
FAKE
chmod +x "$tmp/gcloud"
export PATH="$tmp:$PATH" GCLOUD_LOG="$tmp/calls"

pass=0
fail=0
check() { # check <name> <command…>: passes when the command succeeds
  local name="$1"
  shift
  if "$@"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    echo "FAIL: $name"
    echo "  output: $output"
    echo "  calls:  $(tr '\n' '|' < "$GCLOUD_LOG")"
  fi
}
migrate() { # runs run-migrations.sh, capturing output and exit code
  : > "$GCLOUD_LOG"
  output="$("$here/run-migrations.sh" svc migrate-job europe-west1 2>&1)"
  code=$?
}
called() { grep -q -- "$1" "$GCLOUD_LOG"; }
not_called() { ! called "$1"; }

migrate
check "existing job exits 0" test "$code" -eq 0
check "job is pinned to the service image" called "run jobs update migrate-job --region europe-west1 --image registry/app@sha256:new"
check "job runs and waits" called "run jobs execute migrate-job --region europe-west1 --wait"
check "image is pinned before the run" test "$(grep -n 'jobs update' "$GCLOUD_LOG" | cut -d: -f1)" -lt "$(grep -n 'jobs execute' "$GCLOUD_LOG" | cut -d: -f1)"

FAKE_JOB_EXISTS=0 migrate
check "missing job exits 0" test "$code" -eq 0
check "missing job says it skipped" grep -q "Skipping migrations" <<< "$output"
check "missing job is never updated" not_called "run jobs update"
check "missing job is never executed" not_called "run jobs execute"

FAKE_EXECUTE_FAILS=1 migrate
check "failed migration does not fail the deploy" test "$code" -eq 0
check "failed migration emits a workflow warning" grep -q "::warning title=Migrations::" <<< "$output"

FAKE_UPDATE_FAILS=1 migrate
check "failed repoint fails the deploy" test "$code" -ne 0
check "failed repoint never runs a stale image" not_called "run jobs execute"

: > "$GCLOUD_LOG"
FAKE_JOB_EXISTS=0 "$here/repoint-job.sh" svc snapshot-job europe-west1 >/dev/null 2>&1
code=$?
output=""
check "repoint-job exits 3 for a missing job" test "$code" -eq 3

echo "deploy script tests: $pass passed, $fail failed"
(( fail == 0 ))
```

* [ ] Modify `.github/workflows/deploy-cloudrun.yml`. Current:

```yaml
      - name: Repoint snapshot job to the freshly deployed image
        # pd-snapshot is a separate Cloud Run Job that runs the same binary as
        # the service. Pin it to the same image so the cron and the web app
        # always run identical code.
        run: |
          IMAGE=$(gcloud run services describe "$SERVICE" --region "$REGION" \
            --format 'value(spec.template.spec.containers[0].image)')
          echo "Repointing pd-snapshot to $IMAGE"
          gcloud run jobs update pd-snapshot --region "$REGION" --image "$IMAGE"
```

  Replacement:

```yaml
      - name: Repoint snapshot job to the freshly deployed image
        # pd-snapshot is a separate Cloud Run Job that runs the same binary as
        # the service. Pin it to the same image so the cron and the web app
        # always run identical code.
        run: ./deploy/cloudrun/repoint-job.sh "$SERVICE" pd-snapshot "$REGION"

      - name: Run pending data migrations
        # portfolio-dashboard-migrate runs `migrate` on the new image after
        # rollout (DD-014 §7). A failed step warns without failing the
        # deploy; its status is in the migrations collection and the next
        # deploy resumes it. Skipped while the job does not exist.
        run: ./deploy/cloudrun/run-migrations.sh "$SERVICE" portfolio-dashboard-migrate "$REGION"
```

* [ ] Modify `.github/workflows/deploy-dev.yml`: insert before `Comment dev URL on the PR`:

```yaml
      - name: Run pending data migrations (dev)
        # Same as production (DD-014 §7), against portfolio_dev through its
        # own job. Skipped while portfolio-dashboard-migrate-dev does not
        # exist; a failed step warns and the next deploy resumes it.
        run: ./deploy/cloudrun/run-migrations.sh "$SERVICE" portfolio-dashboard-migrate-dev "$REGION"
```

* [ ] Modify `.github/workflows/lint.yml`: append the job:

```yaml
  deploy-scripts:
    name: Deploy scripts (bash tests)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Fake gcloud on PATH: checks job repointing and the migrations step
      # without touching GCP.
      - run: bash deploy/cloudrun/test.sh
```

* [ ] Modify `deploy/cloudrun/deploy.sh`. Current:

```bash
SNAPSHOT_JOB="${SNAPSHOT_JOB:-pd-snapshot}"
if gcloud run jobs describe "${SNAPSHOT_JOB}" --project "${PROJECT_ID}" \
    --region "${REGION}" >/dev/null 2>&1; then
  IMAGE=$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" \
    --region "${REGION}" --format 'value(spec.template.spec.containers[0].image)')
  echo ">> Repointing ${SNAPSHOT_JOB} to ${IMAGE}"
  gcloud run jobs update "${SNAPSHOT_JOB}" --project "${PROJECT_ID}" \
    --region "${REGION}" --image "${IMAGE}"
else
  echo ">> Skipping ${SNAPSHOT_JOB} update — job not found (run infra/gcp/snapshot-job.sh first)"
fi
```

  Replacement:

```bash
SNAPSHOT_JOB="${SNAPSHOT_JOB:-pd-snapshot}"
export CLOUDSDK_CORE_PROJECT="${PROJECT_ID}"
STATUS=0
./deploy/cloudrun/repoint-job.sh "${SERVICE}" "${SNAPSHOT_JOB}" "${REGION}" || STATUS=$?
if (( STATUS == 3 )); then
  echo ">> Skipping ${SNAPSHOT_JOB} update — job not found (run infra/gcp/snapshot-job.sh first)"
elif (( STATUS != 0 )); then
  exit "${STATUS}"
fi

# Run pending data migrations on the new image (DD-014 §7); skipped while the
# job does not exist, and a failed step warns without failing the deploy.
./deploy/cloudrun/run-migrations.sh "${SERVICE}" "${MIGRATE_JOB:-portfolio-dashboard-migrate}" "${REGION}"
```

* [ ] Document job creation (prod after a backup, dev on `portfolio_dev`) in
  `docs/operations.md` § "On deploy (Cloud Run Jobs)", and update DD-014 §7
  and PRD-014 §6 to the `portfolio-dashboard-migrate` name.
* [ ] Verify: `bash deploy/cloudrun/test.sh`. Expected: `deploy script tests: 13 passed, 0 failed`.
  Then `yamllint -c .yamllint .github/workflows/ && bash -n deploy/cloudrun/deploy.sh`. Expected: no output.
* [ ] Verify after merge: the `Deploy backend to Cloud Run` run shows
  `>> Repointing portfolio-dashboard-migrate to …` and then `>> Migrations
  finished`. The job's log shows `"skipped":["20261116_01"]`.
* [ ] Commit: `git add deploy/cloudrun/repoint-job.sh deploy/cloudrun/run-migrations.sh deploy/cloudrun/test.sh deploy/cloudrun/deploy.sh .github/workflows/deploy-cloudrun.yml .github/workflows/deploy-dev.yml .github/workflows/lint.yml docs/operations.md docs/designs/DD-014-tracked-migrations.md docs/prds/PRD-014-tracked-migrations.md docs/plans/PD-057-migration-runner.md`,
  then `git commit -m "🔧 Run tracked migrations after each deploy"`.

## Task 7: End-to-end verification scenarios

* [ ] **Exactly once**: run `migrate` twice on a throwaway DB. The second run skips every step.
* [ ] **Resume after kill**: Ctrl-C during the sector step's first batch. The
  record is `failed` with `last_error: context canceled` and keeps its
  cursor. Rerun: `attempts: 2`, `"resumed":true` if a cursor was saved, and
  it ends `done`.
* [ ] **Exclusive**: start `migrate` in two terminals on the same DB. One logs
  `migration held by another run` and exits 0. The other finishes.
* [ ] **Real Mongo claim semantics** (verified 2026-11-16 against MongoDB 7):
  first claim inserts; second is held; expired lease is reclaimed with
  cursor kept; failed is reclaimable with `last_error` cleared; done is never
  claimed.

## Done

* `go run . migrate` runs pending steps with explicit per-step status, cursor
  resume and lease exclusivity.
* Sector backfill is step `20261116_01` (PR2). Prod ran it on 2026-11-16:
  59 holdings, 45 resolved, 14 confirmed by the owner.
* Every prod and dev deploy runs pending migrations on the image it just
  deployed (PR3).

**Next:** create `portfolio-dashboard-migrate-dev` (docs/operations.md). Until
then, dev deploys skip the migrations step.
