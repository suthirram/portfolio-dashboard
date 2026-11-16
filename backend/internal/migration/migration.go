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
