package persistence

import (
	"context"
	"maps"

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
	maps.Copy(f, extra)
	return f
}

func legacyHoldingFilter() bson.M {
	return bson.M{"user_id": bson.M{"$exists": false}}
}

func invalidOwnerFilter() bson.M {
	return bson.M{"$and": bson.A{
		bson.M{"user_id": bson.M{"$exists": true}},
		bson.M{"user_id": bson.M{"$not": bson.M{"$type": "objectId"}}},
	}}
}

func objectIDOwnerFilter() bson.M {
	return bson.M{"user_id": bson.M{"$type": "objectId"}}
}

// ListByUser returns uid's holdings sorted by script name.
func (s *HoldingStore) ListByUser(ctx context.Context, uid primitive.ObjectID) ([]domain.Holding, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
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
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
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
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.InsertOne(ctx, h)
	return err
}

// UpdateScopedAndReturn applies set to the holding owned by uid and returns
// the post-update document in one round-trip (FindOneAndUpdate with
// ReturnDocument=After). Returns ErrNotFound when no holding matched the
// owner-scoped filter — either the id is wrong or the caller does not own
// it; both cases collapse to 404 at the handler.
func (s *HoldingStore) UpdateScopedAndReturn(ctx context.Context, uid, id primitive.ObjectID, set bson.D) (domain.Holding, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var out domain.Holding
	err := s.col.FindOneAndUpdate(ctx,
		scopedFilter(uid, bson.M{"_id": id}),
		bson.M{"$set": set},
		opts,
	).Decode(&out)
	if err != nil {
		return domain.Holding{}, translateFindErr(err)
	}
	return out, nil
}

// DeleteScoped removes the holding owned by uid. It returns false when nothing
// matched.
func (s *HoldingStore) DeleteScoped(ctx context.Context, uid, id primitive.ObjectID) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
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
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, bson.M{"user_id": uid})
	return err
}

// CountLegacy returns the number of pre-multi-user holdings that have no
// owner field. This intentionally treats only a missing field as legacy; null
// or malformed owner fields are invalid data and handled separately.
func (s *HoldingStore) CountLegacy(ctx context.Context) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	return s.col.CountDocuments(ctx, legacyHoldingFilter())
}

// CountInvalidOwners returns the number of holdings whose owner field exists
// but is not an ObjectID. Missing owners are the legacy migration target and
// are intentionally excluded.
func (s *HoldingStore) CountInvalidOwners(ctx context.Context) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	return s.col.CountDocuments(ctx, invalidOwnerFilter())
}

// CountByUser returns the number of holdings owned by uid.
func (s *HoldingStore) CountByUser(ctx context.Context, uid primitive.ObjectID) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	return s.col.CountDocuments(ctx, bson.M{"user_id": uid})
}

// CountDanglingOwners returns the number of holdings with an ObjectID owner
// that does not resolve to any user. It is used by the local legacy migration
// to stop before stamping legacy rows when the local data already contains
// broken ownership references.
func (s *HoldingStore) CountDanglingOwners(ctx context.Context, users *UserStore) (int64, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	values, err := s.col.Distinct(ctx, "user_id", objectIDOwnerFilter())
	if err != nil {
		return 0, err
	}
	if len(values) == 0 {
		return 0, nil
	}

	ids := make([]primitive.ObjectID, 0, len(values))
	for _, v := range values {
		id, ok := v.(primitive.ObjectID)
		if !ok {
			continue
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return 0, nil
	}

	existing, err := users.ExistingIDs(ctx, ids)
	if err != nil {
		return 0, err
	}

	missing := make([]primitive.ObjectID, 0)
	for _, id := range ids {
		if _, ok := existing[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) == 0 {
		return 0, nil
	}

	return s.col.CountDocuments(ctx, bson.M{"user_id": bson.M{"$in": missing}})
}

// AssignUnownedTo stamps every legacy holding that has no owner with uid. It
// returns the matched and modified counts. Used once by the migration that
// backfills pre-auth data (DD-001 §10); this is the only unscoped write the
// holdings store allows.
func (s *HoldingStore) AssignUnownedTo(ctx context.Context, uid primitive.ObjectID) (matched, modified int64, err error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	res, err := s.col.UpdateMany(ctx,
		legacyHoldingFilter(),
		bson.M{"$set": bson.M{"user_id": uid}},
	)
	if err != nil {
		return 0, 0, err
	}
	return res.MatchedCount, res.ModifiedCount, nil
}
