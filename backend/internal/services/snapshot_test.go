package services

import (
	"context"
	"errors"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/integration/mtest"

	"portfolio-dashboard/internal/domain"
	"portfolio-dashboard/internal/persistence"
)

func TestCurrencyOf(t *testing.T) {
	cases := []struct {
		name    string
		holding domain.Holding
		want    string
		wantOK  bool
	}{
		{"NSE", domain.Holding{Exchange: "NSE"}, domain.CurrencyINR, true},
		{"BSE lowercase", domain.Holding{Exchange: "bse"}, domain.CurrencyINR, true},
		{"NYSE", domain.Holding{Exchange: "NYSE"}, domain.CurrencyUSD, true},
		{"NASDAQ", domain.Holding{Exchange: "NASDAQ"}, domain.CurrencyUSD, true},
		{"LSE", domain.Holding{Exchange: "LSE"}, domain.CurrencyEUR, true},
		{"XETRA", domain.Holding{Exchange: "XETRA"}, domain.CurrencyEUR, true},
		{"USD currency fallback", domain.Holding{Exchange: "OTHER", Currency: "USD"}, domain.CurrencyUSD, true},
		{"EUR currency fallback", domain.Holding{Exchange: "OTHER", Currency: "EUR"}, domain.CurrencyEUR, true},
		{"INR currency fallback", domain.Holding{Exchange: "OTHER", Currency: "INR"}, domain.CurrencyINR, true},
		{"unknown exchange + unknown currency", domain.Holding{Exchange: "OTHER", Currency: "GBP"}, "unknown", false},
		{"empty exchange + empty currency", domain.Holding{}, "unknown", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := CurrencyOf(c.holding)
			if got != c.want || ok != c.wantOK {
				t.Errorf("CurrencyOf(%+v) = (%q, %v), want (%q, %v)", c.holding, got, ok, c.want, c.wantOK)
			}
		})
	}
}

func TestCurrencyOfIsTotal(t *testing.T) {
	// Property: never panics, always returns a string. Catches accidental
	// removal of the unknown fallback.
	cases := []string{"", "?", "FOOBAR", "lse", "nse"}
	for _, ex := range cases {
		got, _ := CurrencyOf(domain.Holding{Exchange: ex})
		if got == "" {
			t.Errorf("CurrencyOf(exchange=%q) returned empty string", ex)
		}
	}
}

func holdingDoc(uid primitive.ObjectID, exchange, symbol, currency string, qty, cost float64) bson.D {
	return bson.D{
		{Key: "user_id", Value: uid},
		{Key: "script", Value: symbol},
		{Key: "symbol", Value: symbol},
		{Key: "exchange", Value: exchange},
		{Key: "currency", Value: currency},
		{Key: "stocks_owned", Value: qty},
		{Key: "avg_cost_price", Value: cost},
	}
}

func TestBuildSnapshot_GroupsByRegionAndUsesLivePrice(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("group by region", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// TCS in NSE: 10 @ 3000 invested, 10 @ 3500 current. India.
		// AAPL in NASDAQ: 5 @ 100 invested, 5 @ 150 current. US.
		// SAP in XETRA: 2 @ 50 invested, 2 @ 60 current. Europe.
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			holdingDoc(uid, "NSE", "TCS.NS", "INR", 10, 3000),
			holdingDoc(uid, "NASDAQ", "AAPL", "USD", 5, 100),
			holdingDoc(uid, "XETRA", "SAP.DE", "EUR", 2, 50),
		))

		// Stub returns different prices by symbol via the symbol-aware
		// stub below.
		prices := newMultiStub(map[string]float64{
			"TCS.NS": 3500,
			"AAPL":   150,
			"SAP.DE": 60,
		})
		svc := NewSnapshotService(persistence.New(mt.DB).Holdings, nil, nil, prices, nil)

		date := time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC)
		snap, err := svc.BuildSnapshot(context.Background(), uid, date)
		if err != nil {
			t.Fatalf("BuildSnapshot: %v", err)
		}

		inr := snap.Regions[domain.CurrencyINR]
		if inr.Invested != 30000 || inr.Current != 35000 {
			t.Errorf("INR = (%v, %v), want (30000, 35000)", inr.Invested, inr.Current)
		}
		usd := snap.Regions[domain.CurrencyUSD]
		if usd.Invested != 500 || usd.Current != 750 {
			t.Errorf("USD = (%v, %v), want (500, 750)", usd.Invested, usd.Current)
		}
		eur := snap.Regions[domain.CurrencyEUR]
		if eur.Invested != 100 || eur.Current != 120 {
			t.Errorf("EUR = (%v, %v), want (100, 120)", eur.Invested, eur.Current)
		}
		for _, r := range snap.Regions {
			if r.Source != domain.SnapshotSourceCron {
				t.Errorf("bucket source = %q, want cron", r.Source)
			}
		}
	})
}

func TestBuildSnapshot_EmptyPortfolioReturnsAllZeros(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("empty portfolio", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))

		svc := NewSnapshotService(persistence.New(mt.DB).Holdings, nil, nil, &stubPriceFetcher{}, nil)
		snap, err := svc.BuildSnapshot(context.Background(), uid, time.Date(2026, 6, 16, 0, 0, 0, 0, time.UTC))
		if err != nil {
			t.Fatalf("BuildSnapshot: %v", err)
		}
		for _, r := range domain.AllCurrencies {
			rs, ok := snap.Regions[r]
			if !ok {
				t.Errorf("region %q missing", r)
				continue
			}
			if rs.Invested != 0 || rs.Current != 0 {
				t.Errorf("empty %s = (%v, %v), want (0, 0)", r, rs.Invested, rs.Current)
			}
			if rs.Source != domain.SnapshotSourceCron {
				t.Errorf("empty %s source = %q, want cron", r, rs.Source)
			}
		}
	})
}

func TestBuildSnapshot_PriceErrorFallsBackToInvested(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("price error fallback", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			holdingDoc(uid, "NSE", "TCS.NS", "INR", 10, 3000),
		))

		svc := NewSnapshotService(persistence.New(mt.DB).Holdings, nil, nil, &stubPriceFetcher{
			priceErr: errors.New("yahoo down"),
		}, nil)
		snap, err := svc.BuildSnapshot(context.Background(), uid, time.Now())
		if err != nil {
			t.Fatalf("BuildSnapshot: %v", err)
		}
		inr := snap.Regions[domain.CurrencyINR]
		// No synthetic gain: current == invested.
		if inr.Invested != 30000 || inr.Current != 30000 {
			t.Errorf("INR = (%v, %v), want (30000, 30000) on price error", inr.Invested, inr.Current)
		}
	})
}

func TestBuildSnapshot_UnknownCurrencyExcludedFromTotals(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("unknown currency excluded", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// Exchange "JSE" doesn't map; GBP currency is not in our canonical set.
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			holdingDoc(uid, "JSE", "X", "GBP", 1, 100),
		))

		svc := NewSnapshotService(persistence.New(mt.DB).Holdings, nil, nil, &stubPriceFetcher{price: 200}, nil)
		snap, err := svc.BuildSnapshot(context.Background(), uid, time.Now())
		if err != nil {
			t.Fatalf("BuildSnapshot: %v", err)
		}
		// All canonical buckets are zero — the GBP holding was excluded.
		for _, r := range domain.AllCurrencies {
			if snap.Regions[r].Invested != 0 || snap.Regions[r].Current != 0 {
				t.Errorf("bucket %s should be zero (unknown excluded), got %+v", r, snap.Regions[r])
			}
		}
	})
}

type multiStub struct {
	prices map[string]float64
}

func newMultiStub(prices map[string]float64) *multiStub {
	return &multiStub{prices: prices}
}

func (m *multiStub) GetPrice(_ context.Context, symbol string) (float64, string, error) {
	if p, ok := m.prices[symbol]; ok {
		return p, "INR", nil
	}
	return 0, "", errors.New("no price")
}

func (m *multiStub) GetForexRate(_ context.Context, _, _ string) (float64, error) {
	return 0.011, nil
}

// -- Run/Report --

func TestRun_DryRunDoesNotPersist(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("dry run", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// users List returns one user
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: uid},
			{Key: "username", Value: "a"},
			{Key: "role", Value: "user"},
		}))
		// holdings List returns one holding
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch,
			holdingDoc(uid, "NSE", "TCS.NS", "INR", 1, 100),
		))

		store := persistence.New(mt.DB)
		svc := NewSnapshotService(store.Holdings, store.Snapshots, store.Users, &stubPriceFetcher{price: 200}, nil)

		report, err := svc.Run(context.Background(), RunOptions{DryRun: true})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if report.Succeeded != 1 {
			t.Errorf("Succeeded = %d, want 1", report.Succeeded)
		}
		// No upsert command should have been issued.
		events := mt.GetAllStartedEvents()
		for _, e := range events {
			if e.CommandName == "update" || e.CommandName == "insert" {
				t.Errorf("dry-run issued %s; should not have", e.CommandName)
			}
		}
	})
}

func TestRun_RestrictToSingleUser(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("restrict", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// FindByID returns one user
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: uid},
			{Key: "username", Value: "a"},
			{Key: "role", Value: "user"},
		}))
		// holdings List
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))

		store := persistence.New(mt.DB)
		svc := NewSnapshotService(store.Holdings, store.Snapshots, store.Users, &stubPriceFetcher{}, nil)

		report, err := svc.Run(context.Background(), RunOptions{UserID: uid, DryRun: true})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if report.Total != 1 || report.Succeeded != 1 {
			t.Errorf("report = %+v, want Total=1 Succeeded=1", report)
		}
	})
}

func TestRun_DisabledRestrictedUserResultsInZeroTotal(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("restrict disabled", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: uid},
			{Key: "username", Value: "a"},
			{Key: "role", Value: "user"},
			{Key: "disabled", Value: true},
		}))

		store := persistence.New(mt.DB)
		svc := NewSnapshotService(store.Holdings, store.Snapshots, store.Users, &stubPriceFetcher{}, nil)
		report, err := svc.Run(context.Background(), RunOptions{UserID: uid})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if report.Total != 0 {
			t.Errorf("Total = %d, want 0 (disabled user skipped)", report.Total)
		}
	})
}

func TestRun_DateDefaultsToServiceNow(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("date default", func(mt *mtest.T) {
		// No users -> empty list.
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch))

		store := persistence.New(mt.DB)
		svc := NewSnapshotService(store.Holdings, store.Snapshots, store.Users, &stubPriceFetcher{}, nil)
		fixed := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
		svc.Now = func() time.Time { return fixed }

		report, err := svc.Run(context.Background(), RunOptions{})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		want := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
		if !report.Date.Equal(want) {
			t.Errorf("report.Date = %v, want %v", report.Date, want)
		}
	})
}

func TestRun_WritesUpsertWhenNotDryRun(t *testing.T) {
	mt := mtest.New(t, mtest.NewOptions().ClientType(mtest.Mock))
	mt.Run("upsert path", func(mt *mtest.T) {
		uid := primitive.NewObjectID()
		// users list
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".users", mtest.FirstBatch, bson.D{
			{Key: "_id", Value: uid},
			{Key: "role", Value: "user"},
		}))
		// holdings list
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".holdings", mtest.FirstBatch))
		// Upsert: FindOne (none) + InsertOne ack
		mt.AddMockResponses(mtest.CreateCursorResponse(0, mt.DB.Name()+".portfolio_snapshots", mtest.FirstBatch))
		mt.AddMockResponses(mtest.CreateSuccessResponse())

		store := persistence.New(mt.DB)
		svc := NewSnapshotService(store.Holdings, store.Snapshots, store.Users, &stubPriceFetcher{}, nil)
		report, err := svc.Run(context.Background(), RunOptions{})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if report.Succeeded != 1 {
			t.Errorf("Succeeded = %d, want 1", report.Succeeded)
		}

		// Confirm an insert command was issued.
		sawInsert := false
		for _, e := range mt.GetAllStartedEvents() {
			if e.CommandName == "insert" {
				sawInsert = true
				break
			}
		}
		if !sawInsert {
			t.Error("Run with non-dry-run should have issued an insert")
		}
	})
}

func TestRunReport_HasErrors(t *testing.T) {
	r := RunReport{}
	if r.HasErrors() {
		t.Error("empty report should not report errors")
	}
	r.UserErrors = map[string]string{"x": "boom"}
	if !r.HasErrors() {
		t.Error("report with UserErrors should report errors")
	}
}
