package persistence

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"portfolio-dashboard/internal/domain"
)

// SessionStore owns the sessions collection.
type SessionStore struct {
	col *mongo.Collection
}

// Insert stores a new session.
func (s *SessionStore) Insert(ctx context.Context, sess domain.Session) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.InsertOne(ctx, sess)
	return err
}

// Get returns the session with id, or ErrNotFound.
func (s *SessionStore) Get(ctx context.Context, id string) (domain.Session, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var sess domain.Session
	if err := s.col.FindOne(ctx, bson.M{"_id": id}).Decode(&sess); err != nil {
		return domain.Session{}, translateFindErr(err)
	}
	return sess, nil
}

// Delete removes one session by id (logout).
func (s *SessionStore) Delete(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteOne(ctx, bson.M{"_id": id})
	return err
}

// DeleteByUser removes every session of a user (password recovery, hide,
// delete).
func (s *SessionStore) DeleteByUser(ctx context.Context, uid primitive.ObjectID) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.DeleteMany(ctx, bson.M{"user_id": uid})
	return err
}

// DeleteOthers removes every session of a user except keepID (sign out other
// devices on password change).
func (s *SessionStore) DeleteOthers(ctx context.Context, uid primitive.ObjectID, keepID string) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	filter := bson.M{"user_id": uid}
	if keepID != "" {
		filter["_id"] = bson.M{"$ne": keepID}
	}
	_, err := s.col.DeleteMany(ctx, filter)
	return err
}

// SetExpiry slides a session's expiry forward.
func (s *SessionStore) SetExpiry(ctx context.Context, id string, expires time.Time) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	_, err := s.col.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"expires_at": expires}})
	return err
}
