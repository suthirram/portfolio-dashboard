// Package db owns the MongoDB connection and index management.
package db

import (
	"context"
	"log/slog"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Connect dials MongoDB and verifies the connection with a Ping.
func Connect(ctx context.Context, uri string, logger *slog.Logger) (*mongo.Client, error) {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	logger.Info("mongodb connected")
	return client, nil
}

// EnsureIndexes creates the indexes for all collections (DD-001 §2).
func EnsureIndexes(ctx context.Context, database *mongo.Database, logger *slog.Logger) error {
	for col, models := range map[string][]mongo.IndexModel{
		"holdings": {
			{Keys: bson.D{{Key: "symbol", Value: 1}}},
			{Keys: bson.D{{Key: "exchange", Value: 1}}},
			// per-user listing sorted by script; replaces the old {script:1}
			// sort index (redundant once everything is user-scoped, DD-001 §2.3)
			{Keys: bson.D{{Key: "user_id", Value: 1}, {Key: "script", Value: 1}}},
		},
		"users": {
			{Keys: bson.D{{Key: "username", Value: 1}}, Options: options.Index().SetUnique(true)},
			// bootstrap check + super-admin "list admins" view
			{Keys: bson.D{{Key: "role", Value: 1}}},
			// region-scoped user listing for admins
			{Keys: bson.D{{Key: "region", Value: 1}, {Key: "role", Value: 1}}},
		},
		"sessions": {
			// bulk-invalidate on password change
			{Keys: bson.D{{Key: "user_id", Value: 1}}},
			// TTL auto-expiry; expires_at is an absolute deadline
			{Keys: bson.D{{Key: "expires_at", Value: 1}},
				Options: options.Index().SetExpireAfterSeconds(0)},
		},
	} {
		names, err := database.Collection(col).Indexes().CreateMany(ctx, models)
		if err != nil {
			return err
		}
		logger.Info("mongodb indexes ensured",
			slog.String("collection", col),
			slog.Any("indexes", names),
		)
	}
	return nil
}
