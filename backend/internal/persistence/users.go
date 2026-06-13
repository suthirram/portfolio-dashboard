package persistence

import (
	"context"
	"errors"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"portfolio-dashboard/internal/auth"
	"portfolio-dashboard/internal/domain"
)

// UserStore owns the users collection.
type UserStore struct {
	col *mongo.Collection
}

// FindByUsername looks up a user by the case-insensitive username. It returns
// (nil, nil) when no such user exists, so callers can branch on presence
// without importing the not-found sentinel.
func (s *UserStore) FindByUsername(ctx context.Context, username string) (*domain.User, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var u domain.User
	err := s.col.FindOne(ctx, bson.M{"username": auth.NormalizeUsername(username)}).Decode(&u)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// FindByID looks up a user by id, returning ErrNotFound when absent.
func (s *UserStore) FindByID(ctx context.Context, id primitive.ObjectID) (*domain.User, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var u domain.User
	if err := s.col.FindOne(ctx, bson.M{"_id": id}).Decode(&u); err != nil {
		return nil, translateFindErr(err)
	}
	return &u, nil
}

// Insert stores a new user, mapping a unique-index violation to ErrDuplicate.
func (s *UserStore) Insert(ctx context.Context, u domain.User) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if _, err := s.col.InsertOne(ctx, u); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrDuplicate
		}
		return err
	}
	return nil
}

// Update applies a $set patch to one user. A unique-index violation (e.g. a
// taken username on a profile change) maps to ErrDuplicate.
func (s *UserStore) Update(ctx context.Context, id primitive.ObjectID, set bson.M) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	if _, err := s.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": set}); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return ErrDuplicate
		}
		return err
	}
	return nil
}

// IncLoginFailures bumps the login-failure counter after a wrong password.
func (s *UserStore) IncLoginFailures(ctx context.Context, id primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"login_failures": 1}})
	return err
}

// RegisterRecoveryFailure increments the security-question failure counter and,
// when lock is true, sets locked so recovery is blocked (DD-001 §4.3).
func (s *UserStore) RegisterRecoveryFailure(ctx context.Context, id primitive.ObjectID, lock bool) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	update := bson.M{"$inc": bson.M{"security_question_failures": 1}}
	if lock {
		update["$set"] = bson.M{"locked": true}
	}
	_, err := s.col.UpdateOne(ctx, bson.M{"_id": id}, update)
	return err
}

// List returns the users matching filter, sorted by sort.
func (s *UserStore) List(ctx context.Context, filter bson.M, sort bson.D) ([]domain.User, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	cur, err := s.col.Find(ctx, filter, options.Find().SetSort(sort))
	if err != nil {
		return nil, err
	}
	defer func() { _ = cur.Close(ctx) }()

	var users []domain.User
	if err := cur.All(ctx, &users); err != nil {
		return nil, err
	}
	return users, nil
}

// Delete permanently removes a user.
func (s *UserStore) Delete(ctx context.Context, id primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteOne(ctx, bson.M{"_id": id})
	return err
}
