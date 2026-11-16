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
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	classification := domain.Classification{Symbol: "TCS.NS", Status: "resolved", Source: "yahoo", Sector: "Technology", CheckedAt: time.Date(2026, 11, 13, 9, 0, 0, 0, time.UTC)}

	mt.Run("writes only the classification while the symbol matches", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
			{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "symbol", Value: "TCS.NS"},
			{Key: "classification", Value: bson.D{{Key: "symbol", Value: "TCS.NS"}, {Key: "status", Value: "resolved"}, {Key: "sector", Value: "Technology"}}},
		}}))

		got, err := New(mt.DB).Holdings.SetClassification(context.Background(), userId, holdingId, "TCS.NS", "stock", nil, classification)
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
		// A lookup made for a stock must not land on a holding since changed to a fund.
		if holdingType, ok := command.Lookup("query", "type").StringValueOK(); !ok || holdingType != "stock" {
			t.Errorf("query type = %q, want stock", holdingType)
		}
		// No classification when the lookup started: only an unclassified holding matches.
		if exists, ok := command.Lookup("query", "classification.checked_at", "$exists").BooleanOK(); !ok || exists {
			t.Errorf("query classification.checked_at = %v, want {$exists: false}", command.Lookup("query", "classification.checked_at"))
		}
		set, _ := command.Lookup("update", "$set").DocumentOK()
		if elements, _ := set.Elements(); len(elements) != 1 || elements[0].Key() != "classification" {
			t.Errorf("$set = %v, want only classification (no position fields)", set)
		}
	})

	mt.Run("an earlier classification must be unchanged", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: primitive.NewObjectID()}}}))
		expected := domain.Classification{Symbol: "TCS.NS", Status: "needs_review", CheckedAt: time.Date(2026, 11, 1, 8, 0, 0, 0, time.UTC)}

		if _, err := New(mt.DB).Holdings.SetClassification(context.Background(), primitive.NewObjectID(), primitive.NewObjectID(), "TCS.NS", "stock", &expected, classification); err != nil {
			t.Fatalf("SetClassification: %v", err)
		}
		// An owner's confirmation in between changes checked_at, so this lookup would not land.
		checkedAt, ok := mt.GetStartedEvent().Command.Lookup("query", "classification.checked_at").TimeOK()
		if !ok || !checkedAt.Equal(expected.CheckedAt) {
			t.Errorf("query classification.checked_at = %v, want %v", checkedAt, expected.CheckedAt)
		}
	})

	mt.Run("symbol or type changed meanwhile is ErrNotFound", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))

		_, err := New(mt.DB).Holdings.SetClassification(context.Background(), primitive.NewObjectID(), primitive.NewObjectID(), "TCS.NS", "stock", nil, classification)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("err = %v, want ErrNotFound", err)
		}
	})
}

func TestConfirmClassification_SetsTypeAndClassificationWhileSymbolMatches(t *testing.T) {
	t.Parallel()
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	confirmed := domain.Classification{Symbol: "ITC.NS", Status: "resolved", Source: "user", Sector: "FMCG", ProviderSector: "Consumer Defensive", CheckedAt: time.Date(2026, 11, 13, 9, 0, 0, 0, time.UTC)}

	mt.Run("owner-scoped, symbol-guarded, type and classification only", func(mt *mtest.T) {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
			{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "symbol", Value: "ITC.NS"}, {Key: "type", Value: "stock"},
			{Key: "classification", Value: bson.D{{Key: "symbol", Value: "ITC.NS"}, {Key: "status", Value: "resolved"}, {Key: "source", Value: "user"}, {Key: "sector", Value: "FMCG"}}},
		}}))

		got, err := New(mt.DB).Holdings.ConfirmClassification(context.Background(), userId, holdingId, "ITC.NS", "stock", confirmed)
		if err != nil {
			t.Fatalf("ConfirmClassification: %v", err)
		}
		if got.Classification == nil || got.Classification.Sector != "FMCG" {
			t.Errorf("post-image classification = %+v", got.Classification)
		}
		command := mt.GetStartedEvent().Command
		if owner, _ := command.Lookup("query", "user_id").ObjectIDOK(); owner != userId {
			t.Errorf("query user_id = %v, want %s", command.Lookup("query", "user_id"), userId.Hex())
		}
		if symbol := command.Lookup("query", "symbol").StringValue(); symbol != "ITC.NS" {
			t.Errorf("query symbol = %q, want ITC.NS", symbol)
		}
		set := command.Lookup("update", "$set").Document()
		elements, _ := set.Elements()
		if len(elements) != 2 || set.Lookup("type").StringValue() != "stock" || set.Lookup("classification", "source").StringValue() != "user" {
			t.Errorf("$set = %v, want only type and the user classification", set)
		}
	})

	mt.Run("symbol changed meanwhile is ErrNotFound", func(mt *mtest.T) {
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))

		_, err := New(mt.DB).Holdings.ConfirmClassification(context.Background(), primitive.NewObjectID(), primitive.NewObjectID(), "ITC.NS", "stock", confirmed)
		if !errors.Is(err, ErrNotFound) {
			t.Errorf("err = %v, want ErrNotFound", err)
		}
	})
}
