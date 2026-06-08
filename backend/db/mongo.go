package db

import (
	"context"
	"log"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func Connect(ctx context.Context, uri string) (*mongo.Client, error) {
	opts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, opts)
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}
	log.Println("Connected to MongoDB")
	return client, nil
}

// EnsureIndexes creates indexes on the holdings collection
func EnsureIndexes(ctx context.Context, db *mongo.Database) error {
	col := db.Collection("holdings")
	_, err := col.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "script", Value: 1}}},
		{Keys: bson.D{{Key: "symbol", Value: 1}}},
		{Keys: bson.D{{Key: "exchange", Value: 1}}},
	})
	return err
}
