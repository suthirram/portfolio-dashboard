package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// FxRate is the EUR→INR rate one day's overall totals are converted with
// (PD-059). EurInr is INR per 1 EUR; nil means no rate is known. FxDate is
// the trading day the rate belongs to (a weekend carries Friday's).
// Carried marks a fallback after a failed fetch, or a missing rate — the
// History page offers to re-fetch those days.
type FxRate struct {
	EurInr  *float64
	FxDate  string
	Carried bool
}

// OverallDay is one portfolio_overall document: one user's stock totals for
// one day, both buckets converted to INR at that day's stored rate. Gold is
// added at read time. StocksInvestedInr/StocksCurrentInr are nil when the EUR
// bucket is non-zero and no rate is known.
type OverallDay struct {
	UserID            primitive.ObjectID `bson:"user_id"`
	Date              time.Time          `bson:"date"`
	EurInr            *float64           `bson:"eur_inr,omitempty"`
	FxDate            string             `bson:"fx_date,omitempty"`
	FxCarried         bool               `bson:"fx_carried"`
	StocksInvestedInr *float64           `bson:"stocks_invested_inr,omitempty"`
	StocksCurrentInr  *float64           `bson:"stocks_current_inr,omitempty"`
	UpdatedAt         time.Time          `bson:"updated_at"`
}

// OverallFromBuckets converts a snapshot's INR and EUR buckets into INR
// totals at eurInr. The legacy USD bucket is ignored, as /history drops it.
// With a non-zero EUR bucket and no rate, both totals are nil: a conversion
// is never guessed.
func OverallFromBuckets(buckets map[string]RegionSnapshot, eurInr *float64) (invested, current *float64) {
	inr, eur := buckets[CurrencyINR], buckets[CurrencyEUR]
	if eur.Invested == 0 && eur.Current == 0 {
		investedInr, currentInr := round2(inr.Invested), round2(inr.Current)
		return &investedInr, &currentInr
	}
	if eurInr == nil || *eurInr <= 0 {
		return nil, nil
	}
	investedInr := round2(inr.Invested + eur.Invested**eurInr)
	currentInr := round2(inr.Current + eur.Current**eurInr)
	return &investedInr, &currentInr
}
