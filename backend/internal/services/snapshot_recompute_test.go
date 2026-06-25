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

func TestAsOfLedger_FiltersTradesAndGatesOpeningOnKeep(t *testing.T) {
	cutoff := utcDay(6, 19).Add(24 * time.Hour) // include trades on/before 06-19
	txns := []domain.Transaction{
		{Type: domain.TxnOpening, Date: utcDay(1, 1), Quantity: 5, Amount: 500},  // past opening
		{Type: domain.TxnBuy, Date: utcDay(6, 18), Quantity: 10, Amount: 1000},   // kept
		{Type: domain.TxnOpening, Date: utcDay(12, 1), Quantity: 3, Amount: 300}, // future-stamped opening
		{Type: domain.TxnBuy, Date: utcDay(6, 25), Quantity: 7, Amount: 700},     // future buy: always dropped
	}

	// keepOpening=true: both openings retained as the baseline (holding existed).
	kept := asOfLedger(txns, cutoff, true)
	if len(kept) != 3 {
		t.Fatalf("keepOpening=true kept %d events, want 3 (both openings + 06-18 buy)", len(kept))
	}

	// keepOpening=false: openings filtered by date too (holding did not exist on
	// this date), so the future-stamped opening is dropped — no fabrication.
	dropped := asOfLedger(txns, cutoff, false)
	if len(dropped) != 2 {
		t.Fatalf("keepOpening=false kept %d events, want 2 (past opening + 06-18 buy)", len(dropped))
	}
	for _, tx := range dropped {
		if !tx.Date.Before(cutoff) {
			t.Errorf("keepOpening=false kept event dated %s at/after cutoff", tx.Date.Format("2006-01-02"))
		}
	}
}

// TestLinesAsOf_KeepsPositionWhenOpeningStampedAfterSnapshot reproduces the
// production bug: a legacy holding's opening is stamped at migration time (a
// date later than an older snapshot), and a backdated edit triggers a heal of
// that older row. The holding WAS recorded on that row by the cron (hadPrior),
// so the opening must still anchor the position — the recompute must not zero a
// holding the cron correctly recorded.
func TestLinesAsOf_KeepsPositionWhenOpeningStampedAfterSnapshot(t *testing.T) {
	hid := primitive.NewObjectID()
	// Holding created 06-10 (it existed on the 06-20 row), but its opening was
	// stamped 06-24 — e.g. a legacy holding migrated with a "now" stamp.
	holdings := []domain.Holding{{ID: hid, Symbol: "TCS.NS", Script: "TCS", Currency: "INR", CreatedAt: utcDay(6, 10)}}
	byHolding := map[primitive.ObjectID][]domain.Transaction{
		hid: {{HoldingID: hid, Type: domain.TxnOpening, Date: utcDay(6, 24), Quantity: 100, Amount: 5000}},
	}
	existing := domain.PortfolioSnapshot{
		Date:  utcDay(6, 20),
		Lines: []domain.HoldingSnapshot{{Symbol: "TCS.NS", ClosePrice: 60, PriceDate: "2026-06-20"}},
	}

	r := &SnapshotRecomputer{}
	lines := r.linesAsOf(holdings, byHolding, existing)
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1 (opening baseline must survive)", len(lines))
	}
	ln := lines[0]
	if ln.Quantity != 100 {
		t.Errorf("qty = %v, want 100 (opening is the timeless baseline, not dropped)", ln.Quantity)
	}
	if ln.Current != 6000 { // 100 * 60
		t.Errorf("current = %v, want 6000", ln.Current)
	}
	if ln.Invested != 5000 { // 100 * 50 avg
		t.Errorf("invested = %v, want 5000", ln.Invested)
	}
}

// TestLinesAsOf_DoesNotFabricateHoldingFromFutureOpening guards the other
// direction: a holding NOT recorded on a row (no prior line) whose only ledger
// event is an opening stamped after that row must not be fabricated into it.
func TestLinesAsOf_DoesNotFabricateHoldingFromFutureOpening(t *testing.T) {
	hid := primitive.NewObjectID()
	// Holding created 06-24 — it did NOT exist on the 06-20 row.
	holdings := []domain.Holding{{ID: hid, Symbol: "NEW.NS", Script: "NEW", Currency: "INR", CreatedAt: utcDay(6, 24)}}
	byHolding := map[primitive.ObjectID][]domain.Transaction{
		hid: {{HoldingID: hid, Type: domain.TxnOpening, Date: utcDay(6, 24), Quantity: 100, Amount: 5000}},
	}
	// 06-20 row predates the holding; it has no line for NEW.NS.
	existing := domain.PortfolioSnapshot{
		Date:  utcDay(6, 20),
		Lines: []domain.HoldingSnapshot{},
	}

	r := &SnapshotRecomputer{}
	lines := r.linesAsOf(holdings, byHolding, existing)
	if len(lines) != 0 {
		t.Fatalf("got %d lines, want 0 (future-stamped opening must not fabricate a holding)", len(lines))
	}
}

// TestLinesAsOf_DuplicateSymbolDoesNotVouchForNewerHolding guards P2b: an older
// holding's stored line for a symbol must not make a NEWER holding with the same
// symbol keep its future-stamped opening (which would fabricate the newer one
// into rows that predate it). Existence is per-holding (CreatedAt), not symbol.
func TestLinesAsOf_DuplicateSymbolDoesNotVouchForNewerHolding(t *testing.T) {
	oldH := primitive.NewObjectID()
	newH := primitive.NewObjectID()
	holdings := []domain.Holding{
		{ID: oldH, Symbol: "DUP.NS", Script: "Old", Currency: "INR", CreatedAt: utcDay(6, 1)},  // existed on 06-20
		{ID: newH, Symbol: "DUP.NS", Script: "New", Currency: "INR", CreatedAt: utcDay(6, 24)}, // created after 06-20
	}
	byHolding := map[primitive.ObjectID][]domain.Transaction{
		oldH: {{HoldingID: oldH, Type: domain.TxnOpening, Date: utcDay(6, 1), Quantity: 10, Amount: 1000}},
		newH: {{HoldingID: newH, Type: domain.TxnOpening, Date: utcDay(6, 24), Quantity: 100, Amount: 5000}},
	}
	// 06-20 row recorded the OLD holding's DUP.NS line (close 50).
	existing := domain.PortfolioSnapshot{
		Date:  utcDay(6, 20),
		Lines: []domain.HoldingSnapshot{{Symbol: "DUP.NS", ClosePrice: 50, PriceDate: "2026-06-20"}},
	}

	r := &SnapshotRecomputer{}
	lines := r.linesAsOf(holdings, byHolding, existing)
	// Only the old holding survives (10 sh); the newer same-symbol holding's
	// future opening is filtered out, so it is not fabricated into the row.
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1 (newer same-symbol holding must not be fabricated)", len(lines))
	}
	if lines[0].Quantity != 10 {
		t.Errorf("qty = %v, want 10 (only the pre-existing holding)", lines[0].Quantity)
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

func TestLinesAsOf_WorthlessStoredCloseStaysWorthless(t *testing.T) {
	hid := primitive.NewObjectID()
	holdings := []domain.Holding{{ID: hid, Symbol: "DEAD.NS", Script: "DEAD", Currency: "INR"}}
	byHolding := map[primitive.ObjectID][]domain.Transaction{
		hid: {{HoldingID: hid, Type: domain.TxnBuy, Date: utcDay(6, 10), Quantity: 5, Amount: 500}},
	}
	// Existing snapshot recorded DEAD.NS as worthless (delisted / failed fetch:
	// ClosePrice 0, Current 0). Recompute must NOT resurrect it to avg cost.
	existing := domain.PortfolioSnapshot{
		Date:  utcDay(6, 15),
		Lines: []domain.HoldingSnapshot{{Symbol: "DEAD.NS", ClosePrice: 0, Current: 0}},
	}

	r := &SnapshotRecomputer{}
	lines := r.linesAsOf(holdings, byHolding, existing)
	if len(lines) != 1 {
		t.Fatalf("got %d lines, want 1", len(lines))
	}
	ln := lines[0]
	if ln.ClosePrice != 0 {
		t.Errorf("close = %v, want 0 (worthless stays worthless, not resurrected to cost)", ln.ClosePrice)
	}
	if ln.Current != 0 {
		t.Errorf("current = %v, want 0", ln.Current)
	}
	if ln.Invested != 500 { // 5 * 100 avg cost — invested basis unchanged
		t.Errorf("invested = %v, want 500", ln.Invested)
	}
}
