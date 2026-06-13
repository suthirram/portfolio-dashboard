package persistence

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestLegacyHoldingFilterMatchesOnlyMissingUserID(t *testing.T) {
	filter := legacyHoldingFilter()
	userID, ok := filter["user_id"].(bson.M)
	if !ok {
		t.Fatalf("user_id filter = %T, want bson.M", filter["user_id"])
	}
	exists, ok := userID["$exists"].(bool)
	if !ok || exists {
		t.Fatalf("user_id.$exists = %v, want false", userID["$exists"])
	}
}

func TestInvalidOwnerFilterExcludesMissingUserID(t *testing.T) {
	filter := invalidOwnerFilter()
	clauses, ok := filter["$and"].(bson.A)
	if !ok || len(clauses) != 2 {
		t.Fatalf("$and = %#v, want two clauses", filter["$and"])
	}
	existsClause, ok := clauses[0].(bson.M)
	if !ok {
		t.Fatalf("first clause = %T, want bson.M", clauses[0])
	}
	userID, ok := existsClause["user_id"].(bson.M)
	if !ok {
		t.Fatalf("first clause user_id = %T, want bson.M", existsClause["user_id"])
	}
	if exists, ok := userID["$exists"].(bool); !ok || !exists {
		t.Fatalf("user_id.$exists = %v, want true", userID["$exists"])
	}
}

func TestAssignUnownedToUpdatesOnlyMissingUserID(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("filter", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateSuccessResponse(
			bson.E{Key: "n", Value: int32(3)},
			bson.E{Key: "nModified", Value: int32(3)},
		))

		store := New(mt.DB)
		matched, modified, err := store.Holdings.AssignUnownedTo(context.Background(), uid)
		if err != nil {
			t.Fatalf("AssignUnownedTo: %v", err)
		}
		if matched != 3 || modified != 3 {
			t.Fatalf("matched/modified = %d/%d, want 3/3", matched, modified)
		}

		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "update" {
				continue
			}
			updateDoc := e.Command.Lookup("updates").Array().Index(0).Value().Document()
			filter := updateDoc.Lookup("q").Document()
			exists := filter.Lookup("user_id").Document().Lookup("$exists").Boolean()
			if exists {
				t.Fatal("AssignUnownedTo matched existing user_id; want only missing user_id")
			}
			return
		}
		t.Fatal("no update command issued")
	})
}

func TestCountByUserReturnsCount(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("count", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			bson.D{{Key: "n", Value: int64(5)}},
		))

		store := New(mt.DB)
		got, err := store.Holdings.CountByUser(context.Background(), uid)
		if err != nil {
			t.Fatalf("CountByUser: %v", err)
		}
		if got != 5 {
			t.Fatalf("CountByUser = %d, want 5", got)
		}
	})
}

func TestCountDanglingOwnersCountsHoldingsForMissingUsers(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("dangling", func(mt *mtest.T) {
		existing := primitive.NewObjectID()
		missing := primitive.NewObjectID()
		holdingsNS := mt.DB.Name() + ".holdings"
		usersNS := mt.DB.Name() + ".users"
		mt.AddMockResponses(
			mtest.CreateSuccessResponse(bson.E{Key: "values", Value: bson.A{existing, missing}}),
			mtest.CreateCursorResponse(0, usersNS, mtest.FirstBatch, bson.D{{Key: "_id", Value: existing}}),
			mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch, bson.D{{Key: "n", Value: int64(2)}}),
		)

		store := New(mt.DB)
		got, err := store.Holdings.CountDanglingOwners(context.Background(), store.Users)
		if err != nil {
			t.Fatalf("CountDanglingOwners: %v", err)
		}
		if got != 2 {
			t.Fatalf("CountDanglingOwners = %d, want 2", got)
		}

		var sawDistinct bool
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "distinct" {
				continue
			}
			sawDistinct = true
			query := e.Command.Lookup("query").Document()
			if gotType := query.Lookup("user_id").Document().Lookup("$type").StringValue(); gotType != "objectId" {
				t.Fatalf("distinct query user_id.$type = %q, want objectId", gotType)
			}
		}
		if !sawDistinct {
			t.Fatal("no distinct command issued")
		}
	})
}
