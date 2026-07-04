package persistence

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"portfolio-dashboard/internal/domain"
)

// GoldStore owns the Postgres gold tables (DD-003). Like the Mongo stores,
// every method takes the owner uid (the Mongo user ObjectID hex) and pins
// it in the WHERE clause, so a gold row can never be read or written
// without naming whose it is. Single reads return ErrNotFound — including
// for rows owned by someone else (no enumeration).
type GoldStore struct {
	pool *pgxpool.Pool
}

// NewGoldStore wires the gold store onto a live pgx pool.
func NewGoldStore(pool *pgxpool.Pool) *GoldStore { return &GoldStore{pool: pool} }

const goldTxnCols = `id, user_id, txn_date, gm_price, weight_grams,
	quote_price, bill_amount, actual_paid, billed_weight, chennai_rate,
	created_at, updated_at`

func scanGoldTxn(row pgx.Row) (domain.GoldTransaction, error) {
	var t domain.GoldTransaction
	err := row.Scan(&t.ID, &t.UserID, &t.Date, &t.GmPrice, &t.WeightGrams,
		&t.QuotePrice, &t.BillAmount, &t.ActualPaid, &t.BilledWeight, &t.ChennaiRate,
		&t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return domain.GoldTransaction{}, translatePgErr(err)
	}
	return t, nil
}

// translatePgErr maps pgx's no-rows sentinel to ErrNotFound and passes
// everything else through, mirroring translateFindErr for Mongo.
func translatePgErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// ListTransactions returns uid's gold purchases in replay order (date,
// then id) — callers presenting newest-first reverse it themselves.
func (s *GoldStore) ListTransactions(ctx context.Context, uid string) ([]domain.GoldTransaction, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	rows, err := s.pool.Query(ctx,
		`SELECT `+goldTxnCols+` FROM gold_transactions WHERE user_id = $1 ORDER BY txn_date, id`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.GoldTransaction
	for rows.Next() {
		t, err := scanGoldTxn(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// GetTransaction returns uid's gold purchase with the given id, or
// ErrNotFound (also covering a row owned by someone else).
func (s *GoldStore) GetTransaction(ctx context.Context, uid string, id int64) (domain.GoldTransaction, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	return scanGoldTxn(s.pool.QueryRow(ctx,
		`SELECT `+goldTxnCols+` FROM gold_transactions WHERE user_id = $1 AND id = $2`, uid, id))
}

// InsertTransaction stores a new gold purchase (its UserID must already be
// set) and returns the stored row with id and timestamps filled in.
func (s *GoldStore) InsertTransaction(ctx context.Context, t domain.GoldTransaction) (domain.GoldTransaction, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	return scanGoldTxn(s.pool.QueryRow(ctx,
		`INSERT INTO gold_transactions
			(user_id, txn_date, gm_price, weight_grams, quote_price, bill_amount, actual_paid, billed_weight, chennai_rate)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING `+goldTxnCols,
		t.UserID, t.Date, t.GmPrice, t.WeightGrams, t.QuotePrice, t.BillAmount,
		t.ActualPaid, t.BilledWeight, t.ChennaiRate))
}

// UpdateTransaction rewrites uid's gold purchase id with t's entered
// fields and returns the post-update row, or ErrNotFound when nothing
// matched (wrong id or wrong owner).
func (s *GoldStore) UpdateTransaction(ctx context.Context, uid string, id int64, t domain.GoldTransaction) (domain.GoldTransaction, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	return scanGoldTxn(s.pool.QueryRow(ctx,
		`UPDATE gold_transactions SET
			txn_date = $3, gm_price = $4, weight_grams = $5, quote_price = $6,
			bill_amount = $7, actual_paid = $8, billed_weight = $9, chennai_rate = $10,
			updated_at = now()
		 WHERE user_id = $1 AND id = $2
		 RETURNING `+goldTxnCols,
		uid, id, t.Date, t.GmPrice, t.WeightGrams, t.QuotePrice, t.BillAmount,
		t.ActualPaid, t.BilledWeight, t.ChennaiRate))
}

// DeleteTransaction removes uid's gold purchase id. Returns false when
// nothing matched.
func (s *GoldStore) DeleteTransaction(ctx context.Context, uid string, id int64) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	tag, err := s.pool.Exec(ctx,
		`DELETE FROM gold_transactions WHERE user_id = $1 AND id = $2`, uid, id)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// FirstTransactionDate returns the date of uid's earliest gold purchase.
// ok is false when the user has no gold transactions yet — the missing-
// price window (PRD-003 §7) then has no start and nothing prompts.
func (s *GoldStore) FirstTransactionDate(ctx context.Context, uid string) (time.Time, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var d *time.Time
	if err := s.pool.QueryRow(ctx,
		`SELECT min(txn_date) FROM gold_transactions WHERE user_id = $1`, uid).Scan(&d); err != nil {
		return time.Time{}, false, err
	}
	if d == nil {
		return time.Time{}, false, nil
	}
	return *d, true, nil
}

// ListPrices returns uid's daily prices with from ≤ date ≤ to, ascending.
func (s *GoldStore) ListPrices(ctx context.Context, uid string, from, to time.Time) ([]domain.GoldPrice, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	rows, err := s.pool.Query(ctx,
		`SELECT user_id, price_date, price_per_gram, created_at, updated_at
		 FROM gold_daily_prices
		 WHERE user_id = $1 AND price_date BETWEEN $2 AND $3
		 ORDER BY price_date`, uid, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.GoldPrice
	for rows.Next() {
		var p domain.GoldPrice
		if err := rows.Scan(&p.UserID, &p.Date, &p.PricePerGram, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpsertPrices bulk-inserts uid's daily prices, overwriting the price on
// date collision — the missing-day prompt saves every gap in one call, and
// re-entering a day's price is an edit, not an error.
func (s *GoldStore) UpsertPrices(ctx context.Context, uid string, prices []domain.GoldPrice) error {
	if len(prices) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	b := &pgx.Batch{}
	for _, p := range prices {
		b.Queue(
			`INSERT INTO gold_daily_prices (user_id, price_date, price_per_gram)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, price_date)
			 DO UPDATE SET price_per_gram = EXCLUDED.price_per_gram, updated_at = now()`,
			uid, p.Date, p.PricePerGram)
	}
	br := s.pool.SendBatch(ctx, b)
	defer func() { _ = br.Close() }()
	for i := range prices {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("upsert price %s: %w", prices[i].Date.Format("2006-01-02"), err)
		}
	}
	return nil
}

// LatestPriceOnOrBefore returns uid's most recent price row with
// date ≤ onOrBefore, or ErrNotFound. This is the valuation price rule
// (PRD-003 §7): a missing today falls back to the nearest earlier entry.
func (s *GoldStore) LatestPriceOnOrBefore(ctx context.Context, uid string, onOrBefore time.Time) (domain.GoldPrice, error) {
	ctx, cancel := context.WithTimeout(ctx, readTimeout)
	defer cancel()

	var p domain.GoldPrice
	err := s.pool.QueryRow(ctx,
		`SELECT user_id, price_date, price_per_gram, created_at, updated_at
		 FROM gold_daily_prices
		 WHERE user_id = $1 AND price_date <= $2
		 ORDER BY price_date DESC LIMIT 1`, uid, onOrBefore).
		Scan(&p.UserID, &p.Date, &p.PricePerGram, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return domain.GoldPrice{}, translatePgErr(err)
	}
	return p, nil
}

// DeleteAllByUser purges every gold row owned by uid (cascade on user
// delete, mirroring the Mongo stores' DeleteByUser).
func (s *GoldStore) DeleteAllByUser(ctx context.Context, uid string) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	if _, err := s.pool.Exec(ctx, `DELETE FROM gold_transactions WHERE user_id = $1`, uid); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM gold_daily_prices WHERE user_id = $1`, uid)
	return err
}
