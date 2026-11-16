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
