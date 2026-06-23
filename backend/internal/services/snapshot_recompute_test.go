package services

import (
	"context"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/persistence"

	"portfolio-dashboard/internal/domain"
)

// TestRecomputeFrom_SkipsLineLessLegacyRows asserts forward-only behaviour: a
// pre-change total-only row (Lines absent) is left untouched after a backdated
// transaction — no Upsert is issued for it, so its cron buckets cannot be
// corrupted by an avg-cost carry-forward.
func TestRecomputeFrom_SkipsLineLessLegacyRows(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("legacy row skipped", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		hid := primitive.NewObjectID()
		date := utcDay(time.June, 15)

		// One legacy snapshot: regions present, NO `holdings` field.
		legacy := bson.D{
			{Key: "user_id", Value: uid},
			{Key: "date", Value: date},
			{Key: "currency", Value: "INR"},
			{Key: "regions", Value: bson.D{
				{Key: "INR", Value: bson.D{
					{Key: "invested", Value: 1000.0},
					{Key: "current", Value: 1500.0},
					{Key: "source", Value: "cron"},
				}},
			}},
		}

		// RecomputeFrom call order: snapshots.List, holdings.ListByUser,
		// txns.ListByUser. A holding + a backdated buy exist, so if the row
		// were (wrongly) recomputed it would rewrite the INR bucket.
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch, legacy))
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch, bson.D{
			{Key: "user_id", Value: uid},
			{Key: "_id", Value: hid},
			{Key: "symbol", Value: "TCS.NS"},
			{Key: "script", Value: "TCS"},
			{Key: "currency", Value: "INR"},
		}))
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".transactions", mtest.FirstBatch, bson.D{
			{Key: "user_id", Value: uid},
			{Key: "holding_id", Value: hid},
			{Key: "type", Value: "buy"},
			{Key: "date", Value: utcDay(time.June, 10)},
			{Key: "quantity", Value: 10.0},
			{Key: "amount", Value: 1000.0},
		}))

		st := persistence.New(mt.DB)
		rc := NewSnapshotRecomputer(st.Holdings, st.Transactions, st.Snapshots, nil)
		rc.Now = func() time.Time { return utcDay(time.June, 20) }

		if err := rc.RecomputeFrom(context.Background(), uid, utcDay(time.June, 1)); err != nil {
			t.Fatalf("RecomputeFrom: %v", err)
		}

		// The skip means no upsert path ran: no FindOne (find) or update was
		// issued against portfolio_snapshots beyond the initial List.
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "update" {
				t.Errorf("legacy line-less row was rewritten (update issued); want skip")
			}
		}
	})
}

func utcDay(m time.Month, d int) time.Time {
	return time.Date(2026, m, d, 0, 0, 0, 0, time.UTC)
}

func TestAsOfLedger_FiltersByDateKeepsOpening(t *testing.T) {
	cutoff := utcDay(6, 19).Add(24 * time.Hour) // include events on/before 06-19
	txns := []domain.Transaction{
		{Type: domain.TxnOpening, Date: utcDay(12, 1), Quantity: 5, Amount: 500}, // future-dated opening still kept
		{Type: domain.TxnBuy, Date: utcDay(6, 18), Quantity: 10, Amount: 1000},
		{Type: domain.TxnBuy, Date: utcDay(6, 25), Quantity: 7, Amount: 700}, // after cutoff: dropped
	}
	got := asOfLedger(txns, cutoff)
	if len(got) != 2 {
		t.Fatalf("kept %d events, want 2 (opening + the 06-18 buy)", len(got))
	}
	for _, tx := range got {
		if tx.Type == domain.TxnBuy && !tx.Date.Before(cutoff) {
			t.Errorf("kept a buy dated %s at/after cutoff", tx.Date.Format("2006-01-02"))
		}
	}
}

func TestLinesAsOf_ValuesAtStoredCloseAndRespectsAsOfPosition(t *testing.T) {
	hid := primitive.NewObjectID()
	holdings := []domain.Holding{{
		ID: hid, Symbol: "TCS.NS", Script: "TCS", Currency: "INR",
	}}
	// Ledger: 10 @ 100 on 06-18, then a BACKDATED 5 @ 120 on 06-19.
	byHolding := map[primitive.ObjectID][]domain.Transaction{
		hid: {
			{HoldingID: hid, Type: domain.TxnBuy, Date: utcDay(6, 18), Quantity: 10, Amount: 1000},
			{HoldingID: hid, Type: domain.TxnBuy, Date: utcDay(6, 19), Quantity: 5, Amount: 600},
		},
	}
	// Existing 06-18 snapshot recorded a close of 130 for TCS — recompute must
	// reuse it (no refetch), but apply the as-of position for 06-18 (10 shares,
	// the 06-19 buy is excluded).
	existing := domain.PortfolioSnapshot{
		Date:  utcDay(6, 18),
		Lines: []domain.HoldingSnapshot{{Symbol: "TCS.NS", ClosePrice: 130, PriceDate: "2026-06-18"}},
	}

	r := &SnapshotRecomputer{}
	lines := r.linesAsOf(holdings, byHolding, existing)
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1", len(lines))
	}
	ln := lines[0]
	if ln.Quantity != 10 {
		t.Errorf("qty = %v, want 10 (06-19 buy excluded as-of 06-18)", ln.Quantity)
	}
	if ln.ClosePrice != 130 {
		t.Errorf("close = %v, want 130 (reused stored close, no refetch)", ln.ClosePrice)
	}
	if ln.Current != 1300 { // 10 * 130
		t.Errorf("current = %v, want 1300", ln.Current)
	}
	if ln.Invested != 1000 { // 10 * 100 avg
		t.Errorf("invested = %v, want 1000", ln.Invested)
	}
}

func TestLinesAsOf_CarryForwardWhenNoStoredClose(t *testing.T) {
	hid := primitive.NewObjectID()
	holdings := []domain.Holding{{ID: hid, Symbol: "NEW.NS", Script: "NEW", Currency: "INR"}}
	byHolding := map[primitive.ObjectID][]domain.Transaction{
		hid: {{HoldingID: hid, Type: domain.TxnBuy, Date: utcDay(6, 10), Quantity: 4, Amount: 400}},
	}
	// Existing snapshot has NO line for NEW.NS (backdated txn introduced it on
	// a date no cron ever priced) → carry-forward at avg cost: current==invested.
	existing := domain.PortfolioSnapshot{Date: utcDay(6, 15)}

	r := &SnapshotRecomputer{}
	lines := r.linesAsOf(holdings, byHolding, existing)
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1", len(lines))
	}
	ln := lines[0]
	if ln.ClosePrice != 100 { // avg cost 400/4
		t.Errorf("close = %v, want 100 (carry-forward avg cost)", ln.ClosePrice)
	}
	if ln.Current != ln.Invested || ln.Current != 400 {
		t.Errorf("current=%v invested=%v, want both 400 (no synthetic gain)", ln.Current, ln.Invested)
	}
}
