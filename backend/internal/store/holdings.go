package store

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/domain"
)

// HoldingStore owns the holdings collection. Every method is scoped by owner
// user_id (DD-001 §6.1): there is no way to read or write a holding without
// naming whose it is, so cross-user access is impossible by construction.
type HoldingStore struct {
	col *mongo.Collection
}

// scopedFilter composes a holdings filter that always pins user_id, merging
// any extra predicates (e.g. an _id).
func scopedFilter(uid primitive.ObjectID, extra bson.M) bson.M {
	f := bson.M{"user_id": uid}
	for k, v := range extra {
		f[k] = v
	}
	return f
}

// ListByUser returns uid's holdings sorted by script name.
func (s *HoldingStore) ListByUser(ctx context.Context, uid primitive.ObjectID) ([]domain.Holding, error) {
	ctx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "script", Value: 1}})
	cur, err := s.col.Find(ctx, scopedFilter(uid, nil), opts)
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var holdings []domain.Holding
	if err := cur.All(ctx, &holdings); err != nil {
		return nil, err
	}
	return holdings, nil
}

// GetScoped returns the holding owned by uid with the given id, or ErrNotFound
// (which also covers a holding owned by someone else — no enumeration).
func (s *HoldingStore) GetScoped(ctx context.Context, uid, id primitive.ObjectID) (domain.Holding, error) {
	ctx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	var holding domain.Holding
	err := s.col.FindOne(ctx, scopedFilter(uid, bson.M{"_id": id})).Decode(&holding)
	if err != nil {
		return domain.Holding{}, translateFindErr(err)
	}
	return holding, nil
}

// Insert stores a new holding (its UserID must already be set).
func (s *HoldingStore) Insert(ctx context.Context, h domain.Holding) error {
	ctx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.InsertOne(ctx, h)
	return err
}

// UpdateScoped applies set to the holding owned by uid. It returns false when
// no holding matched (missing, or owned by someone else).
func (s *HoldingStore) UpdateScoped(ctx context.Context, uid, id primitive.ObjectID, set bson.D) (bool, error) {
	ctx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()
	res, err := s.col.UpdateOne(ctx, scopedFilter(uid, bson.M{"_id": id}), bson.M{"$set": set})
	if err != nil {
		return false, err
	}
	return res.MatchedCount > 0, nil
}

// DeleteScoped removes the holding owned by uid. It returns false when nothing
// matched.
func (s *HoldingStore) DeleteScoped(ctx context.Context, uid, id primitive.ObjectID) (bool, error) {
	ctx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()
	res, err := s.col.DeleteOne(ctx, scopedFilter(uid, bson.M{"_id": id}))
	if err != nil {
		return false, err
	}
	return res.DeletedCount > 0, nil
}

// DeleteByUser removes every holding owned by uid (used when a user is
// permanently deleted).
func (s *HoldingStore) DeleteByUser(ctx context.Context, uid primitive.ObjectID) error {
	ctx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, bson.M{"user_id": uid})
	return err
}

// AssignUnownedTo stamps every legacy holding that has no owner with uid. It
// returns the matched and modified counts. Used once by the migration that
// backfills pre-auth data (DD-001 §10); this is the only unscoped write the
// holdings store allows.
func (s *HoldingStore) AssignUnownedTo(ctx context.Context, uid primitive.ObjectID) (matched, modified int64, err error) {
	ctx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()
	res, err := s.col.UpdateMany(ctx,
		bson.M{"user_id": bson.M{"$exists": false}},
		bson.M{"$set": bson.M{"user_id": uid}},
	)
	if err != nil {
		return 0, 0, err
	}
	return res.MatchedCount, res.ModifiedCount, nil
}
