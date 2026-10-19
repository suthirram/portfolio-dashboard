package controllers

import (
	"testing"

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
