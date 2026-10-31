package controllers

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/domain"
)

// The all-transactions list must pin the caller's user_id on both reads
// (ledger + holdings) — a user never sees another user's events.
func TestListAllTransactions_ScopesToCurrentUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("own ledger", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch),
		)
		u := scopedUser()
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.ListAllTransactions(userCtx(u), api.ListAllTransactionsRequestObject{})
		if err != nil {
			t.Fatalf("ListAllTransactions: %v", err)
		}
		if _, ok := resp.(api.ListAllTransactions200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "find" {
				continue
			}
			got, ok := commandFilterUserID(t, e.Command, "find")
			if !ok || got != u.ID {
				t.Fatalf("find %s scoped to %v, want %s", e.Command.Lookup("find"), got, u.ID.Hex())
			}
		}
	})
}

// Act-as reads the target's ledger in region; an out-of-region target reads
// as 404 (no enumeration) and its ledger is never queried.
func TestAdminListUserTransactions(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("in-region target", func(mt *mtest.T) {
		targetID := primitive.NewObjectID()
		target := userDocument(t, targetID, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch),
		)
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminListUserTransactions(userCtx(regionalAdmin("india")), api.AdminListUserTransactionsRequestObject{
			Id: targetID.Hex(),
		})
		if err != nil {
			t.Fatalf("AdminListUserTransactions: %v", err)
		}
		if _, ok := resp.(api.AdminListUserTransactions200JSONResponse); !ok {
			t.Fatalf("response = %T, want 200", resp)
		}
		var sawLedger bool
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "find" || e.Command.Lookup("find").StringValue() != "transactions" {
				continue
			}
			sawLedger = true
			if got, ok := commandFilterUserID(t, e.Command, "find"); !ok || got != targetID {
				t.Fatalf("transactions find user_id = %v, want target %s", got, targetID.Hex())
			}
		}
		if !sawLedger {
			t.Fatal("no transactions find issued")
		}
	})

	mt.Run("out-of-region target", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		h := newIntegrationHandler(mt, &mockPriceFetcher{})
		resp, err := h.AdminListUserTransactions(userCtx(regionalAdmin("india")), api.AdminListUserTransactionsRequestObject{
			Id: primitive.NewObjectID().Hex(),
		})
		if err != nil {
			t.Fatalf("AdminListUserTransactions: %v", err)
		}
		if _, ok := resp.(api.AdminListUserTransactions404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", resp)
		}
	})
}

// Act-as ledger writes are region-scoped: out-of-region targets read as 404
// and nothing is written; in-region writes land on the target's ledger.
func TestAdminUserTransactionWrites(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	date := time.Date(2024, 3, 15, 0, 0, 0, 0, time.UTC)

	mt.Run("out-of-region create is 404, no insert", func(mt *mtest.T) {
		target := userDocument(t, primitive.NewObjectID(), "bob", "irrelevant1", domain.RoleUser, "europe", nil)
		mt.AddMockResponses(mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target))
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})
		amount := 300.0
		response, err := handler.AdminCreateUserTransaction(userCtx(regionalAdmin("india")), api.AdminCreateUserTransactionRequestObject{
			Id: primitive.NewObjectID().Hex(), HoldingId: primitive.NewObjectID().Hex(),
			Body: &api.TransactionInput{Type: "dividend", Date: date, Amount: &amount},
		})
		if err != nil {
			t.Fatalf("AdminCreateUserTransaction: %v", err)
		}
		if _, ok := response.(api.AdminCreateUserTransaction404JSONResponse); !ok {
			t.Fatalf("response = %T, want 404", response)
		}
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName == "insert" {
				t.Error("insert issued for an out-of-region target")
			}
		}
	})

	mt.Run("in-region create writes the target's ledger", func(mt *mtest.T) {
		targetId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		target := userDocument(t, targetId, "bob", "irrelevant1", domain.RoleUser, "india", nil)
		dividend := bson.D{{Key: "_id", Value: primitive.NewObjectID()}, {Key: "type", Value: "dividend"}, {Key: "amount", Value: 300.0}}
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, usersNS(mt), mtest.FirstBatch, target),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
				{Key: "_id", Value: holdingId}, {Key: "user_id", Value: targetId}, {Key: "currency", Value: "INR"},
			}),
			mtest.CreateSuccessResponse(),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, dividend),
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: holdingId}}}),
		)
		handler := newIntegrationHandler(mt, &mockPriceFetcher{})
		amount := 300.0
		response, err := handler.AdminCreateUserTransaction(userCtx(regionalAdmin("india")), api.AdminCreateUserTransactionRequestObject{
			Id: targetId.Hex(), HoldingId: holdingId.Hex(),
			Body: &api.TransactionInput{Type: "dividend", Date: date, Amount: &amount},
		})
		if err != nil {
			t.Fatalf("AdminCreateUserTransaction: %v", err)
		}
		if _, ok := response.(api.AdminCreateUserTransaction201JSONResponse); !ok {
			t.Fatalf("response = %T, want 201", response)
		}
		for _, event := range mt.GetAllStartedEvents() {
			if event.CommandName != "insert" {
				continue
			}
			inserted := event.Command.Lookup("documents").Array().Index(0).Value().Document()
			if inserted.Lookup("user_id").ObjectID() != targetId {
				t.Errorf("inserted user_id = %s, want the target", inserted.Lookup("user_id").ObjectID().Hex())
			}
		}
	})
}
