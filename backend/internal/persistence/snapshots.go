package persistence

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/domain"
)

// ErrCronProtected is returned when a caller tries to delete a row that
// still has at least one region whose source is cron. Cron rows are the
// source of truth (PRD-002 §6 / DD-002 §4.5) — they can be overridden but
// not removed.
var ErrCronProtected = errors.New("store: snapshot row contains cron-sourced regions")

// SnapshotStore owns the portfolio_snapshots collection. Every method is
// scoped by user_id, same invariant as HoldingStore: there is no read or
// write that does not name the owner.
type SnapshotStore struct {
	col *mongo.Collection
}

// snapshotFilter pins user_id and the UTC midnight of date.
func snapshotFilter(uid primitive.ObjectID, date time.Time) bson.M {
	return bson.M{"user_id": uid, "date": domain.UTCDate(date)}
}

// Upsert idempotently writes one (user, date) snapshot.
//
// The write is region-aware:
//   - On insert, every region from snap is stored with its given Source.
//   - On a re-run for the same (user, date), existing regions whose stored
//     source is "manual" are preserved untouched (the user has overridden
//     them); every other region is replaced with the incoming value.
//
// This is the property the v2 NATS redelivery story relies on (DD-002 §7):
// any number of cron re-runs over the same fixture converge to the same
// document, and no cron run ever clobbers a manual override.
func (s *SnapshotStore) Upsert(ctx context.Context, snap domain.PortfolioSnapshot) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if snap.UserID.IsZero() {
		return errors.New("snapshot upsert: user_id required")
	}
	if len(snap.Buckets) == 0 {
		return errors.New("snapshot upsert: at least one bucket required")
	}
	for _, r := range snap.Buckets {
		if !r.Source.IsValid() {
			return errors.New("snapshot upsert: invalid bucket source")
		}
	}
	date := domain.UTCDate(snap.Date)
	now := time.Now().UTC()

	// Load the existing row (if any) so we can preserve manual regions.
	var existing domain.PortfolioSnapshot
	err := s.col.FindOne(ctx, snapshotFilter(snap.UserID, date)).Decode(&existing)
	switch {
	case err == nil:
		// Existing row: merge.
		merged := make(map[string]domain.RegionSnapshot, len(snap.Buckets))
		for k, v := range existing.Buckets {
			if v.Source == domain.SnapshotSourceManual {
				merged[k] = v
			}
		}
		for k, v := range snap.Buckets {
			if _, kept := merged[k]; kept {
				continue
			}
			merged[k] = v
		}

		// Refresh the per-stock lines on every cron re-run: they are the
		// cron truth behind the buckets and feed backdated recompute. A
		// manual bucket total is preserved in `merged`, but its underlying
		// lines still track the live ledger × close — storing them does not
		// disturb the frozen manual total, which lives in `regions`.
		update := bson.M{
			"$set": bson.M{
				"regions":    merged,
				"holdings":   snap.Lines,
				"currency":   snap.Currency,
				"updated_at": now,
			},
		}
		_, err := s.col.UpdateOne(ctx, snapshotFilter(snap.UserID, date), update)
		return err
	case errors.Is(err, mongo.ErrNoDocuments):
		// Insert.
		doc := domain.PortfolioSnapshot{
			UserID:    snap.UserID,
			Date:      date,
			Currency:  snap.Currency,
			Buckets:   snap.Buckets,
			Lines:     snap.Lines,
			CreatedAt: now,
			UpdatedAt: now,
		}
		_, err := s.col.InsertOne(ctx, doc)
		return err
	default:
		return err
	}
}

// List returns snap rows in [from, to] inclusive, newest first.
func (s *SnapshotStore) List(ctx context.Context, uid primitive.ObjectID, from, to time.Time) ([]domain.PortfolioSnapshot, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	filter := bson.M{
		"user_id": uid,
		"date": bson.M{
			"$gte": domain.UTCDate(from),
			"$lte": domain.UTCDate(to),
		},
	}
	opts := options.Find().SetSort(bson.D{{Key: "date", Value: -1}})
	cur, err := s.col.Find(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var out []domain.PortfolioSnapshot
	if err := cur.All(ctx, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// LatestBefore returns uid's most recent snapshot with date strictly
// before the given date — the "previous close" reference for the daily
// change indicator. ErrNotFound when the user has no earlier snapshot.
func (s *SnapshotStore) LatestBefore(ctx context.Context, uid primitive.ObjectID, date time.Time) (domain.PortfolioSnapshot, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	filter := bson.M{"user_id": uid, "date": bson.M{"$lt": domain.UTCDate(date)}}
	opts := options.FindOne().SetSort(bson.D{{Key: "date", Value: -1}})

	var out domain.PortfolioSnapshot
	if err := s.col.FindOne(ctx, filter, opts).Decode(&out); err != nil {
		return domain.PortfolioSnapshot{}, translateFindErr(err)
	}
	return out, nil
}

// Get returns the single (user, date) row or ErrNotFound.
func (s *SnapshotStore) Get(ctx context.Context, uid primitive.ObjectID, date time.Time) (domain.PortfolioSnapshot, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var out domain.PortfolioSnapshot
	err := s.col.FindOne(ctx, snapshotFilter(uid, date)).Decode(&out)
	if err != nil {
		return domain.PortfolioSnapshot{}, translateFindErr(err)
	}
	return out, nil
}

// PatchRegion replaces one region on an existing row. The new region is
// always written with source=manual — patching is the API-layer name for
// "the user accepted an override" (DD-002 §4.4). ErrNotFound when no row
// for (user, date) exists.
func (s *SnapshotStore) PatchRegion(ctx context.Context, uid primitive.ObjectID, date time.Time, region string, rs domain.RegionSnapshot) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	rs.Source = domain.SnapshotSourceManual
	now := time.Now().UTC()
	update := bson.M{
		"$set": bson.M{
			"regions." + region: rs,
			"updated_at":        now,
		},
	}
	res, err := s.col.UpdateOne(ctx, snapshotFilter(uid, date), update)
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// PatchRegions replaces multiple regions atomically in one UpdateOne so
// a partial failure cannot leave half the body persisted. Every region in
// rs is written with source=manual; the caller is responsible for
// populating OriginalCron* (HistoryService.PatchRegions does that). The
// whole RegionSnapshot value is sent to Mongo, so any fields the caller
// did not set serialise to their zero / omitempty. Returns ErrNotFound
// when no row for (user, date) exists.
func (s *SnapshotStore) PatchRegions(ctx context.Context, uid primitive.ObjectID, date time.Time, rs map[string]domain.RegionSnapshot) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if len(rs) == 0 {
		return errors.New("snapshot patch: at least one region required")
	}

	set := bson.M{"updated_at": time.Now().UTC()}
	for k, r := range rs {
		r.Source = domain.SnapshotSourceManual
		set["regions."+k] = r
	}
	res, err := s.col.UpdateOne(ctx, snapshotFilter(uid, date), bson.M{"$set": set})
	if err != nil {
		return err
	}
	if res.MatchedCount == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes a (user, date) row only when every region's source is
// manual. Cron-touched rows return ErrCronProtected: the source of truth
// cannot be deleted via API (PRD-002 §6 / DD-002 §4.5). Use ForceDelete
// to bypass the cron-protection guard (super-admin override).
func (s *SnapshotStore) Delete(ctx context.Context, uid primitive.ObjectID, date time.Time) error {
	return s.deleteInternal(ctx, uid, date, false)
}

// ForceDelete removes a (user, date) row regardless of region source.
// Reserved for super-admin callers — bypasses the cron-protection guard
// that Delete enforces.
func (s *SnapshotStore) ForceDelete(ctx context.Context, uid primitive.ObjectID, date time.Time) error {
	return s.deleteInternal(ctx, uid, date, true)
}

func (s *SnapshotStore) deleteInternal(ctx context.Context, uid primitive.ObjectID, date time.Time, force bool) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	var existing domain.PortfolioSnapshot
	err := s.col.FindOne(ctx, snapshotFilter(uid, date)).Decode(&existing)
	if err != nil {
		return translateFindErr(err)
	}
	if !force {
		for _, r := range existing.Buckets {
			if r.Source == domain.SnapshotSourceCron {
				return ErrCronProtected
			}
		}
	}
	_, err = s.col.DeleteOne(ctx, snapshotFilter(uid, date))
	return err
}

// DeleteByUser removes every snapshot owned by uid (used when a user is
// permanently deleted).
func (s *SnapshotStore) DeleteByUser(ctx context.Context, uid primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, bson.M{"user_id": uid})
	return err
}
