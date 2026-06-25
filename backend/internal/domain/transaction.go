package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// TxnType enumerates the ledger event kinds. Transactions are the source of
// truth; a holding's position (stocks_owned, avg_cost_price, realized_pnl,
// total_dividends) is recomputed from its full ledger on every write using the
// average-cost method.
type TxnType string

const (
	// TxnOpening seeds the running position directly (manual override / opening
	// balance): Quantity shares for a total cost of Amount. Used by the
	// holdings→transactions migration and by users who don't want to enter full
	// trade history. May carry RealizedSeed to carry a legacy realized_pnl
	// scalar that has no underlying sell.
	TxnOpening TxnType = "opening"
	// TxnBuy adds Quantity shares for a total debited Amount (brokerage + tax
	// already included). Average cost = running totalBasis / totalQty.
	TxnBuy TxnType = "buy"
	// TxnSell removes Quantity shares for a total credited Amount (net of
	// charges). Realized P&L = Amount − avgCost×Quantity.
	TxnSell TxnType = "sell"
	// TxnDividend records cash income (Amount); no quantity change.
	TxnDividend TxnType = "dividend"
	// TxnSplit scales quantity by Ratio (basis invariant ⇒ avg cost falls).
	// e.g. Ratio=2 is a 2-for-1 split.
	TxnSplit TxnType = "split"
	// TxnBonus behaves like a split for position math (basis invariant, avg
	// cost drops) but is reported distinctly.
	TxnBonus TxnType = "bonus"
	// TxnMerger is recorded for audit but does not auto-transform the position;
	// the user models the effect manually (sell-old + buy-new).
	TxnMerger TxnType = "merger"
)

// Transaction is one ledger event against a holding. Money is recorded as the
// total cash Amount (debited on buy, credited on sell/dividend) — fees are
// folded in, matching how a bank/broker statement reads. Every query is scoped
// by owner user_id (DD-001 §6.1), like holdings.
type Transaction struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"user_id,omitempty" json:"-"`   // owner; every query scopes on it (DD-001 §6.1)
	HoldingID primitive.ObjectID `bson:"holding_id" json:"holding_id"` // FK → holdings._id
	Type      TxnType            `bson:"type" json:"type"`             // opening|buy|sell|dividend|split|bonus|merger
	Date      time.Time          `bson:"date" json:"date"`             // trade / ex date; orders the ledger
	Quantity  float64            `bson:"quantity" json:"quantity"`     // shares (buy/sell/opening); unused for dividend
	Amount    float64            `bson:"amount" json:"amount"`         // total cash: debited (buy) / credited (sell, dividend), in Currency

	Ratio        float64 `bson:"ratio,omitempty" json:"ratio,omitempty"`                 // split/bonus, e.g. 2.0 = 2-for-1
	RealizedSeed float64 `bson:"realized_seed,omitempty" json:"realized_seed,omitempty"` // opening only: carry legacy realized_pnl

	// OpeningDate is the user-set effective date of an opening event; nil means
	// the user has not set it yet (the dashboard prompts until they do). When
	// set, the opening's ordering Date is synced to it. Only meaningful for
	// TxnOpening.
	OpeningDate *time.Time `bson:"opening_date,omitempty" json:"opening_date,omitempty"`

	Currency  string    `bson:"currency" json:"currency"` // denormalised from the holding
	Notes     string    `bson:"notes,omitempty" json:"notes,omitempty"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}
