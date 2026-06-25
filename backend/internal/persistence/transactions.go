package persistence

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/domain"
)

// TransactionStore owns the transactions collection. Like HoldingStore, every
// method is scoped by owner user_id (DD-001 §6.1) via scopedFilter, so a
// transaction can never be read or written without naming whose it is.
type TransactionStore struct {
	col *mongo.Collection
}

// ListByHolding returns uid's transactions for one holding, ordered by trade
// date then insertion time — the order the ledger replays in.
func (s *TransactionStore) ListByHolding(ctx context.Context, uid, holdingID primitive.ObjectID) ([]domain.Transaction, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}})
	cur, err := s.col.Find(ctx, scopedFilter(uid, bson.M{"holding_id": holdingID}), opts)
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var txns []domain.Transaction
	if err := cur.All(ctx, &txns); err != nil {
		return nil, err
	}
	return txns, nil
}

// ListByUser returns every transaction owned by uid (date-ordered).
func (s *TransactionStore) ListByUser(ctx context.Context, uid primitive.ObjectID) ([]domain.Transaction, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "date", Value: 1}, {Key: "created_at", Value: 1}})
	cur, err := s.col.Find(ctx, scopedFilter(uid, nil), opts)
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var txns []domain.Transaction
	if err := cur.All(ctx, &txns); err != nil {
		return nil, err
	}
	return txns, nil
}

// OpeningsByUser returns uid's opening events keyed by holding id (one per
// holding — the opening is seeded once). Used to enrich the holdings list with
// each holding's opening-date status in a single query.
func (s *TransactionStore) OpeningsByUser(ctx context.Context, uid primitive.ObjectID) (map[primitive.ObjectID]domain.Transaction, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	cur, err := s.col.Find(ctx, scopedFilter(uid, bson.M{"type": string(domain.TxnOpening)}))
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var txns []domain.Transaction
	if err := cur.All(ctx, &txns); err != nil {
		return nil, err
	}
	out := make(map[primitive.ObjectID]domain.Transaction, len(txns))
	for _, t := range txns {
		out[t.HoldingID] = t
	}
	return out, nil
}

// GetScoped returns the transaction owned by uid with the given id, or
// ErrNotFound (also covering a transaction owned by someone else).
func (s *TransactionStore) GetScoped(ctx context.Context, uid, id primitive.ObjectID) (domain.Transaction, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var t domain.Transaction
	err := s.col.FindOne(ctx, scopedFilter(uid, bson.M{"_id": id})).Decode(&t)
	if err != nil {
		return domain.Transaction{}, translateFindErr(err)
	}
	return t, nil
}

// Insert stores a new transaction (its UserID and HoldingID must already be set).
func (s *TransactionStore) Insert(ctx context.Context, t domain.Transaction) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.InsertOne(ctx, t)
	return err
}

// UpdateScopedAndReturn applies set to the transaction owned by uid and returns
// the post-update document. Returns ErrNotFound when nothing matched.
func (s *TransactionStore) UpdateScopedAndReturn(ctx context.Context, uid, id primitive.ObjectID, set bson.D) (domain.Transaction, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var out domain.Transaction
	err := s.col.FindOneAndUpdate(ctx,
		scopedFilter(uid, bson.M{"_id": id}),
		bson.M{"$set": set},
		opts,
	).Decode(&out)
	if err != nil {
		return domain.Transaction{}, translateFindErr(err)
	}
	return out, nil
}

// DeleteScoped removes the transaction owned by uid. Returns false when nothing
// matched.
func (s *TransactionStore) DeleteScoped(ctx context.Context, uid, id primitive.ObjectID) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	res, err := s.col.DeleteOne(ctx, scopedFilter(uid, bson.M{"_id": id}))
	if err != nil {
		return false, err
	}
	return res.DeletedCount > 0, nil
}

// DeleteByHolding removes every transaction for one holding (cascade when the
// holding is deleted).
func (s *TransactionStore) DeleteByHolding(ctx context.Context, uid, holdingID primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, scopedFilter(uid, bson.M{"holding_id": holdingID}))
	return err
}

// DeleteByUser removes every transaction owned by uid (cascade on user delete).
func (s *TransactionStore) DeleteByUser(ctx context.Context, uid primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, bson.M{"user_id": uid})
	return err
}

// HasAny reports whether the holding already has any transaction. Used by the
// holdings→transactions migration as its idempotency guard.
func (s *TransactionStore) HasAny(ctx context.Context, uid, holdingID primitive.ObjectID) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()
	err := s.col.FindOne(ctx, scopedFilter(uid, bson.M{"holding_id": holdingID})).Err()
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return false, nil
		}
		return false, err
	}
	return true, nil
}
