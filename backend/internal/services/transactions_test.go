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

// Editing an opening's date through the ledger API (which has no opening_date
// field) must also stamp opening_date, so the snapshot heal's as-of filter
// gates the baseline on the new effective date. A non-date edit must leave
// opening_date untouched.
func TestTransactionsService_Update_OpeningDateTracksDate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	jan := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	mar := time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC)

	// openingDateInTxnUpdate runs Update on an opening originally dated jan with
	// the supplied newDate, then reports whether the transactions findAndModify
	// $set carried opening_date (and its value).
	openingDateInTxnUpdate := func(mt *mtest.T, newDate time.Time) (present bool, val time.Time) {
		uid := primitive.NewObjectID()
		hid := primitive.NewObjectID()
		txnID := primitive.NewObjectID()
		txnsNS := mt.DB.Name() + ".transactions"

		prevOpening := bson.D{
			{Key: "_id", Value: txnID}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "opening"}, {Key: "date", Value: jan},
			{Key: "quantity", Value: 10.0}, {Key: "amount", Value: 1000.0},
		}
		updatedOpening := bson.D{
			{Key: "_id", Value: txnID}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "opening"}, {Key: "date", Value: newDate},
			{Key: "quantity", Value: 10.0}, {Key: "amount", Value: 1000.0},
		}
		mt.AddMockResponses(
			// GetScoped(prev).
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, prevOpening),
			// UpdateScopedAndReturn — findAndModify on transactions.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: updatedOpening}),
			// recompute ListByHolding — the opening alone.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, updatedOpening),
			// recompute holdings update.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
				{Key: "_id", Value: hid}, {Key: "user_id", Value: uid}, {Key: "currency", Value: "INR"},
			}}),
		)

		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, nil, nil)
		q, a := 10.0, 1000.0
		_, found, err := svc.Update(context.Background(), uid, txnID.Hex(), api.TransactionInput{
			Type: "opening", Date: newDate, Quantity: &q, Amount: &a,
		})
		if err != nil || !found {
			t.Fatalf("Update: found=%v err=%v", found, err)
		}

		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "findAndModify" {
				continue
			}
			coll, err := e.Command.LookupErr("findAndModify")
			if err != nil || coll.StringValue() != "transactions" {
				continue
			}
			set, err := e.Command.LookupErr("update", "$set")
			if err != nil {
				t.Fatalf("no $set in transactions update: %v", err)
			}
			if od, err := set.Document().LookupErr("opening_date"); err == nil {
				return true, od.Time().UTC()
			}
			return false, time.Time{}
		}
		t.Fatal("no findAndModify on transactions captured")
		return false, time.Time{}
	}

	mt.Run("date changed syncs opening_date", func(mt *mtest.T) {
		present, val := openingDateInTxnUpdate(mt, mar)
		if !present {
			t.Fatal("opening_date absent from update; want it synced to the new date")
		}
		if !val.Equal(mar) {
			t.Errorf("opening_date = %s, want %s", val.Format("2006-01-02"), mar.Format("2006-01-02"))
		}
	})

	mt.Run("date unchanged leaves opening_date untouched", func(mt *mtest.T) {
		present, _ := openingDateInTxnUpdate(mt, jan)
		if present {
			t.Error("opening_date written on a non-date edit; want it left untouched")
		}
	})
}

// An opening edit that changes the date stamps opening_date BEFORE recompute
// runs. If that recompute oversells (e.g. lowering the opening quantity below a
// later sell), the rollback must restore the prior opening_date too — otherwise
// asOfLedger keeps gating history on a date the edit reverted.
func TestTransactionsService_Update_OversellRestoresOpeningDate(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("oversell rolls opening_date back to prior declared date", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		hid := primitive.NewObjectID()
		txnID := primitive.NewObjectID()
		sellID := primitive.NewObjectID()
		txnsNS := mt.DB.Name() + ".transactions"

		feb := time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC)
		mar := time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC)
		mar15 := time.Date(2026, time.March, 15, 0, 0, 0, 0, time.UTC)

		// prev: opening dated feb with a DECLARED opening_date of feb, qty 10.
		prevOpening := bson.D{
			{Key: "_id", Value: txnID}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "opening"}, {Key: "date", Value: feb}, {Key: "opening_date", Value: feb},
			{Key: "quantity", Value: 10.0}, {Key: "amount", Value: 1000.0},
		}
		sell := bson.D{
			{Key: "_id", Value: sellID}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "sell"}, {Key: "date", Value: mar15},
			{Key: "quantity", Value: 5.0}, {Key: "amount", Value: 600.0},
		}
		// Edit moves the opening to mar and lowers qty to 1 ⇒ oversell vs the sell.
		stampedOpening := bson.D{
			{Key: "_id", Value: txnID}, {Key: "user_id", Value: uid}, {Key: "holding_id", Value: hid},
			{Key: "type", Value: "opening"}, {Key: "date", Value: mar}, {Key: "opening_date", Value: mar},
			{Key: "quantity", Value: 1.0}, {Key: "amount", Value: 100.0},
		}

		mt.AddMockResponses(
			// GetScoped(prev).
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, prevOpening),
			// UpdateScopedAndReturn — the stamping update (date + opening_date → mar).
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: stampedOpening}),
			// recompute#1 ListByHolding — opening qty 1 under a sell of 5 ⇒ oversell.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, stampedOpening, sell),
			// restore UpdateScopedAndReturn — findAndModify reverting the opening.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: prevOpening}),
			// restore recompute ListByHolding — opening qty 10, sell 5 ⇒ valid.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, prevOpening, sell),
			// restore recompute holdings update.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{
				{Key: "_id", Value: hid}, {Key: "user_id", Value: uid}, {Key: "currency", Value: "INR"},
			}}),
		)

		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, nil, nil)
		q, a := 1.0, 100.0
		_, found, err := svc.Update(context.Background(), uid, txnID.Hex(), api.TransactionInput{
			Type: "opening", Date: mar, Quantity: &q, Amount: &a,
		})
		if !found {
			t.Fatal("found=false; want the transaction to be located")
		}
		if !errors.Is(err, ErrOversell) {
			t.Fatalf("err = %v, want ErrOversell", err)
		}

		// The LAST findAndModify on transactions is the restore; its $set must
		// revert opening_date to the prior declared date (feb), not leave mar.
		var lastSet bson.RawValue
		var sawRestore bool
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName != "findAndModify" {
				continue
			}
			if coll, err := e.Command.LookupErr("findAndModify"); err != nil || coll.StringValue() != "transactions" {
				continue
			}
			if set, err := e.Command.LookupErr("update", "$set"); err == nil {
				lastSet, sawRestore = set, true
			}
		}
		if !sawRestore {
			t.Fatal("no transactions findAndModify captured")
		}
		od, err := lastSet.Document().LookupErr("opening_date")
		if err != nil {
			t.Fatal("restore $set omits opening_date; want it reverted to the prior date")
		}
		if !od.Time().UTC().Equal(feb) {
			t.Errorf("restored opening_date = %s, want %s", od.Time().UTC().Format("2006-01-02"), feb.Format("2006-01-02"))
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
