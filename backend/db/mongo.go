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

// EnsureIndexes creates the indexes used by the holdings collection.
func EnsureIndexes(ctx context.Context, database *mongo.Database, logger *slog.Logger) error {
	col := database.Collection("holdings")
	names, err := col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "script", Value: 1}}},
		{Keys: bson.D{{Key: "symbol", Value: 1}}},
		{Keys: bson.D{{Key: "exchange", Value: 1}}},
	})
	if err != nil {
		return err
	}
	logger.Info("mongodb indexes ensured",
		slog.String("collection", "holdings"),
		slog.Any("indexes", names),
	)
	return nil
}
