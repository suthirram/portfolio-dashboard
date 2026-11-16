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
