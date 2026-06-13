package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SessionTTL is how long a session lives without activity. Expiry slides
// forward on use (see httpserver session middleware).
const SessionTTL = 30 * 24 * time.Hour

// Session is a server-side login session; the cookie carries only the
// opaque ID (DD-001 §2.2).
type Session struct {
	ID        string             `bson:"_id"`
	UserID    primitive.ObjectID `bson:"user_id"`
	CreatedAt time.Time          `bson:"created_at"`
	ExpiresAt time.Time          `bson:"expires_at"`
	UserAgent string             `bson:"user_agent,omitempty"`
}
