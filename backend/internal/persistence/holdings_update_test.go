package persistence

import (
	"context"
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/event"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"
)

func TestUpdateScopedAndReturn_IssuesFindAndModifyWithUserScopeAndReturnsPostImage(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("post-image returned in one round-trip", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		id := primitive.NewObjectID()

		// findAndModify reply shape: {ok:1, value: <post-image>}
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{
			Key: "value",
			Value: bson.D{
				{Key: "_id", Value: id},
				{Key: "user_id", Value: uid},
				{Key: "script", Value: "TCS-UPDATED"},
				{Key: "exchange", Value: "NSE"},
				{Key: "type", Value: "stock"},
				{Key: "stocks_owned", Value: 7.0},
				{Key: "avg_cost_price", Value: 3100.0},
				{Key: "realized_pnl", Value: 0.0},
				{Key: "currency", Value: "INR"},
			},
		}))

		s := New(mt.DB)
		got, err := s.Holdings.UpdateScopedAndReturn(context.Background(), uid, id, bson.D{
			{Key: "script", Value: "TCS-UPDATED"},
		})
		if err != nil {
			t.Fatalf("UpdateScopedAndReturn: %v", err)
		}
		if got.Script != "TCS-UPDATED" {
			t.Errorf("post-image script = %q, want TCS-UPDATED", got.Script)
		}
		if got.UserID != uid {
			t.Errorf("post-image user_id = %s, want %s", got.UserID.Hex(), uid.Hex())
		}

		// One wire command, named findAndModify, with new: true, user_id
		// pinned in the query filter.
		events := mt.GetAllStartedEvents()
		var fam *event.CommandStartedEvent
		for _, e := range events {
			if e.CommandName == "findAndModify" {
				fam = e
				break
			}
		}
		if fam == nil {
			t.Fatalf("no findAndModify command issued; got %d events", len(events))
		}
		if v, err := fam.Command.LookupErr("new"); err != nil || !v.Boolean() {
			t.Errorf("findAndModify new = %v (err %v), want true", v, err)
		}
		uidVal, err := fam.Command.LookupErr("query", "user_id")
		if err != nil {
			t.Fatalf("findAndModify query.user_id missing: %v", err)
		}
		gotUID, ok := uidVal.ObjectIDOK()
		if !ok || gotUID != uid {
			t.Errorf("findAndModify scoped to %v, want %s", uidVal, uid.Hex())
		}
	})
}

func TestUpdateScopedAndReturn_NotFoundOnEmptyValue(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("no document matched → ErrNotFound", func(mt *mtest.T) {
		// findAndModify with no matching doc returns {ok:1, value: null}.
		mt.AddMockResponses(mtest.CreateSuccessResponse(bson.E{Key: "value", Value: nil}))

		s := New(mt.DB)
		_, err := s.Holdings.UpdateScopedAndReturn(context.Background(),
			primitive.NewObjectID(), primitive.NewObjectID(),
			bson.D{{Key: "script", Value: "noop"}},
		)
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("err = %v, want persistence.ErrNotFound", err)
		}
	})
}
