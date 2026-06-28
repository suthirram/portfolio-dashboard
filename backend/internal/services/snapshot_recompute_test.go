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

func TestAsOfLedger_FiltersNonOpeningsByDate(t *testing.T) {
	cutoff := utcDay(6, 19).Add(24 * time.Hour) // include events on/before 06-19
	buyDated := func(m time.Month, d int) domain.Transaction {
		return domain.Transaction{Type: domain.TxnBuy, Date: utcDay(m, d), Quantity: 1, Amount: 100}
	}
	got := asOfLedger([]domain.Transaction{buyDated(6, 18), buyDated(6, 25)}, cutoff)
	if len(got) != 1 {
		t.Fatalf("kept %d events, want 1 (06-18 buy; future 06-25 buy dropped)", len(got))
	}
	if !got[0].Date.Before(cutoff) {
		t.Errorf("kept buy dated %s at/after cutoff", got[0].Date.Format("2006-01-02"))
	}
}

// TestAsOfLedger_OpeningBaselineRetainedUnlessDeclaredAfter is the regression
// for the opening-drop limitation: an opening with an UNSET OpeningDate is the
// timeless baseline and must be kept even when its ordering Date falls after the
// row (it defaults to creation/migration time). Only a DECLARED OpeningDate
// on/after the row drops the opening — the position genuinely did not exist yet.
func TestAsOfLedger_OpeningBaselineRetainedUnlessDeclaredAfter(t *testing.T) {
	cutoff := utcDay(6, 19).Add(24 * time.Hour) // as-of 06-19
	declared := func(m time.Month, d int) *time.Time { t := utcDay(m, d); return &t }

	cases := []struct {
		name string
		txn  domain.Transaction
		keep bool
	}{
		{"unset opening dated in the future is retained (baseline, the bug fix)",
			domain.Transaction{Type: domain.TxnOpening, Date: utcDay(12, 1), Quantity: 3, Amount: 300}, true},
		{"unset opening dated in the past is retained",
			domain.Transaction{Type: domain.TxnOpening, Date: utcDay(1, 1), Quantity: 5, Amount: 500}, true},
		{"declared opening date before the row is retained",
			domain.Transaction{Type: domain.TxnOpening, Date: utcDay(12, 1), Quantity: 3, Amount: 300, OpeningDate: declared(6, 1)}, true},
		{"declared opening date on the row (snapshot day) is retained",
			domain.Transaction{Type: domain.TxnOpening, Date: utcDay(12, 1), Quantity: 3, Amount: 300, OpeningDate: declared(6, 19)}, true},
		{"declared opening date the day after the row is dropped",
			domain.Transaction{Type: domain.TxnOpening, Date: utcDay(1, 1), Quantity: 3, Amount: 300, OpeningDate: declared(6, 20)}, false},
		{"declared opening date well after the row is dropped",
			domain.Transaction{Type: domain.TxnOpening, Date: utcDay(1, 1), Quantity: 3, Amount: 300, OpeningDate: declared(6, 25)}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := asOfLedger([]domain.Transaction{c.txn}, cutoff)
			kept := len(got) == 1
			if kept != c.keep {
				t.Errorf("kept=%v, want %v", kept, c.keep)
			}
		})
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
