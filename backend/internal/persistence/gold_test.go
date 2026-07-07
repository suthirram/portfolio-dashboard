package persistence

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"

	"portfolio-dashboard/internal/db"
	"portfolio-dashboard/internal/domain"
)

// goldTestStore connects to a dedicated portfolio_test database (created on
// first run), migrates it, and truncates the gold tables so every test
// starts clean. Skips when no local Postgres is reachable — these are
// integration tests over real SQL, run with `make dev-db` up.
func goldTestStore(t *testing.T) *GoldDao {
	t.Helper()

	adminURI := os.Getenv("POSTGRES_URI")
	if adminURI == "" {
		adminURI = "postgres://portfolio:portfolio@localhost:5432/portfolio?sslmode=disable" //nolint:gosec // local-dev compose credentials
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	admin, err := pgxpool.New(ctx, adminURI)
	if err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	defer admin.Close()
	if err := admin.Ping(ctx); err != nil {
		t.Skipf("postgres not available: %v", err)
	}

	var exists bool
	if err := admin.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'portfolio_test')`).Scan(&exists); err != nil {
		t.Fatalf("check test database: %v", err)
	}
	if !exists {
		if _, err := admin.Exec(ctx, `CREATE DATABASE portfolio_test`); err != nil {
			t.Fatalf("create test database: %v", err)
		}
	}

	cfg, err := pgxpool.ParseConfig(adminURI)
	if err != nil {
		t.Fatalf("parse postgres uri: %v", err)
	}
	cfg.ConnConfig.Database = "portfolio_test"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := db.MigratePostgres(ctx, pool, zap.NewNop()); err != nil {
		t.Fatalf("migrate test database: %v", err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE gold_transactions, gold_daily_prices`); err != nil {
		t.Fatalf("truncate gold tables: %v", err)
	}
	return NewGoldDao(pool)
}

func date(m time.Month, d int) time.Time {
	return time.Date(2026, m, d, 0, 0, 0, 0, time.UTC)
}

func fp(v float64) *float64 { return &v }
func sp(v string) *string   { return &v }

func TestGoldTransactions_ScopedCRUD(t *testing.T) {
	s := goldTestStore(t)
	ctx := context.Background()
	alice, bob := "64a000000000000000000001", "64a000000000000000000002"

	ins, err := s.InsertTransaction(ctx, domain.GoldTransaction{
		UserID: alice, Date: date(6, 10), GmPrice: 9950, GramsBought: 8,
		QuotePrice: fp(10200), BillAmount: fp(81600), ActualPaid: 79600,
		BilledWeight: fp(7.9), ChennaiRate: sp("10100"),
	})
	if err != nil {
		t.Fatalf("insert: %v", err)
	}
	if ins.ID == 0 || ins.CreatedAt.IsZero() {
		t.Fatalf("insert did not return stored row: %+v", ins)
	}
	if _, err := s.InsertTransaction(ctx, domain.GoldTransaction{
		UserID: bob, Date: date(6, 11), GmPrice: 9000, GramsBought: 2, ActualPaid: 18000,
	}); err != nil {
		t.Fatalf("insert bob: %v", err)
	}

	// Owner scoping: alice lists only her row; bob cannot read hers.
	list, err := s.ListTransactions(ctx, alice)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 || list[0].ID != ins.ID {
		t.Fatalf("alice list = %+v, want her single row", list)
	}
	if got := list[0]; got.GmPrice != 9950 || got.GramsBought != 8 || *got.BilledWeight != 7.9 {
		t.Fatalf("stored fields wrong: %+v", got)
	}
	if _, err := s.GetTransaction(ctx, bob, ins.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-owner get: err = %v, want ErrNotFound", err)
	}

	// Update: cross-owner is ErrNotFound, owner sees new values.
	if _, err := s.UpdateTransaction(ctx, bob, ins.ID, ins); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-owner update: err = %v, want ErrNotFound", err)
	}
	ins.ActualPaid = 80000
	ins.ChennaiRate = nil
	upd, err := s.UpdateTransaction(ctx, alice, ins.ID, ins)
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if upd.ActualPaid != 80000 || upd.ChennaiRate != nil {
		t.Fatalf("update not applied: %+v", upd)
	}

	// Delete: cross-owner is a no-op, owner removes the row.
	if ok, err := s.DeleteTransaction(ctx, bob, ins.ID); err != nil || ok {
		t.Fatalf("cross-owner delete = (%v, %v), want (false, nil)", ok, err)
	}
	if ok, err := s.DeleteTransaction(ctx, alice, ins.ID); err != nil || !ok {
		t.Fatalf("owner delete = (%v, %v), want (true, nil)", ok, err)
	}
	if _, err := s.GetTransaction(ctx, alice, ins.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: err = %v, want ErrNotFound", err)
	}
}

func TestGoldFirstTransactionDate(t *testing.T) {
	s := goldTestStore(t)
	ctx := context.Background()
	uid := "64a000000000000000000003"

	if _, ok, err := s.FirstTransactionDate(ctx, uid); err != nil || ok {
		t.Fatalf("empty ledger = (ok=%v, err=%v), want (false, nil)", ok, err)
	}
	for _, d := range []time.Time{date(6, 20), date(6, 5), date(7, 1)} {
		if _, err := s.InsertTransaction(ctx, domain.GoldTransaction{
			UserID: uid, Date: d, GmPrice: 9000, GramsBought: 1, ActualPaid: 9000,
		}); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	first, ok, err := s.FirstTransactionDate(ctx, uid)
	if err != nil || !ok {
		t.Fatalf("FirstTransactionDate: ok=%v err=%v", ok, err)
	}
	if got := first.Format("2006-01-02"); got != "2026-06-05" {
		t.Fatalf("first = %s, want 2026-06-05", got)
	}
}

func TestGoldPrices_UpsertLatestAndScope(t *testing.T) {
	s := goldTestStore(t)
	ctx := context.Background()
	alice, bob := "64a000000000000000000001", "64a000000000000000000002"

	err := s.UpsertPrices(ctx, alice, []domain.GoldPrice{
		{Date: date(6, 10), PricePerGram: 10000},
		{Date: date(6, 11), PricePerGram: 10100},
		{Date: date(6, 14), PricePerGram: 10300},
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := s.UpsertPrices(ctx, bob, []domain.GoldPrice{{Date: date(6, 11), PricePerGram: 9999}}); err != nil {
		t.Fatalf("upsert bob: %v", err)
	}

	// Re-upserting an existing day overwrites, no duplicate row.
	if err := s.UpsertPrices(ctx, alice, []domain.GoldPrice{{Date: date(6, 11), PricePerGram: 10150}}); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}
	prices, err := s.ListPrices(ctx, alice, date(6, 1), date(6, 30))
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(prices) != 3 {
		t.Fatalf("alice has %d price rows, want 3 (upsert must not duplicate)", len(prices))
	}
	if prices[1].PricePerGram != 10150 {
		t.Fatalf("re-upsert not applied: %+v", prices[1])
	}

	// Valuation rule: nearest price on-or-before the asked day.
	p, err := s.LatestPriceOnOrBefore(ctx, alice, date(6, 13))
	if err != nil {
		t.Fatalf("latest: %v", err)
	}
	if got := p.Date.Format("2006-01-02"); got != "2026-06-11" || p.PricePerGram != 10150 {
		t.Fatalf("latest ≤ 06-13 = (%s, %v), want (2026-06-11, 10150)", got, p.PricePerGram)
	}
	if _, err := s.LatestPriceOnOrBefore(ctx, alice, date(6, 9)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("latest before first entry: err = %v, want ErrNotFound", err)
	}

	// Scoping: bob's 06-11 row is his own.
	bp, err := s.LatestPriceOnOrBefore(ctx, bob, date(6, 30))
	if err != nil || bp.PricePerGram != 9999 {
		t.Fatalf("bob latest = (%+v, %v), want his 9999 row", bp, err)
	}
}

func TestGoldDeleteAllByUser(t *testing.T) {
	s := goldTestStore(t)
	ctx := context.Background()
	alice, bob := "64a000000000000000000001", "64a000000000000000000002"

	for _, uid := range []string{alice, bob} {
		if _, err := s.InsertTransaction(ctx, domain.GoldTransaction{
			UserID: uid, Date: date(6, 10), GmPrice: 9000, GramsBought: 1, ActualPaid: 9000,
		}); err != nil {
			t.Fatalf("insert: %v", err)
		}
		if err := s.UpsertPrices(ctx, uid, []domain.GoldPrice{{Date: date(6, 10), PricePerGram: 9500}}); err != nil {
			t.Fatalf("upsert: %v", err)
		}
	}

	if err := s.DeleteAllByUser(ctx, alice); err != nil {
		t.Fatalf("DeleteAllByUser: %v", err)
	}
	if list, _ := s.ListTransactions(ctx, alice); len(list) != 0 {
		t.Fatalf("alice still has %d transactions", len(list))
	}
	if prices, _ := s.ListPrices(ctx, alice, date(1, 1), date(12, 31)); len(prices) != 0 {
		t.Fatalf("alice still has %d prices", len(prices))
	}
	// Bob untouched.
	if list, _ := s.ListTransactions(ctx, bob); len(list) != 1 {
		t.Fatalf("bob lost his transaction")
	}
}
