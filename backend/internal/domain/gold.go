package domain

import "time"

// GoldTransaction is one physical gold purchase (PRD-003 §5). Only the
// user-entered fields are stored; every derived column (gold cost, GST,
// nett per gram, nett reduction, NIMMI loss) is computed in the service
// layer at read time — the same derive-don't-store rule the stock ledger
// follows. Gold rows live in Postgres (DD-003 §1); UserID is the Mongo
// user ObjectID hex so both engines share one identity space.
type GoldTransaction struct {
	ID           int64     `json:"id"`
	UserID       string    `json:"-"`             // owner; every query scopes on it
	Date         time.Time `json:"date"`          // purchase date (DATE)
	GmPrice      float64   `json:"gm_price"`      // per-gram purchase rate
	WeightGrams  float64   `json:"weight_grams"`  // actual grams bought
	QuotePrice   *float64  `json:"quote_price"`   // jeweler-quoted rate
	BillAmount   *float64  `json:"bill_amount"`   // amount printed on the bill
	ActualPaid   float64   `json:"actual_paid"`   // cash actually paid
	BilledWeight *float64  `json:"billed_weight"` // grams on the bill
	ChennaiRate  *float64  `json:"chennai_rate"`  // market reference rate that day
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// GoldPrice is one user-entered daily per-gram price row (PRD-003 §7).
// Every calendar day from the user's first gold transaction onward is
// expected to have one; the Gold page prompts for gaps.
type GoldPrice struct {
	UserID       string    `json:"-"`
	Date         time.Time `json:"date"`
	PricePerGram float64   `json:"price_per_gram"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
