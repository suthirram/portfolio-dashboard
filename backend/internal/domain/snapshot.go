package domain

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// SnapshotSource marks who wrote a region's values. A cron-written region
// can be overridden by the user, at which point its source flips to manual
// and subsequent cron runs leave it alone (DD-002 §6).
type SnapshotSource string

const (
	SnapshotSourceCron   SnapshotSource = "cron"
	SnapshotSourceManual SnapshotSource = "manual"
)

// IsValid reports whether s is one of the recognised sources.
func (s SnapshotSource) IsValid() bool {
	return s == SnapshotSourceCron || s == SnapshotSourceManual
}

// Known snapshot bucket keys. PR7 design review (2026-06-16) switched the
// snapshot key from region (india|europe|us) to currency (INR|EUR|USD).
// Holdings whose buy price is in EUR live in the EUR bucket regardless of
// which exchange they were bought on (PD-042 §3.x follow-up: PD-042 plan
// records this decision and the "no migration of dev data" note).
const (
	CurrencyINR = "INR"
	CurrencyEUR = "EUR"
	CurrencyUSD = "USD"
)

// AllCurrencies is the canonical iteration order for chart series and
// zero-row initialisation (PRD-002 §6).
var AllCurrencies = []string{CurrencyINR, CurrencyEUR, CurrencyUSD}

// RegionSnapshot is one region's contribution to a portfolio snapshot. Both
// monetary fields are in the row's currency (PortfolioSnapshot.Currency).
//
// OriginalCronInvested / OriginalCronCurrent are populated when the user
// first overrides a cron-written bucket — they preserve the values the
// snapshot job recorded so the override is reversible (PD-042 §3.3 audit
// trail). Subsequent overrides do not clobber them; nil on both means
// "no override has ever happened on this bucket".
type RegionSnapshot struct {
	Invested float64        `bson:"invested" json:"invested"`
	Current  float64        `bson:"current" json:"current"`
	Source   SnapshotSource `bson:"source" json:"source"`

	OriginalCronInvested *float64 `bson:"original_cron_invested,omitempty" json:"original_cron_invested,omitempty"`
	OriginalCronCurrent  *float64 `bson:"original_cron_current,omitempty"  json:"original_cron_current,omitempty"`

	// WriteCurrency is the currency code the manual amount was typed in.
	// In v1 it always equals the bucket key (the PortfolioSnapshot map
	// is currency-keyed) and is therefore redundant, but it is stored
	// explicitly so a future per-user display-currency toggle can decide
	// without ambiguity whether a manual row converts or stays frozen
	// (PD-042 §3.4). Empty on cron-written buckets — cron values inherit
	// the bucket key by definition.
	WriteCurrency string `bson:"write_currency,omitempty" json:"write_currency,omitempty"`
}

// HoldingSnapshot is one holding's contribution to a snapshot, carrying the
// per-stock close used to value it (PD-0xx). Storing the close at write time
// makes a row reproducible: a later backdated transaction can be replayed and
// the position revalued against the price that actually held on that date,
// instead of refetching (which a closed market can no longer provide).
//
// Currency is the bucket key (INR|EUR|USD). PriceDate is the trading date the
// ClosePrice belongs to ("YYYY-MM-DD") — on a weekend/holiday it is the prior
// session, not the snapshot date, which is how the weekend-phantom drift is
// avoided. Invested = Quantity×AvgCost, Current = Quantity×ClosePrice; both are
// stored so a read never has to recompute, and a carry-forward day (no live
// close available) sets ClosePrice = AvgCost so Current == Invested.
type HoldingSnapshot struct {
	Symbol     string  `bson:"symbol" json:"symbol"`
	Script     string  `bson:"script" json:"script"`
	Currency   string  `bson:"currency" json:"currency"`
	Quantity   float64 `bson:"quantity" json:"quantity"`
	AvgCost    float64 `bson:"avg_cost" json:"avg_cost"`
	ClosePrice float64 `bson:"close_price" json:"close_price"`
	PriceDate  string  `bson:"price_date,omitempty" json:"price_date,omitempty"`
	Invested   float64 `bson:"invested" json:"invested"`
	Current    float64 `bson:"current" json:"current"`
}

// PortfolioSnapshot is the cumulative state of one user's portfolio at one
// UTC midnight. Totals are derived at read time so a manual override of one
// region cannot drift the stored totals (DD-002 §2.1).
type PortfolioSnapshot struct {
	ID       primitive.ObjectID `bson:"_id,omitempty" json:"-"`
	UserID   primitive.ObjectID `bson:"user_id" json:"-"`
	Date     time.Time          `bson:"date" json:"date"`         // UTC midnight
	Currency string             `bson:"currency" json:"currency"` // e.g. "INR"
	// Buckets is the per-currency map (keys: "INR" | "EUR" | "USD"). The
	// bson + json tags still say "regions" for backwards-compat with
	// PR4-era documents that used the same field name; PR7 design-review
	// switched the dimension from region to currency, and PD-042 §3.6/§6
	// flagged the field-name rename as a v2 follow-up. Do not rename the
	// tags without writing a Mongo migration.
	Buckets map[string]RegionSnapshot `bson:"regions" json:"regions"`
	// Lines is the per-stock breakdown behind the cron-sourced buckets. It is
	// nil on PR4-era rows and on purely manual rows; a manual override replaces
	// a bucket total but does not carry per-stock detail. Lines only ever cover
	// currencies whose bucket is cron-sourced — see BucketsFromLines.
	//
	// No omitempty: a cron run on an empty portfolio writes an explicit empty
	// array, which round-trips back as a non-nil empty slice and stays
	// recomputable. omitempty would drop it to absent → indistinguishable from
	// a legacy/manual row, so a backdated txn could never heal that day.
	Lines     []HoldingSnapshot `bson:"holdings" json:"holdings,omitempty"`
	CreatedAt time.Time         `bson:"created_at" json:"-"`
	UpdatedAt time.Time         `bson:"updated_at" json:"-"`
}

// BucketsFromLines aggregates per-stock lines into the per-currency bucket map,
// every bucket marked cron-sourced. Currencies with no line still get a zero
// row so the chart starts the day the user signed up (PRD-002 §6). Monetary
// fields are rounded to two decimals to match the snapshot-build convention.
func BucketsFromLines(lines []HoldingSnapshot) map[string]RegionSnapshot {
	buckets := make(map[string]RegionSnapshot, len(AllCurrencies))
	for _, c := range AllCurrencies {
		buckets[c] = RegionSnapshot{Source: SnapshotSourceCron}
	}
	for _, ln := range lines {
		rs := buckets[ln.Currency]
		rs.Source = SnapshotSourceCron
		rs.Invested += ln.Invested
		rs.Current += ln.Current
		buckets[ln.Currency] = rs
	}
	// Round once, after summing — the per-line values are already 2dp, so
	// rounding each before accumulating is a no-op that only risks float drift
	// across the sum.
	for c, rs := range buckets {
		rs.Invested = round2(rs.Invested)
		rs.Current = round2(rs.Current)
		buckets[c] = rs
	}
	return buckets
}

func round2(v float64) float64 { return float64(int64(v*100+sign(v)*0.5)) / 100 }

// SnapshotTotals is the derived aggregate over a PortfolioSnapshot. PnLPct
// is a pointer so an undefined value (invested_total == 0) serialises to
// JSON null rather than the misleading 0 (PRD-002 §6).
type SnapshotTotals struct {
	InvestedTotal float64  `json:"invested_total"`
	CurrentTotal  float64  `json:"current_total"`
	PnLPct        *float64 `json:"pnl_pct"`
}

// Totals derives the headline aggregate from the per-bucket map. It
// rounds PnLPct to two decimals; callers should not round again.
//
// NOTE: this is a SAME-CURRENCY-ONLY aggregate. Buckets are summed in
// their native units with no FX conversion, so for a mixed-currency
// portfolio (e.g. INR + EUR) the result is not a meaningful base-currency
// figure. The history UI never renders it — it shows per-currency buckets.
// Do not wire this into a converted/base-currency headline without first
// storing a per-snapshot FX rate (see plan F2 / DD-002 follow-up).
func (p PortfolioSnapshot) Totals() SnapshotTotals {
	var invested, current float64
	for _, r := range p.Buckets {
		invested += r.Invested
		current += r.Current
	}
	t := SnapshotTotals{InvestedTotal: invested, CurrentTotal: current}
	if invested > 0 {
		pct := (current - invested) / invested * 100
		// Round to two decimals via integer math; avoids math.Round import
		// just for one call.
		pct = float64(int(pct*100+sign(pct)*0.5)) / 100
		t.PnLPct = &pct
	}
	return t
}

func sign(x float64) float64 {
	if x < 0 {
		return -1
	}
	return 1
}

// UTCDate truncates t to its UTC midnight. Snapshot rows are keyed by this
// value, never by the raw time the job happened to run.
func UTCDate(t time.Time) time.Time {
	u := t.UTC()
	return time.Date(u.Year(), u.Month(), u.Day(), 0, 0, 0, 0, time.UTC)
}
