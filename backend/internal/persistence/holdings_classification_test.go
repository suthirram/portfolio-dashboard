package persistence

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
)

func TestSetClassification_ComparesSymbolAndScopesToOwner(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	classification := domain.Classification{Symbol: "TCS.NS", Status: "resolved", Source: "yahoo", Sector: "Technology", CheckedAt: time.Date(2026, 11, 13, 9, 0, 0, 0, time.UTC)}

	mt.Run("writes only the classification while the symbol matches", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
			{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "symbol", Value: "TCS.NS"},
			{Key: "classification", Value: bson.D{{Key: "symbol", Value: "TCS.NS"}, {Key: "status", Value: "resolved"}, {Key: "sector", Value: "Technology"}}},
		}}))

		got, err := New(mt.DB).Holdings.SetClassification(context.Background(), userId, holdingId, "TCS.NS", classification)
		if err != nil {
			t.Fatalf("SetClassification: %v", err)
		}
		if got.Classification == nil || got.Classification.Sector != "Technology" {
			t.Errorf("post-image classification = %+v", got.Classification)
		}
		command := mt.GetStartedEvent().Command
		if owner, _ := command.Lookup("query", "user_id").ObjectIDOK(); owner != userId {
			t.Errorf("query user_id = %v, want %s", command.Lookup("query", "user_id"), userId.Hex())
		}
		if symbol := command.Lookup("query", "symbol").StringValue(); symbol != "TCS.NS" {
			t.Errorf("query symbol = %q, want TCS.NS", symbol)
		}
		set, _ := command.Lookup("update", "$set").DocumentOK()
		if elements, _ := set.Elements(); len(elements) != 1 || elements[0].Key() != "classification" {
			t.Errorf("$set = %v, want only classification (no position fields)", set)
		}
	})

	mt.Run("symbol changed meanwhile is ErrNotFound", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))

		_, err := New(mt.DB).Holdings.SetClassification(context.Background(), primitive.NewObjectID(), primitive.NewObjectID(), "TCS.NS", classification)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("err = %v, want ErrNotFound", err)
		}
	})
}
