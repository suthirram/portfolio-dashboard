package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/api"
	"portfolio-dashboard/internal/persistence"
)

// A sell against a holding with no shares must be rejected with ErrOversell and
// the just-inserted transaction rolled back (DeleteScoped), so the ledger never
// keeps a rejected event.
func TestTransactionsService_Create_OversellRollsBack(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("sell with no shares", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		hid := primitive.NewObjectID()
		holdingsNS := mt.DB.Name() + ".holdings"
		txnsNS := mt.DB.Name() + ".transactions"

		mt.AddMockResponses(
			// GetScoped(holdings) — the owning holding.
			mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: hid}, {Key: "user_id", Value: uid}, {Key: "currency", Value: "INR"},
			}),
			// Insert(transactions).
			mtest.CreateSuccessResponse(),
			// recompute ListByHolding — only the new sell ⇒ oversell.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: primitive.NewObjectID()}, {Key: "type", Value: "sell"},
				{Key: "quantity", Value: 10.0}, {Key: "amount", Value: 1000.0},
			}),
			// rollback DeleteScoped.
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
		)

		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, nil, nil)

		qty, amt := 10.0, 1000.0
		_, found, err := svc.Create(context.Background(), uid, hid.Hex(), api.TransactionInput{
			Type: "sell", Date: time.Now(), Quantity: &qty, Amount: &amt,
		})
		if !found {
			t.Fatal("found=false; want the holding to be located")
		}
		if !errors.Is(err, ErrOversell) {
			t.Fatalf("err = %v, want ErrOversell", err)
		}
	})
}

// Deleting a buy that a later sell depends on must be rejected and the buy
// re-inserted so the ledger stays consistent.
func TestTransactionsService_Delete_OversellReinserts(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("delete buy under a sell", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		hid := primitive.NewObjectID()
		buyID := primitive.NewObjectID()
		txnsNS := mt.DB.Name() + ".transactions"

		buyDoc := bson.D{
			{Key: "_id", Value: buyID}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "buy"}, {Key: "quantity", Value: 10.0}, {Key: "amount", Value: 1000.0},
		}
		sellDoc := bson.D{
			{Key: "_id", Value: primitive.NewObjectID()}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "sell"}, {Key: "quantity", Value: 10.0}, {Key: "amount", Value: 1500.0},
		}

		mt.AddMockResponses(
			// GetScoped(transactions) — the buy to delete.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, buyDoc),
			// DeleteScoped.
			mtest.CreateSuccessResponse(bson.E{Key: "n", Value: 1}),
			// recompute ListByHolding — only the sell remains ⇒ oversell.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, sellDoc),
			// rollback Insert(buy).
			mtest.CreateSuccessResponse(),
			// recompute ListByHolding again — buy + sell, consistent.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, buyDoc, sellDoc),
			// recompute FindOneAndUpdate(holdings).
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
				{Key: "_id", Value: hid}, {Key: "user_id", Value: uid}, {Key: "currency", Value: "INR"},
			}}),
		)

		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, nil, nil)

		deleted, err := svc.Delete(context.Background(), uid, buyID.Hex())
		if !errors.Is(err, ErrOversell) {
			t.Fatalf("err = %v, want ErrOversell", err)
		}
		if deleted {
			t.Fatal("deleted=true; want false when the delete is rejected")
		}
	})
}
