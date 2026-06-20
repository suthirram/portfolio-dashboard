// Package persistence is the data-access layer: every MongoDB read and write
// lives here, one store type per collection (HoldingStore, UserStore,
// SessionStore). Callers (handlers, middleware, CLI) receive domain types and
// run no queries of their own. The one Mongo detail that crosses the boundary
// is the bson field patch passed to the update and list methods — a deliberate
// trade-off for partial updates that keeps the API small. Query construction
// otherwise lives in exactly one place per collection and is easy to audit.
package persistence

import (
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
// scan a whole portfolio; writes are short. Each store method derives a
// child context bounded by one of these via context.WithTimeout.
const (
	readTimeout  = 15 * time.Second
	writeTimeout = 5 * time.Second
)

// Store bundles the per-collection stores behind one handle.
type Store struct {
	Holdings     *HoldingStore
	Transactions *TransactionStore
	Users        *UserStore
	Sessions     *SessionStore
	Snapshots    *SnapshotStore
}

// New wires the collection stores onto db.
func New(db *mongo.Database) *Store {
	return &Store{
		Holdings:     &HoldingStore{col: db.Collection("holdings")},
		Transactions: &TransactionStore{col: db.Collection("transactions")},
		Users:        &UserStore{col: db.Collection("users")},
		Sessions:     &SessionStore{col: db.Collection("sessions")},
		Snapshots:    &SnapshotStore{col: db.Collection("portfolio_snapshots")},
	}
}

// translateFindErr maps the driver's no-documents sentinel to ErrNotFound and
// passes everything else through unchanged.
func translateFindErr(err error) error {
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	return err
}
