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
