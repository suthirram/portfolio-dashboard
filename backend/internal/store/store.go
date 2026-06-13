// Package store is the persistence layer. It owns every MongoDB read and
// write, split one type per collection (HoldingStore, UserStore,
// SessionStore). Callers (handlers, middleware, CLI) work with domain types
// and never touch *mongo.Collection or bson directly, so query construction
// lives in exactly one place per collection and is easy to audit.
package store

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
)

// ErrNotFound is returned by single-document reads when no document matches.
// It decouples callers from the mongo driver's sentinel.
var ErrNotFound = errors.New("store: document not found")

// ErrDuplicate is returned by inserts that violate a unique index (e.g. a
// taken username).
var ErrDuplicate = errors.New("store: duplicate key")

// Default per-operation timeouts. Reads are generous because a few endpoints
// scan a whole portfolio; writes are short.
const (
	readTimeout  = 15 * time.Second
	writeTimeout = 5 * time.Second
)

// Store bundles the per-collection stores behind one handle.
type Store struct {
	Holdings *HoldingStore
	Users    *UserStore
	Sessions *SessionStore
}

// New wires the collection stores onto db.
func New(db *mongo.Database) *Store {
	return &Store{
		Holdings: &HoldingStore{col: db.Collection("holdings")},
		Users:    &UserStore{col: db.Collection("users")},
		Sessions: &SessionStore{col: db.Collection("sessions")},
	}
}

// withTimeout derives a bounded context for a single operation.
func withTimeout(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, d)
}

// translateFindErr maps the driver's no-documents sentinel to ErrNotFound and
// passes everything else through unchanged.
func translateFindErr(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	return err
}
