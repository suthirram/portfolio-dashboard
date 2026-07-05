// Package domain defines domain models used across the application.
package domain

import "time"

// GoldTransaction is one physical gold purchase (PRD-003 §5). Only the
// user-entered fields are stored; every derived column (gold cost, GST,
// nett per gram, nett reduction, NIMMI loss) is computed in the service
// layer at read time — the same derive-don't-store rule the stock ledger
// follows. Gold rows live in Postgres (DD-003 §1); UserID is the Mongo
// user ObjectID hex so both engines share one identity space. The db tags
// map columns by name for pgx's RowToStructByName scanning.
type GoldTransaction struct {
	ID           int64     `db:"id"            json:"id"`
	UserID       string    `db:"user_id"       json:"-"`             // owner; every query scopes on it
	Date         time.Time `db:"txn_date"      json:"date"`          // purchase date (DATE)
	GmPrice      float64   `db:"gm_price"      json:"gm_price"`      // per-gram purchase rate
	GramsBought  float64   `db:"weight_grams"  json:"grams_bought"`  // actual grams bought
	QuotePrice   *float64  `db:"quote_price"   json:"quote_price"`   // jeweler-quoted rate
	BillAmount   *float64  `db:"bill_amount"   json:"bill_amount"`   // amount printed on the bill
	ActualPaid   float64   `db:"actual_paid"   json:"actual_paid"`   // cash actually paid
	BilledWeight *float64  `db:"billed_weight" json:"billed_weight"` // grams on the bill
	ChennaiRate  *float64  `db:"chennai_rate"  json:"chennai_rate"`  // market reference rate that day
	CreatedAt    time.Time `db:"created_at"    json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"    json:"updated_at"`
}

// GoldPrice is one user-entered daily per-gram price row (PRD-003 §7).
// Every calendar day from the user's first gold transaction onward is
// expected to have one; the Gold page prompts for gaps.
type GoldPrice struct {
	UserID       string    `db:"user_id"        json:"-"`
	Date         time.Time `db:"price_date"     json:"date"`
	PricePerGram float64   `db:"price_per_gram" json:"price_per_gram"`
	CreatedAt    time.Time `db:"created_at"     json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"     json:"updated_at"`
}
