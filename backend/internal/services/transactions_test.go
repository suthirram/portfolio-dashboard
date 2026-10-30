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
	"portfolio-dashboard/internal/domain"
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

// ListAll joins each event to its holding's labels, returns newest first
// (reversing the store's replay order), keeps an orphan event with blank
// labels, and exposes the opening's user-set date (DD-004 §2.2).
func TestTransactionsService_ListAll(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))

	mt.Run("join, order, orphan, opening_date", func(mt *mtest.T) {
		userId := primitive.NewObjectID()
		tcs, gone := primitive.NewObjectID(), primitive.NewObjectID()
		openID, buyID, divID := primitive.NewObjectID(), primitive.NewObjectID(), primitive.NewObjectID()
		day := func(d int) time.Time { return time.Date(2026, 6, d, 0, 0, 0, 0, time.UTC) }
		txnsNS := mt.DB.Name() + ".transactions"
		holdingsNS := mt.DB.Name() + ".holdings"

		mt.AddMockResponses(
			// ListByUser — store order is replay order (date ascending).
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch,
				bson.D{{Key: "_id", Value: openID}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: tcs},
					{Key: "type", Value: "opening"}, {Key: "date", Value: day(1)}, {Key: "opening_date", Value: day(15)}},
				bson.D{{Key: "_id", Value: buyID}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: tcs},
					{Key: "type", Value: "buy"}, {Key: "date", Value: day(2)}},
				bson.D{{Key: "_id", Value: divID}, {Key: "user_id", Value: userId}, {Key: "holding_id", Value: gone},
					{Key: "type", Value: "dividend"}, {Key: "date", Value: day(3)}},
			),
			// holdings.ListByUser — only TCS survives; `gone` is orphaned.
			mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch,
				bson.D{{Key: "_id", Value: tcs}, {Key: "user_id", Value: userId}, {Key: "script", Value: "TCS"}, {Key: "symbol", Value: "TCS.NS"}},
			),
		)

		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, nil, nil)
		rows, err := svc.ListAll(context.Background(), userId)
		if err != nil {
			t.Fatalf("ListAll: %v", err)
		}
		if len(rows) != 3 {
			t.Fatalf("len = %d, want 3", len(rows))
		}
		wantIDs := []primitive.ObjectID{divID, buyID, openID}
		for i, want := range wantIDs {
			if *rows[i].Id != want.Hex() {
				t.Errorf("rows[%d].id = %s, want %s (newest first)", i, *rows[i].Id, want.Hex())
			}
		}
		if *rows[0].Script != "" || *rows[0].Symbol != "" {
			t.Errorf("orphan labels = %q/%q, want blank", *rows[0].Script, *rows[0].Symbol)
		}
		if *rows[1].Script != "TCS" || *rows[1].Symbol != "TCS.NS" {
			t.Errorf("buy labels = %q/%q, want TCS/TCS.NS", *rows[1].Script, *rows[1].Symbol)
		}
		if rows[2].OpeningDate == nil || !rows[2].OpeningDate.Equal(day(15)) {
			t.Errorf("opening_date = %v, want %v", rows[2].OpeningDate, day(15))
		}
		if rows[1].OpeningDate != nil {
			t.Errorf("buy opening_date = %v, want nil", rows[1].OpeningDate)
		}
	})

	mt.Run("empty ledger is an empty slice, not nil", func(mt *mtest.T) {
		mt.AddMockResponses(
			mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch),
			mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch),
		)
		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, nil, nil)
		rows, err := svc.ListAll(context.Background(), primitive.NewObjectID())
		if err != nil {
			t.Fatalf("ListAll: %v", err)
		}
		if rows == nil || len(rows) != 0 {
			t.Fatalf("rows = %#v, want empty non-nil slice (serialises as [])", rows)
		}
	})
}

// The ledger and the CSV import share one dividend rule (PRD-005 §4).
func TestValidateDividend(t *testing.T) {
	today := time.Date(2026, time.October, 30, 0, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		date   time.Time
		amount float64
		ok     bool
	}{
		{"today, positive", today, 300, true},
		{"past, positive", today.AddDate(-6, 0, 0), 1250.5, true},
		{"tomorrow", today.AddDate(0, 0, 1), 300, false},
		{"zero", today, 0, false},
		{"negative", today, -5, false},
		{"absurd", today, 1e12, false},
	}
	for _, c := range cases {
		err := validateDividend(c.date, c.amount, today)
		if c.ok && err != nil {
			t.Errorf("%s: err = %v, want nil", c.name, err)
		}
		if !c.ok && !errors.Is(err, ErrValidation) {
			t.Errorf("%s: err = %v, want ErrValidation", c.name, err)
		}
	}
}

// A future-dated dividend through the ledger API is a 400, not a stored row.
func TestValidateTxnInput_FutureDividendRejected(t *testing.T) {
	today := time.Date(2026, time.October, 30, 0, 0, 0, 0, time.UTC)
	amt := 300.0
	err := validateTxnInput(api.TransactionInput{Type: "dividend", Date: today.AddDate(0, 0, 2), Amount: &amt}, today)
	if !errors.Is(err, ErrValidation) {
		t.Fatalf("err = %v, want ErrValidation", err)
	}
}

// countingRecomputer records RecomputeFrom calls (the snapshot heal).
type countingRecomputer struct{ calls int }

func (c *countingRecomputer) RecomputeFrom(context.Context, primitive.ObjectID, time.Time) error {
	c.calls++
	return nil
}

// A back-dated dividend must not heal snapshots; a back-dated buy still must.
func TestTransactionsService_DividendSkipsHeal(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	past := time.Date(2024, time.March, 15, 0, 0, 0, 0, time.UTC)

	create := func(mt *mtest.T, typ string, qty float64) int {
		userId, holdingId := primitive.NewObjectID(), primitive.NewObjectID()
		holdingsNS, txnsNS := mt.DB.Name()+".holdings", mt.DB.Name()+".transactions"
		event := bson.D{
			{Key: "_id", Value: primitive.NewObjectID()}, {Key: "type", Value: typ},
			{Key: "date", Value: past}, {Key: "quantity", Value: qty}, {Key: "amount", Value: 300.0},
		}
		mt.AddMockResponses(
			// GetScoped(holdings).
			mtest.CreateCursorResponse(0, holdingsNS, mtest.FirstBatch, bson.D{
				{Key: "_id", Value: holdingId}, {Key: "user_id", Value: userId}, {Key: "currency", Value: "INR"},
			}),
			// Insert(transactions).
			mtest.CreateSuccessResponse(),
			// recompute ListByHolding.
			mtest.CreateCursorResponse(0, txnsNS, mtest.FirstBatch, event),
			// recompute holdings findAndModify.
			mtest.CreateSuccessResponse(bson.E{Key: "value", Value: bson.D{{Key: "_id", Value: holdingId}}}),
		)
		rec := &countingRecomputer{}
		st := persistence.New(mt.DB)
		svc := NewTransactionsService(st.Transactions, st.Holdings, rec, nil)
		svc.now = func() time.Time { return time.Date(2026, time.October, 30, 0, 0, 0, 0, time.UTC) }
		amt := 300.0
		in := api.TransactionInput{Type: api.TransactionInputType(typ), Date: past, Amount: &amt}
		if qty > 0 {
			in.Quantity = &qty
		}
		if _, found, err := svc.Create(context.Background(), userId, holdingId.Hex(), in); err != nil || !found {
			t.Fatalf("Create %s: found=%v err=%v", typ, found, err)
		}
		return rec.calls
	}

	mt.Run("dividend", func(mt *mtest.T) {
		if calls := create(mt, "dividend", 0); calls != 0 {
			t.Errorf("heal calls = %d, want 0 for a dividend", calls)
		}
	})
	mt.Run("buy", func(mt *mtest.T) {
		if calls := create(mt, "buy", 10); calls != 1 {
			t.Errorf("heal calls = %d, want 1 for a buy", calls)
		}
	})
}

func TestLedgerCurrency(t *testing.T) {
	cases := map[string]string{"": "INR", "inr": "INR", "EUR": "EUR", "usd": "USD"}
	for in, want := range cases {
		if got := ledgerCurrency(domain.Holding{Currency: in}); got != want {
			t.Errorf("ledgerCurrency(%q) = %q, want %q", in, got, want)
		}
	}
}
